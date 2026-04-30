from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from runtime_helpers import ROOT_DIR, reexec_with_venv, runtime_value

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

LOG_DIR = ROOT_DIR / "output" / "playwright"
APP_EVIDENCE_PATH = LOG_DIR / "app-qa.json"
PORT_AUDIT_PATH = LOG_DIR / "runtime-port-audit.json"
SOURCES_QA_PATH = LOG_DIR / "sources-qa.json"
SOURCES_SMOKE_PATH = LOG_DIR / "sources-a11y-smoke.json"
READER_QA_PATH = LOG_DIR / "reader-qa.json"
READER_SMOKE_PATH = LOG_DIR / "reader-rich-smoke.json"
CAPTURE_SMOKE_PATH = LOG_DIR / "capture-smoke.json"
CONTINUITY_SMOKE_PATH = LOG_DIR / "continuity-smoke.json"
LAYOUT_QA_PATH = LOG_DIR / "layout-qa.json"
DEFAULT_FLOW_TIMEOUT_SECONDS = int(os.environ.get("RSSMASTER_QA_APP_STEP_TIMEOUT_SECONDS", "600"))
FLOW_TIMEOUT_SECONDS = {
    "ports": int(os.environ.get("RSSMASTER_QA_APP_PORTS_TIMEOUT_SECONDS", "60")),
    "contract": int(os.environ.get("RSSMASTER_QA_APP_CONTRACT_TIMEOUT_SECONDS", "180")),
    "layout": int(os.environ.get("RSSMASTER_QA_APP_LAYOUT_TIMEOUT_SECONDS", "540")),
    "sources": int(os.environ.get("RSSMASTER_QA_APP_SOURCES_TIMEOUT_SECONDS", "1200")),
    "reader": int(os.environ.get("RSSMASTER_QA_APP_READER_TIMEOUT_SECONDS", "1200")),
    "capture": int(os.environ.get("RSSMASTER_QA_APP_CAPTURE_TIMEOUT_SECONDS", "420")),
    "continuity": int(os.environ.get("RSSMASTER_QA_APP_CONTINUITY_TIMEOUT_SECONDS", "420")),
}
FLOW_ARTIFACTS = {
    "ports": [PORT_AUDIT_PATH],
    "layout": [LAYOUT_QA_PATH],
    "sources": [SOURCES_QA_PATH, SOURCES_SMOKE_PATH],
    "reader": [READER_QA_PATH, READER_SMOKE_PATH],
    "capture": [CAPTURE_SMOKE_PATH],
    "continuity": [CONTINUITY_SMOKE_PATH],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Uruchamia agregator QA dla RSSmaster, reutilizujac istniejace gate'y contract/runtime/browser.",
    )
    parser.add_argument("--web-port", type=int, default=int(runtime_value("RSSMASTER_WEB_PORT", "3000")))
    parser.add_argument("--api-port", type=int, default=int(runtime_value("RSSMASTER_API_PORT", "8000")))
    return parser.parse_args()


def ensure_output_dir() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def kill_process_tree(process: subprocess.Popen[Any]) -> None:
    if process.poll() is not None:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
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


def run_flow(name: str, command: list[str], env: dict[str, str], timeout_seconds: int) -> dict[str, Any]:
    started_at = time.time()
    started_at_iso = datetime.now(UTC).isoformat()
    print(f"[qa:app] {name}: {' '.join(command)}")
    process = subprocess.Popen(command, cwd=ROOT_DIR, env=env)
    timed_out = False
    exit_code = 1
    try:
        exit_code = process.wait(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        kill_process_tree(process)
        exit_code = 124

    duration_seconds = round(time.time() - started_at, 3)
    status = "timeout" if timed_out else ("passed" if exit_code == 0 else "failed")
    return {
        "name": name,
        "command": command,
        "started_at": started_at_iso,
        "completed_at": datetime.now(UTC).isoformat(),
        "exit_code": exit_code,
        "duration_seconds": duration_seconds,
        "timeout_seconds": timeout_seconds,
        "timed_out": timed_out,
        "failure_kind": "harness_timeout" if timed_out else ("product_or_gate_failure" if exit_code != 0 else None),
        "last_active_step": name,
        "next_diagnostic_command": " ".join(command),
        "status": status,
    }


def resolve_runtime_urls(base_env: dict[str, str], web_port: int, api_port: int) -> dict[str, str]:
    resolved_env = base_env.copy()
    resolved_web_port = web_port
    resolved_api_port = api_port

    for artifact_path in (READER_QA_PATH, SOURCES_QA_PATH):
        if not artifact_path.exists():
            continue
        try:
            artifact = read_json(artifact_path)
        except json.JSONDecodeError:
            continue

        resolved_ports = artifact.get("resolved_ports")
        if not isinstance(resolved_ports, dict):
            continue

        artifact_web_port = resolved_ports.get("web")
        artifact_api_port = resolved_ports.get("api")
        if isinstance(artifact_web_port, int) and artifact_web_port > 0:
            resolved_web_port = artifact_web_port
        if isinstance(artifact_api_port, int) and artifact_api_port > 0:
            resolved_api_port = artifact_api_port
        break

    resolved_env["RSSMASTER_WEB_URL"] = f"http://127.0.0.1:{resolved_web_port}"
    resolved_env["RSSMASTER_API_URL"] = f"http://127.0.0.1:{resolved_api_port}"
    return resolved_env


def collect_json_artifact(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "missing": True}

    try:
        return read_json(path)
    except json.JSONDecodeError:
        return {"path": str(path), "parse_error": True}


def collect_evidence() -> dict[str, Any]:
    return {
        "runtime_port_audit": collect_json_artifact(PORT_AUDIT_PATH),
        "sources_qa": collect_json_artifact(SOURCES_QA_PATH),
        "sources_smoke": collect_json_artifact(SOURCES_SMOKE_PATH),
        "reader_qa": collect_json_artifact(READER_QA_PATH),
        "reader_smoke": collect_json_artifact(READER_SMOKE_PATH),
        "capture_smoke": collect_json_artifact(CAPTURE_SMOKE_PATH),
        "continuity_smoke": collect_json_artifact(CONTINUITY_SMOKE_PATH),
        "layout_qa": collect_json_artifact(LAYOUT_QA_PATH),
    }


def _artifact_generated_at(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("generated_at", "checkedAt"):
        value = payload.get(key)
        if isinstance(value, str):
            return value
    run = payload.get("run")
    if isinstance(run, dict):
        value = run.get("completedAt") or run.get("completed_at")
        if isinstance(value, str):
            return value
    return None


def collect_artifact_freshness(run_started_epoch: float) -> dict[str, Any]:
    artifacts: dict[str, Any] = {}
    for flow_name, paths in FLOW_ARTIFACTS.items():
        flow_artifacts: list[dict[str, Any]] = []
        for path in paths:
            exists = path.exists()
            payload: dict[str, Any] | None = None
            generated_at: str | None = None
            parse_error = False
            if exists:
                try:
                    payload = read_json(path)
                    generated_at = _artifact_generated_at(payload)
                except json.JSONDecodeError:
                    parse_error = True
            modified_at = path.stat().st_mtime if exists else None
            flow_artifacts.append(
                {
                    "path": str(path),
                    "exists": exists,
                    "parse_error": parse_error,
                    "fresh": bool(exists and modified_at is not None and modified_at >= run_started_epoch - 1),
                    "modified_at": datetime.fromtimestamp(modified_at, UTC).isoformat() if modified_at else None,
                    "generated_at": generated_at,
                }
            )
        artifacts[flow_name] = flow_artifacts
    stale = [
        artifact
        for flow_artifacts in artifacts.values()
        for artifact in flow_artifacts
        if not artifact["fresh"] or artifact["parse_error"]
    ]
    return {
        "run_started_at": datetime.fromtimestamp(run_started_epoch, UTC).isoformat(),
        "artifacts": artifacts,
        "all_required_fresh": len(stale) == 0,
        "stale_or_missing": stale,
    }


def _is_artifact_missing(payload: Any) -> bool:
    return not isinstance(payload, dict) or bool(payload.get("missing")) or bool(payload.get("parse_error"))


def validate_artifacts(
    evidence: dict[str, Any],
    flow_statuses: dict[str, str],
    artifact_freshness: dict[str, Any],
) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    passed = True

    def add_check(name: str, condition: bool, details: dict[str, Any]) -> None:
        nonlocal passed
        status = "passed" if condition else "failed"
        passed = passed and condition
        checks.append({"name": name, "status": status, "details": details})

    add_check("check:ports flow", flow_statuses.get("ports") == "passed", {"status": flow_statuses.get("ports")})
    add_check("check:contract flow", flow_statuses.get("contract") == "passed", {"status": flow_statuses.get("contract")})
    add_check("qa:sources flow", flow_statuses.get("sources") == "passed", {"status": flow_statuses.get("sources")})
    add_check("qa:reader flow", flow_statuses.get("reader") == "passed", {"status": flow_statuses.get("reader")})
    add_check("check:layout flow", flow_statuses.get("layout") == "passed", {"status": flow_statuses.get("layout")})
    add_check("check:capture flow", flow_statuses.get("capture") == "passed", {"status": flow_statuses.get("capture")})
    add_check("check:continuity flow", flow_statuses.get("continuity") == "passed", {"status": flow_statuses.get("continuity")})
    add_check(
        "fresh current-run artifacts",
        bool(artifact_freshness.get("all_required_fresh")),
        {"stale_or_missing": artifact_freshness.get("stale_or_missing", [])},
    )

    port_audit = evidence.get("runtime_port_audit")
    add_check(
        "runtime port audit artifact",
        isinstance(port_audit, dict) and isinstance(port_audit.get("targets"), dict),
        {"evidence": str(PORT_AUDIT_PATH)},
    )

    sources_smoke = evidence.get("sources_smoke")
    if not _is_artifact_missing(sources_smoke):
        required_source_keys = [
            "keyboardReachedSkip",
            "keyboardReachedInput",
            "manualPreviewMovedFocus",
            "stalePreviewGuarded",
            "multiCandidateWorks",
            "transportFailureQuiet",
            "tabletRender",
            "mobileRender",
        ]
        add_check(
            "sources browser smoke evidence",
            all(bool(sources_smoke.get(key)) for key in required_source_keys)
            and not sources_smoke.get("consoleErrors")
            and not sources_smoke.get("pageErrors"),
            {"evidence": str(SOURCES_SMOKE_PATH), "keys": required_source_keys},
        )
    else:
        add_check("sources browser smoke evidence", False, {"evidence": str(SOURCES_SMOKE_PATH)})

    reader_smoke = evidence.get("reader_smoke")
    if not _is_artifact_missing(reader_smoke):
        required_reader_keys = [
            "articleOpened",
            "cleanedMode",
            "figureRendered",
            "imageRendered",
            "blockquoteRendered",
            "listRendered",
            "linkAbsolutized",
            "keyboardReachedBackButton",
            "keyboardReachedNotesButton",
        ]
        add_check(
            "reader browser smoke evidence",
            all(bool(reader_smoke.get(key)) for key in required_reader_keys)
            and not reader_smoke.get("consoleErrors")
            and not reader_smoke.get("pageErrors"),
            {"evidence": str(READER_SMOKE_PATH), "keys": required_reader_keys},
        )
    else:
        add_check("reader browser smoke evidence", False, {"evidence": str(READER_SMOKE_PATH)})

    layout_qa = evidence.get("layout_qa")
    if not _is_artifact_missing(layout_qa):
        release_signal = layout_qa.get("releaseSignal")
        add_check(
            "layout responsive QA evidence",
            isinstance(release_signal, dict)
            and bool(release_signal.get("browserSweepGreen"))
            and bool(release_signal.get("visualProofGreen"))
            and bool(release_signal.get("clickthroughGreen"))
            and not layout_qa.get("problemRoutes")
            and not layout_qa.get("problemStates")
            and not layout_qa.get("failedClicks"),
            {"evidence": str(LAYOUT_QA_PATH)},
        )
    else:
        add_check("layout responsive QA evidence", False, {"evidence": str(LAYOUT_QA_PATH)})

    sources_qa = evidence.get("sources_qa")
    if not _is_artifact_missing(sources_qa):
        steps = sources_qa.get("steps")
        add_check(
            "sources runtime QA bundle",
            isinstance(steps, list) and all(step.get("status") == "passed" for step in steps if isinstance(step, dict)),
            {"evidence": str(SOURCES_QA_PATH)},
        )
    else:
        add_check("sources runtime QA bundle", False, {"evidence": str(SOURCES_QA_PATH)})

    reader_qa = evidence.get("reader_qa")
    if not _is_artifact_missing(reader_qa):
        steps = reader_qa.get("steps")
        add_check(
            "reader runtime QA bundle",
            isinstance(steps, list) and all(step.get("status") == "passed" for step in steps if isinstance(step, dict)),
            {"evidence": str(READER_QA_PATH)},
        )
    else:
        add_check("reader runtime QA bundle", False, {"evidence": str(READER_QA_PATH)})

    capture_smoke = evidence.get("capture_smoke")
    if not _is_artifact_missing(capture_smoke):
        required_capture_keys = [
            "prefilledUrl",
            "prefilledTitle",
            "prefilledNote",
            "bookmarkletReady",
            "manifestShareTarget",
            "captureSucceeded",
            "openedSavedReader",
            "notePersisted",
        ]
        add_check(
            "capture browser smoke evidence",
            all(bool(capture_smoke.get(key)) for key in required_capture_keys)
            and not capture_smoke.get("consoleErrors")
            and not capture_smoke.get("pageErrors"),
            {"evidence": str(CAPTURE_SMOKE_PATH), "keys": required_capture_keys},
        )
    else:
        add_check("capture browser smoke evidence", False, {"evidence": str(CAPTURE_SMOKE_PATH)})

    continuity_smoke = evidence.get("continuity_smoke")
    if not _is_artifact_missing(continuity_smoke):
        required_continuity_keys = [
            "exportDownloaded",
            "bundleMarkedReadSection",
            "bundleCapturedActiveArticle",
            "bundleCapturedProgress",
            "restoredLibraryState",
            "restoredRoute",
            "restoredReaderScroll",
            "restoredLocalContinuity",
            "restoredLocalProgress",
        ]
        add_check(
            "continuity browser smoke evidence",
            all(bool(continuity_smoke.get(key)) for key in required_continuity_keys)
            and not continuity_smoke.get("consoleErrors")
            and not continuity_smoke.get("pageErrors"),
            {"evidence": str(CONTINUITY_SMOKE_PATH), "keys": required_continuity_keys},
        )
    else:
        add_check("continuity browser smoke evidence", False, {"evidence": str(CONTINUITY_SMOKE_PATH)})

    return {"status": "passed" if passed else "failed", "checks": checks}


def build_confidence_levels(evidence: dict[str, Any], flow_statuses: dict[str, str]) -> dict[str, Any]:
    contract_green = flow_statuses.get("contract") == "passed"
    fallback_runtime_green = (
        flow_statuses.get("sources") == "passed"
        and flow_statuses.get("reader") == "passed"
        and flow_statuses.get("layout") == "passed"
        and flow_statuses.get("capture") == "passed"
        and flow_statuses.get("continuity") == "passed"
    )

    runtime_audit = evidence.get("runtime_port_audit")
    targets = runtime_audit.get("targets") if isinstance(runtime_audit, dict) else None
    canonical_ports_clear = False
    canonical_notes = "not_proven"
    if isinstance(targets, dict):
        api_audit = targets.get("api")
        web_audit = targets.get("web")
        if isinstance(api_audit, dict) and isinstance(web_audit, dict):
            api_classification = str(api_audit.get("classification"))
            web_classification = str(web_audit.get("classification"))
            canonical_ports_clear = api_classification == "free" and web_classification == "free"
            canonical_notes = (
                "default ports are free for a future cold-start proof"
                if canonical_ports_clear
                else f"default ports are not both free (web={web_classification}, api={api_classification})"
            )

    return {
        "contract_green": contract_green,
        "fallback_runtime_green": fallback_runtime_green,
        "layout_green": flow_statuses.get("layout") == "passed",
        "canonical_cold_boot_green": False,
        "canonical_cold_boot_reason": "qa:app does not run qa:sources -- --cold-start; use that command separately",
        "canonical_ports_clear": canonical_ports_clear,
        "canonical_ports_note": canonical_notes,
    }


def coverage_map() -> list[dict[str, Any]]:
    return [
        {
            "flow": "boot runtime",
            "covered_by": ["check:ports", "qa:sources", "qa:reader", "check:layout"],
            "notes": "qa:sources and qa:reader prove fallback runtime boot; canonical cold boot still needs qa:sources -- --cold-start",
        },
        {
            "flow": "responsive shell and primary navigation",
            "covered_by": ["check:layout"],
            "notes": "desktop, tablet, mobile representative routes, mobile drawer states, and primary nav clickthrough are verified in scripts/check_layout_ui.mjs",
        },
        {
            "flow": "add source and sync",
            "covered_by": ["qa:sources", "check:contract"],
            "notes": "browser add-flow plus in-process sync and ingestion smoke",
        },
        {
            "flow": "open cleaned reader",
            "covered_by": ["qa:reader"],
            "notes": "reader smoke asserts article open, cleaned mode, formatting, media, and keyboard reachability",
        },
        {
            "flow": "capture from outside the app",
            "covered_by": ["check:capture"],
            "notes": "capture smoke asserts prefilled /capture entry, manifest share target, bookmarklet readiness, save success, and note persistence into the reader",
        },
        {
            "flow": "manual continuity bundle restore",
            "covered_by": ["check:continuity"],
            "notes": "continuity smoke exports the active reader session from /sources, clears local continuity, restores the bundle, and proves route plus progress recovery",
        },
        {
            "flow": "mutate read/save/archive/digest",
            "covered_by": ["check:contract"],
            "notes": "covered in the in-process API contract smoke against seeded data",
        },
        {
            "flow": "digest preview and build",
            "covered_by": ["check:contract"],
            "notes": "digest preview/build/history is verified in scripts/check_api.py",
        },
        {
            "flow": "delivery preflight and dry-run dispatch",
            "covered_by": ["check:contract"],
            "notes": "delivery preflight and dry-run log persistence is verified in scripts/check_api.py",
        },
    ]


def main() -> int:
    args = parse_args()
    ensure_output_dir()
    run_started_epoch = time.time()
    run_started_at = datetime.now(UTC).isoformat()
    last_active_step = "initializing"

    env = os.environ.copy()
    env["RSSMASTER_WEB_PORT"] = str(args.web_port)
    env["RSSMASTER_API_PORT"] = str(args.api_port)

    npm_bin = "npm.cmd" if os.name == "nt" else "npm"
    flows: dict[str, dict[str, Any]] = {}

    def run_named_flow(name: str, command: list[str], flow_env: dict[str, str]) -> None:
        nonlocal last_active_step
        last_active_step = name
        flows[name] = run_flow(name, command, flow_env, FLOW_TIMEOUT_SECONDS.get(name, DEFAULT_FLOW_TIMEOUT_SECONDS))

    try:
        run_named_flow("ports", [npm_bin, "run", "check:ports"], env)
        run_named_flow("contract", [npm_bin, "run", "check:contract"], env)
        run_named_flow("layout", [npm_bin, "run", "check:layout"], env)
        run_named_flow("sources", [sys.executable, str(ROOT_DIR / "scripts" / "run_sources_qa.py")], env)
        run_named_flow("reader", [sys.executable, str(ROOT_DIR / "scripts" / "run_reader_qa.py")], env)
        capture_env = resolve_runtime_urls(env, args.web_port, args.api_port)
        run_named_flow("capture", [npm_bin, "run", "check:capture"], capture_env)
        run_named_flow("continuity", [npm_bin, "run", "check:continuity"], capture_env)

        evidence = collect_evidence()
        artifact_freshness = collect_artifact_freshness(run_started_epoch)
        validations = validate_artifacts(evidence, {name: flow["status"] for name, flow in flows.items()}, artifact_freshness)
        confidence = build_confidence_levels(evidence, {name: flow["status"] for name, flow in flows.items()})
        overall_status = (
            "passed"
            if flows["contract"]["status"] == "passed"
            and flows["sources"]["status"] == "passed"
            and flows["reader"]["status"] == "passed"
            and flows["layout"]["status"] == "passed"
            and flows["capture"]["status"] == "passed"
            and flows["continuity"]["status"] == "passed"
            and validations["status"] == "passed"
            else "failed"
        )
        summary = {
            "generated_at": datetime.now(UTC).isoformat(),
            "run": {
                "started_at": run_started_at,
                "completed_at": datetime.now(UTC).isoformat(),
                "duration_seconds": round(time.time() - run_started_epoch, 3),
                "last_active_step": last_active_step,
                "target_urls": {
                    "web": f"http://127.0.0.1:{args.web_port}",
                    "api": f"http://127.0.0.1:{args.api_port}",
                },
            },
            "overall_status": overall_status,
            "flows": flows,
            "validations": validations,
            "confidence_levels": confidence,
            "artifact_freshness": artifact_freshness,
            "coverage_map": coverage_map(),
            "evidence": evidence,
            "artifacts": {
                "app_qa": str(APP_EVIDENCE_PATH),
                "runtime_port_audit": str(PORT_AUDIT_PATH),
                "sources_qa": str(SOURCES_QA_PATH),
                "sources_smoke": str(SOURCES_SMOKE_PATH),
                "reader_qa": str(READER_QA_PATH),
                "reader_smoke": str(READER_SMOKE_PATH),
                "capture_smoke": str(CAPTURE_SMOKE_PATH),
                "continuity_smoke": str(CONTINUITY_SMOKE_PATH),
                "layout_qa": str(LAYOUT_QA_PATH),
            },
        }
        write_json(APP_EVIDENCE_PATH, summary)
        print(f"[qa:app] overall status: {overall_status}")
        print(f"[qa:app] evidence: {APP_EVIDENCE_PATH}")
        return 0 if overall_status == "passed" else 1
    except Exception as error:
        artifact_freshness = collect_artifact_freshness(run_started_epoch)
        summary = {
            "generated_at": datetime.now(UTC).isoformat(),
            "run": {
                "started_at": run_started_at,
                "completed_at": datetime.now(UTC).isoformat(),
                "duration_seconds": round(time.time() - run_started_epoch, 3),
                "last_active_step": last_active_step,
                "target_urls": {
                    "web": f"http://127.0.0.1:{args.web_port}",
                    "api": f"http://127.0.0.1:{args.api_port}",
                },
            },
            "overall_status": "failed",
            "flows": flows,
            "error": str(error),
            "failure_kind": "harness_failure",
            "next_diagnostic_command": (
                flows.get(last_active_step, {}).get("next_diagnostic_command")
                if last_active_step in flows
                else "npm run qa:app"
            ),
            "artifact_freshness": artifact_freshness,
            "evidence": collect_evidence(),
            "artifacts": {
                "app_qa": str(APP_EVIDENCE_PATH),
                "runtime_port_audit": str(PORT_AUDIT_PATH),
                "sources_qa": str(SOURCES_QA_PATH),
                "sources_smoke": str(SOURCES_SMOKE_PATH),
                "reader_qa": str(READER_QA_PATH),
                "reader_smoke": str(READER_SMOKE_PATH),
                "capture_smoke": str(CAPTURE_SMOKE_PATH),
                "continuity_smoke": str(CONTINUITY_SMOKE_PATH),
                "layout_qa": str(LAYOUT_QA_PATH),
            },
        }
        write_json(APP_EVIDENCE_PATH, summary)
        print(f"[qa:app] FAIL: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
