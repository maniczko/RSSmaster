from __future__ import annotations

import json
from pathlib import Path
import sqlite3
from uuid import uuid4

from app.db.initializer import connect


class DigestRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def list_candidate_items(
        self,
        *,
        item_ids: list[str] | None,
        category: str | None,
        include_read: bool,
        favorites_only: bool,
        digest_candidates_only: bool,
        period_start: str | None,
        period_end: str | None,
        limit: int,
    ) -> list[dict[str, object]]:
        clauses = ["c.state != 'archived'"]
        params: list[object] = []

        if item_ids:
            placeholders = ", ".join("?" for _ in item_ids)
            clauses.append(f"i.id IN ({placeholders})")
            params.extend(item_ids)
        if category:
            clauses.append("c.category = ?")
            params.append(category)
        if not include_read:
            clauses.append("i.is_read = 0")
        if favorites_only:
            clauses.append("i.is_favorite = 1")
        if digest_candidates_only and not item_ids:
            clauses.append("i.digest_candidate = 1")
        if period_start:
            clauses.append("COALESCE(i.published_at, i.discovered_at, i.created_at) >= ?")
            params.append(period_start)
        if period_end:
            clauses.append("COALESCE(i.published_at, i.discovered_at, i.created_at) <= ?")
            params.append(period_end)

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    i.id,
                    i.channel_id,
                    c.title AS channel_title,
                    c.category,
                    i.title,
                    i.author,
                    i.source_url,
                    i.excerpt,
                    i.raw_html,
                    i.cleaned_html,
                    i.content_text,
                    i.published_at,
                    i.is_read,
                    i.is_favorite,
                    i.digest_candidate,
                    i.content_hash
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE {' AND '.join(clauses)}
                ORDER BY
                    CASE WHEN COALESCE(c.category, '') = '' THEN 1 ELSE 0 END ASC,
                    lower(COALESCE(c.category, '')) ASC,
                    COALESCE(i.published_at, i.discovered_at, i.created_at) DESC,
                    lower(i.title) ASC,
                    i.id ASC
                LIMIT ?
                """,
                [*params, limit],
            ).fetchall()

        serialized = [self._serialize_candidate_item(row) for row in rows]
        if not item_ids:
            return serialized

        order_map = {item_id: index for index, item_id in enumerate(item_ids)}
        return sorted(
            serialized,
            key=lambda item: (
                order_map.get(str(item["id"]), len(order_map)),
                str(item["id"]),
            ),
        )

    def create_job_run(
        self,
        *,
        scope: dict[str, object],
        trigger_kind: str,
        article_count: int,
    ) -> str:
        run_id = f"run_{uuid4().hex[:12]}"
        metadata = {
            "article_count": article_count,
            "artifact_path": None,
            "artifact_sha256": None,
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
                    metadata_json,
                    total_count
                )
                VALUES (?, 'digest', ?, 'pending', ?, ?, ?)
                """,
                [
                    run_id,
                    trigger_kind,
                    json.dumps(scope, separators=(",", ":"), sort_keys=True),
                    json.dumps(metadata, separators=(",", ":"), sort_keys=True),
                    article_count,
                ],
            )
            connection.commit()

        return run_id

    def mark_job_run_building(self, run_id: str, *, started_at: str, article_count: int) -> None:
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
                    error_code = NULL,
                    error_message = NULL,
                    error_details_json = NULL
                WHERE id = ? AND job_type = 'digest'
                """,
                [started_at, article_count, run_id],
            )
            connection.commit()

    def complete_job_run(
        self,
        run_id: str,
        *,
        status: str,
        completed_at: str,
        duration_ms: int,
        article_count: int,
        artifact_path: str | None,
        artifact_sha256: str | None,
        error_code: str | None,
        error_message: str | None,
    ) -> None:
        metadata = {
            "article_count": article_count,
            "artifact_path": artifact_path,
            "artifact_sha256": artifact_sha256,
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
                WHERE id = ? AND job_type = 'digest'
                """,
                [
                    status,
                    completed_at,
                    duration_ms,
                    article_count,
                    article_count if status == "completed" else 0,
                    0 if status == "completed" else article_count,
                    json.dumps(metadata, separators=(",", ":"), sort_keys=True),
                    error_code,
                    error_message,
                    json.dumps({}, separators=(",", ":"), sort_keys=True),
                    run_id,
                ],
            )
            connection.commit()

    def create_digest_history(
        self,
        *,
        job_run_id: str,
        title: str,
        period_start: str | None,
        period_end: str | None,
        article_count: int,
        selection_snapshot: list[dict[str, object]],
        category_summary: list[dict[str, object]],
    ) -> dict[str, object]:
        digest_id = f"dig_{uuid4().hex[:12]}"

        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO digest_history (
                    id,
                    job_run_id,
                    status,
                    title,
                    period_start,
                    period_end,
                    article_count,
                    selection_snapshot_json,
                    category_summary_json
                )
                VALUES (?, ?, 'building', ?, ?, ?, ?, ?, ?)
                """,
                [
                    digest_id,
                    job_run_id,
                    title,
                    period_start,
                    period_end,
                    article_count,
                    json.dumps(selection_snapshot, separators=(",", ":"), sort_keys=True),
                    json.dumps(category_summary, separators=(",", ":"), sort_keys=True),
                ],
            )
            connection.commit()

        digest = self.get_digest_history(digest_id)
        if digest is None:
            raise RuntimeError("Digest history insert succeeded but could not be reloaded.")
        return digest

    def complete_digest_history(
        self,
        digest_id: str,
        *,
        artifact_path: str,
        artifact_sha256: str,
        generated_at: str,
    ) -> dict[str, object]:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE digest_history
                SET
                    status = 'completed',
                    artifact_path = ?,
                    artifact_sha256 = ?,
                    generated_at = ?,
                    error_code = NULL,
                    error_message = NULL
                WHERE id = ?
                """,
                [artifact_path, artifact_sha256, generated_at, digest_id],
            )
            connection.commit()

        digest = self.get_digest_history(digest_id)
        if digest is None:
            raise RuntimeError("Digest history update succeeded but could not be reloaded.")
        return digest

    def fail_digest_history(
        self,
        digest_id: str,
        *,
        error_code: str,
        error_message: str,
    ) -> dict[str, object]:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE digest_history
                SET
                    status = 'failed',
                    error_code = ?,
                    error_message = ?
                WHERE id = ?
                """,
                [error_code, error_message, digest_id],
            )
            connection.commit()

        digest = self.get_digest_history(digest_id)
        if digest is None:
            raise RuntimeError("Digest history failure update succeeded but could not be reloaded.")
        return digest

    def get_digest_history(self, digest_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    job_run_id,
                    status,
                    title,
                    period_start,
                    period_end,
                    article_count,
                    selection_snapshot_json,
                    category_summary_json,
                    artifact_path,
                    artifact_sha256,
                    generated_at,
                    sent_at,
                    error_code,
                    error_message,
                    created_at,
                    updated_at
                FROM digest_history
                WHERE id = ?
                """,
                [digest_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_digest_history(row)

    def list_digest_history(self, *, limit: int) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    job_run_id,
                    status,
                    title,
                    period_start,
                    period_end,
                    article_count,
                    selection_snapshot_json,
                    category_summary_json,
                    artifact_path,
                    artifact_sha256,
                    generated_at,
                    sent_at,
                    error_code,
                    error_message,
                    created_at,
                    updated_at
                FROM digest_history
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                [limit],
            ).fetchall()

        return [self._serialize_digest_history(row) for row in rows]

    @staticmethod
    def _serialize_candidate_item(row: sqlite3.Row) -> dict[str, object]:
        return {
            "id": row["id"],
            "channel_id": row["channel_id"],
            "channel_title": row["channel_title"],
            "category": row["category"],
            "title": row["title"],
            "author": row["author"],
            "source_url": row["source_url"],
            "excerpt": row["excerpt"],
            "raw_html": row["raw_html"],
            "cleaned_html": row["cleaned_html"],
            "content_text": row["content_text"],
            "published_at": row["published_at"],
            "is_read": bool(row["is_read"]),
            "is_favorite": bool(row["is_favorite"]),
            "digest_candidate": bool(row["digest_candidate"]),
            "content_hash": row["content_hash"],
        }

    @staticmethod
    def _serialize_digest_history(row: sqlite3.Row) -> dict[str, object]:
        selection_snapshot = json.loads(row["selection_snapshot_json"] or "[]")
        category_summary = json.loads(row["category_summary_json"] or "[]")
        artifact_path = row["artifact_path"]
        size_bytes = None
        if artifact_path:
            artifact_file = Path(artifact_path)
            if artifact_file.exists():
                size_bytes = artifact_file.stat().st_size

        return {
            "id": row["id"],
            "job_run_id": row["job_run_id"],
            "status": row["status"],
            "title": row["title"],
            "period_start": row["period_start"],
            "period_end": row["period_end"],
            "article_count": int(row["article_count"] or 0),
            "selection_snapshot": selection_snapshot,
            "category_summary": category_summary,
            "artifact": {
                "path": artifact_path,
                "sha256": row["artifact_sha256"],
                "size_bytes": size_bytes,
            },
            "generated_at": row["generated_at"],
            "sent_at": row["sent_at"],
            "error_code": row["error_code"],
            "error_message": row["error_message"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
