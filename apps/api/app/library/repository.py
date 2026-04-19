from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
import sqlite3
import uuid
from typing import Any

from app.db.initializer import connect
from app.items.repository import build_library, escape_like, has_text

from .models import LibraryQueryDefinition

SORT_VALUE_SQL = "COALESCE(i.published_at, i.discovered_at, i.created_at)"
RECENTLY_SAVED_SORT_VALUE_SQL = "COALESCE(i.favorited_at, i.published_at, i.discovered_at, i.created_at)"


@dataclass(frozen=True)
class OffsetListResult:
    items: list[dict[str, Any]]
    next_offset: int | None
    has_more: bool
    limit: int


class LibraryRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._ensure_schema()

    def list_tags(self, *, include_archived: bool, limit: int, offset: int) -> OffsetListResult:
        where_sql = "" if include_archived else "WHERE t.archived_at IS NULL"
        return self._fetch_tag_rows(where_sql=where_sql, params=[], limit=limit, offset=offset)

    def get_tag(self, tag_id: str) -> dict[str, Any] | None:
        rows = self._fetch_tag_rows(where_sql="WHERE t.id = ?", params=[tag_id], limit=1, offset=0).items
        return rows[0] if rows else None

    def create_tag(self, *, name: str, normalized_name: str, color: str | None, description: str | None) -> dict[str, Any]:
        tag_id = f"tag_{uuid.uuid4().hex}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO library_tags (
                    id,
                    name,
                    normalized_name,
                    color,
                    description
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                [tag_id, name, normalized_name, color, description],
            )
            connection.commit()

        tag = self.get_tag(tag_id)
        if tag is None:
            raise RuntimeError("Tag create succeeded but row could not be reloaded.")
        return tag

    def update_tag(
        self,
        tag_id: str,
        *,
        name: str | None,
        normalized_name: str | None,
        update_name: bool,
        color: str | None,
        update_color: bool,
        description: str | None,
        update_description: bool,
        state: str | None,
        update_state: bool,
    ) -> dict[str, Any]:
        assignments: list[str] = []
        params: list[object] = []

        if update_name:
            assignments.extend(["name = ?", "normalized_name = ?"])
            params.extend([name, normalized_name])
        if update_color:
            assignments.append("color = ?")
            params.append(color)
        if update_description:
            assignments.append("description = ?")
            params.append(description)
        if update_state:
            if state == "archived":
                assignments.append("archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)")
            else:
                assignments.append("archived_at = NULL")

        if not assignments:
            tag = self.get_tag(tag_id)
            if tag is None:
                raise RuntimeError("Tag not found.")
            return tag

        with connect(self.database_path) as connection:
            cursor = connection.execute(
                f"""
                UPDATE library_tags
                SET {", ".join(assignments)}
                WHERE id = ?
                """,
                [*params, tag_id],
            )
            connection.commit()

        if cursor.rowcount == 0:
            raise RuntimeError("Tag not found.")

        tag = self.get_tag(tag_id)
        if tag is None:
            raise RuntimeError("Tag update succeeded but row could not be reloaded.")
        return tag

    def archive_tag(self, tag_id: str) -> dict[str, Any]:
        with connect(self.database_path) as connection:
            cursor = connection.execute(
                """
                UPDATE library_tags
                SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
                WHERE id = ?
                """,
                [tag_id],
            )
            connection.commit()

        if cursor.rowcount == 0:
            raise RuntimeError("Tag not found.")

        tag = self.get_tag(tag_id)
        if tag is None:
            raise RuntimeError("Tag archive succeeded but row could not be reloaded.")
        return tag

    def replace_tag_items(self, tag_id: str, item_ids: list[str]) -> dict[str, Any]:
        target_ids = list(item_ids)
        target_set = set(target_ids)

        with connect(self.database_path) as connection:
            tag_exists = connection.execute(
                """
                SELECT 1
                FROM library_tags
                WHERE id = ?
                """,
                [tag_id],
            ).fetchone()
            if tag_exists is None:
                raise RuntimeError("Tag not found.")

            existing_rows = connection.execute(
                """
                SELECT item_id
                FROM library_tag_items
                WHERE tag_id = ?
                """,
                [tag_id],
            ).fetchall()
            existing_ids = {str(row["item_id"]) for row in existing_rows}

            removed_ids = existing_ids - target_set
            added_ids = target_set - existing_ids

            if removed_ids:
                placeholders = ", ".join("?" for _ in removed_ids)
                connection.execute(
                    f"""
                    DELETE FROM library_tag_items
                    WHERE tag_id = ?
                      AND item_id IN ({placeholders})
                    """,
                    [tag_id, *sorted(removed_ids)],
                )

            for item_id in target_ids:
                if item_id not in added_ids:
                    continue
                connection.execute(
                    """
                    INSERT INTO library_tag_items (
                        tag_id,
                        item_id
                    )
                    VALUES (?, ?)
                    """,
                    [tag_id, item_id],
                )

            connection.commit()

        tag = self.get_tag(tag_id)
        if tag is None:
            raise RuntimeError("Tag membership update succeeded but tag could not be reloaded.")
        return tag

    def list_tag_items(self, tag_id: str, *, include_archived_items: bool, limit: int, offset: int) -> OffsetListResult:
        query = LibraryQueryDefinition(
            search=None,
            channel_ids=(),
            categories=(),
            tag_ids=(),
            collection_ids=(),
            view=None,
            sort="newest",
            is_read=None,
            is_favorite=None,
            digest_candidate=None,
            published_after=None,
            published_before=None,
            include_archived_items=include_archived_items,
        )
        return self.list_items_for_query(
            query,
            limit=limit,
            offset=offset,
            extra_clauses=["EXISTS (SELECT 1 FROM library_tag_items tag_items WHERE tag_items.item_id = i.id AND tag_items.tag_id = ?)"],
            extra_params=[tag_id],
        )

    def list_collections(self, *, include_archived: bool, limit: int, offset: int) -> OffsetListResult:
        where_sql = "" if include_archived else "WHERE c.archived_at IS NULL"
        return self._fetch_collection_rows(where_sql=where_sql, params=[], limit=limit, offset=offset)

    def get_collection(self, collection_id: str) -> dict[str, Any] | None:
        rows = self._fetch_collection_rows(where_sql="WHERE c.id = ?", params=[collection_id], limit=1, offset=0).items
        return rows[0] if rows else None

    def create_collection(self, *, name: str, normalized_name: str, description: str | None) -> dict[str, Any]:
        collection_id = f"col_{uuid.uuid4().hex}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO library_collections (
                    id,
                    name,
                    normalized_name,
                    description
                )
                VALUES (?, ?, ?, ?)
                """,
                [collection_id, name, normalized_name, description],
            )
            connection.commit()

        collection = self.get_collection(collection_id)
        if collection is None:
            raise RuntimeError("Collection create succeeded but row could not be reloaded.")
        return collection

    def update_collection(
        self,
        collection_id: str,
        *,
        name: str | None,
        normalized_name: str | None,
        update_name: bool,
        description: str | None,
        update_description: bool,
        state: str | None,
        update_state: bool,
    ) -> dict[str, Any]:
        assignments: list[str] = []
        params: list[object] = []

        if update_name:
            assignments.extend(["name = ?", "normalized_name = ?"])
            params.extend([name, normalized_name])
        if update_description:
            assignments.append("description = ?")
            params.append(description)
        if update_state:
            if state == "archived":
                assignments.append("archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)")
            else:
                assignments.append("archived_at = NULL")

        if not assignments:
            collection = self.get_collection(collection_id)
            if collection is None:
                raise RuntimeError("Collection not found.")
            return collection

        with connect(self.database_path) as connection:
            cursor = connection.execute(
                f"""
                UPDATE library_collections
                SET {", ".join(assignments)}
                WHERE id = ?
                """,
                [*params, collection_id],
            )
            connection.commit()

        if cursor.rowcount == 0:
            raise RuntimeError("Collection not found.")

        collection = self.get_collection(collection_id)
        if collection is None:
            raise RuntimeError("Collection update succeeded but row could not be reloaded.")
        return collection

    def archive_collection(self, collection_id: str) -> dict[str, Any]:
        with connect(self.database_path) as connection:
            cursor = connection.execute(
                """
                UPDATE library_collections
                SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
                WHERE id = ?
                """,
                [collection_id],
            )
            connection.commit()

        if cursor.rowcount == 0:
            raise RuntimeError("Collection not found.")

        collection = self.get_collection(collection_id)
        if collection is None:
            raise RuntimeError("Collection archive succeeded but row could not be reloaded.")
        return collection

    def replace_collection_items(self, collection_id: str, item_ids: list[str]) -> dict[str, Any]:
        target_ids = list(item_ids)
        temporary_offset = max(1000000, len(target_ids) + 1000000)

        with connect(self.database_path) as connection:
            collection_exists = connection.execute(
                """
                SELECT 1
                FROM library_collections
                WHERE id = ?
                """,
                [collection_id],
            ).fetchone()
            if collection_exists is None:
                raise RuntimeError("Collection not found.")

            connection.execute(
                """
                UPDATE library_collection_items
                SET position = position + ?
                WHERE collection_id = ?
                """,
                [temporary_offset, collection_id],
            )

            for position, item_id in enumerate(target_ids):
                connection.execute(
                    """
                    INSERT INTO library_collection_items (
                        collection_id,
                        item_id,
                        position
                    )
                    VALUES (?, ?, ?)
                    ON CONFLICT(collection_id, item_id) DO UPDATE SET
                        position = excluded.position
                    """,
                    [collection_id, item_id, position],
                )

            if target_ids:
                placeholders = ", ".join("?" for _ in target_ids)
                connection.execute(
                    f"""
                    DELETE FROM library_collection_items
                    WHERE collection_id = ?
                      AND item_id NOT IN ({placeholders})
                    """,
                    [collection_id, *target_ids],
                )
            else:
                connection.execute(
                    """
                    DELETE FROM library_collection_items
                    WHERE collection_id = ?
                    """,
                    [collection_id],
                )

            connection.commit()

        collection = self.get_collection(collection_id)
        if collection is None:
            raise RuntimeError("Collection membership update succeeded but collection could not be reloaded.")
        return collection

    def list_collection_items(
        self,
        collection_id: str,
        *,
        include_archived_items: bool,
        limit: int,
        offset: int,
    ) -> OffsetListResult:
        query = LibraryQueryDefinition(
            search=None,
            channel_ids=(),
            categories=(),
            tag_ids=(),
            collection_ids=(),
            view=None,
            sort="newest",
            is_read=None,
            is_favorite=None,
            digest_candidate=None,
            published_after=None,
            published_before=None,
            include_archived_items=include_archived_items,
        )
        return self.list_items_for_query(
            query,
            limit=limit,
            offset=offset,
            extra_clauses=[
                "EXISTS (SELECT 1 FROM library_collection_items collection_items WHERE collection_items.item_id = i.id AND collection_items.collection_id = ?)"
            ],
            extra_params=[collection_id],
            order_sql_override="""
                (
                    SELECT collection_items.position
                    FROM library_collection_items collection_items
                    WHERE collection_items.collection_id = ?
                      AND collection_items.item_id = i.id
                ) ASC,
                datetime(COALESCE(i.published_at, i.discovered_at, i.created_at)) DESC,
                i.id DESC
            """,
            order_params=[collection_id],
        )

    def list_saved_searches(self, *, include_archived: bool, limit: int, offset: int) -> OffsetListResult:
        clauses = []
        params: list[object] = []
        if not include_archived:
            clauses.append("archived_at IS NULL")
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    id,
                    name,
                    description,
                    query_json,
                    created_at,
                    updated_at,
                    last_used_at,
                    archived_at
                FROM library_saved_searches
                {where_sql}
                ORDER BY lower(name) ASC, created_at ASC
                LIMIT ? OFFSET ?
                """,
                [*params, limit + 1, offset],
            ).fetchall()

        has_more = len(rows) > limit
        page_rows = rows[:limit]
        return OffsetListResult(
            items=[self._serialize_saved_search(row) for row in page_rows],
            next_offset=offset + limit if has_more else None,
            has_more=has_more,
            limit=limit,
        )

    def get_saved_search(self, saved_search_id: str) -> dict[str, Any] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    name,
                    description,
                    query_json,
                    created_at,
                    updated_at,
                    last_used_at,
                    archived_at
                FROM library_saved_searches
                WHERE id = ?
                """,
                [saved_search_id],
            ).fetchone()

        if row is None:
            return None
        return self._serialize_saved_search(row)

    def create_saved_search(
        self,
        *,
        name: str,
        normalized_name: str,
        description: str | None,
        query_payload: dict[str, Any],
    ) -> dict[str, Any]:
        saved_search_id = f"search_{uuid.uuid4().hex}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO library_saved_searches (
                    id,
                    name,
                    normalized_name,
                    description,
                    query_json
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    saved_search_id,
                    name,
                    normalized_name,
                    description,
                    json.dumps(query_payload, separators=(",", ":"), sort_keys=True),
                ],
            )
            connection.commit()

        saved_search = self.get_saved_search(saved_search_id)
        if saved_search is None:
            raise RuntimeError("Saved search create succeeded but row could not be reloaded.")
        return saved_search

    def update_saved_search(
        self,
        saved_search_id: str,
        *,
        name: str | None,
        normalized_name: str | None,
        update_name: bool,
        description: str | None,
        update_description: bool,
        query_payload: dict[str, Any] | None,
        update_query: bool,
        state: str | None,
        update_state: bool,
    ) -> dict[str, Any]:
        assignments: list[str] = []
        params: list[object] = []

        if update_name:
            assignments.extend(["name = ?", "normalized_name = ?"])
            params.extend([name, normalized_name])
        if update_description:
            assignments.append("description = ?")
            params.append(description)
        if update_query:
            assignments.append("query_json = ?")
            params.append(json.dumps(query_payload or {}, separators=(",", ":"), sort_keys=True))
        if update_state:
            if state == "archived":
                assignments.append("archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)")
            else:
                assignments.append("archived_at = NULL")

        if not assignments:
            saved_search = self.get_saved_search(saved_search_id)
            if saved_search is None:
                raise RuntimeError("Saved search not found.")
            return saved_search

        with connect(self.database_path) as connection:
            cursor = connection.execute(
                f"""
                UPDATE library_saved_searches
                SET {", ".join(assignments)}
                WHERE id = ?
                """,
                [*params, saved_search_id],
            )
            connection.commit()

        if cursor.rowcount == 0:
            raise RuntimeError("Saved search not found.")

        saved_search = self.get_saved_search(saved_search_id)
        if saved_search is None:
            raise RuntimeError("Saved search update succeeded but row could not be reloaded.")
        return saved_search

    def archive_saved_search(self, saved_search_id: str) -> dict[str, Any]:
        with connect(self.database_path) as connection:
            cursor = connection.execute(
                """
                UPDATE library_saved_searches
                SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)
                WHERE id = ?
                """,
                [saved_search_id],
            )
            connection.commit()

        if cursor.rowcount == 0:
            raise RuntimeError("Saved search not found.")

        saved_search = self.get_saved_search(saved_search_id)
        if saved_search is None:
            raise RuntimeError("Saved search archive succeeded but row could not be reloaded.")
        return saved_search

    def touch_saved_search(self, saved_search_id: str) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                UPDATE library_saved_searches
                SET last_used_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                [saved_search_id],
            )
            connection.commit()

    def list_items_for_query(
        self,
        query: LibraryQueryDefinition,
        *,
        limit: int,
        offset: int,
        extra_clauses: list[str] | None = None,
        extra_params: list[object] | None = None,
        order_sql_override: str | None = None,
        order_params: list[object] | None = None,
    ) -> OffsetListResult:
        where_sql, params = self._build_item_where_sql(
            query,
            extra_clauses=extra_clauses or [],
            extra_params=extra_params or [],
        )
        order_sql = order_sql_override or resolve_item_order_sql(query.sort)

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
                {where_sql}
                ORDER BY {order_sql}
                LIMIT ? OFFSET ?
                """,
                [*params, *(order_params or []), limit + 1, offset],
            ).fetchall()

        has_more = len(rows) > limit
        page_rows = rows[:limit]
        item_ids = [str(row["id"]) for row in page_rows]
        tags_by_item = self._list_tags_for_items(item_ids)
        collections_by_item = self._list_collections_for_items(item_ids)

        return OffsetListResult(
            items=[
                self._serialize_item(
                    row,
                    tags=tags_by_item.get(str(row["id"]), []),
                    collections=collections_by_item.get(str(row["id"]), []),
                )
                for row in page_rows
            ],
            next_offset=offset + limit if has_more else None,
            has_more=has_more,
            limit=limit,
        )

    def count_items(
        self,
        query: LibraryQueryDefinition,
        *,
        extra_clauses: list[str] | None = None,
        extra_params: list[object] | None = None,
    ) -> int:
        where_sql, params = self._build_item_where_sql(
            query,
            extra_clauses=extra_clauses or [],
            extra_params=extra_params or [],
        )
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

    def get_existing_item_ids(self, item_ids: list[str]) -> set[str]:
        return self._get_existing_ids(table="items", item_ids=item_ids)

    def get_existing_channel_ids(self, channel_ids: list[str]) -> set[str]:
        return self._get_existing_ids(table="channels", item_ids=channel_ids)

    def get_existing_tag_ids(self, tag_ids: list[str]) -> set[str]:
        return self._get_existing_ids(table="library_tags", item_ids=tag_ids)

    def get_existing_collection_ids(self, collection_ids: list[str]) -> set[str]:
        return self._get_existing_ids(table="library_collections", item_ids=collection_ids)

    def _fetch_tag_rows(self, *, where_sql: str, params: list[object], limit: int, offset: int) -> OffsetListResult:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    t.id,
                    t.name,
                    t.color,
                    t.description,
                    t.created_at,
                    t.updated_at,
                    t.archived_at,
                    COUNT(lti.item_id) AS item_count,
                    SUM(CASE WHEN i.archived_at IS NULL AND i.is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
                    MAX(lti.assigned_at) AS last_assigned_at
                FROM library_tags t
                LEFT JOIN library_tag_items lti
                    ON lti.tag_id = t.id
                LEFT JOIN items i
                    ON i.id = lti.item_id
                {where_sql}
                GROUP BY t.id
                ORDER BY lower(t.name) ASC, t.created_at ASC
                LIMIT ? OFFSET ?
                """,
                [*params, limit + 1, offset],
            ).fetchall()

        has_more = len(rows) > limit
        page_rows = rows[:limit]
        return OffsetListResult(
            items=[self._serialize_tag(row) for row in page_rows],
            next_offset=offset + limit if has_more else None,
            has_more=has_more,
            limit=limit,
        )

    def _fetch_collection_rows(
        self,
        *,
        where_sql: str,
        params: list[object],
        limit: int,
        offset: int,
    ) -> OffsetListResult:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    c.id,
                    c.name,
                    c.description,
                    c.created_at,
                    c.updated_at,
                    c.archived_at,
                    COUNT(ci.item_id) AS item_count,
                    SUM(CASE WHEN i.archived_at IS NULL AND i.is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
                    MAX(ci.added_at) AS last_added_at
                FROM library_collections c
                LEFT JOIN library_collection_items ci
                    ON ci.collection_id = c.id
                LEFT JOIN items i
                    ON i.id = ci.item_id
                {where_sql}
                GROUP BY c.id
                ORDER BY lower(c.name) ASC, c.created_at ASC
                LIMIT ? OFFSET ?
                """,
                [*params, limit + 1, offset],
            ).fetchall()

        has_more = len(rows) > limit
        page_rows = rows[:limit]
        return OffsetListResult(
            items=[self._serialize_collection(row) for row in page_rows],
            next_offset=offset + limit if has_more else None,
            has_more=has_more,
            limit=limit,
        )

    def _build_item_where_sql(
        self,
        query: LibraryQueryDefinition,
        *,
        extra_clauses: list[str],
        extra_params: list[object],
    ) -> tuple[str, list[object]]:
        clauses: list[str] = list(extra_clauses)
        params: list[object] = list(extra_params)

        if query.channel_ids:
            placeholders = ", ".join("?" for _ in query.channel_ids)
            clauses.append(f"i.channel_id IN ({placeholders})")
            params.extend(query.channel_ids)
        if query.categories:
            placeholders = ", ".join("?" for _ in query.categories)
            clauses.append(f"c.category IN ({placeholders})")
            params.extend(query.categories)
        if query.tag_ids:
            placeholders = ", ".join("?" for _ in query.tag_ids)
            clauses.append(
                f"""
                EXISTS (
                    SELECT 1
                    FROM library_tag_items query_tags
                    WHERE query_tags.item_id = i.id
                      AND query_tags.tag_id IN ({placeholders})
                )
                """
            )
            params.extend(query.tag_ids)
        if query.collection_ids:
            placeholders = ", ".join("?" for _ in query.collection_ids)
            clauses.append(
                f"""
                EXISTS (
                    SELECT 1
                    FROM library_collection_items query_collections
                    WHERE query_collections.item_id = i.id
                      AND query_collections.collection_id IN ({placeholders})
                )
                """
            )
            params.extend(query.collection_ids)

        if query.view == "inbox":
            clauses.append("i.archived_at IS NULL")
            clauses.append("i.is_favorite = 0")
        elif query.view == "saved":
            clauses.append("i.archived_at IS NULL")
            clauses.append("i.is_favorite = 1")
        elif query.view == "archive":
            clauses.append("i.archived_at IS NOT NULL")
        elif not query.include_archived_items:
            clauses.append("i.archived_at IS NULL")

        if query.is_read is not None:
            clauses.append("i.is_read = ?")
            params.append(int(query.is_read))
        if query.is_favorite is not None:
            clauses.append("i.is_favorite = ?")
            params.append(int(query.is_favorite))
        if query.digest_candidate is not None:
            clauses.append("i.digest_candidate = ?")
            params.append(int(query.digest_candidate))
        if query.published_after:
            clauses.append(f"datetime({SORT_VALUE_SQL}) >= datetime(?)")
            params.append(query.published_after)
        if query.published_before:
            clauses.append(f"datetime({SORT_VALUE_SQL}) <= datetime(?)")
            params.append(query.published_before)
        if query.search:
            pattern = f"%{escape_like(query.search.casefold())}%"
            clauses.append(
                """
                (
                    lower(i.title) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(i.author, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(i.excerpt, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(i.content_text, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.title, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.category, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.feed_url, '')) LIKE ? ESCAPE '\\'
                    OR lower(COALESCE(c.site_url, '')) LIKE ? ESCAPE '\\'
                    OR lower(i.source_url) LIKE ? ESCAPE '\\'
                )
                """
            )
            params.extend([pattern] * 9)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return where_sql, params

    def _list_tags_for_items(self, item_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        if not item_ids:
            return {}

        placeholders = ", ".join("?" for _ in item_ids)
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    lti.item_id,
                    t.id,
                    t.name,
                    t.color
                FROM library_tag_items lti
                INNER JOIN library_tags t
                    ON t.id = lti.tag_id
                WHERE lti.item_id IN ({placeholders})
                  AND t.archived_at IS NULL
                ORDER BY lower(t.name) ASC
                """,
                item_ids,
            ).fetchall()

        tags_by_item: dict[str, list[dict[str, Any]]] = {item_id: [] for item_id in item_ids}
        for row in rows:
            tags_by_item.setdefault(str(row["item_id"]), []).append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "color": row["color"],
                }
            )
        return tags_by_item

    def _list_collections_for_items(self, item_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        if not item_ids:
            return {}

        placeholders = ", ".join("?" for _ in item_ids)
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    ci.item_id,
                    c.id,
                    c.name,
                    ci.position
                FROM library_collection_items ci
                INNER JOIN library_collections c
                    ON c.id = ci.collection_id
                WHERE ci.item_id IN ({placeholders})
                  AND c.archived_at IS NULL
                ORDER BY ci.position ASC, lower(c.name) ASC
                """,
                item_ids,
            ).fetchall()

        collections_by_item: dict[str, list[dict[str, Any]]] = {item_id: [] for item_id in item_ids}
        for row in rows:
            collections_by_item.setdefault(str(row["item_id"]), []).append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "position": int(row["position"]) if row["position"] is not None else None,
                }
            )
        return collections_by_item

    def _get_existing_ids(self, *, table: str, item_ids: list[str]) -> set[str]:
        if not item_ids:
            return set()

        placeholders = ", ".join("?" for _ in item_ids)
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT id
                FROM {table}
                WHERE id IN ({placeholders})
                """,
                item_ids,
            ).fetchall()
        return {str(row["id"]) for row in rows}

    @staticmethod
    def _serialize_tag(row: sqlite3.Row) -> dict[str, Any]:
        archived_at = row["archived_at"] if has_text(row["archived_at"]) else None
        return {
            "id": row["id"],
            "name": row["name"],
            "color": row["color"],
            "description": row["description"],
            "state": "archived" if archived_at else "active",
            "item_count": int(row["item_count"] or 0),
            "unread_count": int(row["unread_count"] or 0),
            "last_assigned_at": row["last_assigned_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "archived_at": archived_at,
        }

    @staticmethod
    def _serialize_collection(row: sqlite3.Row) -> dict[str, Any]:
        archived_at = row["archived_at"] if has_text(row["archived_at"]) else None
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "state": "archived" if archived_at else "active",
            "item_count": int(row["item_count"] or 0),
            "unread_count": int(row["unread_count"] or 0),
            "last_added_at": row["last_added_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "archived_at": archived_at,
        }

    @staticmethod
    def _serialize_saved_search(row: sqlite3.Row) -> dict[str, Any]:
        raw_query = json.loads(row["query_json"] or "{}")
        query = raw_query if isinstance(raw_query, dict) else {}
        archived_at = row["archived_at"] if has_text(row["archived_at"]) else None
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "state": "archived" if archived_at else "active",
            "query": query,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "last_used_at": row["last_used_at"],
            "archived_at": archived_at,
        }

    @staticmethod
    def _serialize_item(
        row: sqlite3.Row,
        *,
        tags: list[dict[str, Any]],
        collections: list[dict[str, Any]],
    ) -> dict[str, Any]:
        has_cleaned_content = has_text(row["cleaned_html"]) or has_text(row["content_text"])
        has_raw_content = has_text(row["raw_html"]) or has_text(row["excerpt"])
        library = build_library(
            is_favorite=bool(row["is_favorite"]),
            favorited_at=row["favorited_at"],
            archived_at=row["archived_at"],
        )
        return {
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
            "library": library,
            "channel": {
                "id": row["channel_id"],
                "title": row["channel_title"],
                "category": row["channel_category"],
                "feed_url": row["channel_feed_url"],
                "site_url": row["channel_site_url"],
                "state": row["channel_state"],
            },
            "tags": tags,
            "collections": collections,
        }

    def _ensure_schema(self) -> None:
        with connect(self.database_path) as connection:
            tables = {
                str(row["name"])
                for row in connection.execute(
                    """
                    SELECT name
                    FROM sqlite_master
                    WHERE type = 'table'
                    """
                ).fetchall()
            }
            if "items" not in tables:
                return

            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS library_tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    normalized_name TEXT NOT NULL,
                    color TEXT,
                    description TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    archived_at TEXT
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_library_tags_name_unique
                    ON library_tags (normalized_name)
                    WHERE archived_at IS NULL;

                CREATE TABLE IF NOT EXISTS library_tag_items (
                    tag_id TEXT NOT NULL REFERENCES library_tags(id) ON DELETE CASCADE,
                    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (tag_id, item_id)
                );

                CREATE INDEX IF NOT EXISTS idx_library_tag_items_item_id
                    ON library_tag_items (item_id);

                CREATE TABLE IF NOT EXISTS library_collections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    normalized_name TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    archived_at TEXT
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_library_collections_name_unique
                    ON library_collections (normalized_name)
                    WHERE archived_at IS NULL;

                CREATE TABLE IF NOT EXISTS library_collection_items (
                    collection_id TEXT NOT NULL REFERENCES library_collections(id) ON DELETE CASCADE,
                    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                    position INTEGER NOT NULL CHECK (position >= 0),
                    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (collection_id, item_id)
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_library_collection_items_position_unique
                    ON library_collection_items (collection_id, position);

                CREATE INDEX IF NOT EXISTS idx_library_collection_items_item_id
                    ON library_collection_items (item_id);

                CREATE TABLE IF NOT EXISTS library_saved_searches (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    normalized_name TEXT NOT NULL,
                    description TEXT,
                    query_json TEXT NOT NULL DEFAULT '{}',
                    last_used_at TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    archived_at TEXT
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_library_saved_searches_name_unique
                    ON library_saved_searches (normalized_name)
                    WHERE archived_at IS NULL;

                CREATE TRIGGER IF NOT EXISTS trg_library_tags_updated_at
                AFTER UPDATE ON library_tags
                FOR EACH ROW
                WHEN NEW.updated_at = OLD.updated_at
                BEGIN
                    UPDATE library_tags
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.id;
                END;

                CREATE TRIGGER IF NOT EXISTS trg_library_collections_updated_at
                AFTER UPDATE ON library_collections
                FOR EACH ROW
                WHEN NEW.updated_at = OLD.updated_at
                BEGIN
                    UPDATE library_collections
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.id;
                END;

                CREATE TRIGGER IF NOT EXISTS trg_library_saved_searches_updated_at
                AFTER UPDATE ON library_saved_searches
                FOR EACH ROW
                WHEN NEW.updated_at = OLD.updated_at
                BEGIN
                    UPDATE library_saved_searches
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = NEW.id;
                END;
                """
            )
            connection.commit()


def resolve_item_order_sql(sort: str) -> str:
    if sort == "oldest":
        return f"datetime({SORT_VALUE_SQL}) ASC, i.id ASC"
    if sort == "recently_saved":
        return f"datetime({RECENTLY_SAVED_SORT_VALUE_SQL}) DESC, i.id DESC"
    return f"datetime({SORT_VALUE_SQL}) DESC, i.id DESC"
