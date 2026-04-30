from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / "output" / "playwright"
OUTPUT_JSON = OUTPUT_DIR / "workspace-perf-smoke.json"
HISTORY_DIR = OUTPUT_DIR / "perf-history"
HISTORY_JSONL = HISTORY_DIR / "workspace-api.ndjson"
API_URL = os.environ.get("RSSMASTER_API_URL", "http://127.0.0.1:8000").rstrip("/")
WARNING_MS = 1500
FAIL_MS = 2500
WAIT_TIMEOUT_SECONDS = 120
SAMPLE_RUNS = 5
ACCOUNT_PASSWORD = "PerfSmoke-12345"
COOKIE_HEADER: str | None = None


def python_executable() -> str:
    venv_python = ROOT_DIR / ".venv" / "Scripts" / "python.exe"
    return str(venv_python) if venv_python.exists() else sys.executable


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def fetch_json(path: str) -> tuple[int, object]:
    started = time.perf_counter()
    headers = {"Accept": "application/json", "Origin": "http://127.0.0.1:3000"}
    if COOKIE_HEADER:
        headers["Cookie"] = COOKIE_HEADER
    request = urllib.request.Request(
        f"{API_URL}{path}",
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read().decode("utf-8")
        status = response.status
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    return elapsed_ms, json.loads(body) if body else {}


def request_json(url: str, timeout: int = 10) -> object:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body else {}


def request_json_response(url: str, payload: dict[str, object], timeout: int = 15) -> tuple[int, object, str | None]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Accept": "application/json", "Content-Type": "application/json", "Origin": "http://127.0.0.1:3000"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        response_body = response.read().decode("utf-8")
        cookies = response.headers.get_all("Set-Cookie") or []
        cookie_header = "; ".join(cookie.split(";", 1)[0] for cookie in cookies if cookie)
        return response.status, json.loads(response_body) if response_body else {}, cookie_header or None


def should_use_isolated_runtime(api_url: str) -> tuple[bool, str, object | None]:
    if os.environ.get("RSSMASTER_USE_EXISTING_RUNTIME") == "1":
        return False, "forced-existing-runtime", None

    try:
        session = request_json(f"{api_url}/api/v1/auth/session")
    except Exception:
        return True, "isolated-because-authenticated-baseline-required", None

    return True, "isolated-because-authenticated-baseline-required", session


def wait_for_health(api_url: str) -> None:
    deadline = time.time() + WAIT_TIMEOUT_SECONDS
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            payload = request_json(f"{api_url}/health", timeout=5)
            if isinstance(payload, dict) and payload.get("status") == "ok":
                return
        except Exception as error:
            last_error = error
        time.sleep(1.5)
    detail = f": {last_error}" if last_error else ""
    raise RuntimeError(f"Isolated workspace perf API did not become healthy at {api_url}{detail}")


def stop_process(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            cwd=ROOT_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


def start_isolated_api() -> tuple[str, subprocess.Popen[bytes], dict[str, object]]:
    run_dir = Path(tempfile.mkdtemp(prefix="workspace-perf-", dir=OUTPUT_DIR))
    data_dir = run_dir / "data"
    workspace_dir = data_dir / "accounts"
    workspace_dir.mkdir(parents=True, exist_ok=True)
    api_port = find_free_port()
    api_url = f"http://127.0.0.1:{api_port}"
    log_path = run_dir / "api.log"
    env = os.environ.copy()
    env.update(
        {
            "RSSMASTER_API_PORT": str(api_port),
            "RSSMASTER_API_URL": api_url,
            "RSSMASTER_DATABASE_PATH": str(data_dir / "workspace.db"),
            "RSSMASTER_ACCOUNTS_DATABASE_PATH": str(data_dir / "accounts.db"),
            "RSSMASTER_ACCOUNTS_WORKSPACE_DIR": str(workspace_dir),
            "RSSMASTER_ACCOUNTS_COOKIE_NAME": f"rssmaster_workspace_perf_{int(time.time() * 1000)}",
        }
    )
    log_file = log_path.open("wb")
    process = subprocess.Popen(
        [
            python_executable(),
            "-m",
            "uvicorn",
            "app.main:app",
            "--app-dir",
            str(ROOT_DIR / "apps" / "api"),
            "--host",
            "127.0.0.1",
            "--port",
            str(api_port),
        ],
        cwd=ROOT_DIR,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    try:
        wait_for_health(api_url)
    except Exception:
        stop_process(process)
        log_file.close()
        raise
    log_file.close()
    runtime = {
        "apiUrl": api_url,
        "authMode": "isolated-no-account-runtime",
        "databasePath": str(data_dir / "workspace.db"),
        "accountsDatabasePath": str(data_dir / "accounts.db"),
        "accountsWorkspaceDir": str(workspace_dir),
        "isolated": True,
        "runDir": str(run_dir),
    }
    return api_url, process, runtime


def build_perf_account() -> dict[str, str]:
    timestamp = int(time.time() * 1000)
    return {
        "display_name": "Perf Smoke Operator",
        "password": ACCOUNT_PASSWORD,
        "username": f"perfapi{timestamp}",
    }


def authenticate_workspace_runtime(api_url: str, runtime: dict[str, object]) -> dict[str, object]:
    global COOKIE_HEADER

    account = build_perf_account()
    if bool(runtime.get("isolated")):
        status, payload, cookie_header = request_json_response(
            f"{api_url}/api/v1/auth/register",
            {
                "claim_legacy_workspace": False,
                "display_name": account["display_name"],
                "password": account["password"],
                "username": account["username"],
            },
        )
    elif os.environ.get("RSSMASTER_PERF_USERNAME") and os.environ.get("RSSMASTER_PERF_PASSWORD"):
        account["username"] = str(os.environ["RSSMASTER_PERF_USERNAME"])
        account["password"] = str(os.environ["RSSMASTER_PERF_PASSWORD"])
        status, payload, cookie_header = request_json_response(
            f"{api_url}/api/v1/auth/login",
            {
                "password": account["password"],
                "username": account["username"],
            },
        )
    else:
        return {
            "authenticated": False,
            "reason": "forced existing runtime without RSSMASTER_PERF_USERNAME/RSSMASTER_PERF_PASSWORD",
            "username": None,
        }

    if status != 200 or not isinstance(payload, dict) or not payload.get("session"):
        raise RuntimeError(f"Workspace perf auth failed: status={status} payload={payload}")
    if not cookie_header:
        raise RuntimeError("Workspace perf auth did not return a session cookie.")
    COOKIE_HEADER = cookie_header
    return {
        "authenticated": True,
        "authMode": "isolated-authenticated-runtime" if bool(runtime.get("isolated")) else "existing-authenticated-runtime",
        "reason": "registered-isolated-account" if bool(runtime.get("isolated")) else "logged-in-existing-runtime",
        "username": account["username"],
    }


def percentile_value(values: list[float], percentile: float) -> float:
    if len(values) == 1:
        return values[0]
    if not values:
        return 0
    sorted_values = sorted(values)
    index = min(len(sorted_values) - 1, max(0, int((len(sorted_values) * percentile + 0.999999) - 1)))
    return round(sorted_values[index], 2)


def percentile_95(values: list[float]) -> float:
    return percentile_value(values, 0.95)


def percentile_99(values: list[float]) -> float:
    return percentile_value(values, 0.99)


def main() -> None:
    global API_URL

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    use_isolated, auth_mode, auth_probe = should_use_isolated_runtime(API_URL)
    runtime_process: subprocess.Popen[bytes] | None = None
    runtime: dict[str, object] = {
        "apiUrl": API_URL,
        "authMode": auth_mode,
        "authProbe": auth_probe,
        "isolated": False,
        "runDir": None,
    }
    if use_isolated:
        API_URL, runtime_process, isolated_runtime = start_isolated_api()
        runtime = {**isolated_runtime, "authProbe": auth_probe}

    endpoints = [
        "/health",
        "/api/v1/workspace/ranking?limit=12",
        "/api/v1/workspace/stories?limit=8",
        "/api/v1/workspace/briefing",
        "/api/v1/workspace/source-health",
    ]
    samples: dict[str, list[float]] = {endpoint: [] for endpoint in endpoints}
    payload_shapes: dict[str, list[str]] = {}
    cold_ms: dict[str, float] = {}

    try:
        auth_context = authenticate_workspace_runtime(API_URL, runtime)
        runtime = {**runtime, **auth_context}

        for endpoint in endpoints:
            elapsed_ms, _payload = fetch_json(endpoint)
            cold_ms[endpoint] = elapsed_ms

        for endpoint in endpoints:
            for _ in range(SAMPLE_RUNS):
                try:
                    elapsed_ms, payload = fetch_json(endpoint)
                except (urllib.error.URLError, TimeoutError) as error:
                    raise RuntimeError(f"Workspace perf endpoint failed for {endpoint}: {error}") from error
                samples[endpoint].append(elapsed_ms)
                payload_shapes[endpoint] = sorted(payload.keys()) if isinstance(payload, dict) else [type(payload).__name__]

        p95_by_endpoint = {endpoint: percentile_95(values) for endpoint, values in samples.items()}
        p99_by_endpoint = {endpoint: percentile_99(values) for endpoint, values in samples.items()}
        workspace_values = [
            elapsed
            for endpoint, values in samples.items()
            if endpoint != "/health"
            for elapsed in values
        ]
        workspace_p95 = percentile_95(workspace_values)
        workspace_p99 = percentile_99(workspace_values)
        status = "pass"
        if workspace_p95 > FAIL_MS:
            status = "fail"
        elif workspace_p95 > WARNING_MS:
            status = "warn"

        result = {
            "status": status,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "thresholds": {
                "warningMs": WARNING_MS,
                "failMs": FAIL_MS,
            },
            "sampleRuns": SAMPLE_RUNS,
            "workspaceP95Ms": workspace_p95,
            "workspaceP99Ms": workspace_p99,
            "p95ByEndpointMs": p95_by_endpoint,
            "p99ByEndpointMs": p99_by_endpoint,
            "coldMs": cold_ms,
            "warmupMs": cold_ms,
            "samplesMs": samples,
            "payloadShapes": payload_shapes,
            "runtime": runtime,
        }
        OUTPUT_JSON.write_text(json.dumps(result, indent=2), encoding="utf-8")
        with HISTORY_JSONL.open("a", encoding="utf-8") as history_file:
            history_file.write(json.dumps(result, separators=(",", ":")) + "\n")
        print(json.dumps(result, indent=2))

        if status == "fail":
            raise SystemExit(f"Workspace API p95 {workspace_p95}ms exceeds fail threshold {FAIL_MS}ms")
    finally:
        stop_process(runtime_process)


if __name__ == "__main__":
    main()
