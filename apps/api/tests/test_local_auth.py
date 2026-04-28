from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth.router import get_accounts_store
from app.db.initializer import ensure_database, connect
from app.auth.store import AccountsStore
from app.config import Settings, get_settings
from app.main import app
import app.main as main_module


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


class LocalAuthApiTests(unittest.TestCase):
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
                    "chn_legacy",
                    "Legacy feed",
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
                    "itm_legacy",
                    "chn_legacy",
                    "https://example.com/article",
                    "https://example.com/article",
                    "Legacy article",
                    "legacy-article",
                ],
            )
            connection.commit()

        self.settings = Settings(
            **{
                "RSSMASTER_ENV": "test",
                "RSSMASTER_DATABASE_PATH": str(self.legacy_database),
                "RSSMASTER_ACCOUNTS_DATABASE_PATH": str(self.accounts_database),
                "RSSMASTER_ACCOUNTS_WORKSPACE_DIR": str(self.workspace_dir),
                "RSSMASTER_ACCOUNTS_COOKIE_NAME": "rssmaster_test_session",
            }
        )
        self.store = AccountsStore(self.accounts_database, self.legacy_database, self.workspace_dir)
        self.original_overrides = dict(app.dependency_overrides)
        app.dependency_overrides[get_settings] = lambda: self.settings
        app.dependency_overrides[get_accounts_store] = lambda: self.store
        self.original_main_settings = main_module.settings
        self.original_main_accounts_store = main_module.accounts_store
        main_module.settings = self.settings
        main_module.accounts_store = self.store

    def tearDown(self) -> None:
        app.dependency_overrides = self.original_overrides
        main_module.settings = self.original_main_settings
        main_module.accounts_store = self.original_main_accounts_store
        self.tempdir.cleanup()

    def test_session_and_protected_routes_are_open_before_accounts(self) -> None:
        with TestClient(app) as client:
            session_response = client.get("/api/v1/auth/session")
            protected_response = client.get("/api/v1/items")

        self.assertEqual(session_response.status_code, 200)
        self.assertEqual(
            session_response.json(),
            {
                "has_accounts": False,
                "auth_required": False,
                "session": None,
            },
        )
        self.assertEqual(protected_response.status_code, 200)

    def test_protected_routes_require_cookie_after_account_exists(self) -> None:
        with TestClient(app) as client:
            register_response = client.post(
                "/api/v1/auth/register",
                json={
                    "username": "Mateusz",
                    "password": "supersekret123",
                    "display_name": "Mateusz",
                },
            )

        self.assertEqual(register_response.status_code, 200)

        with TestClient(app) as anonymous_client:
            protected_response = anonymous_client.get("/api/v1/items")

        self.assertEqual(protected_response.status_code, 401)
        self.assertEqual(protected_response.json()["error"]["code"], "auth_required")

    def test_protected_route_cors_preflight_is_not_blocked_by_auth(self) -> None:
        with TestClient(app) as client:
            register_response = client.post(
                "/api/v1/auth/register",
                json={
                    "username": "Mateusz",
                    "password": "supersekret123",
                    "display_name": "Mateusz",
                },
            )
            preflight_response = client.options(
                "/api/v1/items",
                headers={
                    "Origin": "http://127.0.0.1:53123",
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "content-type",
                },
            )

        self.assertEqual(register_response.status_code, 200)
        self.assertEqual(preflight_response.status_code, 200)
        self.assertEqual(preflight_response.headers.get("access-control-allow-origin"), "http://127.0.0.1:53123")

    def test_register_sets_cookie_and_allows_protected_access(self) -> None:
        with TestClient(app) as client:
            register_response = client.post(
                "/api/v1/auth/register",
                json={
                    "username": "Mateusz",
                    "password": "supersekret123",
                    "display_name": "Mateusz",
                },
            )
            session_response = client.get("/api/v1/auth/session")
            protected_response = client.get("/api/v1/items")

        self.assertEqual(register_response.status_code, 200)
        self.assertIn(self.settings.accounts_cookie_name, register_response.cookies)
        self.assertEqual(session_response.status_code, 200)
        self.assertEqual(session_response.json()["session"]["account"]["username"], "Mateusz")
        self.assertEqual(protected_response.status_code, 200)

    def test_login_sets_cookie_and_allows_protected_access(self) -> None:
        with TestClient(app) as setup_client:
            setup_response = setup_client.post(
                "/api/v1/auth/register",
                json={
                    "username": "Mateusz",
                    "password": "supersekret123",
                    "display_name": "Mateusz",
                },
            )
        self.assertEqual(setup_response.status_code, 200)

        with TestClient(app) as client:
            login_response = client.post(
                "/api/v1/auth/login",
                json={
                    "username": " mateusz ",
                    "password": "supersekret123",
                },
            )
            protected_response = client.get("/api/v1/items")

        self.assertEqual(login_response.status_code, 200)
        self.assertIn(self.settings.accounts_cookie_name, login_response.cookies)
        self.assertEqual(login_response.json()["session"]["account"]["username"], "Mateusz")
        self.assertEqual(protected_response.status_code, 200)

    def test_logout_revokes_session_cookie_access(self) -> None:
        with TestClient(app) as client:
            register_response = client.post(
                "/api/v1/auth/register",
                json={
                    "username": "Mateusz",
                    "password": "supersekret123",
                    "display_name": "Mateusz",
                },
            )
            protected_before_logout = client.get("/api/v1/items")
            logout_response = client.post("/api/v1/auth/logout")
            protected_after_logout = client.get("/api/v1/items")

        self.assertEqual(register_response.status_code, 200)
        self.assertEqual(protected_before_logout.status_code, 200)
        self.assertEqual(logout_response.status_code, 200)
        self.assertIsNone(logout_response.json()["session"])
        self.assertEqual(protected_after_logout.status_code, 401)

    def test_invalid_credentials_return_401_without_session(self) -> None:
        with TestClient(app) as setup_client:
            setup_response = setup_client.post(
                "/api/v1/auth/register",
                json={
                    "username": "Mateusz",
                    "password": "supersekret123",
                    "display_name": "Mateusz",
                },
            )
        self.assertEqual(setup_response.status_code, 200)

        with TestClient(app) as client:
            login_response = client.post(
                "/api/v1/auth/login",
                json={
                    "username": "Mateusz",
                    "password": "blednehaslo",
                },
            )
            protected_response = client.get("/api/v1/items")

        self.assertEqual(login_response.status_code, 401)
        self.assertEqual(login_response.json()["error"]["code"], "invalid_credentials")
        self.assertNotIn(self.settings.accounts_cookie_name, login_response.cookies)
        self.assertEqual(protected_response.status_code, 401)

    def test_duplicate_normalized_username_is_rejected(self) -> None:
        with TestClient(app) as client:
            first_response = client.post(
                "/api/v1/auth/register",
                json={
                    "username": "Mateusz",
                    "password": "supersekret123",
                    "display_name": "Mateusz",
                },
            )
            duplicate_response = client.post(
                "/api/v1/auth/register",
                json={
                    "username": "  MATEUSZ  ",
                    "password": "innehaslo123",
                    "display_name": "Mateusz 2",
                },
            )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(duplicate_response.status_code, 409)
        self.assertEqual(duplicate_response.json()["error"]["code"], "account_exists")

    def test_second_account_gets_isolated_workspace_and_does_not_claim_legacy(self) -> None:
        with TestClient(app) as client:
            first_response = client.post(
                "/api/v1/auth/register",
                json={
                    "username": "Mateusz",
                    "password": "supersekret123",
                    "display_name": "Mateusz",
                },
            )
            second_response = client.post(
                "/api/v1/auth/register",
                json={
                    "username": "Ala",
                    "password": "innehaslo123",
                    "display_name": "Ala",
                },
            )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)

        first_account = self.store.get_account(str(first_response.json()["session"]["account"]["id"]))
        second_account = self.store.get_account(str(second_response.json()["session"]["account"]["id"]))
        first_workspace = Path(str(first_account["workspace_database_path"]))
        second_workspace = Path(str(second_account["workspace_database_path"]))

        with connect(first_workspace) as connection:
            first_item_count = connection.execute("SELECT COUNT(*) AS total FROM items").fetchone()["total"]
        with connect(second_workspace) as connection:
            second_item_count = connection.execute("SELECT COUNT(*) AS total FROM items").fetchone()["total"]

        self.assertNotEqual(first_workspace, second_workspace)
        self.assertEqual(first_item_count, 1)
        self.assertEqual(second_item_count, 0)


if __name__ == "__main__":
    unittest.main()
