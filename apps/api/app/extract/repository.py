from __future__ import annotations

from pathlib import Path
import sqlite3

from app.db.initializer import connect

from .models import ExtractionCandidate, ExtractionResult


class ExtractionRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def list_pending_candidates(
        self,
        *,
        channel_id: str,
        dedupe_keys: list[str],
        limit: int,
    ) -> list[ExtractionCandidate]:
        if not dedupe_keys:
            return []

        placeholders = ", ".join("?" for _ in dedupe_keys)
        params: list[object] = [channel_id, *dedupe_keys, limit]

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    id,
                    channel_id,
                    dedupe_key,
                    source_url,
                    title,
                    excerpt,
                    raw_html
                FROM items
                WHERE channel_id = ?
                    AND extraction_status = 'pending'
                    AND dedupe_key IN ({placeholders})
                ORDER BY COALESCE(published_at, discovered_at, created_at) DESC, id DESC
                LIMIT ?
                """,
                params,
            ).fetchall()

        return [self._serialize_candidate(row) for row in rows]

    def mark_running(self, item_id: str) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE items
                SET
                    extraction_status = 'running',
                    extraction_error = NULL
                WHERE id = ?
                """,
                [item_id],
            )
            connection.commit()

    def persist_result(self, item_id: str, *, result: ExtractionResult) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE items
                SET
                    raw_html = ?,
                    cleaned_html = ?,
                    content_text = ?,
                    excerpt = ?,
                    raw_fetched_at = ?,
                    cleaned_at = ?,
                    extraction_status = ?,
                    extraction_error = ?
                WHERE id = ?
                """,
                [
                    result.raw_html,
                    result.cleaned_html,
                    result.content_text,
                    result.excerpt,
                    result.raw_fetched_at,
                    result.cleaned_at,
                    result.extraction_status,
                    result.extraction_error,
                    item_id,
                ],
            )
            connection.commit()

    @staticmethod
    def _serialize_candidate(row: sqlite3.Row) -> ExtractionCandidate:
        return ExtractionCandidate(
            id=row["id"],
            channel_id=row["channel_id"],
            dedupe_key=row["dedupe_key"],
            source_url=row["source_url"],
            title=row["title"],
            excerpt=row["excerpt"],
            raw_html=row["raw_html"],
        )
