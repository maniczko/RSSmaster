from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from runtime_helpers import ROOT_DIR, reexec_with_venv

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

OUTPUT_DIR = ROOT_DIR / "output" / "release-evidence"
PLAYWRIGHT_DIR = ROOT_DIR / "output" / "playwright"
LATEST_JSON_PATH = OUTPUT_DIR / "release-evidence-latest.json"
LATEST_MD_PATH = OUTPUT_DIR / "release-evidence-latest.md"


@dataclass(frozen=True)
class Gate:
    id: str
    label: str
    command: list[str]
    timeout_seconds: int
    artifacts: tuple[Path, ...] = ()
    required: bool = True


def npm_bin() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def gates() -> list[Gate]:
    npm = npm_bin()
    return [
        Gate("ports", "Runtime port audit", [npm, "run", "check:ports"], 60, (PLAYWRIGHT_DIR / "runtime-port-audit.json",)),
        Gate("health", "Live health diagnostics", [npm, "run", "health"], 120),
        Gate("build", "Frontend production build", [npm, "run", "build"], 900),
        Gate("unit", "Unit test suite", [npm, "run", "test:unit"], 900),
        Gate("contract", "API contract smoke", [npm, "run", "check:contract"], 240),
        Gate("auth", "Local auth browser smoke", [npm, "run", "check:auth"], 420, (PLAYWRIGHT_DIR / "auth-smoke" / "auth-smoke.json",)),
        Gate("sources", "Sources browser smoke", [npm, "run", "check:sources"], 540, (PLAYWRIGHT_DIR / "sources-a11y-smoke.json",)),
        Gate("reader", "Reader browser smoke", [npm, "run", "check:reader"], 540, (PLAYWRIGHT_DIR / "reader-rich-smoke.json",)),
        Gate("layout", "Layout browser sweep", [npm, "run", "check:layout"], 540, (PLAYWRIGHT_DIR / "layout-qa.json",)),
        Gate("capture", "Capture browser smoke", [npm, "run", "check:capture"], 420, (PLAYWRIGHT_DIR / "capture-smoke.json",)),
        Gate("continuity", "Continuity browser smoke", [npm, "run", "check:continuity"], 420, (PLAYWRIGHT_DIR / "continuity-smoke.json",)),
        Gate("digest", "Persisted digest candidate browser smoke", [npm, "run", "check:digest"], 540, (PLAYWRIGHT_DIR / "digest-smoke" / "digest-smoke.json",)),
        Gate("feed-reading", "Feed reading diagnostics smoke", [npm, "run", "check:feed-reading"], 540, (PLAYWRIGHT_DIR / "feed-reading" / "feed-reading-smoke.json",)),
        Gate("reader-interaction", "Reader interaction smoke", [npm, "run", "check:reader:interaction"], 540, (PLAYWRIGHT_DIR / "reader-interaction-smoke.json",)),
        Gate("perf-browser", "Browser performance smoke", [npm, "run", "check:perf:browser"], 420, (PLAYWRIGHT_DIR / "browser-perf-smoke.json",)),
        Gate("perf-workspace", "Workspace API performance smoke", [npm, "run", "check:perf:workspace"], 240, (PLAYWRIGHT_DIR / "workspace-perf-smoke.json",)),
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generuje timestamped release evidence dla lokalnego RSSmaster.")
    parser.add_argument(
        "--reuse-fresh",
        action="store_true",
        help="Pomin bramki z wystarczajaco swiezymi artefaktami i oznacz je jako skipped_fresh.",
    )
    parser.add_argument(
        "--max-artifact-age-minutes",
        type=int,
        default=120,
        help="Maksymalny wiek artefaktu uzywanego przez --reuse-fresh.",
    )
    parser.add_argument(
        "--only",
        default="",
        help="Opcjonalna lista gate id po przecinku, przydatna do diagnostyki runnera.",
    )
    return parser.parse_args()


def kill_process_tree(process: subprocess.Popen[Any]) -> None:
    if process.poll() is not None:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            cwd=ROOT_DIR,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return

    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def artifact_reported_status(payload: dict[str, Any] | None) -> str | None:
    if not isinstance(payload, dict):
        return None

    artifact = payload.get("artifact")
    artifact_status = artifact.get("status") if isinstance(artifact, dict) else None
    return payload.get("status") or payload.get("overall_status") or artifact_status


def artifact_schema_valid(payload: dict[str, Any] | None) -> bool:
    if not isinstance(payload, dict):
        return False

    validation = payload.get("artifactSchemaValidation")
    if isinstance(validation, dict):
        return validation.get("valid") is True

    return False


def artifact_details(paths: tuple[Path, ...], run_started_epoch: float, max_age_minutes: int) -> list[dict[str, Any]]:
    now_epoch = time.time()
    details: list[dict[str, Any]] = []
    for path in paths:
        exists = path.exists()
        modified_epoch = path.stat().st_mtime if exists else None
        age_seconds = now_epoch - modified_epoch if modified_epoch is not None else None
        payload = read_json(path) if exists else None
        parse_ok = payload is not None if exists else False
        reported_status = artifact_reported_status(payload)
        schema_valid = artifact_schema_valid(payload)
        fresh_enough_to_reuse = bool(age_seconds is not None and age_seconds <= max_age_minutes * 60)
        details.append(
            {
                "path": str(path),
                "exists": exists,
                "fresh_for_current_run": bool(modified_epoch is not None and modified_epoch >= run_started_epoch - 1),
                "fresh_enough_to_reuse": fresh_enough_to_reuse,
                "modified_at": datetime.fromtimestamp(modified_epoch, UTC).isoformat() if modified_epoch else None,
                "age_seconds": round(age_seconds, 3) if age_seconds is not None else None,
                "parse_ok": parse_ok,
                "artifact_schema_valid": schema_valid,
                "reported_status": reported_status,
                "reusable": bool(exists and fresh_enough_to_reuse and parse_ok and schema_valid and reported_status == "passed"),
            }
        )
    return details


def can_reuse_gate(gate: Gate, max_age_minutes: int) -> bool:
    if gate.id == "ports":
        return False
    if not gate.artifacts:
        return False
    artifacts = artifact_details(gate.artifacts, 0, max_age_minutes)
    return all(item["reusable"] for item in artifacts)


def run_gate(gate: Gate, env: dict[str, str], run_started_epoch: float, max_age_minutes: int, reuse_fresh: bool) -> dict[str, Any]:
    if reuse_fresh and can_reuse_gate(gate, max_age_minutes):
        return {
            "id": gate.id,
            "label": gate.label,
            "command": gate.command,
            "status": "skipped_fresh",
            "required": gate.required,
            "duration_seconds": 0,
            "timeout_seconds": gate.timeout_seconds,
            "failure_kind": None,
            "next_diagnostic_command": " ".join(gate.command),
            "artifacts": artifact_details(gate.artifacts, run_started_epoch, max_age_minutes),
        }

    started = time.time()
    print(f"[release:evidence] {gate.id}: {' '.join(gate.command)}")
    process = subprocess.Popen(gate.command, cwd=ROOT_DIR, env=env)
    timed_out = False
    exit_code = 1
    try:
        exit_code = process.wait(timeout=gate.timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        kill_process_tree(process)
        exit_code = 124

    duration_seconds = round(time.time() - started, 3)
    artifacts = artifact_details(gate.artifacts, run_started_epoch, max_age_minutes)
    artifacts_required_and_stale = bool(gate.artifacts) and not all(item["fresh_for_current_run"] for item in artifacts)
    artifacts_required_and_invalid = bool(gate.artifacts) and not all(
        item["parse_ok"] and item["artifact_schema_valid"] and item["reported_status"] == "passed" for item in artifacts
    )
    status = "timeout" if timed_out else ("passed" if exit_code == 0 else "failed")
    if status == "passed" and (artifacts_required_and_stale or artifacts_required_and_invalid):
        status = "stale"

    return {
        "id": gate.id,
        "label": gate.label,
        "command": gate.command,
        "status": status,
        "required": gate.required,
        "exit_code": exit_code,
        "duration_seconds": duration_seconds,
        "timeout_seconds": gate.timeout_seconds,
        "timed_out": timed_out,
        "failure_kind": "harness_timeout" if timed_out else ("stale_or_invalid_artifact" if status == "stale" else ("product_or_gate_failure" if exit_code != 0 else None)),
        "next_diagnostic_command": " ".join(gate.command),
        "artifacts": artifacts,
    }


def unverified_checks() -> list[dict[str, str]]:
    return [
        {
            "id": "live-smtp-send",
            "status": "unverified",
            "reason": "Requires real SMTP credentials and an intentional live send.",
            "next_step": "Follow docs/runbooks/live-delivery-signoff.md and store evidence under ignored output/live-delivery/.",
        },
        {
            "id": "kindle-acceptance",
            "status": "unverified",
            "reason": "Requires Amazon Kindle inbox acceptance and rendering confirmation.",
            "next_step": "Copy docs/runbooks/live-delivery-evidence-template.md into output/live-delivery/ and complete the Kindle acceptance section.",
        },
        {
            "id": "screen-reader-spoken-signoff",
            "status": "unverified",
            "reason": "Browser automation does not prove spoken NVDA/Narrator output.",
            "next_step": "Run docs/runbooks/a11y-screen-reader-signoff.md.",
        },
    ]


def write_markdown(path: Path, summary: dict[str, Any]) -> None:
    lines = [
        f"# RSSmaster release evidence {summary['run']['id']}",
        "",
        f"- Overall status: `{summary['overall_status']}`",
        f"- Started: `{summary['run']['started_at']}`",
        f"- Completed: `{summary['run']['completed_at']}`",
        f"- Duration: `{summary['run']['duration_seconds']}s`",
        "",
        "## Gates",
        "",
        "| Gate | Status | Duration | Next diagnostic |",
        "| --- | --- | ---: | --- |",
    ]
    for gate in summary["gates"]:
        lines.append(
            f"| `{gate['id']}` | `{gate['status']}` | `{gate.get('duration_seconds', 0)}s` | `{gate['next_diagnostic_command']}` |"
        )
    lines.extend(["", "## Unverified", ""])
    for item in summary["unverified_checks"]:
        lines.append(f"- `{item['id']}`: {item['reason']} Next: {item['next_step']}")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    args = parse_args()
    run_started_epoch = time.time()
    run_started_at = datetime.now(UTC)
    run_id = run_started_at.strftime("release-%Y%m%dT%H%M%SZ")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    selected = {item.strip() for item in args.only.split(",") if item.strip()}
    selected_gates = [gate for gate in gates() if not selected or gate.id in selected]
    env = os.environ.copy()
    results = [
        run_gate(gate, env, run_started_epoch, args.max_artifact_age_minutes, args.reuse_fresh)
        for gate in selected_gates
    ]
    failed = [gate for gate in results if gate["required"] and gate["status"] not in {"passed", "skipped_fresh"}]
    stale = [gate for gate in results if gate["status"] == "stale"]
    timeouts = [gate for gate in results if gate["status"] == "timeout"]
    completed_at = datetime.now(UTC)
    summary = {
        "generated_at": completed_at.isoformat(),
        "overall_status": "passed" if not failed else "failed",
        "run": {
            "id": run_id,
            "started_at": run_started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_seconds": round(time.time() - run_started_epoch, 3),
            "reuse_fresh": args.reuse_fresh,
            "max_artifact_age_minutes": args.max_artifact_age_minutes,
            "only": sorted(selected),
        },
        "gates": results,
        "summary": {
            "passed": sum(1 for gate in results if gate["status"] == "passed"),
            "skipped_fresh": sum(1 for gate in results if gate["status"] == "skipped_fresh"),
            "failed": len(failed),
            "stale": len(stale),
            "timeouts": len(timeouts),
        },
        "unverified_checks": unverified_checks(),
        "artifacts": {
            "json": str(OUTPUT_DIR / f"{run_id}.json"),
            "markdown": str(OUTPUT_DIR / f"{run_id}.md"),
            "latest_json": str(LATEST_JSON_PATH),
            "latest_markdown": str(LATEST_MD_PATH),
        },
    }

    json_path = OUTPUT_DIR / f"{run_id}.json"
    markdown_path = OUTPUT_DIR / f"{run_id}.md"
    json_payload = json.dumps(summary, indent=2, sort_keys=True)
    json_path.write_text(json_payload, encoding="utf-8")
    LATEST_JSON_PATH.write_text(json_payload, encoding="utf-8")
    write_markdown(markdown_path, summary)
    write_markdown(LATEST_MD_PATH, summary)

    print(f"[release:evidence] overall status: {summary['overall_status']}")
    print(f"[release:evidence] json: {json_path}")
    print(f"[release:evidence] markdown: {markdown_path}")
    for gate in results:
        print(f"[release:evidence] {gate['id']}: {gate['status']} ({gate.get('duration_seconds', 0)}s)")
    return 0 if summary["overall_status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
