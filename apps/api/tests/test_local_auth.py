from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.db.initializer import ensure_database, connect
from app.auth.store import AccountsStore


class LocalAuthStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self.tempdir.name)
        self.legacy_database = self.root / "rssmaster.db"
        self.accounts_database = self.root / "rssmaster_accounts.db"
        self.workspace_dir = self.root / "accounts"
        ensure_database(self.legacy_database)
        with connect(self.legacy_database) as connection:
            connection.execute(
                """
                INSERT INTO channels (id, title, site_url, feed_url, normalized_feed_url)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    "chn_existing",
                    "Existing feed",
                    "https://example.com",
                    "https://example.com/feed.xml",
                    "https://example.com/feed.xml",
                ],
            )
            connection.execute(
                """
                INSERT INTO items (
                    id,
                    channel_id,
                    source_url,
                    normalized_source_url,
                    title,
                    dedupe_key,
                    is_favorite
                )
                VALUES (?, ?, ?, ?, ?, ?, 1)
                """,
                [
                    "itm_existing",
                    "chn_existing",
                    "https://example.com/article",
                    "https://example.com/article",
                    "Existing article",
                    "existing-article",
                ],
            )
            connection.commit()

        self.store = AccountsStore(self.accounts_database, self.legacy_database, self.workspace_dir)

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_first_account_can_claim_legacy_workspace(self) -> None:
        account = self.store.create_account(
            username="Mateusz",
            password="supersekret123",
            display_name="Mateusz",
            claim_legacy_workspace=True,
        )

        workspace_database = Path(str(account["workspace_database_path"]))
        self.assertTrue(workspace_database.exists())

        with connect(workspace_database) as connection:
            saved_count = connection.execute("SELECT COUNT(*) AS total FROM items WHERE is_favorite = 1").fetchone()["total"]
            channel_count = connection.execute("SELECT COUNT(*) AS total FROM channels").fetchone()["total"]

        self.assertEqual(saved_count, 1)
        self.assertEqual(channel_count, 1)

    def test_additional_account_gets_isolated_workspace(self) -> None:
        self.store.create_account(
            username="Mateusz",
            password="supersekret123",
            display_name="Mateusz",
            claim_legacy_workspace=True,
        )
        second = self.store.create_account(
            username="Ala",
            password="innehaslo123",
            display_name="Ala",
            claim_legacy_workspace=False,
        )

        workspace_database = Path(str(second["workspace_database_path"]))
        with connect(workspace_database) as connection:
            saved_count = connection.execute("SELECT COUNT(*) AS total FROM items").fetchone()["total"]
            channel_count = connection.execute("SELECT COUNT(*) AS total FROM channels").fetchone()["total"]

        self.assertEqual(saved_count, 0)
        self.assertEqual(channel_count, 0)

    def test_authenticate_and_resolve_session(self) -> None:
        account = self.store.create_account(
            username="Mateusz",
            password="supersekret123",
            display_name="Mateusz",
            claim_legacy_workspace=True,
        )
        authenticated = self.store.authenticate(username="mateusz", password="supersekret123")
        session = self.store.create_session(account_id=str(account["id"]), session_days=30)
        resolved = self.store.resolve_session(str(session["token"]))

        self.assertEqual(authenticated["id"], account["id"])
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved["id"], account["id"])


if __name__ == "__main__":
    unittest.main()
