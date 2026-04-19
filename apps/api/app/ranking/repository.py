from __future__ import annotations

import sqlite3
from pathlib import Path

from app.db.initializer import connect

from .models import RankingCandidateFilters, RankingCandidateIntakeResult

SORT_TIMESTAMP_SQL = "COALESCE(i.published_at, i.discovered_at, i.ingested_at)"


class RankingRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def list_candidates(self, filters: RankingCandidateFilters) -> RankingCandidateIntakeResult:
        clauses = [
            "c.state != 'archived'",
            "i.archived_at IS NULL",
        ]
        params: list[object] = []

        if filters.channel_ids:
            placeholders = ", ".join("?" for _ in filters.channel_ids)
            clauses.append(f"i.channel_id IN ({placeholders})")
            params.extend(filters.channel_ids)
        if filters.categories:
            placeholders = ", ".join("?" for _ in filters.categories)
            clauses.append(f"c.category IN ({placeholders})")
            params.extend(filters.categories)
        if not filters.include_read:
            clauses.append("i.is_read = 0")
        if filters.favorites_only:
            clauses.append("i.is_favorite = 1")
        if filters.digest_candidates_only:
            clauses.append("i.digest_candidate = 1")
        if filters.published_after:
            clauses.append(f"datetime({SORT_TIMESTAMP_SQL}) >= datetime(?)")
            params.append(filters.published_after)
        if filters.published_before:
            clauses.append(f"datetime({SORT_TIMESTAMP_SQL}) <= datetime(?)")
            params.append(filters.published_before)

        where_sql = f"WHERE {' AND '.join(clauses)}"

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
                    i.cleaned_html,
                    i.content_text,
                    i.published_at,
                    i.discovered_at,
                    i.ingested_at,
                    i.is_read,
                    i.is_favorite,
                    i.digest_candidate,
                    i.extraction_status
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                {where_sql}
                ORDER BY
                    datetime({SORT_TIMESTAMP_SQL}) DESC,
                    i.is_favorite DESC,
                    i.id DESC
                LIMIT ?
                """,
                [*params, filters.candidate_limit + 1],
            ).fetchall()

        intake_truncated = len(rows) > filters.candidate_limit
        page_rows = rows[: filters.candidate_limit]
        return RankingCandidateIntakeResult(
            items=[self._serialize_candidate(row) for row in page_rows],
            intake_truncated=intake_truncated,
            candidate_limit=filters.candidate_limit,
        )

    @staticmethod
    def _serialize_candidate(row: sqlite3.Row) -> dict[str, object]:
        return {
            "id": row["id"],
            "channel_id": row["channel_id"],
            "channel_title": row["channel_title"],
            "category": row["category"],
            "title": row["title"],
            "author": row["author"],
            "source_url": row["source_url"],
            "excerpt": row["excerpt"],
            "cleaned_html": row["cleaned_html"],
            "content_text": row["content_text"],
            "published_at": row["published_at"],
            "discovered_at": row["discovered_at"],
            "ingested_at": row["ingested_at"],
            "is_read": bool(row["is_read"]),
            "is_favorite": bool(row["is_favorite"]),
            "digest_candidate": bool(row["digest_candidate"]),
            "extraction_status": row["extraction_status"],
            "has_cleaned_content": has_text(row["cleaned_html"]) or has_text(row["content_text"]),
        }


def has_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())
