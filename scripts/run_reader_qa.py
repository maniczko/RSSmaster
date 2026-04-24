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
DEFAULT_WEB_PORT = 3000
DEFAULT_API_PORT = 8000
LOG_DIR = ROOT_DIR / "output" / "playwright"
EVIDENCE_PATH = LOG_DIR / "reader-qa.json"
READER_SMOKE_PATH = LOG_DIR / "reader-rich-smoke.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Uruchamia pelny plan QA dla cleaned readera wraz z lokalnym bootem runtime, jesli trzeba.",
    )
    parser.add_argument("--keep-running", action="store_true", help="Nie zatrzymuj runtime'ow uruchomionych przez skrypt.")
    parser.add_argument("--web-port", type=int, default=int(runtime_value("RSSMASTER_WEB_PORT", str(DEFAULT_WEB_PORT))))
    parser.add_argument("--api-port", type=int, default=int(runtime_value("RSSMASTER_API_PORT", str(DEFAULT_API_PORT))))
    return parser.parse_args()


def read_json(url: str) -> dict[str, object]:
    with urlopen(url, timeout=REQUEST_TIMEOUT_SECONDS) as response:
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
            print(f"[qa:reader] {name} health ok: {url}")
            return
        time.sleep(2)
    raise RuntimeError(f"{name} did not become healthy within {timeout_seconds}s: {url}")


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
    print(f"[qa:reader] started {name}: pid={proc.pid}, log={LOG_DIR / log_name}")
    return proc, log_file


def ensure_runtime(*, name: str, health_url: str, host: str, port: int, command: list[str], env: dict[str, str], log_name: str) -> tuple[subprocess.Popen[bytes] | None, TextIO | None]:
    if is_healthy(health_url):
        print(f"[qa:reader] using existing {name}: {health_url}")
        return None, None

    if port_in_use(host, port):
        raise RuntimeError(f"{name} port {host}:{port} is already bound but health is not ok. Free the port first.")

    proc, log_file = start_logged_process(name, command, env, log_name)
    wait_for_health(name, health_url, WAIT_TIMEOUT_SECONDS)
    return proc, log_file


def run_step(label: str, command: list[str], env: dict[str, str]) -> None:
    print(f"[qa:reader] {label}: {' '.join(command)}")
    completed = subprocess.run(command, cwd=ROOT_DIR, env=env, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"Step failed: {label} (exit {completed.returncode})")


def main() -> int:
    args = parse_args()

    host = "127.0.0.1"
    requested_ports = {"web": args.web_port, "api": args.api_port}
    requested_port_audit = runtime_ports.audit_runtime_ports(host, requested_ports)
    api_selection = runtime_ports.select_runtime_port("api", host, args.api_port, allow_fallback=True)
    web_selection = runtime_ports.select_runtime_port("web", host, args.web_port, allow_fallback=True)
    chosen_api_port = int(api_selection["resolved_port"])
    chosen_web_port = int(web_selection["resolved_port"])
    web_url = f"http://{host}:{chosen_web_port}"
    api_url = f"http://{host}:{chosen_api_port}"

    env = os.environ.copy()
    env["RSSMASTER_WEB_PORT"] = str(chosen_web_port)
    env["RSSMASTER_API_PORT"] = str(chosen_api_port)
    env["RSSMASTER_WEB_URL"] = web_url
    env["RSSMASTER_API_URL"] = api_url
    env["NEXT_PUBLIC_API_BASE_URL"] = api_url

    npm_bin = "npm.cmd" if os.name == "nt" else "npm"
    started: list[subprocess.Popen[bytes] | None] = []
    logs: list[TextIO] = []
    evidence: dict[str, object] = {
        "requested_ports": requested_ports,
        "port_audit": requested_port_audit,
        "resolved_ports": {"web": chosen_web_port, "api": chosen_api_port},
        "resolved_port_audit": {"web": web_selection["resolved_audit"], "api": api_selection["resolved_audit"]},
        "selection_reason": {"web": web_selection["selection_reason"], "api": api_selection["selection_reason"]},
        "fallback_reason": {"web": web_selection["fallback_reason"], "api": api_selection["fallback_reason"]},
        "blocker_details": {"web": web_selection["blocker_details"], "api": api_selection["blocker_details"]},
        "boot": {},
        "steps": [],
    }

    try:
        run_step("web unit tests", [npm_bin, "run", "test:unit:web"], env)
        evidence["steps"].append({"label": "web unit tests", "status": "passed"})  # type: ignore[union-attr]
        run_step("api unit tests", [sys.executable, str(ROOT_DIR / "scripts" / "test_api_unit.py")], env)
        evidence["steps"].append({"label": "api unit tests", "status": "passed"})  # type: ignore[union-attr]
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
            log_name="qa-reader-api.log",
        )
        web_proc, web_log = ensure_runtime(
            name="web",
            health_url=f"{web_url}/api/health",
            host=host,
            port=chosen_web_port,
            command=["node", str(ROOT_DIR / "scripts" / "run_web.mjs"), "dev"],
            env=env,
            log_name="qa-reader-web.log",
        )
        started.extend([web_proc, api_proc])
        logs.extend([log for log in [api_log, web_log] if log is not None])

        run_step("health smoke", [sys.executable, str(ROOT_DIR / "scripts" / "check_health.py")], env)
        evidence["steps"].append({"label": "health smoke", "status": "passed"})  # type: ignore[union-attr]
        evidence["boot"] = {
            "api_health": read_json(f"{api_url}/health"),
            "web_health": read_json(f"{web_url}/api/health"),
            "api_startup": read_json(f"{api_url}/diagnostics/startup"),
            "web_startup": read_json(f"{web_url}/api/diagnostics/startup"),
        }

        run_step("reader browser smoke", [npm_bin, "run", "check:reader"], env)
        evidence["steps"].append({"label": "reader browser smoke", "status": "passed"})  # type: ignore[union-attr]

        if READER_SMOKE_PATH.exists():
            try:
                evidence["reader_smoke"] = json.loads(READER_SMOKE_PATH.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                evidence["reader_smoke"] = {"path": str(READER_SMOKE_PATH), "parse_error": True}

        LOG_DIR.mkdir(parents=True, exist_ok=True)
        EVIDENCE_PATH.write_text(json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")

        print("[qa:reader] PASS")
        print(f"[qa:reader] manual UI target: {web_url}/read/saved")
        print(f"[qa:reader] evidence: {READER_SMOKE_PATH}")
        print(f"[qa:reader] qa summary: {EVIDENCE_PATH}")
        if args.keep_running:
            print("[qa:reader] keeping started runtimes alive as requested.")
        return 0
    except RuntimeError as error:
        evidence["failure"] = str(error)
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        EVIDENCE_PATH.write_text(json.dumps(evidence, indent=2, sort_keys=True), encoding="utf-8")
        print(f"[qa:reader] FAIL: {error}")
        return 1
    finally:
        if not args.keep_running:
            for proc in started:
                stop_process(proc)
        for log in logs:
            log.close()


if __name__ == "__main__":
    raise SystemExit(main())
