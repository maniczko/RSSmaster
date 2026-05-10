from __future__ import annotations

import json
from pathlib import Path
import sqlite3
from typing import Any

from app.db.initializer import connect

DELIVERY_SETTINGS_KEY = "delivery_profile"
DELIVERY_SETTINGS_DESCRIPTION = "User-managed SMTP and Kindle delivery settings."
AI_SETTINGS_KEY = "ai_profile"
AI_SETTINGS_DESCRIPTION = "User-managed AI provider and OpenAI model settings."


class SettingsRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def get_setting(self, key: str) -> dict[str, Any] | None:
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

        return self._serialize_setting(row)

    def upsert_setting(
        self,
        *,
        key: str,
        value: dict[str, Any],
        description: str,
        updated_by: str | None,
    ) -> dict[str, Any]:
        with connect(self.database_path) as connection:
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
            connection.commit()

        setting = self.get_setting(key)
        if setting is None:
            raise RuntimeError("Setting upsert succeeded but row could not be reloaded.")
        return setting

    def delete_setting(self, key: str) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                DELETE FROM settings
                WHERE key = ?
                """,
                [key],
            )
            connection.commit()

    @staticmethod
    def _serialize_setting(row: sqlite3.Row) -> dict[str, Any]:
        raw_value = json.loads(row["value_json"] or "{}")
        value = raw_value if isinstance(raw_value, dict) else {}
        return {
            "key": row["key"],
            "value": value,
            "description": row["description"],
            "updated_by": row["updated_by"],
            "updated_at": row["updated_at"],
        }
