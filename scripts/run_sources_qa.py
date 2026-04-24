from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import TextIO
from urllib.error import URLError
from urllib.request import urlopen

import runtime_port_audit as runtime_ports
from runtime_helpers import ROOT_DIR, reexec_with_venv, runtime_value

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

REQUEST_TIMEOUT_SECONDS = 5
WAIT_TIMEOUT_SECONDS = 90
LOG_DIR = ROOT_DIR / "output" / "playwright"
DEFAULT_WEB_PORT = 3000
DEFAULT_API_PORT = 8000
BROWSER_SMOKE_PATH = LOG_DIR / "sources-a11y-smoke.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Uruchamia caly plan QA dla /sources wraz z lokalnym bootem runtime, jesli trzeba.",
    )
    parser.add_argument("--keep-running", action="store_true", help="Nie zatrzymuj runtime'ow uruchomionych przez skrypt.")
    parser.add_argument(
        "--cold-start",
        action="store_true",
        help="Wymus prawdziwy clean start na domyslnych portach 3000/8000 i nie korzystaj z fallbackow.",
    )
    parser.add_argument("--web-port", type=int, default=int(runtime_value("RSSMASTER_WEB_PORT", str(DEFAULT_WEB_PORT))))
    parser.add_argument("--api-port", type=int, default=int(runtime_value("RSSMASTER_API_PORT", str(DEFAULT_API_PORT))))
    return parser.parse_args()


def evidence_path_for(cold_start: bool) -> Path:
    return LOG_DIR / ("sources-cold-boot.json" if cold_start else "sources-qa.json")


def read_json(url: str) -> dict[str, object]:
    with urlopen(url, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        import json

        return json.loads(response.read().decode("utf-8"))


def is_healthy(url: str) -> bool:
    try:
        payload = read_json(url)
    except (URLError, OSError, TimeoutError):
        return False

    return payload.get("status") == "ok"


def port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        return probe.connect_ex((host, port)) == 0


def wait_for_health(name: str, url: str, timeout_seconds: int) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if is_healthy(url):
            print(f"[qa:sources] {name} health ok: {url}")
            return
        time.sleep(2)
    raise RuntimeError(f"{name} did not become healthy within {timeout_seconds}s: {url}")


def runtime_health_url(name: str, host: str, port: int) -> str:
    return f"http://{host}:{port}/health" if name == "api" else f"http://{host}:{port}/api/health"


def runtime_startup_url(name: str, host: str, port: int) -> str:
    return f"http://{host}:{port}/diagnostics/startup" if name == "api" else f"http://{host}:{port}/api/diagnostics/startup"


def collect_cold_start_metadata(name: str, host: str, port: int) -> dict[str, object]:
    metadata = runtime_ports.prepare_cold_start_cleanup(name, host, port, root_dir=ROOT_DIR)
    cleanup = metadata.get("cleanup")
    killed_targets = cleanup.get("killed_targets") if isinstance(cleanup, dict) else []
    for target in killed_targets if isinstance(killed_targets, list) else []:
        if not isinstance(target, dict):
            continue
        print(f"[qa:sources] stopped repo {name} runtime for cold start: pid={target.get('pid')} port={target.get('port')}")
    return metadata


def repair_stale_listener(name: str, host: str, port: int) -> bool:
    if is_healthy(runtime_health_url(name, host, port)):
        return False

    audit_before = runtime_ports.audit_runtime_port(name, host, port)
    if not bool(audit_before.get("port_in_use")):
        return False

    cleanup = runtime_ports.cleanup_repo_runtimes(name, host, [port], root_dir=ROOT_DIR)
    killed_targets = cleanup.get("killed_targets") if isinstance(cleanup, dict) else []
    repaired = bool(killed_targets)
    for target in killed_targets if isinstance(killed_targets, list) else []:
        if not isinstance(target, dict):
            continue
        print(f"[qa:sources] repairing stale {name} listener on {host}:{port}: pid={target.get('pid')}")

    if not repaired:
        return False

    deadline = time.time() + 10
    while time.time() < deadline:
        if is_healthy(runtime_health_url(name, host, port)):
            return True
        if not port_in_use(host, port):
            return True
        time.sleep(1)
    return True


def choose_runtime_port(name: str, host: str, preferred_port: int) -> int:
    health_suffix = "/health" if name == "api" else "/api/health"
    preferred_url = f"http://{host}:{preferred_port}{health_suffix}"
    if is_healthy(preferred_url):
        print(f"[qa:sources] using healthy default {name} port: {preferred_port}")
        return preferred_port

    repaired = repair_stale_listener(name, host, preferred_port)
    if repaired and is_healthy(preferred_url):
        print(f"[qa:sources] repaired default {name} port: {preferred_port}")
        return preferred_port

    fallback_ports = [preferred_port + 100, preferred_port + 200, preferred_port + 300, preferred_port + 301, preferred_port + 302]
    for fallback_port in fallback_ports:
        fallback_url = f"http://{host}:{fallback_port}{health_suffix}"
        if is_healthy(fallback_url):
            print(f"[qa:sources] using existing fallback {name} port: {fallback_port}")
            return fallback_port

    if not port_in_use(host, preferred_port):
        return preferred_port

    for fallback_port in fallback_ports:
        if not port_in_use(host, fallback_port):
            print(f"[qa:sources] selected fallback {name} port: {fallback_port}")
            return fallback_port

    raise RuntimeError(f"Could not find a healthy or free port for {name}. Tried {preferred_port} and {fallback_ports}.")


def taskkill_tree(pid: int) -> None:
    subprocess.run(
        ["taskkill", "/PID", str(pid), "/T", "/F"],
        cwd=ROOT_DIR,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def stop_process(proc: subprocess.Popen[bytes] | None) -> None:
    if proc is None or proc.poll() is not None:
        return

    if os.name == "nt":
        taskkill_tree(proc.pid)
        return

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def start_logged_process(name: str, command: list[str], env: dict[str, str], log_name: str) -> tuple[subprocess.Popen[bytes], TextIO]:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file = (LOG_DIR / log_name).open("w", encoding="utf-8")
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    proc = subprocess.Popen(
        command,
        cwd=ROOT_DIR,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        creationflags=creationflags,
    )
    print(f"[qa:sources] started {name}: pid={proc.pid}, log={LOG_DIR / log_name}")
    return proc, log_file


def run_step(label: str, command: list[str], env: dict[str, str]) -> None:
    print(f"[qa:sources] {label}: {' '.join(command)}")
    completed = subprocess.run(command, cwd=ROOT_DIR, env=env, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"Step failed: {label} (exit {completed.returncode})")


def ensure_runtime(
    *,
    name: str,
    health_url: str,
    host: str,
    port: int,
    command: list[str],
    env: dict[str, str],
    log_name: str,
    cold_start: bool = False,
    cold_start_metadata: dict[str, object] | None = None,
) -> tuple[subprocess.Popen[bytes] | None, TextIO | None]:
    if cold_start:
        if cold_start_metadata is None:
            cold_start_metadata = collect_cold_start_metadata(name, host, port)
        if not cold_start_metadata.get("clean_start_ready"):
            blocker_message = cold_start_metadata.get("blocker_message")
            raise RuntimeError(
                str(blocker_message)
                if isinstance(blocker_message, str) and blocker_message
                else (
                    f"Could not prepare {name} for a cold start on {host}:{port}. "
                    f"Details: {json.dumps(cold_start_metadata, sort_keys=True)}"
                ),
            )

    if is_healthy(health_url):
        print(f"[qa:sources] using existing {name}: {health_url}")
        return None, None

    repaired = repair_stale_listener(name, host, port)
    if repaired and is_healthy(health_url):
        print(f"[qa:sources] stale {name} listener repaired and healthy: {health_url}")
        return None, None

    if port_in_use(host, port):
        raise RuntimeError(f"{name} port {host}:{port} is already bound but health is not ok. Free the port first.")

    proc, log_file = start_logged_process(name, command, env, log_name)
    wait_for_health(name, health_url, WAIT_TIMEOUT_SECONDS)
    return proc, log_file


def main() -> int:
    args = parse_args()
    evidence_path = evidence_path_for(args.cold_start)

    if args.cold_start and (args.web_port != DEFAULT_WEB_PORT or args.api_port != DEFAULT_API_PORT):
        raise RuntimeError(
            f"Cold-start proof requires the default ports {DEFAULT_WEB_PORT}/{DEFAULT_API_PORT}. "
            "Do not override RSSMASTER_WEB_PORT or RSSMASTER_API_PORT for this run.",
        )

    host = "127.0.0.1"
    requested_ports = {"web": args.web_port, "api": args.api_port}
    requested_port_audit = runtime_ports.audit_runtime_ports(host, requested_ports)

    npm_bin = "npm.cmd" if os.name == "nt" else "npm"
    started: list[subprocess.Popen[bytes] | None] = []
    logs: list[TextIO] = []
    evidence: dict[str, object] = {
        "cold_start": args.cold_start,
        "default_ports": {"web": DEFAULT_WEB_PORT, "api": DEFAULT_API_PORT},
        "requested_ports": requested_ports,
        "port_audit": requested_port_audit,
        "resolved_ports": {},
        "resolved_port_audit": {},
        "selection_reason": {"web": None, "api": None},
        "fallback_reason": {"web": None, "api": None},
        "blocker_details": {"web": None, "api": None},
        "boot": {},
        "steps": [],
    }
    cold_start_preflight: dict[str, dict[str, object]] = {}

    try:
        api_selection = runtime_ports.select_runtime_port(
            "api",
            host,
            args.api_port,
            allow_fallback=not args.cold_start,
        )
        web_selection = runtime_ports.select_runtime_port(
            "web",
            host,
            args.web_port,
            allow_fallback=not args.cold_start,
        )
        chosen_api_port = int(api_selection["resolved_port"])
        chosen_web_port = int(web_selection["resolved_port"])
        web_url = f"http://{host}:{chosen_web_port}"
        api_url = f"http://{host}:{chosen_api_port}"

        evidence["resolved_ports"] = {"web": chosen_web_port, "api": chosen_api_port}
        evidence["resolved_port_audit"] = {"web": web_selection["resolved_audit"], "api": api_selection["resolved_audit"]}
        evidence["selection_reason"] = {"web": web_selection["selection_reason"], "api": api_selection["selection_reason"]}
        evidence["fallback_reason"] = {"web": web_selection["fallback_reason"], "api": api_selection["fallback_reason"]}
        evidence["blocker_details"] = {"web": web_selection["blocker_details"], "api": api_selection["blocker_details"]}

        env = os.environ.copy()
        env["RSSMASTER_WEB_PORT"] = str(chosen_web_port)
        env["RSSMASTER_API_PORT"] = str(chosen_api_port)
        env["RSSMASTER_WEB_URL"] = web_url
        env["RSSMASTER_API_URL"] = api_url
        env["NEXT_PUBLIC_API_BASE_URL"] = api_url

        if args.cold_start:
            try:
                cold_start_preflight = {
                    "api": collect_cold_start_metadata("api", host, chosen_api_port),
                    "web": collect_cold_start_metadata("web", host, chosen_web_port),
                }
                evidence["cold_start_preflight"] = cold_start_preflight
            except RuntimeError as error:
                evidence["cold_start_preflight_error"] = str(error)
                raise

        run_step("unit tests", [npm_bin, "run", "test:unit"], env)
        evidence["steps"].append({"label": "unit tests", "status": "passed"})  # type: ignore[union-attr]
        run_step("frontend build", [npm_bin, "run", "build"], env)
        evidence["steps"].append({"label": "frontend build", "status": "passed"})  # type: ignore[union-attr]

        api_proc, api_log = ensure_runtime(
            name="api",
            health_url=f"{api_url}/health",
            host=host,
            port=chosen_api_port,
            command=[
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--app-dir",
                str(ROOT_DIR / "apps" / "api"),
                "--host",
                host,
                "--port",
                str(chosen_api_port),
            ],
            env=env,
            log_name="qa-sources-api.log",
            cold_start=args.cold_start,
            cold_start_metadata=cold_start_preflight.get("api"),
        )
        web_proc, web_log = ensure_runtime(
            name="web",
            health_url=f"{web_url}/api/health",
            host=host,
            port=chosen_web_port,
            command=["node", str(ROOT_DIR / "scripts" / "run_web.mjs"), "dev"],
            env=env,
            log_name="qa-sources-web.log",
            cold_start=args.cold_start,
            cold_start_metadata=cold_start_preflight.get("web"),
        )
        started.extend([web_proc, api_proc])
        logs.extend([log for log in [api_log, web_log] if log is not None])

        run_step("api contract smoke", [sys.executable, str(ROOT_DIR / "scripts" / "check_api.py")], env)
        evidence["steps"].append({"label": "api contract smoke", "status": "passed"})  # type: ignore[union-attr]
        run_step("health smoke", [sys.executable, str(ROOT_DIR / "scripts" / "check_health.py")], env)
        evidence["steps"].append({"label": "health smoke", "status": "passed"})  # type: ignore[union-attr]

        evidence["boot"] = {
            "api_health": read_json(f"{api_url}/health"),
            "web_health": read_json(f"{web_url}/api/health"),
            "api_startup": read_json(f"{api_url}/diagnostics/startup"),
            "web_startup": read_json(f"{web_url}/api/diagnostics/startup"),
        }

        run_step("sources browser smoke", [npm_bin, "run", "check:sources"], env)
        evidence["steps"].append({"label": "sources browser smoke", "status": "passed"})  # type: ignore[union-attr]

        if BROWSER_SMOKE_PATH.exists():
            try:
                evidence["browser_smoke"] = json.loads(BROWSER_SMOKE_PATH.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                evidence["browser_smoke"] = {"path": str(BROWSER_SMOKE_PATH), "parse_error": True}

        LOG_DIR.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")

        print("[qa:sources] PASS")
        print(f"[qa:sources] manual UI target: {web_url}/sources")
        print(f"[qa:sources] evidence: {LOG_DIR / 'sources-a11y-smoke.json'}")
        print(f"[qa:sources] qa summary: {evidence_path}")
        if args.keep_running:
            print("[qa:sources] keeping started runtimes alive as requested.")
        return 0
    except RuntimeError as error:
        evidence["failure"] = str(error)
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")
        print(f"[qa:sources] FAIL: {error}")
        return 1
    finally:
        if not args.keep_running:
            for proc in started:
                stop_process(proc)
        for log in logs:
            log.close()


if __name__ == "__main__":
    raise SystemExit(main())
