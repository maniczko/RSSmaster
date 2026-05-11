from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from app.db.initializer import connect

from .models import ItemCursor, ItemListFilters

SORT_VALUE_SQL = "COALESCE(i.published_at, i.discovered_at, i.created_at)"
SORT_DATETIME_SQL = f"datetime({SORT_VALUE_SQL})"


@dataclass(frozen=True)
class RepositoryItemListResult:
    items: list[dict[str, object]]
    next_cursor: ItemCursor | None
    has_more: bool
    limit: int


class ItemRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._ensure_library_schema()

    def count_items(self, filters: ItemListFilters) -> int:
        clauses: list[str] = []
        params: list[object] = []
        self._apply_list_filters(filters, clauses, params, include_cursor=False)
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with connect(self.database_path) as connection:
            row = connection.execute(
                f"""
                SELECT COUNT(*) AS count
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                {where_sql}
                """,
                params,
            ).fetchone()

        return int(row["count"] or 0) if row is not None else 0

    def list_items(self, filters: ItemListFilters) -> RepositoryItemListResult:
        clauses: list[str] = []
        params: list[object] = []
        cursor_clause_sql, order_sql = resolve_sort_sql(filters.sort)
        self._apply_list_filters(
            filters,
            clauses,
            params,
            include_cursor=True,
            cursor_clause_sql=cursor_clause_sql,
        )

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    i.id,
                    i.channel_id,
                    i.title,
                    i.author,
                    i.source_url,
                    i.excerpt,
                    i.published_at,
                    i.is_read,
                    i.is_favorite,
                    i.favorited_at,
                    i.archived_at,
                    i.digest_candidate,
                    i.extraction_status,
                    i.extraction_error,
                    i.raw_html,
                    i.cleaned_html,
                    i.content_text,
                    (
                        SELECT group_concat(t.name, ' ')
                        FROM item_tags it
                        INNER JOIN tags t
                            ON t.id = it.tag_id
                        WHERE it.item_id = i.id
                    ) AS tag_names,
                    (
                        SELECT group_concat(co.name || ' ' || COALESCE(co.description, ''), ' ')
                        FROM collection_items ci
                        INNER JOIN collections co
                            ON co.id = ci.collection_id
                        WHERE ci.item_id = i.id
                    ) AS collection_text,
                    (
                        SELECT group_concat(trim(COALESCE(a.quote_text, '') || ' ' || COALESCE(a.note_text, '')), ' ')
                        FROM annotations a
                        WHERE a.item_id = i.id
                            AND a.archived_at IS NULL
                    ) AS annotation_text,
                    {SORT_VALUE_SQL} AS sort_value,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    c.feed_url AS channel_feed_url,
                    c.site_url AS channel_site_url,
                    c.state AS channel_state
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                {where_sql}
                ORDER BY {order_sql}
                LIMIT ?
                """,
                [*params, filters.limit + 1],
            ).fetchall()

        has_more = len(rows) > filters.limit
        page_rows = rows[: filters.limit]
        next_cursor = None
        if has_more and page_rows:
            last_row = page_rows[-1]
            next_cursor = ItemCursor(
                sort_value=str(last_row["sort_value"]),
                item_id=str(last_row["id"]),
            )

        return RepositoryItemListResult(
            items=[self._serialize_item(row, search_query=filters.search) for row in page_rows],
            next_cursor=next_cursor,
            has_more=has_more,
            limit=filters.limit,
        )

    def _apply_list_filters(
        self,
        filters: ItemListFilters,
        clauses: list[str],
        params: list[object],
        *,
        include_cursor: bool,
        cursor_clause_sql: str | None = None,
    ) -> None:
        if filters.channel_ids:
            placeholders = ", ".join("?" for _ in filters.channel_ids)
            clauses.append(f"i.channel_id IN ({placeholders})")
            params.extend(filters.channel_ids)
        if filters.categories:
            placeholders = ", ".join("?" for _ in filters.categories)
            clauses.append(f"c.category IN ({placeholders})")
            params.extend(filters.categories)
        if filters.view == "inbox":
            clauses.append("i.archived_at IS NULL")
            clauses.append("i.is_favorite = 0")
        elif filters.view == "saved":
            clauses.append("i.archived_at IS NULL")
            clauses.append("i.is_favorite = 1")
        elif filters.view == "archive":
            clauses.append("i.archived_at IS NOT NULL")
        if filters.is_read is not None:
            clauses.append("i.is_read = ?")
            params.append(int(filters.is_read))
        if filters.is_favorite is not None:
            clauses.append("i.is_favorite = ?")
            params.append(int(filters.is_favorite))
        if filters.digest_candidate is not None:
            clauses.append("i.digest_candidate = ?")
            params.append(int(filters.digest_candidate))
        if filters.published_after:
            clauses.append("datetime(COALESCE(i.published_at, i.discovered_at, i.ingested_at)) >= datetime(?)")
            params.append(filters.published_after)
        if filters.published_before:
            clauses.append("datetime(COALESCE(i.published_at, i.discovered_at, i.ingested_at)) <= datetime(?)")
            params.append(filters.published_before)
        if include_cursor and filters.cursor is not None and cursor_clause_sql is not None:
            clauses.append(cursor_clause_sql)
            params.extend([filters.cursor.sort_value, filters.cursor.sort_value, filters.cursor.item_id])
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
                    OR lower(COALESCE(c.description, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.category, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.feed_url, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.normalized_feed_url, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.site_url, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.language, '')) LIKE ? ESCAPE '\\'
                    OR lower(i.source_url) LIKE ? ESCAPE '\\'
                    OR lower(i.normalized_source_url) LIKE ? ESCAPE '\\'
                    OR EXISTS(
                        SELECT 1
                        FROM item_tags it
                        INNER JOIN tags t
                            ON t.id = it.tag_id
                        WHERE it.item_id = i.id
                            AND lower(t.name) LIKE ? ESCAPE '\\'
                    )
                    OR EXISTS(
                        SELECT 1
                        FROM collection_items ci
                        INNER JOIN collections co
                            ON co.id = ci.collection_id
                        WHERE ci.item_id = i.id
                            AND (
                                lower(co.name) LIKE ? ESCAPE '\\'
                                OR lower(COALESCE(co.description, '')) LIKE ? ESCAPE '\\'
                            )
                    )
                    OR EXISTS(
                        SELECT 1
                        FROM annotations a
                        WHERE a.item_id = i.id
                            AND a.archived_at IS NULL
                            AND (
                                lower(COALESCE(a.quote_text, '')) LIKE ? ESCAPE '\\'
                                OR lower(COALESCE(a.note_text, '')) LIKE ? ESCAPE '\\'
                            )
                    )
                )
                """
            )
            params.extend(
                [
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                    pattern,
                ]
            )

    def get_by_id(self, item_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    i.id,
                    i.channel_id,
                    i.title,
                    i.author,
                    i.source_url,
                    i.excerpt,
                    i.published_at,
                    i.is_read,
                    i.is_favorite,
                    i.favorited_at,
                    i.archived_at,
                    i.digest_candidate,
                    i.extraction_status,
                    i.extraction_error,
                    i.raw_html,
                    i.cleaned_html,
                    i.content_text,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    c.feed_url AS channel_feed_url,
                    c.site_url AS channel_site_url,
                    c.state AS channel_state
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE i.id = ?
                """,
                [item_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_item(row)

    def get_detail_by_id(self, item_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    i.id,
                    i.channel_id,
                    i.title,
                    i.author,
                    i.source_url,
                    i.excerpt,
                    i.published_at,
                    i.is_read,
                    i.is_favorite,
                    i.favorited_at,
                    i.archived_at,
                    i.digest_candidate,
                    i.extraction_status,
                    i.extraction_error,
                    i.raw_html,
                    i.cleaned_html,
                    i.content_text,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    c.feed_url AS channel_feed_url,
                    c.site_url AS channel_site_url,
                    c.state AS channel_state
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE i.id = ?
                """,
                [item_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_item(row, include_content=True)

    def update_item_state(
        self,
        item_id: str,
        *,
        is_read: bool | None,
        update_is_read: bool,
        is_favorite: bool | None,
        update_is_favorite: bool,
        is_archived: bool | None,
        update_is_archived: bool,
        digest_candidate: bool | None,
        update_digest_candidate: bool,
    ) -> dict[str, object]:
        assignments: list[str] = []
        params: list[object] = []

        if update_is_read:
            assignments.append("is_read = ?")
            params.append(int(bool(is_read)))
            assignments.append("read_at = COALESCE(read_at, CURRENT_TIMESTAMP)" if is_read else "read_at = NULL")

        if update_is_favorite:
            assignments.append("is_favorite = ?")
            params.append(int(bool(is_favorite)))
            assignments.append(
                "favorited_at = COALESCE(favorited_at, CURRENT_TIMESTAMP)" if is_favorite else "favorited_at = NULL"
            )

        if update_is_archived:
            assignments.append("archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)" if is_archived else "archived_at = NULL")

        if update_digest_candidate:
            assignments.append("digest_candidate = ?")
            params.append(int(bool(digest_candidate)))

        if not assignments:
            item = self.get_by_id(item_id)
            if item is None:
                raise RuntimeError("Item not found.")
            return item

        with connect(self.database_path) as connection:
            cursor = connection.execute(
                f"""
                UPDATE items
                SET {', '.join(assignments)}
                WHERE id = ?
                """,
                [*params, item_id],
            )
            connection.commit()

        if cursor.rowcount == 0:
            raise RuntimeError("Item not found.")

        item = self.get_by_id(item_id)
        if item is None:
            raise RuntimeError("Item update succeeded but item could not be reloaded.")
        return item

    @staticmethod
    def _serialize_item(
        row: sqlite3.Row,
        *,
        include_content: bool = False,
        search_query: str | None = None,
    ) -> dict[str, object]:
        has_cleaned_content = has_text(row["cleaned_html"]) or has_text(row["content_text"])
        has_raw_content = has_text(row["raw_html"]) or has_text(row["excerpt"])
        reader_status = build_reader_status(
            extraction_status=row["extraction_status"],
            extraction_error=row["extraction_error"],
            cleaned_html=row["cleaned_html"],
            content_text=row["content_text"],
            raw_html=row["raw_html"],
            excerpt=row["excerpt"],
            include_diagnostic=include_content,
        )
        library = build_library(
            is_favorite=bool(row["is_favorite"]),
            favorited_at=row["favorited_at"],
            archived_at=row["archived_at"],
        )
        search_match = build_search_match(row, search_query)
        digest_status, digest_reason = build_digest_visibility(
            digest_candidate=bool(row["digest_candidate"]),
            extraction_status=row["extraction_status"],
            has_cleaned_content=has_cleaned_content,
            has_raw_content=has_raw_content,
        )
        payload: dict[str, object] = {
            "id": row["id"],
            "channel_id": row["channel_id"],
            "title": row["title"],
            "author": row["author"],
            "source_url": row["source_url"],
            "excerpt": row["excerpt"],
            "published_at": row["published_at"],
            "is_read": bool(row["is_read"]),
            "is_favorite": bool(row["is_favorite"]),
            "is_archived": bool(library["is_archived"]),
            "digest_candidate": bool(row["digest_candidate"]),
            "extraction_status": row["extraction_status"],
            "has_cleaned_content": has_cleaned_content,
            "has_raw_content": has_raw_content,
            "reader_status": reader_status,
            "library": library,
            "search_match": search_match,
            "channel": {
                "id": row["channel_id"],
                "title": row["channel_title"],
                "category": row["channel_category"],
                "feed_url": row["channel_feed_url"],
                "site_url": row["channel_site_url"],
                "state": row["channel_state"],
            },
            "digest": {
                "is_candidate": bool(row["digest_candidate"]),
                "status": digest_status,
                "reason": digest_reason,
            },
        }
        if include_content:
            cleaned_html = row["cleaned_html"] if has_text(row["cleaned_html"]) else None
            content_text = row["content_text"] if has_text(row["content_text"]) else None
            payload.update(
                {
                    "cleaned_html": cleaned_html,
                    "content_text": content_text,
                }
            )

        return payload

    def _ensure_library_schema(self) -> None:
        with connect(self.database_path) as connection:
            table_exists = connection.execute(
                """
                SELECT 1
                FROM sqlite_master
                WHERE type = 'table' AND name = 'items'
                """
            ).fetchone()
            if table_exists is None:
                return
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(items)").fetchall()
            }
            if "archived_at" not in columns:
                connection.execute("ALTER TABLE items ADD COLUMN archived_at TEXT")
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_items_archived_at
                ON items (archived_at)
                """
            )
            connection.commit()


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def has_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def build_reader_status(
    *,
    extraction_status: object,
    extraction_error: object,
    cleaned_html: object,
    content_text: object,
    raw_html: object,
    excerpt: object,
    include_diagnostic: bool,
) -> dict[str, object]:
    extraction_state = str(extraction_status or "pending")
    diagnostic_reason = sanitize_extraction_diagnostic(extraction_error) if include_diagnostic else None

    if has_text(cleaned_html) and extraction_state == "completed":
        return {
            "mode": "cleaned",
            "quality": "ready",
            "label": "Pełny tekst",
            "summary": "Oczyszczony widok jest gotowy do czytania w aplikacji.",
            "primary_action": "read_in_app",
            "diagnostic_reason": diagnostic_reason if extraction_state == "failed" else None,
        }

    if has_text(content_text):
        quality = "degraded" if extraction_state in {"failed", "skipped"} else "ready"
        summary = (
            "Ekstrakcja pełnego tekstu nie zakończyła się poprawnie, ale feed dostarczył czytelny tekst lokalny."
            if quality == "degraded"
            else "Pełny HTML nie jest gotowy, ale artykuł ma czytelny tekst lokalny."
        )
        return {
            "mode": "text_fallback",
            "quality": quality,
            "label": "Tekst z feedu",
            "summary": summary,
            "primary_action": "read_in_app",
            "diagnostic_reason": diagnostic_reason if extraction_state == "failed" else None,
        }

    if has_text(excerpt):
        return {
            "mode": "excerpt",
            "quality": "degraded",
            "label": "Tylko skrót",
            "summary": "Pełny tekst nie jest gotowy, ale skrót z feedu można przeczytać w aplikacji.",
            "primary_action": "read_in_app",
            "diagnostic_reason": diagnostic_reason if extraction_state == "failed" else None,
        }

    if extraction_state in {"pending", "running"}:
        return {
            "mode": "source_only",
            "quality": "loading",
            "label": "W trakcie",
            "summary": "Czytelny widok czeka na ekstrakcję albo kolejny sync.",
            "primary_action": "wait_for_sync",
            "diagnostic_reason": None,
        }

    if has_text(raw_html):
        return {
            "mode": "source_only",
            "quality": "degraded",
            "label": "Źródło",
            "summary": "Aplikacja ma surowy materiał, ale nie ma bezpiecznej lokalnej wersji do czytania.",
            "primary_action": "open_source",
            "diagnostic_reason": diagnostic_reason if extraction_state == "failed" else None,
        }

    return {
        "mode": "source_only",
        "quality": "blocked",
        "label": "Źródło",
        "summary": "Brak lokalnej treści; najlepszym fallbackiem jest otwarcie oryginalnego źródła.",
        "primary_action": "open_source",
        "diagnostic_reason": diagnostic_reason if extraction_state == "failed" else None,
    }


def sanitize_extraction_diagnostic(value: object) -> str | None:
    if not isinstance(value, str):
        return None

    normalized = " ".join(value.strip().split())
    if not normalized:
        return None

    blocked_markers = (
        "traceback",
        "file \"",
        "line ",
        "stack",
        "raise ",
    )
    lowered = normalized.casefold()
    if any(marker in lowered for marker in blocked_markers):
        return "Ekstrakcja zgłosiła błąd techniczny. Szczegóły są dostępne w logach runtime."

    if len(normalized) > 180:
        return normalized[:177].rstrip() + "..."

    return normalized


def resolve_sort_sql(sort: str) -> tuple[str, str]:
    if sort == "oldest":
        return (
            f"""
            (
                {SORT_DATETIME_SQL} > datetime(?)
                OR ({SORT_DATETIME_SQL} = datetime(?) AND i.id > ?)
            )
            """,
            f"{SORT_DATETIME_SQL} ASC, i.id ASC",
        )

    return (
        f"""
        (
            {SORT_DATETIME_SQL} < datetime(?)
            OR ({SORT_DATETIME_SQL} = datetime(?) AND i.id < ?)
        )
        """,
        f"{SORT_DATETIME_SQL} DESC, i.id DESC",
    )


def build_library(*, is_favorite: bool, favorited_at: object, archived_at: object) -> dict[str, object]:
    archived_value = archived_at if has_text(archived_at) else None
    saved_value = favorited_at if has_text(favorited_at) else None

    if archived_value is not None:
        state = "archived"
    elif is_favorite:
        state = "saved"
    else:
        state = "inbox"

    return {
        "state": state,
        "saved_at": saved_value,
        "archived_at": archived_value,
        "is_saved": is_favorite,
        "is_archived": archived_value is not None,
    }


def build_digest_visibility(
    *,
    digest_candidate: bool,
    extraction_status: object,
    has_cleaned_content: bool,
    has_raw_content: bool,
) -> tuple[str, str]:
    extraction_state = str(extraction_status or "pending")

    if not digest_candidate:
        return "excluded", "Item is currently excluded from digest generation."

    if has_cleaned_content:
        return "ready", "Item is selected and already has cleaned content ready for digest build."

    if extraction_state in {"pending", "running"}:
        return "pending_extraction", "Item is selected for the digest and is still waiting on extraction."

    if extraction_state == "failed":
        return "blocked_by_extraction", "Item is selected, but extraction failed and needs review before digest build."

    if has_raw_content:
        return "needs_content_review", "Item is selected, but only raw or excerpt content is available right now."

    return "needs_content_review", "Item is selected, but no usable content has been captured yet."


def build_search_match(row: sqlite3.Row, search_query: str | None) -> dict[str, object] | None:
    if not search_query or not search_query.strip():
        return None

    lowered = search_query.casefold()
    tokens = [token for token in lowered.split() if token]
    if not tokens:
        return None

    field_sources: list[tuple[str, str]] = [
        ("title", str(row["title"] or "")),
        ("author", str(row["author"] or "")),
        ("source", " ".join(
            part
            for part in [
                str(row["channel_title"] or ""),
                str(row["channel_feed_url"] or ""),
                str(row["channel_site_url"] or ""),
                str(row["source_url"] or ""),
            ]
            if part
        )),
        ("category", str(row["channel_category"] or "")),
        ("excerpt", str(row["excerpt"] or "")),
        ("body", str(row["content_text"] or "")),
        ("organization", " ".join(
            part
            for part in [
                str(row["tag_names"] or ""),
                str(row["collection_text"] or ""),
            ]
            if part
        )),
        ("annotation", str(row["annotation_text"] or "")),
    ]

    matched_fields: list[str] = []

    for field_name, source in field_sources:
        if not source.strip():
            continue
        source_lower = source.casefold()
        if not any(token in source_lower for token in tokens):
            continue
        matched_fields.append(field_name)
    if not matched_fields:
        return None

    priority = {
        "title": 0,
        "author": 1,
        "source": 2,
        "category": 3,
        "body": 4,
        "excerpt": 5,
        "organization": 6,
        "annotation": 7,
    }
    primary_field = min(matched_fields, key=lambda field_name: priority.get(field_name, 999))
    primary_source = next(
        source
        for field_name, source in field_sources
        if field_name == primary_field
    )
    snippet = build_match_snippet(primary_source, tokens)

    return {
        "primary_field": primary_field,
        "fields": matched_fields,
        "snippet": snippet,
    }


def build_match_snippet(source: str, tokens: list[str]) -> str:
    normalized = " ".join(source.split())
    if len(normalized) <= 180:
        return normalized

    lowered = normalized.casefold()
    first_index = min((index for token in tokens if (index := lowered.find(token)) >= 0), default=-1)
    if first_index < 0:
        return normalized[:177].rstrip() + "..."

    start = max(first_index - 70, 0)
    end = min(first_index + 110, len(normalized))
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(normalized) else ""
    return prefix + normalized[start:end].strip() + suffix
