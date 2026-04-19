from __future__ import annotations

from datetime import UTC, datetime
import sqlite3
from pathlib import Path
from uuid import uuid4

from app.db.initializer import connect

STALE_FETCH_HOURS = 72
NOISY_ITEMS_LAST_24H = 25
NOISY_ITEMS_LAST_7D = 120

CHANNEL_SELECT_SQL = """
    SELECT
        c.id,
        c.title,
        c.site_url,
        c.feed_url,
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

CHANNEL_GROUP_BY_SQL = """
    GROUP BY
        c.id,
        c.title,
        c.site_url,
        c.feed_url,
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


class ChannelRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def list_channels(
        self,
        *,
        state: str | None,
        category: str | None,
        limit: int,
    ) -> list[dict[str, object]]:
        clauses: list[str] = []
        params: list[object] = []

        if state:
            clauses.append("c.state = ?")
            params.append(state)
        if category:
            clauses.append("c.category = ?")
            params.append(category)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                {CHANNEL_SELECT_SQL}
                {where_sql}
                {CHANNEL_GROUP_BY_SQL}
                ORDER BY c.created_at DESC, c.id DESC
                LIMIT ?
                """,
                [*params, limit],
            ).fetchall()

        return [self._serialize_channel(row) for row in rows]

    def get_by_normalized_feed_url(self, normalized_feed_url: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT * FROM (
                    SELECT
                        c.id,
                        c.title,
                        c.site_url,
                        c.feed_url,
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
                    WHERE c.normalized_feed_url = ?
                    GROUP BY
                        c.id,
                        c.title,
                        c.site_url,
                        c.feed_url,
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
                )
                """,
                [normalized_feed_url],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_channel(row)

    def get_by_id(self, channel_id: str) -> dict[str, object] | None:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT * FROM (
                    SELECT
                        c.id,
                        c.title,
                        c.site_url,
                        c.feed_url,
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
                    WHERE c.id = ?
                    GROUP BY
                        c.id,
                        c.title,
                        c.site_url,
                        c.feed_url,
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
                )
                """,
                [channel_id],
            ).fetchone()

        if row is None:
            return None

        return self._serialize_channel(row)

    def list_by_normalized_feed_urls(self, normalized_feed_urls: list[str]) -> dict[str, dict[str, object]]:
        normalized_candidates = [url for url in normalized_feed_urls if url]
        if not normalized_candidates:
            return {}

        placeholders = ", ".join("?" for _ in normalized_candidates)
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                {CHANNEL_SELECT_SQL}
                WHERE c.normalized_feed_url IN ({placeholders})
                {CHANNEL_GROUP_BY_SQL}
                """,
                normalized_candidates,
            ).fetchall()

        channels = [self._serialize_channel(row) for row in rows]
        return {str(channel["feed_url"]): channel for channel in channels}

    def create_channel(
        self,
        *,
        title: str,
        site_url: str | None,
        feed_url: str,
        normalized_feed_url: str,
        description: str | None,
        language: str | None,
        category: str | None,
    ) -> dict[str, object]:
        channel_id = f"chn_{uuid4().hex[:12]}"

        with connect(self.database_path) as connection:
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
                        title,
                        site_url,
                        feed_url,
                        normalized_feed_url,
                        description,
                        language,
                        category,
                    ],
                )
                connection.commit()
            except sqlite3.IntegrityError as error:
                raise error

        channel = self.get_by_normalized_feed_url(normalized_feed_url)
        if channel is None:
            raise RuntimeError("Channel insert succeeded but could not be reloaded.")
        return channel

    def update_channel(
        self,
        channel_id: str,
        *,
        category: str | None,
        update_category: bool,
        state: str | None,
        update_state: bool,
    ) -> dict[str, object]:
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

        if not assignments:
            channel = self.get_by_id(channel_id)
            if channel is None:
                raise RuntimeError("Channel not found.")
            return channel

        with connect(self.database_path) as connection:
            cursor = connection.execute(
                f"""
                UPDATE channels
                SET {', '.join(assignments)}
                WHERE id = ?
                """,
                [*params, channel_id],
            )
            connection.commit()

        if cursor.rowcount == 0:
            raise RuntimeError("Channel not found.")

        channel = self.get_by_id(channel_id)
        if channel is None:
            raise RuntimeError("Channel update succeeded but channel could not be reloaded.")
        return channel

    def archive_channel(self, channel_id: str) -> dict[str, object]:
        return self.update_channel(
            channel_id,
            category=None,
            update_category=False,
            state="archived",
            update_state=True,
        )

    @staticmethod
    def _serialize_channel(row: sqlite3.Row) -> dict[str, object]:
        return {
            "id": row["id"],
            "title": row["title"],
            "site_url": row["site_url"],
            "feed_url": row["feed_url"],
            "category": row["category"],
            "state": row["state"],
            "last_fetch_at": row["last_fetch_at"],
            "last_error": row["last_error_message"],
            "unread_count": int(row["unread_count"] or 0),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "health": build_channel_health(row),
        }


def build_channel_health(row: sqlite3.Row) -> dict[str, object]:
    items_last_24h = int(row["items_last_24h"] or 0)
    items_last_7d = int(row["items_last_7d"] or 0)
    total_items = int(row["total_items"] or 0)
    consecutive_failures = int(row["consecutive_failures"] or 0)
    last_fetch_at = row["last_fetch_at"]
    last_successful_fetch_at = row["last_successful_fetch_at"]
    last_error_at = row["last_error_at"]
    last_error_code = row["last_error_code"]
    last_error_message = row["last_error_message"]
    latest_item_at = row["latest_item_at"]

    now = datetime.now(UTC)
    stale = is_stale_channel(now=now, created_at=row["created_at"], last_successful_fetch_at=last_successful_fetch_at)
    noisy = items_last_24h >= NOISY_ITEMS_LAST_24H or items_last_7d >= NOISY_ITEMS_LAST_7D

    indicators: list[str] = []
    if stale:
        indicators.append("stale")
    if noisy:
        indicators.append("noisy")
    if consecutive_failures:
        indicators.append("failing")
    elif last_fetch_at is None:
        indicators.append("pending_initial_sync")

    if consecutive_failures >= 3:
        status = "error"
        summary = f"{consecutive_failures} consecutive sync failures."
    elif last_error_at and last_successful_fetch_at is None:
        status = "error"
        summary = "No successful sync yet; latest fetch failed."
    elif stale or noisy or consecutive_failures > 0:
        status = "warning"
        summary = summarize_warning(
            stale=stale,
            noisy=noisy,
            consecutive_failures=consecutive_failures,
            last_successful_fetch_at=last_successful_fetch_at,
            items_last_24h=items_last_24h,
        )
    elif last_successful_fetch_at:
        status = "healthy"
        summary = f"Last successful sync {last_successful_fetch_at}."
    else:
        status = "unknown"
        summary = "Waiting for first successful sync."

    return {
        "status": status,
        "summary": summary,
        "indicators": indicators,
        "stale": stale,
        "noisy": noisy,
        "last_fetch_at": last_fetch_at,
        "last_successful_fetch_at": last_successful_fetch_at,
        "last_error_at": last_error_at,
        "last_error_code": last_error_code,
        "last_error_message": last_error_message,
        "consecutive_failures": consecutive_failures,
        "items_last_24h": items_last_24h,
        "items_last_7d": items_last_7d,
        "total_items": total_items,
        "latest_item_at": latest_item_at,
    }


def summarize_warning(
    *,
    stale: bool,
    noisy: bool,
    consecutive_failures: int,
    last_successful_fetch_at: str | None,
    items_last_24h: int,
) -> str:
    if consecutive_failures > 0:
        return f"Latest sync failed ({consecutive_failures} consecutive failure(s))."
    if stale:
        if last_successful_fetch_at:
            return f"No successful sync since {last_successful_fetch_at}."
        return "Never fetched successfully yet."
    return f"High-volume feed: {items_last_24h} item(s) in the last 24 hours."


def is_stale_channel(*, now: datetime, created_at: str | None, last_successful_fetch_at: str | None) -> bool:
    if last_successful_fetch_at:
        last_success = parse_timestamp(last_successful_fetch_at)
        if last_success is None:
            return False
        return (now - last_success).total_seconds() >= STALE_FETCH_HOURS * 3600

    created = parse_timestamp(created_at)
    if created is None:
        return False
    return (now - created).total_seconds() >= STALE_FETCH_HOURS * 3600


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None

    candidate = value.strip()
    if not candidate:
        return None

    normalized = candidate.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            parsed = datetime.strptime(candidate, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
