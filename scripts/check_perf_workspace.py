from __future__ import annotations

import json
import os
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / "output" / "playwright"
OUTPUT_JSON = OUTPUT_DIR / "workspace-perf-smoke.json"
API_URL = os.environ.get("RSSMASTER_API_URL", "http://127.0.0.1:8000").rstrip("/")
WARNING_MS = 1500
FAIL_MS = 2500


def fetch_json(path: str) -> tuple[int, object]:
    started = time.perf_counter()
    request = urllib.request.Request(
        f"{API_URL}{path}",
        headers={"Accept": "application/json", "Origin": "http://127.0.0.1:3000"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read().decode("utf-8")
        status = response.status
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    return elapsed_ms, json.loads(body) if body else {}


def percentile_95(values: list[float]) -> float:
    if len(values) == 1:
        return values[0]
    return round(statistics.quantiles(values, n=20, method="inclusive")[18], 2)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    endpoints = [
        "/health",
        "/api/v1/workspace/ranking?limit=12",
        "/api/v1/workspace/stories?limit=8",
        "/api/v1/workspace/briefing",
    ]
    samples: dict[str, list[float]] = {endpoint: [] for endpoint in endpoints}
    payload_shapes: dict[str, list[str]] = {}
    warmup_ms: dict[str, float] = {}

    for endpoint in endpoints:
        elapsed_ms, _payload = fetch_json(endpoint)
        warmup_ms[endpoint] = elapsed_ms

    for endpoint in endpoints:
        for _ in range(3):
            try:
                elapsed_ms, payload = fetch_json(endpoint)
            except (urllib.error.URLError, TimeoutError) as error:
                raise RuntimeError(f"Workspace perf endpoint failed for {endpoint}: {error}") from error
            samples[endpoint].append(elapsed_ms)
            payload_shapes[endpoint] = sorted(payload.keys()) if isinstance(payload, dict) else [type(payload).__name__]

    p95_by_endpoint = {endpoint: percentile_95(values) for endpoint, values in samples.items()}
    workspace_values = [
        elapsed
        for endpoint, values in samples.items()
        if endpoint != "/health"
        for elapsed in values
    ]
    workspace_p95 = percentile_95(workspace_values)
    status = "pass"
    if workspace_p95 > FAIL_MS:
        status = "fail"
    elif workspace_p95 > WARNING_MS:
        status = "warn"

    result = {
        "status": status,
        "thresholds": {
            "warningMs": WARNING_MS,
            "failMs": FAIL_MS,
        },
        "workspaceP95Ms": workspace_p95,
        "p95ByEndpointMs": p95_by_endpoint,
        "warmupMs": warmup_ms,
        "samplesMs": samples,
        "payloadShapes": payload_shapes,
    }
    OUTPUT_JSON.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))

    if status == "fail":
        raise SystemExit(f"Workspace API p95 {workspace_p95}ms exceeds fail threshold {FAIL_MS}ms")


if __name__ == "__main__":
    main()
