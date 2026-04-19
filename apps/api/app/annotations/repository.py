from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.db.initializer import connect

from .models import AnnotationCursor, AnnotationListFilters, HighlightAnchorModel

ANNOTATION_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quote_text TEXT NOT NULL,
    color TEXT,
    anchor_json TEXT NOT NULL DEFAULT '{}',
    text_start INTEGER,
    text_end INTEGER,
    occurrence_index INTEGER,
    context_prefix TEXT,
    context_suffix TEXT,
    selector TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_highlights_item_created_at
    ON highlights (item_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_highlights_item_anchor
    ON highlights (item_id, text_start, text_end);

CREATE TABLE IF NOT EXISTS highlight_notes (
    id TEXT PRIMARY KEY,
    highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_highlight_notes_highlight_created_at
    ON highlight_notes (highlight_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_highlight_notes_item_created_at
    ON highlight_notes (item_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS document_notes (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    title TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_notes_item_created_at
    ON document_notes (item_id, created_at DESC, id DESC);

CREATE TRIGGER IF NOT EXISTS trg_highlights_updated_at
AFTER UPDATE ON highlights
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE highlights
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_highlight_notes_updated_at
AFTER UPDATE ON highlight_notes
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE highlight_notes
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_notes_updated_at
AFTER UPDATE ON document_notes
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE document_notes
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
"""


@dataclass(frozen=True)
class RepositoryAnnotationListResult:
    items: list[dict[str, object]]
    next_cursor: AnnotationCursor | None
    has_more: bool
    limit: int


class AnnotationRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._ensure_annotation_schema()

    def get_item_summary(self, item_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    i.id,
                    i.title,
                    i.source_url,
                    i.published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE i.id = ?
                """,
                [item_id],
            ).fetchone()

        if row is None:
            return None

        return serialize_item_summary(row)

    def find_duplicate_highlight(
        self,
        *,
        item_id: str,
        quote_text: str,
        anchor: dict[str, object],
    ) -> str | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT id
                FROM highlights
                WHERE item_id = ?
                    AND quote_text = ?
                    AND COALESCE(text_start, -1) = COALESCE(?, -1)
                    AND COALESCE(text_end, -1) = COALESCE(?, -1)
                    AND COALESCE(occurrence_index, -1) = COALESCE(?, -1)
                    AND COALESCE(context_prefix, '') = COALESCE(?, '')
                    AND COALESCE(context_suffix, '') = COALESCE(?, '')
                    AND COALESCE(selector, '') = COALESCE(?, '')
                LIMIT 1
                """,
                [
                    item_id,
                    quote_text,
                    anchor.get("text_start"),
                    anchor.get("text_end"),
                    anchor.get("occurrence_index"),
                    anchor.get("prefix"),
                    anchor.get("suffix"),
                    anchor.get("selector"),
                ],
            ).fetchone()

        return str(row["id"]) if row is not None else None

    def create_highlight(
        self,
        *,
        item_id: str,
        quote_text: str,
        color: str | None,
        anchor: dict[str, object],
    ) -> dict[str, object]:
        highlight_id = f"hlt_{uuid4().hex[:12]}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO highlights (
                    id,
                    item_id,
                    quote_text,
                    color,
                    anchor_json,
                    text_start,
                    text_end,
                    occurrence_index,
                    context_prefix,
                    context_suffix,
                    selector
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    highlight_id,
                    item_id,
                    quote_text,
                    color,
                    json.dumps(anchor, separators=(",", ":"), sort_keys=True),
                    anchor.get("text_start"),
                    anchor.get("text_end"),
                    anchor.get("occurrence_index"),
                    anchor.get("prefix"),
                    anchor.get("suffix"),
                    anchor.get("selector"),
                ],
            )
            connection.commit()

        highlight = self.get_highlight(highlight_id)
        if highlight is None:
            raise RuntimeError("Highlight insert succeeded but highlight could not be reloaded.")
        return highlight

    def get_highlight(self, highlight_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    h.id,
                    h.item_id,
                    h.quote_text,
                    h.color,
                    h.anchor_json,
                    h.text_start,
                    h.text_end,
                    h.occurrence_index,
                    h.context_prefix,
                    h.context_suffix,
                    h.selector,
                    h.created_at,
                    h.updated_at,
                    i.title AS item_title,
                    i.source_url AS item_source_url,
                    i.published_at AS item_published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    (
                        SELECT COUNT(*)
                        FROM highlight_notes hn
                        WHERE hn.highlight_id = h.id
                    ) AS note_count
                FROM highlights h
                INNER JOIN items i
                    ON i.id = h.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE h.id = ?
                """,
                [highlight_id],
            ).fetchone()

        if row is None:
            return None

        notes_by_highlight = self._list_highlight_notes_for_ids([highlight_id])
        return self._serialize_highlight(
            row,
            notes=notes_by_highlight.get(highlight_id, []),
            search_query=None,
        )

    def list_highlights(
        self,
        filters: AnnotationListFilters,
        *,
        include_notes: bool = False,
    ) -> RepositoryAnnotationListResult:
        clauses: list[str] = []
        params: list[object] = []
        cursor_clause_sql, order_sql = resolve_sort_sql("datetime(h.created_at)", "h.id", filters.sort)

        if filters.item_id:
            clauses.append("h.item_id = ?")
            params.append(filters.item_id)
        if filters.search:
            pattern = f"%{escape_like(filters.search.casefold())}%"
            clauses.append(
                """
                (
                    lower(h.quote_text) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(h.context_prefix, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(h.context_suffix, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(h.selector, '')) LIKE ? ESCAPE '\\'
                    OR lower(i.title) LIKE ? ESCAPE '\\'
                )
                """
            )
            params.extend([pattern, pattern, pattern, pattern, pattern])
        if filters.cursor is not None:
            clauses.append(cursor_clause_sql)
            params.extend([filters.cursor.sort_value, filters.cursor.sort_value, filters.cursor.annotation_key])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    h.id,
                    h.item_id,
                    h.quote_text,
                    h.color,
                    h.anchor_json,
                    h.text_start,
                    h.text_end,
                    h.occurrence_index,
                    h.context_prefix,
                    h.context_suffix,
                    h.selector,
                    h.created_at,
                    h.updated_at,
                    i.title AS item_title,
                    i.source_url AS item_source_url,
                    i.published_at AS item_published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    (
                        SELECT COUNT(*)
                        FROM highlight_notes hn
                        WHERE hn.highlight_id = h.id
                    ) AS note_count
                FROM highlights h
                INNER JOIN items i
                    ON i.id = h.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                {where_sql}
                ORDER BY {order_sql}
                LIMIT ?
                """,
                [*params, filters.limit + 1],
            ).fetchall()

        return self._build_highlight_page(rows, filters=filters, include_notes=include_notes)

    def create_highlight_note(
        self,
        *,
        highlight_id: str,
        item_id: str,
        body: str,
    ) -> dict[str, object]:
        note_id = f"hln_{uuid4().hex[:12]}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO highlight_notes (
                    id,
                    highlight_id,
                    item_id,
                    body
                )
                VALUES (?, ?, ?, ?)
                """,
                [note_id, highlight_id, item_id, body],
            )
            connection.commit()

        note = self.get_highlight_note(note_id)
        if note is None:
            raise RuntimeError("Highlight note insert succeeded but note could not be reloaded.")
        return note

    def get_highlight_note(self, note_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    n.id,
                    n.highlight_id,
                    n.item_id,
                    n.body,
                    n.created_at,
                    n.updated_at,
                    h.quote_text AS highlight_quote_text,
                    h.color AS highlight_color,
                    h.anchor_json AS highlight_anchor_json,
                    i.title AS item_title,
                    i.source_url AS item_source_url,
                    i.published_at AS item_published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category
                FROM highlight_notes n
                INNER JOIN highlights h
                    ON h.id = n.highlight_id
                INNER JOIN items i
                    ON i.id = n.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE n.id = ?
                """,
                [note_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_highlight_note(row, search_query=None)

    def list_highlight_notes(self, filters: AnnotationListFilters) -> RepositoryAnnotationListResult:
        clauses: list[str] = []
        params: list[object] = []
        cursor_clause_sql, order_sql = resolve_sort_sql("datetime(n.created_at)", "n.id", filters.sort)

        if filters.item_id:
            clauses.append("n.item_id = ?")
            params.append(filters.item_id)
        if filters.highlight_id:
            clauses.append("n.highlight_id = ?")
            params.append(filters.highlight_id)
        if filters.search:
            pattern = f"%{escape_like(filters.search.casefold())}%"
            clauses.append(
                """
                (
                    lower(n.body) LIKE ? ESCAPE '\\'
                    OR lower(h.quote_text) LIKE ? ESCAPE '\\'
                    OR lower(i.title) LIKE ? ESCAPE '\\'
                )
                """
            )
            params.extend([pattern, pattern, pattern])
        if filters.cursor is not None:
            clauses.append(cursor_clause_sql)
            params.extend([filters.cursor.sort_value, filters.cursor.sort_value, filters.cursor.annotation_key])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    n.id,
                    n.highlight_id,
                    n.item_id,
                    n.body,
                    n.created_at,
                    n.updated_at,
                    h.quote_text AS highlight_quote_text,
                    h.color AS highlight_color,
                    h.anchor_json AS highlight_anchor_json,
                    i.title AS item_title,
                    i.source_url AS item_source_url,
                    i.published_at AS item_published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category
                FROM highlight_notes n
                INNER JOIN highlights h
                    ON h.id = n.highlight_id
                INNER JOIN items i
                    ON i.id = n.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                {where_sql}
                ORDER BY {order_sql}
                LIMIT ?
                """,
                [*params, filters.limit + 1],
            ).fetchall()

        return self._build_page(
            rows,
            limit=filters.limit,
            serializer=lambda row: self._serialize_highlight_note(row, search_query=filters.search),
        )

    def create_document_note(
        self,
        *,
        item_id: str,
        title: str | None,
        body: str,
    ) -> dict[str, object]:
        note_id = f"dn_{uuid4().hex[:12]}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO document_notes (
                    id,
                    item_id,
                    title,
                    body
                )
                VALUES (?, ?, ?, ?)
                """,
                [note_id, item_id, title, body],
            )
            connection.commit()

        note = self.get_document_note(note_id)
        if note is None:
            raise RuntimeError("Document note insert succeeded but note could not be reloaded.")
        return note

    def get_document_note(self, note_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    d.id,
                    d.item_id,
                    d.title,
                    d.body,
                    d.created_at,
                    d.updated_at,
                    i.title AS item_title,
                    i.source_url AS item_source_url,
                    i.published_at AS item_published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category
                FROM document_notes d
                INNER JOIN items i
                    ON i.id = d.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE d.id = ?
                """,
                [note_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_document_note(row, search_query=None)

    def list_document_notes(self, filters: AnnotationListFilters) -> RepositoryAnnotationListResult:
        clauses: list[str] = []
        params: list[object] = []
        cursor_clause_sql, order_sql = resolve_sort_sql("datetime(d.created_at)", "d.id", filters.sort)

        if filters.item_id:
            clauses.append("d.item_id = ?")
            params.append(filters.item_id)
        if filters.search:
            pattern = f"%{escape_like(filters.search.casefold())}%"
            clauses.append(
                """
                (
                    lower(COALESCE(d.title, '')) LIKE ? ESCAPE '\\'
                    OR lower(d.body) LIKE ? ESCAPE '\\'
                    OR lower(i.title) LIKE ? ESCAPE '\\'
                )
                """
            )
            params.extend([pattern, pattern, pattern])
        if filters.cursor is not None:
            clauses.append(cursor_clause_sql)
            params.extend([filters.cursor.sort_value, filters.cursor.sort_value, filters.cursor.annotation_key])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    d.id,
                    d.item_id,
                    d.title,
                    d.body,
                    d.created_at,
                    d.updated_at,
                    i.title AS item_title,
                    i.source_url AS item_source_url,
                    i.published_at AS item_published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category
                FROM document_notes d
                INNER JOIN items i
                    ON i.id = d.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                {where_sql}
                ORDER BY {order_sql}
                LIMIT ?
                """,
                [*params, filters.limit + 1],
            ).fetchall()

        return self._build_page(
            rows,
            limit=filters.limit,
            serializer=lambda row: self._serialize_document_note(row, search_query=filters.search),
        )

    def list_annotations(self, filters: AnnotationListFilters) -> RepositoryAnnotationListResult:
        clauses: list[str] = []
        params: list[object] = []
        cursor_clause_sql, order_sql = resolve_sort_sql("datetime(created_at)", "annotation_key", filters.sort)

        if filters.kind and filters.kind != "highlight":
            highlight_subquery = None
        else:
            highlight_subquery, highlight_params = self._build_highlight_activity_subquery(filters)
            params.extend(highlight_params)

        if filters.kind and filters.kind != "highlight_note":
            highlight_note_subquery = None
        else:
            highlight_note_subquery, highlight_note_params = self._build_highlight_note_activity_subquery(filters)
            params.extend(highlight_note_params)

        if filters.kind and filters.kind != "document_note":
            document_note_subquery = None
        else:
            document_note_subquery, document_note_params = self._build_document_note_activity_subquery(filters)
            params.extend(document_note_params)

        subqueries = [sql for sql in [highlight_subquery, highlight_note_subquery, document_note_subquery] if sql]
        if not subqueries:
            return RepositoryAnnotationListResult(items=[], next_cursor=None, has_more=False, limit=filters.limit)

        if filters.cursor is not None:
            clauses.append(cursor_clause_sql)
            params.extend([filters.cursor.sort_value, filters.cursor.sort_value, filters.cursor.annotation_key])

        outer_where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        union_sql = "\nUNION ALL\n".join(subqueries)

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT *
                FROM (
                    {union_sql}
                )
                {outer_where_sql}
                ORDER BY {order_sql}
                LIMIT ?
                """,
                [*params, filters.limit + 1],
            ).fetchall()

        return self._build_page(
            rows,
            limit=filters.limit,
            serializer=lambda row: self._serialize_annotation_timeline_entry(row, search_query=filters.search),
        )

    def get_annotation_hub(self, item_id: str, *, recent_limit: int = 25) -> dict[str, object] | None:
        item = self.get_item_summary(item_id)
        if item is None:
            return None

        with connect(self.database_path) as connection:
            highlight_rows = connection.execute(
                """
                SELECT
                    h.id,
                    h.item_id,
                    h.quote_text,
                    h.color,
                    h.anchor_json,
                    h.text_start,
                    h.text_end,
                    h.occurrence_index,
                    h.context_prefix,
                    h.context_suffix,
                    h.selector,
                    h.created_at,
                    h.updated_at,
                    i.title AS item_title,
                    i.source_url AS item_source_url,
                    i.published_at AS item_published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    (
                        SELECT COUNT(*)
                        FROM highlight_notes hn
                        WHERE hn.highlight_id = h.id
                    ) AS note_count
                FROM highlights h
                INNER JOIN items i
                    ON i.id = h.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE h.item_id = ?
                ORDER BY datetime(h.created_at) DESC, h.id DESC
                """,
                [item_id],
            ).fetchall()
            document_note_rows = connection.execute(
                """
                SELECT
                    d.id,
                    d.item_id,
                    d.title,
                    d.body,
                    d.created_at,
                    d.updated_at,
                    i.title AS item_title,
                    i.source_url AS item_source_url,
                    i.published_at AS item_published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category
                FROM document_notes d
                INNER JOIN items i
                    ON i.id = d.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE d.item_id = ?
                ORDER BY datetime(d.created_at) DESC, d.id DESC
                """,
                [item_id],
            ).fetchall()

        highlight_ids = [str(row["id"]) for row in highlight_rows]
        notes_by_highlight = self._list_highlight_notes_for_ids(highlight_ids)
        highlights = [
            self._serialize_highlight(
                row,
                notes=notes_by_highlight.get(str(row["id"]), []),
                search_query=None,
            )
            for row in highlight_rows
        ]
        document_notes = [self._serialize_document_note(row, search_query=None) for row in document_note_rows]
        recent_activity_result = self.list_annotations(
            AnnotationListFilters(
                item_id=item_id,
                highlight_id=None,
                kind=None,
                sort="newest",
                search=None,
                cursor=None,
                limit=recent_limit,
            )
        )
        recent_activity = recent_activity_result.items
        highlight_note_count = sum(int(highlight["note_count"]) for highlight in highlights)
        latest_activity_at = max(
            (
                activity_at
                for activity_at in [
                    *[str(entry["updated_at"]) for entry in highlights],
                    *[
                        str(note["updated_at"])
                        for highlight in highlights
                        for note in highlight.get("notes", [])
                        if isinstance(note, dict)
                    ],
                    *[str(entry["updated_at"]) for entry in document_notes],
                ]
                if activity_at
            ),
            default=None,
        )

        return {
            "item": item,
            "summary": {
                "total_annotations": len(highlights) + highlight_note_count + len(document_notes),
                "highlight_count": len(highlights),
                "highlight_note_count": highlight_note_count,
                "document_note_count": len(document_notes),
                "latest_activity_at": latest_activity_at,
            },
            "highlights": highlights,
            "document_notes": document_notes,
            "recent_activity": recent_activity,
        }

    def _build_highlight_page(
        self,
        rows: list[sqlite3.Row],
        *,
        filters: AnnotationListFilters,
        include_notes: bool,
    ) -> RepositoryAnnotationListResult:
        has_more = len(rows) > filters.limit
        page_rows = rows[: filters.limit]
        highlight_ids = [str(row["id"]) for row in page_rows] if include_notes else []
        notes_by_highlight = self._list_highlight_notes_for_ids(highlight_ids) if highlight_ids else {}
        next_cursor = None
        if has_more and page_rows:
            last_row = page_rows[-1]
            next_cursor = AnnotationCursor(
                sort_value=str(last_row["created_at"]),
                annotation_key=str(last_row["id"]),
            )

        return RepositoryAnnotationListResult(
            items=[
                self._serialize_highlight(
                    row,
                    notes=notes_by_highlight.get(str(row["id"]), []),
                    search_query=filters.search,
                )
                for row in page_rows
            ],
            next_cursor=next_cursor,
            has_more=has_more,
            limit=filters.limit,
        )

    def _build_page(
        self,
        rows: list[sqlite3.Row],
        *,
        limit: int,
        serializer,
    ) -> RepositoryAnnotationListResult:
        has_more = len(rows) > limit
        page_rows = rows[:limit]
        next_cursor = None
        if has_more and page_rows:
            last_row = page_rows[-1]
            next_cursor = AnnotationCursor(
                sort_value=str(last_row["created_at"]),
                annotation_key=str(last_row["annotation_key"]) if "annotation_key" in last_row.keys() else str(last_row["id"]),
            )

        return RepositoryAnnotationListResult(
            items=[serializer(row) for row in page_rows],
            next_cursor=next_cursor,
            has_more=has_more,
            limit=limit,
        )

    def _list_highlight_notes_for_ids(self, highlight_ids: list[str]) -> dict[str, list[dict[str, object]]]:
        if not highlight_ids:
            return {}

        placeholders = ", ".join("?" for _ in highlight_ids)
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    n.id,
                    n.highlight_id,
                    n.item_id,
                    n.body,
                    n.created_at,
                    n.updated_at,
                    h.quote_text AS highlight_quote_text,
                    h.color AS highlight_color,
                    h.anchor_json AS highlight_anchor_json,
                    i.title AS item_title,
                    i.source_url AS item_source_url,
                    i.published_at AS item_published_at,
                    c.id AS channel_id,
                    c.title AS channel_title,
                    c.category AS channel_category
                FROM highlight_notes n
                INNER JOIN highlights h
                    ON h.id = n.highlight_id
                INNER JOIN items i
                    ON i.id = n.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE n.highlight_id IN ({placeholders})
                ORDER BY datetime(n.created_at) ASC, n.id ASC
                """,
                highlight_ids,
            ).fetchall()

        grouped: dict[str, list[dict[str, object]]] = {highlight_id: [] for highlight_id in highlight_ids}
        for row in rows:
            grouped.setdefault(str(row["highlight_id"]), []).append(self._serialize_highlight_note(row, search_query=None))

        return grouped

    def _build_highlight_activity_subquery(self, filters: AnnotationListFilters) -> tuple[str, list[object]]:
        clauses: list[str] = []
        params: list[object] = []
        if filters.item_id:
            clauses.append("h.item_id = ?")
            params.append(filters.item_id)
        if filters.search:
            pattern = f"%{escape_like(filters.search.casefold())}%"
            clauses.append(
                """
                (
                    lower(h.quote_text) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(h.context_prefix, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(h.context_suffix, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(h.selector, '')) LIKE ? ESCAPE '\\'
                    OR lower(i.title) LIKE ? ESCAPE '\\'
                )
                """
            )
            params.extend([pattern, pattern, pattern, pattern, pattern])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return (
            f"""
            SELECT
                h.id,
                'highlight' AS kind,
                h.item_id,
                NULL AS title,
                NULL AS body,
                h.quote_text AS quote_text,
                h.color AS color,
                h.id AS highlight_id,
                h.created_at,
                h.updated_at,
                h.id AS annotation_key,
                h.anchor_json AS anchor_json,
                h.quote_text AS highlight_quote_text,
                h.color AS highlight_color,
                h.anchor_json AS highlight_anchor_json,
                i.title AS item_title,
                i.source_url AS item_source_url,
                i.published_at AS item_published_at,
                c.id AS channel_id,
                c.title AS channel_title,
                c.category AS channel_category,
                h.context_prefix,
                h.context_suffix
            FROM highlights h
            INNER JOIN items i
                ON i.id = h.item_id
            INNER JOIN channels c
                ON c.id = i.channel_id
            {where_sql}
            """,
            params,
        )

    def _build_highlight_note_activity_subquery(self, filters: AnnotationListFilters) -> tuple[str, list[object]]:
        clauses: list[str] = []
        params: list[object] = []
        if filters.item_id:
            clauses.append("n.item_id = ?")
            params.append(filters.item_id)
        if filters.highlight_id:
            clauses.append("n.highlight_id = ?")
            params.append(filters.highlight_id)
        if filters.search:
            pattern = f"%{escape_like(filters.search.casefold())}%"
            clauses.append(
                """
                (
                    lower(n.body) LIKE ? ESCAPE '\\'
                    OR lower(h.quote_text) LIKE ? ESCAPE '\\'
                    OR lower(i.title) LIKE ? ESCAPE '\\'
                )
                """
            )
            params.extend([pattern, pattern, pattern])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return (
            f"""
            SELECT
                n.id,
                'highlight_note' AS kind,
                n.item_id,
                NULL AS title,
                n.body AS body,
                h.quote_text AS quote_text,
                h.color AS color,
                n.highlight_id,
                n.created_at,
                n.updated_at,
                n.id AS annotation_key,
                NULL AS anchor_json,
                h.quote_text AS highlight_quote_text,
                h.color AS highlight_color,
                h.anchor_json AS highlight_anchor_json,
                i.title AS item_title,
                i.source_url AS item_source_url,
                i.published_at AS item_published_at,
                c.id AS channel_id,
                c.title AS channel_title,
                c.category AS channel_category,
                NULL AS context_prefix,
                NULL AS context_suffix
            FROM highlight_notes n
            INNER JOIN highlights h
                ON h.id = n.highlight_id
            INNER JOIN items i
                ON i.id = n.item_id
            INNER JOIN channels c
                ON c.id = i.channel_id
            {where_sql}
            """,
            params,
        )

    def _build_document_note_activity_subquery(self, filters: AnnotationListFilters) -> tuple[str, list[object]]:
        clauses: list[str] = []
        params: list[object] = []
        if filters.item_id:
            clauses.append("d.item_id = ?")
            params.append(filters.item_id)
        if filters.search:
            pattern = f"%{escape_like(filters.search.casefold())}%"
            clauses.append(
                """
                (
                    lower(COALESCE(d.title, '')) LIKE ? ESCAPE '\\'
                    OR lower(d.body) LIKE ? ESCAPE '\\'
                    OR lower(i.title) LIKE ? ESCAPE '\\'
                )
                """
            )
            params.extend([pattern, pattern, pattern])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return (
            f"""
            SELECT
                d.id,
                'document_note' AS kind,
                d.item_id,
                d.title,
                d.body,
                NULL AS quote_text,
                NULL AS color,
                NULL AS highlight_id,
                d.created_at,
                d.updated_at,
                d.id AS annotation_key,
                NULL AS anchor_json,
                NULL AS highlight_quote_text,
                NULL AS highlight_color,
                NULL AS highlight_anchor_json,
                i.title AS item_title,
                i.source_url AS item_source_url,
                i.published_at AS item_published_at,
                c.id AS channel_id,
                c.title AS channel_title,
                c.category AS channel_category,
                NULL AS context_prefix,
                NULL AS context_suffix
            FROM document_notes d
            INNER JOIN items i
                ON i.id = d.item_id
            INNER JOIN channels c
                ON c.id = i.channel_id
            {where_sql}
            """,
            params,
        )

    def _serialize_highlight(
        self,
        row: sqlite3.Row,
        *,
        notes: list[dict[str, object]],
        search_query: str | None,
    ) -> dict[str, object]:
        return {
            "kind": "highlight",
            "id": row["id"],
            "item_id": row["item_id"],
            "quote_text": row["quote_text"],
            "color": row["color"],
            "anchor": parse_anchor(row["anchor_json"]),
            "note_count": int(row["note_count"] or 0),
            "created_at": normalize_timestamp(row["created_at"]),
            "updated_at": normalize_timestamp(row["updated_at"]),
            "item": serialize_item_summary(row),
            "notes": notes,
            "search_match": build_annotation_search_match(
                kind="highlight",
                search_query=search_query,
                quote_text=row["quote_text"],
                body=None,
                title=None,
                context=" ".join(part for part in [str(row["context_prefix"] or ""), str(row["context_suffix"] or ""), str(row["selector"] or "")] if part),
                item_title=row["item_title"],
            ),
        }

    def _serialize_highlight_note(self, row: sqlite3.Row, *, search_query: str | None) -> dict[str, object]:
        return {
            "kind": "highlight_note",
            "id": row["id"],
            "highlight_id": row["highlight_id"],
            "item_id": row["item_id"],
            "body": row["body"],
            "created_at": normalize_timestamp(row["created_at"]),
            "updated_at": normalize_timestamp(row["updated_at"]),
            "item": serialize_item_summary(row),
            "highlight": {
                "id": row["highlight_id"],
                "quote_text": row["highlight_quote_text"],
                "color": row["highlight_color"],
                "anchor": parse_anchor(row["highlight_anchor_json"]),
            },
            "search_match": build_annotation_search_match(
                kind="highlight_note",
                search_query=search_query,
                quote_text=row["highlight_quote_text"],
                body=row["body"],
                title=None,
                context=None,
                item_title=row["item_title"],
            ),
        }

    def _serialize_document_note(self, row: sqlite3.Row, *, search_query: str | None) -> dict[str, object]:
        return {
            "kind": "document_note",
            "id": row["id"],
            "item_id": row["item_id"],
            "title": row["title"],
            "body": row["body"],
            "created_at": normalize_timestamp(row["created_at"]),
            "updated_at": normalize_timestamp(row["updated_at"]),
            "item": serialize_item_summary(row),
            "search_match": build_annotation_search_match(
                kind="document_note",
                search_query=search_query,
                quote_text=None,
                body=row["body"],
                title=row["title"],
                context=None,
                item_title=row["item_title"],
            ),
        }

    def _serialize_annotation_timeline_entry(self, row: sqlite3.Row, *, search_query: str | None) -> dict[str, object]:
        highlight = None
        if has_text(row["highlight_quote_text"]):
            highlight = {
                "id": row["highlight_id"],
                "quote_text": row["highlight_quote_text"],
                "color": row["highlight_color"],
                "anchor": parse_anchor(row["highlight_anchor_json"]),
            }

        return {
            "id": row["id"],
            "kind": row["kind"],
            "item_id": row["item_id"],
            "title": row["title"],
            "body": row["body"],
            "quote_text": row["quote_text"],
            "color": row["color"],
            "highlight_id": row["highlight_id"],
            "created_at": normalize_timestamp(row["created_at"]),
            "updated_at": normalize_timestamp(row["updated_at"]),
            "item": serialize_item_summary(row),
            "highlight": highlight,
            "search_match": build_annotation_search_match(
                kind=str(row["kind"]),
                search_query=search_query,
                quote_text=row["quote_text"],
                body=row["body"],
                title=row["title"],
                context=" ".join(
                    part
                    for part in [str(row["context_prefix"] or ""), str(row["context_suffix"] or "")]
                    if part
                ) or None,
                item_title=row["item_title"],
            ),
        }

    def _ensure_annotation_schema(self) -> None:
        with connect(self.database_path) as connection:
            connection.executescript(ANNOTATION_SCHEMA_SQL)
            connection.commit()


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def has_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def normalize_timestamp(value: object) -> str | None:
    if not has_text(value):
        return None

    raw_value = str(value).strip()
    try:
        parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
    except ValueError:
        return raw_value

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    else:
        parsed = parsed.astimezone(UTC)
    return parsed.isoformat().replace("+00:00", "Z")


def parse_anchor(value: object) -> dict[str, object]:
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            parsed = {}
    elif isinstance(value, dict):
        parsed = value
    else:
        parsed = {}

    try:
        return HighlightAnchorModel.model_validate(parsed).model_dump(exclude_none=True)
    except Exception:
        return {}


def resolve_sort_sql(created_sql: str, key_sql: str, sort: str) -> tuple[str, str]:
    if sort == "oldest":
        return (
            f"""
            (
                {created_sql} > datetime(?)
                OR ({created_sql} = datetime(?) AND {key_sql} > ?)
            )
            """,
            f"{created_sql} ASC, {key_sql} ASC",
        )

    return (
        f"""
        (
            {created_sql} < datetime(?)
            OR ({created_sql} = datetime(?) AND {key_sql} < ?)
        )
        """,
        f"{created_sql} DESC, {key_sql} DESC",
    )


def serialize_item_summary(row: sqlite3.Row) -> dict[str, object]:
    return {
        "id": row["item_id"] if "item_id" in row.keys() else row["id"],
        "title": row["item_title"] if "item_title" in row.keys() else row["title"],
        "source_url": row["item_source_url"] if "item_source_url" in row.keys() else row["source_url"],
        "published_at": normalize_timestamp(
            row["item_published_at"] if "item_published_at" in row.keys() else row["published_at"]
        ),
        "channel_id": row["channel_id"],
        "channel_title": row["channel_title"],
        "channel_category": row["channel_category"],
    }


def build_annotation_search_match(
    *,
    kind: str,
    search_query: str | None,
    quote_text: object,
    body: object,
    title: object,
    context: object,
    item_title: object,
) -> dict[str, object] | None:
    if not search_query or not search_query.strip():
        return None

    lowered = search_query.casefold()
    tokens = [token for token in lowered.split() if token]
    if not tokens:
        return None

    field_sources: list[tuple[str, str]] = []
    if kind == "highlight":
        field_sources = [
            ("quote", str(quote_text or "")),
            ("context", str(context or "")),
            ("item", str(item_title or "")),
        ]
    elif kind == "highlight_note":
        field_sources = [
            ("body", str(body or "")),
            ("quote", str(quote_text or "")),
            ("item", str(item_title or "")),
        ]
    else:
        field_sources = [
            ("title", str(title or "")),
            ("body", str(body or "")),
            ("item", str(item_title or "")),
        ]

    matched_fields: list[str] = []
    for field_name, source in field_sources:
        if not source.strip():
            continue
        source_lower = source.casefold()
        if any(token in source_lower for token in tokens):
            matched_fields.append(field_name)

    if not matched_fields:
        return None

    priority = {
        "quote": 0,
        "body": 1,
        "title": 2,
        "context": 3,
        "item": 4,
    }
    primary_field = min(matched_fields, key=lambda field_name: priority.get(field_name, 999))
    primary_source = next(source for field_name, source in field_sources if field_name == primary_field)
    return {
        "primary_field": primary_field,
        "fields": matched_fields,
        "snippet": build_match_snippet(primary_source, tokens),
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
