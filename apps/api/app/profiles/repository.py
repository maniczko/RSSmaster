from __future__ import annotations

from pathlib import Path
from typing import Any

from app.settings.repository import SettingsRepository

INTEREST_PROFILE_KEY = "user_interest_profile"
INTEREST_PROFILE_DESCRIPTION = "Operator-managed ranking interests, suppressions, and recency preference."


class InterestProfileRepository:
    def __init__(self, database_path: Path) -> None:
        self._settings_repository = SettingsRepository(database_path)

    def get_profile(self) -> dict[str, Any] | None:
        return self._settings_repository.get_setting(INTEREST_PROFILE_KEY)

    def upsert_profile(
        self,
        *,
        value: dict[str, Any],
        updated_by: str | None,
    ) -> dict[str, Any]:
        return self._settings_repository.upsert_setting(
            key=INTEREST_PROFILE_KEY,
            value=value,
            description=INTEREST_PROFILE_DESCRIPTION,
            updated_by=updated_by,
        )

    def delete_profile(self) -> None:
        self._settings_repository.delete_setting(INTEREST_PROFILE_KEY)
