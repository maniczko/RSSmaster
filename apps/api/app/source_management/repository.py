from __future__ import annotations

import json
from pathlib import Path
import sqlite3
from typing import Any
from uuid import uuid4

from app.channels.repository import build_channel_health
from app.db.initializer import connect

SOURCE_MANAGEMENT_LAYOUT_KEY = "source_management_layout"
SOURCE_MANAGEMENT_LAYOUT_DESCRIPTION = "Source folders, bundles, and channel membership metadata."
SOURCE_MANAGEMENT_CONTROLS_KEY = "source_management_controls"
SOURCE_MANAGEMENT_CONTROLS_DESCRIPTION = "Source control state such as pause reasons, mute, and snooze metadata."

SOURCE_SELECT_SQL = """
    SELECT
        c.id,
        c.title,
        c.site_url,
        c.feed_url,
        c.normalized_feed_url,
        c.description,
        c.language,
        c.category,
        c.state,
        c.last_fetch_at,
        c.last_successful_fetch_at,
        c.last_error_code,
        c.last_error_message,
        c.last_error_at,
        c.consecutive_failures,
        c.created_at,
        c.updated_at,
        COALESCE(SUM(CASE WHEN i.is_read = 0 THEN 1 ELSE 0 END), 0) AS unread_count,
        COUNT(i.id) AS total_items,
        MAX(COALESCE(i.ingested_at, i.created_at)) AS latest_item_at,
        COALESCE(
            SUM(CASE WHEN COALESCE(i.ingested_at, i.created_at) >= datetime('now', '-1 day') THEN 1 ELSE 0 END),
            0
        ) AS items_last_24h,
        COALESCE(
            SUM(CASE WHEN COALESCE(i.ingested_at, i.created_at) >= datetime('now', '-7 day') THEN 1 ELSE 0 END),
            0
        ) AS items_last_7d
    FROM channels c
    LEFT JOIN items i ON i.channel_id = c.id
"""

SOURCE_GROUP_BY_SQL = """
    GROUP BY
        c.id,
        c.title,
        c.site_url,
        c.feed_url,
        c.normalized_feed_url,
        c.description,
        c.language,
        c.category,
        c.state,
        c.last_fetch_at,
        c.last_successful_fetch_at,
        c.last_error_code,
        c.last_error_message,
        c.last_error_at,
        c.consecutive_failures,
        c.created_at,
        c.updated_at
"""


class SourceManagementRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def list_sources(self, *, include_archived: bool) -> list[dict[str, object]]:
        where_sql = "" if include_archived else "WHERE c.state != 'archived'"
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                {SOURCE_SELECT_SQL}
                {where_sql}
                {SOURCE_GROUP_BY_SQL}
                ORDER BY c.created_at DESC, c.id DESC
                """
            ).fetchall()
        return [self._serialize_source(row) for row in rows]

    def get_source(self, channel_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                f"""
                {SOURCE_SELECT_SQL}
                WHERE c.id = ?
                {SOURCE_GROUP_BY_SQL}
                """,
                [channel_id],
            ).fetchone()
        if row is None:
            return None
        return self._serialize_source(row)

    def list_sources_by_ids(self, channel_ids: list[str]) -> dict[str, dict[str, object]]:
        if not channel_ids:
            return {}

        placeholders = ", ".join("?" for _ in channel_ids)
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                {SOURCE_SELECT_SQL}
                WHERE c.id IN ({placeholders})
                {SOURCE_GROUP_BY_SQL}
                """,
                channel_ids,
            ).fetchall()
        items = [self._serialize_source(row) for row in rows]
        return {str(item["id"]): item for item in items}

    def list_sources_by_feed_urls(self, normalized_feed_urls: list[str]) -> dict[str, dict[str, object]]:
        candidates = [url for url in normalized_feed_urls if url]
        if not candidates:
            return {}

        placeholders = ", ".join("?" for _ in candidates)
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                {SOURCE_SELECT_SQL}
                WHERE c.normalized_feed_url IN ({placeholders})
                {SOURCE_GROUP_BY_SQL}
                """,
                candidates,
            ).fetchall()
        items = [self._serialize_source(row) for row in rows]
        return {str(item["normalized_feed_url"]): item for item in items}

    def list_recent_items(self, channel_id: str, *, limit: int) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    title,
                    source_url,
                    excerpt,
                    published_at,
                    is_read
                FROM items
                WHERE channel_id = ?
                ORDER BY COALESCE(published_at, ingested_at, created_at) DESC, id DESC
                LIMIT ?
                """,
                [channel_id, limit],
            ).fetchall()

        return [
            {
                "id": row["id"],
                "title": row["title"],
                "source_url": row["source_url"],
                "excerpt": row["excerpt"],
                "published_at": row["published_at"],
                "is_read": bool(row["is_read"]),
            }
            for row in rows
        ]

    def list_recent_sync_runs(self, *, limit: int) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    status,
                    trigger_kind,
                    started_at,
                    completed_at,
                    total_count,
                    success_count,
                    failure_count,
                    error_message
                FROM job_runs
                WHERE job_type = 'sync'
                ORDER BY COALESCE(started_at, created_at) DESC, id DESC
                LIMIT ?
                """,
                [limit],
            ).fetchall()

        return [
            {
                "id": row["id"],
                "status": row["status"],
                "trigger_kind": row["trigger_kind"],
                "started_at": row["started_at"],
                "completed_at": row["completed_at"],
                "total_count": int(row["total_count"] or 0),
                "success_count": int(row["success_count"] or 0),
                "failure_count": int(row["failure_count"] or 0),
                "error_message": row["error_message"],
            }
            for row in rows
        ]

    def get_document(self, key: str) -> dict[str, Any] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    key,
                    value_json,
                    description,
                    updated_by,
                    updated_at
                FROM settings
                WHERE key = ?
                """,
                [key],
            ).fetchone()

        if row is None:
            return None

        raw_value = json.loads(row["value_json"] or "{}")
        value = raw_value if isinstance(raw_value, dict) else {}
        return {
            "key": row["key"],
            "value": value,
            "description": row["description"],
            "updated_by": row["updated_by"],
            "updated_at": row["updated_at"],
        }

    def commit_source_updates(
        self,
        channel_id: str,
        *,
        category: str | None,
        update_category: bool,
        state: str | None,
        update_state: bool,
        layout_value: dict[str, Any] | None,
        controls_value: dict[str, Any] | None,
        updated_by: str | None,
    ) -> None:
        with connect(self.database_path) as connection:
            self._assert_channel_exists(connection, channel_id)

            assignments: list[str] = []
            params: list[object] = []

            if update_category:
                assignments.append("category = ?")
                params.append(category)
            if update_state:
                assignments.append("state = ?")
                params.append(state)
                if state == "archived":
                    assignments.append("archived_at = CURRENT_TIMESTAMP")
                else:
                    assignments.append("archived_at = NULL")

            if assignments:
                cursor = connection.execute(
                    f"""
                    UPDATE channels
                    SET {', '.join(assignments)}
                    WHERE id = ?
                    """,
                    [*params, channel_id],
                )
                if cursor.rowcount == 0:
                    raise RuntimeError("Channel not found.")

            if layout_value is not None:
                self._upsert_setting_with_connection(
                    connection,
                    key=SOURCE_MANAGEMENT_LAYOUT_KEY,
                    value=layout_value,
                    description=SOURCE_MANAGEMENT_LAYOUT_DESCRIPTION,
                    updated_by=updated_by,
                )
            if controls_value is not None:
                self._upsert_setting_with_connection(
                    connection,
                    key=SOURCE_MANAGEMENT_CONTROLS_KEY,
                    value=controls_value,
                    description=SOURCE_MANAGEMENT_CONTROLS_DESCRIPTION,
                    updated_by=updated_by,
                )

            connection.commit()

    def apply_opml_import(
        self,
        *,
        feeds: list[dict[str, object]],
        layout_value: dict[str, Any] | None,
        default_category: str | None,
        updated_by: str | None,
    ) -> list[str]:
        created_ids: list[str] = []

        with connect(self.database_path) as connection:
            for feed in feeds:
                channel_id = f"chn_{uuid4().hex[:12]}"
                try:
                    connection.execute(
                        """
                        INSERT INTO channels (
                            id,
                            title,
                            site_url,
                            feed_url,
                            normalized_feed_url,
                            description,
                            language,
                            category
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            channel_id,
                            feed["title"],
                            feed.get("site_url"),
                            feed["feed_url"],
                            feed["feed_url"],
                            feed.get("description"),
                            feed.get("language"),
                            default_category,
                        ],
                    )
                except sqlite3.IntegrityError:
                    continue
                created_ids.append(channel_id)

            if layout_value is not None:
                self._upsert_setting_with_connection(
                    connection,
                    key=SOURCE_MANAGEMENT_LAYOUT_KEY,
                    value=layout_value,
                    description=SOURCE_MANAGEMENT_LAYOUT_DESCRIPTION,
                    updated_by=updated_by,
                )

            connection.commit()

        return created_ids

    def save_documents(
        self,
        *,
        layout_value: dict[str, Any] | None,
        controls_value: dict[str, Any] | None,
        updated_by: str | None,
    ) -> None:
        if layout_value is None and controls_value is None:
            return

        with connect(self.database_path) as connection:
            if layout_value is not None:
                self._upsert_setting_with_connection(
                    connection,
                    key=SOURCE_MANAGEMENT_LAYOUT_KEY,
                    value=layout_value,
                    description=SOURCE_MANAGEMENT_LAYOUT_DESCRIPTION,
                    updated_by=updated_by,
                )
            if controls_value is not None:
                self._upsert_setting_with_connection(
                    connection,
                    key=SOURCE_MANAGEMENT_CONTROLS_KEY,
                    value=controls_value,
                    description=SOURCE_MANAGEMENT_CONTROLS_DESCRIPTION,
                    updated_by=updated_by,
                )
            connection.commit()

    @staticmethod
    def _assert_channel_exists(connection: sqlite3.Connection, channel_id: str) -> None:
        row = connection.execute(
            """
            SELECT 1
            FROM channels
            WHERE id = ?
            """,
            [channel_id],
        ).fetchone()
        if row is None:
            raise RuntimeError("Channel not found.")

    @staticmethod
    def _upsert_setting_with_connection(
        connection: sqlite3.Connection,
        *,
        key: str,
        value: dict[str, Any],
        description: str,
        updated_by: str | None,
    ) -> None:
        connection.execute(
            """
            INSERT INTO settings (
                key,
                value_json,
                description,
                updated_by
            )
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                description = excluded.description,
                updated_by = excluded.updated_by,
                updated_at = CURRENT_TIMESTAMP
            """,
            [
                key,
                json.dumps(value, separators=(",", ":"), sort_keys=True),
                description,
                updated_by,
            ],
        )

    @staticmethod
    def _serialize_source(row: sqlite3.Row) -> dict[str, object]:
        return {
            "id": row["id"],
            "title": row["title"],
            "site_url": row["site_url"],
            "feed_url": row["feed_url"],
            "normalized_feed_url": row["normalized_feed_url"],
            "description": row["description"],
            "language": row["language"],
            "category": row["category"],
            "state": row["state"],
            "unread_count": int(row["unread_count"] or 0),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "health": build_channel_health(row),
        }
