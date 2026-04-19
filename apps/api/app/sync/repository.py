from __future__ import annotations

import json
from pathlib import Path
import sqlite3
from uuid import uuid4

from app.db.initializer import connect


class SyncRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def list_target_channels(
        self,
        *,
        channel_ids: list[str] | None,
        mode: str,
    ) -> list[dict[str, object]]:
        clauses = ["state != 'archived'"]
        params: list[object] = []

        if self._mode_uses_active_channels(mode, has_explicit_channel_ids=bool(channel_ids)):
            clauses.append("state = 'active'")

        if channel_ids:
            placeholders = ", ".join("?" for _ in channel_ids)
            clauses.append(f"id IN ({placeholders})")
            params.extend(channel_ids)

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    id,
                    title,
                    site_url,
                    feed_url,
                    state
                FROM channels
                WHERE {' AND '.join(clauses)}
                ORDER BY created_at DESC, id DESC
                """,
                params,
            ).fetchall()

        return [self._serialize_channel(row) for row in rows]

    def create_run(self, *, scope: dict[str, object], trigger_kind: str, mode: str) -> dict[str, object]:
        run_id = f"run_{uuid4().hex[:12]}"
        persisted_scope = self._serialize_scope(scope=scope, mode=mode)
        metadata = {
            "channels_total": len(persisted_scope.get("channel_ids", [])),
            "channels_succeeded": 0,
            "channels_failed": 0,
            "items_seen": 0,
            "items_created": 0,
            "items_skipped": 0,
        }

        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO job_runs (
                    id,
                    job_type,
                    trigger_kind,
                    status,
                    scope_json,
                    metadata_json
                )
                VALUES (?, 'sync', ?, 'pending', ?, ?)
                """,
                [
                    run_id,
                    trigger_kind,
                    json.dumps(persisted_scope, separators=(",", ":"), sort_keys=True),
                    json.dumps(metadata, separators=(",", ":"), sort_keys=True),
                ],
            )
            connection.commit()

        run = self.get_run(run_id)
        if run is None:
            raise RuntimeError("Sync run insert succeeded but could not be reloaded.")
        return run

    def list_runs(self, *, limit: int) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    job_type,
                    trigger_kind,
                    status,
                    scope_json,
                    metadata_json,
                    started_at,
                    completed_at,
                    total_count,
                    success_count,
                    failure_count,
                    retry_count,
                    error_code,
                    error_message,
                    error_details_json,
                    created_at,
                    updated_at
                FROM job_runs
                WHERE job_type = 'sync'
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                [limit],
            ).fetchall()

        return [self._serialize_run(row) for row in rows]

    def get_run(self, run_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    job_type,
                    trigger_kind,
                    status,
                    scope_json,
                    metadata_json,
                    started_at,
                    completed_at,
                    total_count,
                    success_count,
                    failure_count,
                    retry_count,
                    error_code,
                    error_message,
                    error_details_json,
                    created_at,
                    updated_at
                FROM job_runs
                WHERE id = ? AND job_type = 'sync'
                """,
                [run_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_run(row)

    def mark_run_running(self, run_id: str, *, started_at: str, total_count: int) -> None:
        metadata = {
            "channels_total": total_count,
            "channels_succeeded": 0,
            "channels_failed": 0,
            "items_seen": 0,
            "items_created": 0,
            "items_skipped": 0,
        }
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE job_runs
                SET
                    status = 'running',
                    started_at = ?,
                    total_count = ?,
                    success_count = 0,
                    failure_count = 0,
                    metadata_json = ?,
                    error_code = NULL,
                    error_message = NULL,
                    error_details_json = NULL
                WHERE id = ?
                """,
                [
                    started_at,
                    total_count,
                    json.dumps(metadata, separators=(",", ":"), sort_keys=True),
                    run_id,
                ],
            )
            connection.commit()

    def update_run_progress(
        self,
        run_id: str,
        *,
        total_count: int,
        success_count: int,
        failure_count: int,
        items_seen: int,
        items_created: int,
        items_skipped: int,
        errors: list[dict[str, object]],
    ) -> None:
        metadata = {
            "channels_total": total_count,
            "channels_succeeded": success_count,
            "channels_failed": failure_count,
            "items_seen": items_seen,
            "items_created": items_created,
            "items_skipped": items_skipped,
        }
        error_payload = {"errors": errors}
        error_code = "sync_partial_failure" if failure_count else None
        error_message = f"{failure_count} channel(s) failed during sync." if failure_count else None

        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE job_runs
                SET
                    status = 'running',
                    total_count = ?,
                    success_count = ?,
                    failure_count = ?,
                    metadata_json = ?,
                    error_code = ?,
                    error_message = ?,
                    error_details_json = ?
                WHERE id = ?
                """,
                [
                    total_count,
                    success_count,
                    failure_count,
                    json.dumps(metadata, separators=(",", ":"), sort_keys=True),
                    error_code,
                    error_message,
                    json.dumps(error_payload, separators=(",", ":"), sort_keys=True),
                    run_id,
                ],
            )
            connection.commit()

    def complete_run(
        self,
        run_id: str,
        *,
        status: str,
        completed_at: str,
        duration_ms: int,
        total_count: int,
        success_count: int,
        failure_count: int,
        items_seen: int,
        items_created: int,
        items_skipped: int,
        errors: list[dict[str, object]],
        error_code: str | None,
        error_message: str | None,
    ) -> None:
        metadata = {
            "channels_total": total_count,
            "channels_succeeded": success_count,
            "channels_failed": failure_count,
            "items_seen": items_seen,
            "items_created": items_created,
            "items_skipped": items_skipped,
        }

        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE job_runs
                SET
                    status = ?,
                    completed_at = ?,
                    duration_ms = ?,
                    total_count = ?,
                    success_count = ?,
                    failure_count = ?,
                    metadata_json = ?,
                    error_code = ?,
                    error_message = ?,
                    error_details_json = ?
                WHERE id = ?
                """,
                [
                    status,
                    completed_at,
                    duration_ms,
                    total_count,
                    success_count,
                    failure_count,
                    json.dumps(metadata, separators=(",", ":"), sort_keys=True),
                    error_code,
                    error_message,
                    json.dumps({"errors": errors}, separators=(",", ":"), sort_keys=True),
                    run_id,
                ],
            )
            connection.commit()

    def record_channel_success(self, channel_id: str, *, fetched_at: str) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE channels
                SET
                    last_fetch_at = ?,
                    last_successful_fetch_at = ?,
                    last_error_code = NULL,
                    last_error_message = NULL,
                    last_error_at = NULL,
                    consecutive_failures = 0
                WHERE id = ?
                """,
                [fetched_at, fetched_at, channel_id],
            )
            connection.commit()

    def record_channel_failure(
        self,
        channel_id: str,
        *,
        fetched_at: str,
        error_code: str,
        error_message: str,
    ) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE channels
                SET
                    last_fetch_at = ?,
                    last_error_code = ?,
                    last_error_message = ?,
                    last_error_at = ?,
                    consecutive_failures = consecutive_failures + 1
                WHERE id = ?
                """,
                [fetched_at, error_code, error_message, fetched_at, channel_id],
            )
            connection.commit()

    def insert_items(self, channel_id: str, *, entries: list[dict[str, object]]) -> int:
        if not entries:
            return 0

        created = 0
        with connect(self.database_path) as connection:
            for entry in entries:
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO items (
                        id,
                        channel_id,
                        guid,
                        source_url,
                        normalized_source_url,
                        title,
                        author,
                        excerpt,
                        raw_html,
                        published_at,
                        raw_fetched_at,
                        dedupe_key,
                        content_hash
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        f"itm_{uuid4().hex[:12]}",
                        channel_id,
                        entry["guid"],
                        entry["source_url"],
                        entry["normalized_source_url"],
                        entry["title"],
                        entry["author"],
                        entry["excerpt"],
                        entry["raw_html"],
                        entry["published_at"],
                        entry["raw_fetched_at"],
                        entry["dedupe_key"],
                        entry["content_hash"],
                    ],
                )
                if cursor.rowcount > 0:
                    created += 1
            connection.commit()

        return created

    @staticmethod
    def _mode_uses_active_channels(mode: str, *, has_explicit_channel_ids: bool) -> bool:
        return mode == "scheduled" or not has_explicit_channel_ids

    @staticmethod
    def _serialize_scope(*, scope: dict[str, object], mode: str) -> dict[str, object]:
        serialized = dict(scope)
        serialized["mode"] = mode
        return serialized

    @staticmethod
    def _serialize_channel(row: sqlite3.Row) -> dict[str, object]:
        return {
            "id": row["id"],
            "title": row["title"],
            "site_url": row["site_url"],
            "feed_url": row["feed_url"],
            "state": row["state"],
        }

    @staticmethod
    def _serialize_run(row: sqlite3.Row) -> dict[str, object]:
        scope = json.loads(row["scope_json"] or "{}")
        metadata = json.loads(row["metadata_json"] or "{}")
        error_details = json.loads(row["error_details_json"] or "{}") if row["error_details_json"] else {}
        errors = error_details.get("errors", []) if isinstance(error_details, dict) else []

        return {
            "id": row["id"],
            "job_type": row["job_type"],
            "trigger_kind": row["trigger_kind"],
            "status": row["status"],
            "scope": scope,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "started_at": row["started_at"],
            "completed_at": row["completed_at"],
            "channels_total": int(row["total_count"] or metadata.get("channels_total") or 0),
            "channels_succeeded": int(row["success_count"] or metadata.get("channels_succeeded") or 0),
            "channels_failed": int(row["failure_count"] or metadata.get("channels_failed") or 0),
            "items_seen": int(metadata.get("items_seen") or 0),
            "items_created": int(metadata.get("items_created") or 0),
            "items_skipped": int(metadata.get("items_skipped") or 0),
            "retry_count": int(row["retry_count"] or 0),
            "error_code": row["error_code"],
            "error_message": row["error_message"],
            "errors": errors,
        }
