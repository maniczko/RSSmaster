from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx

from app.auth.router import get_accounts_store
from app.db.initializer import connect, ensure_database, pop_database_path_override, push_database_path_override
from app.auth.store import AccountsStore
from app.config import Settings, get_settings
from app.digests.router import resolve_digest_artifact_root
from app.main import app
from app.sync.repository import SyncRepository
from app.sync.router import execute_sync_run_in_workspace
from app.sync.service import SyncService
import app.main as main_module


SAMPLE_SYNC_FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Alpha feed</title>
    <item>
      <title>Alpha workspace article</title>
      <link>https://alpha.example/article-1</link>
      <guid>alpha-article-1</guid>
      <description><![CDATA[Alpha feed excerpt that should remain scoped to the first account workspace.]]></description>
      <pubDate>Tue, 28 Apr 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
"""

SAMPLE_ARTICLE_HTML = """
<html>
  <body>
    <article>
      <h1>Alpha workspace article</h1>
      <p>This fixture article has enough readable text to exercise extraction without touching the network.</p>
      <p>It must be written only into the workspace captured when the background sync run was scheduled.</p>
    </article>
  </body>
</html>
"""


class _FakeSyncHttpClient:
    def __init__(self, *args, **kwargs) -> None:
        pass

    def __enter__(self) -> "_FakeSyncHttpClient":
        return self

    def __exit__(self, *args) -> bool:
        return False

    def get(self, url: str) -> httpx.Response:
        request = httpx.Request("GET", str(url))
        body = SAMPLE_SYNC_FEED if str(url).endswith("/feed.xml") else SAMPLE_ARTICLE_HTML
        return httpx.Response(200, request=request, text=body)


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

    def _register_test_account(self, client: TestClient, *, username: str, password: str) -> dict[str, object]:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "username": username,
                "password": password,
                "display_name": username,
                "claim_legacy_workspace": False,
            },
        )
        self.assertEqual(response.status_code, 200)
        account_id = response.json()["session"]["account"]["id"]
        return self.store.get_account(str(account_id))

    def _seed_channel(self, workspace_database: Path, *, channel_id: str, feed_url: str) -> None:
        with connect(workspace_database) as connection:
            connection.execute(
                """
                INSERT INTO channels (id, title, site_url, feed_url, normalized_feed_url)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    channel_id,
                    f"{channel_id} title",
                    feed_url.removesuffix("/feed.xml"),
                    feed_url,
                    feed_url,
                ],
            )
            connection.commit()

    def _seed_digest_candidate(
        self,
        workspace_database: Path,
        *,
        channel_id: str,
        item_id: str,
        title: str,
    ) -> None:
        with connect(workspace_database) as connection:
            connection.execute(
                """
                INSERT INTO channels (id, title, site_url, feed_url, normalized_feed_url)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    channel_id,
                    f"{title} channel",
                    f"https://{channel_id}.example",
                    f"https://{channel_id}.example/feed.xml",
                    f"https://{channel_id}.example/feed.xml",
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
                    excerpt,
                    content_text,
                    dedupe_key,
                    digest_candidate
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                [
                    item_id,
                    channel_id,
                    f"https://{channel_id}.example/{item_id}",
                    f"https://{channel_id}.example/{item_id}",
                    title,
                    f"{title} excerpt",
                    f"{title} readable body for digest account isolation verification.",
                    f"{channel_id}:{item_id}",
                ],
            )
            connection.commit()

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

    def test_sync_background_run_uses_captured_account_workspace(self) -> None:
        with TestClient(app) as first_client:
            first_account = self._register_test_account(first_client, username="Alpha", password="supersekret123")
        with TestClient(app) as second_client:
            second_account = self._register_test_account(second_client, username="Beta", password="innehaslo123")

        first_workspace = Path(str(first_account["workspace_database_path"]))
        second_workspace = Path(str(second_account["workspace_database_path"]))
        self._seed_channel(first_workspace, channel_id="chn_alpha", feed_url="https://alpha.example/feed.xml")

        service = SyncService(self.settings, SyncRepository(first_workspace))
        run = service.create_manual_run(channel_ids=["chn_alpha"])

        wrong_workspace_token = push_database_path_override(second_workspace)
        try:
            with (
                patch("app.sync.service.httpx.Client", new=_FakeSyncHttpClient),
                patch("app.extract.service.httpx.Client", new=_FakeSyncHttpClient),
            ):
                execute_sync_run_in_workspace(
                    settings=self.settings,
                    database_path=first_workspace,
                    run_id=str(run["id"]),
                )
        finally:
            pop_database_path_override(wrong_workspace_token)

        with connect(first_workspace) as connection:
            first_item_count = connection.execute("SELECT COUNT(*) AS total FROM items").fetchone()["total"]
            first_run = connection.execute(
                "SELECT status, success_count FROM job_runs WHERE id = ?",
                [run["id"]],
            ).fetchone()
        with connect(second_workspace) as connection:
            second_item_count = connection.execute("SELECT COUNT(*) AS total FROM items").fetchone()["total"]
            second_run_count = connection.execute("SELECT COUNT(*) AS total FROM job_runs").fetchone()["total"]

        self.assertEqual(first_item_count, 1)
        self.assertEqual(first_run["status"], "completed")
        self.assertEqual(first_run["success_count"], 1)
        self.assertEqual(second_item_count, 0)
        self.assertEqual(second_run_count, 0)

    def test_digest_build_artifacts_are_scoped_to_account_workspace(self) -> None:
        with TestClient(app) as first_client, TestClient(app) as second_client:
            first_account = self._register_test_account(first_client, username="DigestOne", password="supersekret123")
            second_account = self._register_test_account(second_client, username="DigestTwo", password="innehaslo123")

            first_workspace = Path(str(first_account["workspace_database_path"]))
            second_workspace = Path(str(second_account["workspace_database_path"]))
            self._seed_digest_candidate(
                first_workspace,
                channel_id="chn_digest_one",
                item_id="itm_digest_one",
                title="First account digest article",
            )
            self._seed_digest_candidate(
                second_workspace,
                channel_id="chn_digest_two",
                item_id="itm_digest_two",
                title="Second account digest article",
            )

            first_digest_response = first_client.post(
                "/api/v1/digests/build",
                json={
                    "digest_candidates_only": True,
                    "include_read": True,
                    "limit": 10,
                    "title": "First account digest",
                },
            )
            second_digest_response = second_client.post(
                "/api/v1/digests/build",
                json={
                    "digest_candidates_only": True,
                    "include_read": True,
                    "limit": 10,
                    "title": "Second account digest",
                },
            )

        self.assertEqual(first_digest_response.status_code, 201)
        self.assertEqual(second_digest_response.status_code, 201)

        first_artifact_path = Path(first_digest_response.json()["digest"]["artifact"]["path"]).resolve()
        second_artifact_path = Path(second_digest_response.json()["digest"]["artifact"]["path"]).resolve()
        first_artifact_root = resolve_digest_artifact_root(
            first_workspace,
            default_database_path=self.settings.database_file,
        )
        second_artifact_root = resolve_digest_artifact_root(
            second_workspace,
            default_database_path=self.settings.database_file,
        )

        self.assertEqual(first_artifact_path.parent, first_artifact_root.resolve())
        self.assertEqual(second_artifact_path.parent, second_artifact_root.resolve())
        self.assertNotEqual(first_artifact_path.parent, second_artifact_path.parent)
        self.assertTrue(first_artifact_path.exists())
        self.assertTrue(second_artifact_path.exists())

        with connect(first_workspace) as connection:
            first_digest_count = connection.execute("SELECT COUNT(*) AS total FROM digest_history").fetchone()["total"]
        with connect(second_workspace) as connection:
            second_digest_count = connection.execute("SELECT COUNT(*) AS total FROM digest_history").fetchone()["total"]
        with connect(self.legacy_database) as connection:
            legacy_digest_count = connection.execute("SELECT COUNT(*) AS total FROM digest_history").fetchone()["total"]

        self.assertEqual(first_digest_count, 1)
        self.assertEqual(second_digest_count, 1)
        self.assertEqual(legacy_digest_count, 0)


if __name__ == "__main__":
    unittest.main()
