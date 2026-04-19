from __future__ import annotations

from pathlib import Path
import sqlite3
from urllib.parse import urlsplit

from app.db.initializer import connect

from .models import StoryCandidateFilters, StoryCandidateRecord

SORT_VALUE_SQL = "COALESCE(i.published_at, i.discovered_at, i.created_at)"


class StoryRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def list_candidates(self, filters: StoryCandidateFilters) -> list[StoryCandidateRecord]:
        clauses: list[str] = []
        params: list[object] = []

        if filters.channel_ids:
            placeholders = ", ".join("?" for _ in filters.channel_ids)
            clauses.append(f"i.channel_id IN ({placeholders})")
            params.extend(filters.channel_ids)
        if filters.categories:
            placeholders = ", ".join("?" for _ in filters.categories)
            clauses.append(f"c.category IN ({placeholders})")
            params.extend(filters.categories)
        if not filters.include_archived:
            clauses.append("i.archived_at IS NULL")
        if not filters.include_read:
            clauses.append("i.is_read = 0")
        if filters.favorites_only:
            clauses.append("i.is_favorite = 1")
        if filters.digest_candidates_only:
            clauses.append("i.digest_candidate = 1")
        if filters.published_after:
            clauses.append(f"datetime({SORT_VALUE_SQL}) >= datetime(?)")
            params.append(filters.published_after)
        if filters.published_before:
            clauses.append(f"datetime({SORT_VALUE_SQL}) <= datetime(?)")
            params.append(filters.published_before)
        if filters.search:
            pattern = f"%{escape_like(filters.search.lower())}%"
            clauses.append(
                """
                (
                    lower(i.title) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(i.author, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(i.excerpt, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(i.content_text, '')) LIKE ? ESCAPE '\\'
                    OR lower(c.title) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.category, '')) LIKE ? ESCAPE '\\'
                    OR lower(i.source_url) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(i.normalized_source_url, '')) LIKE ? ESCAPE '\\'
                )
                """
            )
            params.extend([pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    i.id,
                    i.channel_id,
                    i.source_url,
                    i.normalized_source_url,
                    i.title,
                    i.author,
                    i.excerpt,
                    i.published_at,
                    i.discovered_at,
                    i.created_at,
                    i.is_read,
                    i.is_favorite,
                    i.archived_at,
                    i.digest_candidate,
                    i.extraction_status,
                    i.raw_html,
                    i.cleaned_html,
                    i.content_text,
                    i.content_hash,
                    c.title AS channel_title,
                    c.category AS channel_category
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                {where_sql}
                ORDER BY datetime({SORT_VALUE_SQL}) DESC, i.id DESC
                LIMIT ?
                """,
                [*params, filters.candidate_limit],
            ).fetchall()

        return [self._serialize_candidate(row) for row in rows]

    @staticmethod
    def _serialize_candidate(row: sqlite3.Row) -> StoryCandidateRecord:
        normalized_source_url = normalize_nullable_text(row["normalized_source_url"]) or str(row["source_url"])
        return StoryCandidateRecord(
            id=str(row["id"]),
            channel_id=str(row["channel_id"]),
            channel_title=str(row["channel_title"]),
            category=normalize_nullable_text(row["channel_category"]),
            source_url=str(row["source_url"]),
            normalized_source_url=normalized_source_url,
            source_domain=extract_source_domain(normalized_source_url),
            title=str(row["title"]),
            author=normalize_nullable_text(row["author"]),
            excerpt=normalize_nullable_text(row["excerpt"]),
            published_at=normalize_nullable_text(row["published_at"]),
            discovered_at=str(row["discovered_at"]),
            created_at=str(row["created_at"]),
            is_read=bool(row["is_read"]),
            is_favorite=bool(row["is_favorite"]),
            is_archived=has_text(row["archived_at"]),
            digest_candidate=bool(row["digest_candidate"]),
            extraction_status=str(row["extraction_status"] or "pending"),
            has_cleaned_content=has_text(row["cleaned_html"]) or has_text(row["content_text"]),
            has_raw_content=has_text(row["raw_html"]) or has_text(row["excerpt"]),
            content_hash=normalize_nullable_text(row["content_hash"]),
        )


def extract_source_domain(value: str | None) -> str | None:
    if value is None:
        return None
    hostname = urlsplit(value).hostname
    return hostname.lower() if hostname else None


def normalize_nullable_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def has_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

