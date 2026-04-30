from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OWNERSHIP_JSON = ROOT / "docs" / "code-ownership.json"
OWNERSHIP_DOC = ROOT / "docs" / "code-ownership.md"

REQUIRED_MECHANISMS = {
    "auth",
    "reader",
    "sources",
    "library",
    "annotations",
    "digest",
    "capture",
    "ranking_stories",
    "workspace_facade",
    "storage_migrations",
    "qa_harness",
}

REQUIRED_FIELDS = {
    "owner",
    "role",
    "current_score",
    "target_score",
    "primary_paths",
    "verification",
    "next_refactor_tasks",
}


def _fail(message: str) -> None:
    print(f"ownership check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        _fail(f"missing {path.relative_to(ROOT)}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        _fail(f"invalid JSON in {path.relative_to(ROOT)}: {error}")


def _require_non_empty_list(value: Any, field: str, mechanism: str) -> list[Any]:
    if not isinstance(value, list) or not value:
        _fail(f"{mechanism}.{field} must be a non-empty list")
    return value


def _validate_score(value: Any, field: str, mechanism: str) -> float:
    if not isinstance(value, int | float):
        _fail(f"{mechanism}.{field} must be numeric")
    score = float(value)
    if score < 1 or score > 10:
        _fail(f"{mechanism}.{field} must be within 1..10")
    return score


def _path_exists(path_value: str) -> bool:
    path = ROOT / path_value
    if any(marker in path_value for marker in (" + ", " or ")):
        return True
    return path.exists()


def validate(payload: dict[str, Any]) -> None:
    if payload.get("schema_version") != 1:
        _fail("schema_version must be 1")

    baseline = payload.get("baseline")
    if not isinstance(baseline, dict):
        _fail("baseline must be present")
    current = _validate_score(baseline.get("overall_current_score"), "overall_current_score", "baseline")
    target = _validate_score(baseline.get("overall_target_score"), "overall_target_score", "baseline")
    if target < current:
        _fail("baseline target score must be >= current score")

    mechanisms = payload.get("mechanisms")
    if not isinstance(mechanisms, dict):
        _fail("mechanisms must be present")

    missing = sorted(REQUIRED_MECHANISMS.difference(mechanisms))
    if missing:
        _fail(f"missing mechanisms: {', '.join(missing)}")

    for mechanism in sorted(REQUIRED_MECHANISMS):
        entry = mechanisms[mechanism]
        if not isinstance(entry, dict):
            _fail(f"{mechanism} must be an object")
        missing_fields = sorted(REQUIRED_FIELDS.difference(entry))
        if missing_fields:
            _fail(f"{mechanism} missing fields: {', '.join(missing_fields)}")

        for field in ("owner", "role"):
            if not isinstance(entry[field], str) or not entry[field].strip():
                _fail(f"{mechanism}.{field} must be a non-empty string")

        current_score = _validate_score(entry["current_score"], "current_score", mechanism)
        target_score = _validate_score(entry["target_score"], "target_score", mechanism)
        if target_score < current_score:
            _fail(f"{mechanism}.target_score must be >= current_score")

        primary_paths = _require_non_empty_list(entry["primary_paths"], "primary_paths", mechanism)
        for path_value in primary_paths:
            if not isinstance(path_value, str) or not path_value.strip():
                _fail(f"{mechanism}.primary_paths contains a blank path")
            if not _path_exists(path_value):
                _fail(f"{mechanism}.primary_paths references missing path: {path_value}")

        verification = _require_non_empty_list(entry["verification"], "verification", mechanism)
        for command in verification:
            if not isinstance(command, str) or not command.strip():
                _fail(f"{mechanism}.verification contains a blank command")

        tasks = _require_non_empty_list(entry["next_refactor_tasks"], "next_refactor_tasks", mechanism)
        for task in tasks:
            if not isinstance(task, str) or len(task.strip()) < 12:
                _fail(f"{mechanism}.next_refactor_tasks contains an underspecified task")

    workspace_role = mechanisms["workspace_facade"]["role"].casefold()
    if "facade" not in workspace_role and "aggregation" not in workspace_role:
        _fail("workspace_facade role must explicitly remain a facade/aggregation layer")


def validate_markdown(payload: dict[str, Any]) -> None:
    if not OWNERSHIP_DOC.exists():
        _fail(f"missing {OWNERSHIP_DOC.relative_to(ROOT)}")
    text = OWNERSHIP_DOC.read_text(encoding="utf-8")
    for mechanism in REQUIRED_MECHANISMS:
        if f"`{mechanism}`" not in text:
            _fail(f"docs/code-ownership.md does not mention `{mechanism}`")
    if "npm run check:ownership" not in text:
        _fail("docs/code-ownership.md must document npm run check:ownership")
    if str(payload["baseline"]["overall_target_score"]) not in text:
        _fail("docs/code-ownership.md must include the target score")


def main() -> int:
    payload = _load_json(OWNERSHIP_JSON)
    validate(payload)
    validate_markdown(payload)
    mechanisms = payload["mechanisms"]
    current = payload["baseline"]["overall_current_score"]
    target = payload["baseline"]["overall_target_score"]
    print(
        json.dumps(
            {
                "status": "passed",
                "mechanism_count": len(mechanisms),
                "current_score": current,
                "target_score": target,
                "ownership_doc": str(OWNERSHIP_DOC.relative_to(ROOT)),
                "ownership_json": str(OWNERSHIP_JSON.relative_to(ROOT)),
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
