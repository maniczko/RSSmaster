from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from runtime_helpers import ROOT_DIR, reexec_with_venv

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

from app.db.initializer import MIGRATIONS, REQUIRED_TABLES, SCHEMA_VERSION, connect, ensure_database  # noqa: E402

OUTPUT_PATH = ROOT_DIR / "output" / "storage-schema-check.json"

REQUIRED_INDEXES = {
    "idx_channels_normalized_feed_url_unique",
    "idx_items_dedupe_key_unique",
    "idx_items_channel_guid_unique",
    "idx_items_published_at",
    "idx_items_digest_candidate",
    "idx_job_runs_type_status",
    "idx_digest_history_created_at",
    "idx_delivery_logs_digest_id",
    "idx_ranking_state_status_score",
}

REQUIRED_COLUMNS = {
    "items": {
        "channel_id",
        "normalized_source_url",
        "raw_html",
        "cleaned_html",
        "content_text",
        "excerpt",
        "extraction_status",
        "extraction_error",
        "digest_candidate",
        "dedupe_key",
        "content_hash",
    },
    "digest_history": {
        "job_run_id",
        "status",
        "selection_snapshot_json",
        "category_summary_json",
        "artifact_path",
        "artifact_sha256",
        "generated_at",
        "sent_at",
    },
    "delivery_logs": {
        "job_run_id",
        "digest_id",
        "target_kind",
        "recipient",
        "status",
        "provider_message_id",
        "attempt_count",
        "error_message",
    },
    "job_runs": {
        "job_type",
        "trigger_kind",
        "status",
        "scope_json",
        "metadata_json",
        "retry_count",
        "error_message",
    },
}


def read_sqlite_names(connection, object_type: str) -> set[str]:
    rows = connection.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = ? AND name NOT LIKE 'sqlite_%'
        """,
        (object_type,),
    ).fetchall()
    return {str(row["name"]) for row in rows}


def read_columns(connection, table: str) -> set[str]:
    rows = connection.execute(f"PRAGMA table_info({table})").fetchall()
    return {str(row["name"]) for row in rows}


def build_report(database_path: Path) -> dict[str, object]:
    state = ensure_database(database_path)
    failures: list[str] = []

    migration_status = state.get("migration_status")
    if not isinstance(migration_status, dict) or migration_status.get("status") != "ready":
        failures.append(f"migration_status_not_ready: {migration_status}")
    if migration_status.get("current_version") != SCHEMA_VERSION:
        failures.append(f"user_version_mismatch: {migration_status.get('current_version')} != {SCHEMA_VERSION}")
    if migration_status.get("latest_version") != SCHEMA_VERSION:
        failures.append(f"latest_version_mismatch: {migration_status.get('latest_version')} != {SCHEMA_VERSION}")

    with connect(database_path) as connection:
        foreign_keys_enabled = int(connection.execute("PRAGMA foreign_keys").fetchone()[0]) == 1
        user_version = int(connection.execute("PRAGMA user_version").fetchone()[0])
        tables = read_sqlite_names(connection, "table")
        indexes = read_sqlite_names(connection, "index")
        migration_rows = connection.execute(
            """
            SELECT version, name
            FROM schema_migrations
            ORDER BY version
            """
        ).fetchall()
        applied_migrations = [
            {"version": int(row["version"]), "name": str(row["name"])}
            for row in migration_rows
        ]

        missing_tables = sorted(REQUIRED_TABLES - tables)
        missing_indexes = sorted(REQUIRED_INDEXES - indexes)
        missing_columns: dict[str, list[str]] = {}
        for table, required_columns in REQUIRED_COLUMNS.items():
            columns = read_columns(connection, table)
            table_missing = sorted(required_columns - columns)
            if table_missing:
                missing_columns[table] = table_missing

    if not foreign_keys_enabled:
        failures.append("foreign_keys_disabled")
    if user_version != SCHEMA_VERSION:
        failures.append(f"pragma_user_version_mismatch: {user_version} != {SCHEMA_VERSION}")
    if missing_tables:
        failures.append(f"missing_tables: {missing_tables}")
    if missing_indexes:
        failures.append(f"missing_indexes: {missing_indexes}")
    if missing_columns:
        failures.append(f"missing_columns: {missing_columns}")
    if len(applied_migrations) != len(MIGRATIONS):
        failures.append(f"migration_count_mismatch: {len(applied_migrations)} != {len(MIGRATIONS)}")

    return {
        "status": "passed" if not failures else "failed",
        "database_path": str(database_path),
        "schema_version": SCHEMA_VERSION,
        "migration_status": migration_status,
        "applied_migrations": applied_migrations,
        "foreign_keys_enabled": foreign_keys_enabled,
        "required_tables": sorted(REQUIRED_TABLES),
        "required_indexes": sorted(REQUIRED_INDEXES),
        "required_columns": {key: sorted(value) for key, value in REQUIRED_COLUMNS.items()},
        "table_count": len(tables),
        "index_count": len(indexes),
        "failures": failures,
        "output_path": str(OUTPUT_PATH),
    }


def main() -> int:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="rssmaster-storage-schema-", ignore_cleanup_errors=True) as tempdir:
        report = build_report(Path(tempdir) / "rssmaster-storage-check.db")

    OUTPUT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
