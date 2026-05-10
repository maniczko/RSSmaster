from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.db.initializer import SCHEMA_VERSION, connect, ensure_database


class DatabaseMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.database_path = Path(self.tempdir.name) / "rssmaster-migration-test.db"

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_ensure_database_applies_all_migrations_and_reports_ready_status(self) -> None:
        state = ensure_database(self.database_path)

        self.assertEqual(state["schema_version"], SCHEMA_VERSION)
        self.assertEqual(state["missing_tables"], [])
        self.assertEqual(state["migration_status"]["status"], "ready")
        self.assertEqual(state["migration_status"]["current_version"], SCHEMA_VERSION)
        self.assertEqual(state["migration_status"]["latest_version"], SCHEMA_VERSION)
        self.assertEqual(state["migration_status"]["pending_versions"], [])
        self.assertEqual(
            state["migration_status"]["applied_this_run"],
            [
                {"version": 1, "name": "rssmaster_schema_v1"},
                {"version": 2, "name": "rssmaster_schema_v2"},
            ],
        )
        with connect(self.database_path) as connection:
            feedback_table = connection.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name = 'reader_feedback'
                """
            ).fetchone()

        self.assertIsNotNone(feedback_table)

    def test_ensure_database_is_idempotent_and_preserves_existing_rows(self) -> None:
        ensure_database(self.database_path)
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO channels (id, title, site_url, feed_url, normalized_feed_url)
                VALUES ('chn_migration', 'Migration Feed', 'https://example.com', 'https://example.com/feed.xml', 'https://example.com/feed.xml')
                """
            )
            connection.commit()

        second_state = ensure_database(self.database_path)

        self.assertEqual(second_state["migration_status"]["status"], "ready")
        self.assertEqual(second_state["migration_status"]["applied_this_run"], [])
        with connect(self.database_path) as connection:
            channel_count = connection.execute("SELECT COUNT(*) AS total FROM channels").fetchone()["total"]
            migration_count = connection.execute("SELECT COUNT(*) AS total FROM schema_migrations").fetchone()["total"]
            user_version = int(connection.execute("PRAGMA user_version").fetchone()[0])

        self.assertEqual(channel_count, 1)
        self.assertEqual(migration_count, SCHEMA_VERSION)
        self.assertEqual(user_version, SCHEMA_VERSION)

    def test_missing_required_table_fails_fast_with_recovery_signal(self) -> None:
        ensure_database(self.database_path)
        with connect(self.database_path) as connection:
            connection.execute("DROP TABLE items")
            connection.commit()

        with self.assertRaisesRegex(RuntimeError, "Missing tables: \\['items'\\]"):
            ensure_database(self.database_path)


if __name__ == "__main__":
    unittest.main()
