from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.config import Settings
from app.db.initializer import ensure_database
from app.settings.models import UpdateMagazineSettingsRequest
from app.settings.repository import MAGAZINE_SETTINGS_KEY, SettingsRepository
from app.settings.service import SettingsService


class MagazineSettingsServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.database_path = Path(self.tempdir.name) / "rssmaster.db"
        ensure_database(self.database_path)

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def _service(self, *, timezone: str = "Europe/Warsaw", digest_max_items: int = 25) -> SettingsService:
        settings = Settings(
            **{
                "RSSMASTER_ENV": "test",
                "RSSMASTER_DATABASE_PATH": str(self.database_path),
                "RSSMASTER_TIMEZONE": timezone,
                "RSSMASTER_DIGEST_MAX_ITEMS": digest_max_items,
            }
        )
        return SettingsService(settings, SettingsRepository(self.database_path))

    def test_default_magazine_settings_are_disabled_until_configured(self) -> None:
        service = self._service(digest_max_items=33)

        payload = service.get_magazine_settings()
        preflight = service.preflight_magazine_settings()

        self.assertEqual(payload["frequency"], "disabled")
        self.assertEqual(payload["timezone"], "Europe/Warsaw")
        self.assertEqual(payload["time_of_day"], "07:00")
        self.assertEqual(payload["day_of_week"], 1)
        self.assertEqual(payload["article_limit"], 33)
        self.assertEqual(payload["source_scope"], "digest_candidates")
        self.assertEqual(payload["output_format"], "epub")
        self.assertFalse(payload["kindle_delivery_enabled"])
        self.assertFalse(payload["ready"])
        self.assertEqual(preflight["status"], "needs_configuration")
        self.assertFalse(preflight["can_generate"])

    def test_weekly_magazine_schedule_persists_and_preflights_ready(self) -> None:
        service = self._service()

        payload = service.update_magazine_settings(
            UpdateMagazineSettingsRequest(
                frequency="weekly",
                timezone="Europe/Warsaw",
                time_of_day="6:05",
                day_of_week=5,
                article_limit=12,
                source_scope="all_active",
                output_format="epub",
                kindle_delivery_enabled=False,
                updated_by="test-suite",
            )
        )
        preflight = service.preflight_magazine_settings()

        self.assertTrue(payload["ready"])
        self.assertEqual(payload["frequency"], "weekly")
        self.assertEqual(payload["time_of_day"], "06:05")
        self.assertEqual(payload["day_of_week"], 5)
        self.assertEqual(payload["article_limit"], 12)
        self.assertEqual(payload["source_scope"], "all_active")
        self.assertEqual(payload["updated_by"], "test-suite")
        self.assertEqual(preflight["status"], "ready")
        self.assertTrue(preflight["can_generate"])

    def test_invalid_stored_timezone_is_reported_without_crashing(self) -> None:
        service = self._service()
        service.repository.upsert_setting(
            key=MAGAZINE_SETTINGS_KEY,
            value={
                "frequency": "daily",
                "timezone": "Mars/Base",
                "time_of_day": "07:30",
                "article_limit": 10,
            },
            description="test invalid timezone",
            updated_by="test-suite",
        )

        payload = service.get_magazine_settings()
        preflight = service.preflight_magazine_settings()

        self.assertFalse(payload["ready"])
        self.assertEqual(preflight["status"], "needs_configuration")
        self.assertFalse(preflight["can_generate"])
        self.assertTrue(any("niepoprawna" in issue for issue in payload["issues"]))

    def test_null_update_clears_local_override_and_uses_defaults(self) -> None:
        service = self._service(digest_max_items=19)
        service.update_magazine_settings(
            UpdateMagazineSettingsRequest(
                frequency="daily",
                article_limit=8,
                time_of_day="08:15",
            )
        )

        payload = service.update_magazine_settings(
            UpdateMagazineSettingsRequest(
                article_limit=None,
                time_of_day=None,
            )
        )

        self.assertEqual(payload["article_limit"], 19)
        self.assertEqual(payload["time_of_day"], "07:00")
        self.assertEqual(payload["frequency"], "daily")


if __name__ == "__main__":
    unittest.main()
