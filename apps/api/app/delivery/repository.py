from __future__ import annotations

import json
from pathlib import Path
import sqlite3
from typing import Any
from uuid import uuid4

from app.db.initializer import connect


class DeliveryRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def get_digest(self, digest_id: str) -> dict[str, Any] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    title,
                    status,
                    artifact_path,
                    artifact_sha256,
                    generated_at,
                    sent_at,
                    article_count
                FROM digest_history
                WHERE id = ?
                """,
                [digest_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_digest(row)

    def list_logs(self, *, limit: int, digest_id: str | None) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[object] = []

        if digest_id:
            clauses.append("l.digest_id = ?")
            params.append(digest_id)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    l.id,
                    l.job_run_id,
                    l.digest_id,
                    d.title AS digest_title,
                    l.target_kind,
                    l.recipient,
                    l.status,
                    l.provider_message_id,
                    l.attempt_count,
                    l.sent_at,
                    l.error_code,
                    l.error_message,
                    l.error_details_json,
                    l.created_at,
                    l.updated_at
                FROM delivery_logs l
                LEFT JOIN digest_history d
                    ON d.id = l.digest_id
                {where_sql}
                ORDER BY l.created_at DESC, l.id DESC
                LIMIT ?
                """,
                [*params, limit],
            ).fetchall()

        return [self._serialize_log(row) for row in rows]

    def get_log(self, log_id: str) -> dict[str, Any] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    l.id,
                    l.job_run_id,
                    l.digest_id,
                    d.title AS digest_title,
                    l.target_kind,
                    l.recipient,
                    l.status,
                    l.provider_message_id,
                    l.attempt_count,
                    l.sent_at,
                    l.error_code,
                    l.error_message,
                    l.error_details_json,
                    l.created_at,
                    l.updated_at
                FROM delivery_logs l
                LEFT JOIN digest_history d
                    ON d.id = l.digest_id
                WHERE l.id = ?
                """,
                [log_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_log(row)

    def create_run(self, *, scope: dict[str, Any], trigger_kind: str) -> dict[str, Any]:
        run_id = f"run_{uuid4().hex[:12]}"
        metadata = {"deliveries_total": 1, "deliveries_sent": 0, "deliveries_failed": 0}

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
                VALUES (?, 'delivery', ?, 'pending', ?, ?)
                """,
                [
                    run_id,
                    trigger_kind,
                    json.dumps(scope, separators=(",", ":"), sort_keys=True),
                    json.dumps(metadata, separators=(",", ":"), sort_keys=True),
                ],
            )
            connection.commit()

        run = self.get_run(run_id)
        if run is None:
            raise RuntimeError("Delivery run insert succeeded but could not be reloaded.")
        return run

    def get_run(self, run_id: str) -> dict[str, Any] | None:
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
                    created_at,
                    updated_at
                FROM job_runs
                WHERE id = ? AND job_type = 'delivery'
                """,
                [run_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_run(row)

    def mark_run_running(self, run_id: str, *, started_at: str) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE job_runs
                SET
                    status = 'running',
                    started_at = ?,
                    total_count = 1,
                    success_count = 0,
                    failure_count = 0,
                    error_code = NULL,
                    error_message = NULL
                WHERE id = ?
                """,
                [started_at, run_id],
            )
            connection.commit()

    def complete_run(
        self,
        run_id: str,
        *,
        status: str,
        completed_at: str,
        duration_ms: int,
        success_count: int,
        failure_count: int,
        error_code: str | None,
        error_message: str | None,
        metadata: dict[str, Any],
    ) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE job_runs
                SET
                    status = ?,
                    completed_at = ?,
                    duration_ms = ?,
                    total_count = 1,
                    success_count = ?,
                    failure_count = ?,
                    metadata_json = ?,
                    error_code = ?,
                    error_message = ?
                WHERE id = ?
                """,
                [
                    status,
                    completed_at,
                    duration_ms,
                    success_count,
                    failure_count,
                    json.dumps(metadata, separators=(",", ":"), sort_keys=True),
                    error_code,
                    error_message,
                    run_id,
                ],
            )
            connection.commit()

    def create_log(
        self,
        *,
        job_run_id: str,
        digest_id: str,
        target_kind: str,
        recipient: str | None,
        details: dict[str, Any],
    ) -> dict[str, Any]:
        log_id = f"dlv_{uuid4().hex[:12]}"

        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO delivery_logs (
                    id,
                    job_run_id,
                    digest_id,
                    target_kind,
                    recipient,
                    status,
                    attempt_count,
                    error_details_json
                )
                VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)
                """,
                [
                    log_id,
                    job_run_id,
                    digest_id,
                    target_kind,
                    recipient,
                    json.dumps(details, separators=(",", ":"), sort_keys=True),
                ],
            )
            connection.commit()

        log = self.get_log(log_id)
        if log is None:
            raise RuntimeError("Delivery log insert succeeded but could not be reloaded.")
        return log

    def complete_log(
        self,
        log_id: str,
        *,
        status: str,
        attempt_count: int,
        provider_message_id: str | None,
        sent_at: str | None,
        error_code: str | None,
        error_message: str | None,
        details: dict[str, Any],
    ) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE delivery_logs
                SET
                    status = ?,
                    attempt_count = ?,
                    provider_message_id = ?,
                    sent_at = ?,
                    error_code = ?,
                    error_message = ?,
                    error_details_json = ?
                WHERE id = ?
                """,
                [
                    status,
                    attempt_count,
                    provider_message_id,
                    sent_at,
                    error_code,
                    error_message,
                    json.dumps(details, separators=(",", ":"), sort_keys=True),
                    log_id,
                ],
            )
            connection.commit()

    def mark_digest_sent(self, digest_id: str, *, sent_at: str) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE digest_history
                SET
                    status = 'sent',
                    sent_at = ?
                WHERE id = ?
                """
                ,
                [sent_at, digest_id],
            )
            connection.commit()

    @staticmethod
    def _serialize_digest(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "title": row["title"],
            "status": row["status"],
            "artifact_path": row["artifact_path"],
            "artifact_sha256": row["artifact_sha256"],
            "generated_at": row["generated_at"],
            "sent_at": row["sent_at"],
            "article_count": int(row["article_count"] or 0),
        }

    @staticmethod
    def _serialize_run(row: sqlite3.Row) -> dict[str, Any]:
        scope = json.loads(row["scope_json"] or "{}")
        metadata = json.loads(row["metadata_json"] or "{}")
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
            "total_count": int(row["total_count"] or metadata.get("deliveries_total") or 0),
            "success_count": int(row["success_count"] or metadata.get("deliveries_sent") or 0),
            "failure_count": int(row["failure_count"] or metadata.get("deliveries_failed") or 0),
            "retry_count": int(row["retry_count"] or 0),
            "error_code": row["error_code"],
            "error_message": row["error_message"],
        }

    @staticmethod
    def _serialize_log(row: sqlite3.Row) -> dict[str, Any]:
        raw_details = json.loads(row["error_details_json"] or "{}")
        details = raw_details if isinstance(raw_details, dict) else {}
        return {
            "id": row["id"],
            "job_run_id": row["job_run_id"],
            "digest_id": row["digest_id"],
            "digest_title": row["digest_title"],
            "target_kind": row["target_kind"],
            "recipient": row["recipient"],
            "status": row["status"],
            "provider_message_id": row["provider_message_id"],
            "attempt_count": int(row["attempt_count"] or 0),
            "sent_at": row["sent_at"],
            "error_code": row["error_code"],
            "error_message": row["error_message"],
            "details": details,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
