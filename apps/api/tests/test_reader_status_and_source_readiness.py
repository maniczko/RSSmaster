from __future__ import annotations

from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import tempfile
from threading import Thread
import unittest
from pathlib import Path

from app.config import Settings
from app.db.initializer import connect, ensure_database
from app.items.repository import ItemRepository
from app.items.service import ItemService
from app.workspace.repository import WorkspaceRepository
from app.workspace.service import WorkspaceService


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class ArticleFixtureHandler(BaseHTTPRequestHandler):
    routes: dict[str, tuple[int, str, str]] = {}

    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        route = self.routes.get(self.path)
        if route is None:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"not found")
            return

        status_code, content_type, body = route
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))


class ReaderStatusAndSourceReadinessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.database_path = Path(self.tempdir.name) / "rssmaster-test.db"
        ensure_database(self.database_path)
        self.item_repository = ItemRepository(self.database_path)
        self.workspace_repository = WorkspaceRepository(self.database_path)
        self.settings = Settings(
            **{
                "RSSMASTER_ENV": "test",
                "RSSMASTER_DATABASE_PATH": str(self.database_path),
            }
        )
        self.workspace_service = WorkspaceService(self.settings, self.workspace_repository)

    def tearDown(self) -> None:
        self.workspace_service = None
        self.workspace_repository = None
        self.item_repository = None
        self.tempdir.cleanup()

    def insert_channel(self, channel_id: str, title: str) -> None:
        with connect(self.database_path) as connection:
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
                    f"https://example.com/{channel_id}",
                    f"https://example.com/{channel_id}/feed.xml",
                    f"https://example.com/{channel_id}/feed.xml",
                    None,
                    "pl",
                    "test",
                ],
            )
            connection.commit()

    def insert_item(
        self,
        item_id: str,
        channel_id: str,
        *,
        title: str | None = None,
        excerpt: str | None = None,
        raw_html: str | None = None,
        cleaned_html: str | None = None,
        content_text: str | None = None,
        extraction_status: str = "completed",
        extraction_error: str | None = None,
        source_url: str | None = None,
    ) -> None:
        resolved_source_url = source_url or f"https://example.com/{item_id}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO items (
                    id,
                    channel_id,
                    guid,
                    source_url,
                    normalized_source_url,
                    title,
                    author,
                    excerpt,
                    raw_html,
                    cleaned_html,
                    content_text,
                    published_at,
                    extraction_status,
                    extraction_error,
                    dedupe_key
                )
                VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    item_id,
                    channel_id,
                    item_id,
                    resolved_source_url,
                    resolved_source_url,
                    title or f"Reader status {item_id}",
                    excerpt,
                    raw_html,
                    cleaned_html,
                    content_text,
                    utc_now(),
                    extraction_status,
                    extraction_error,
                    f"dedupe::{item_id}",
                ],
            )
            connection.commit()

    def test_item_reader_status_projects_best_available_reading_surface(self) -> None:
        self.insert_channel("chn_reader", "Reader fixtures")
        self.insert_item("itm_cleaned", "chn_reader", cleaned_html="<article>Pełny tekst</article>", content_text="Pełny tekst")
        self.insert_item("itm_text", "chn_reader", content_text="Tekst z feedu")
        self.insert_item(
            "itm_excerpt",
            "chn_reader",
            excerpt="Skrót z feedu",
            extraction_status="failed",
            extraction_error='Traceback File "extract.py", line 12 RuntimeError("boom")',
        )
        self.insert_item(
            "itm_failed_feed_text",
            "chn_reader",
            cleaned_html="<p>Skrót z feedu opakowany jako HTML.</p>",
            content_text="Skrót z feedu opakowany jako tekst.",
            extraction_status="failed",
            extraction_error="Source article returned HTTP 500.",
        )
        self.insert_item(
            "itm_source",
            "chn_reader",
            extraction_status="failed",
            extraction_error="HTTP 403 while fetching article body",
        )
        self.insert_item("itm_loading", "chn_reader", extraction_status="pending")

        cleaned = self.item_repository.get_by_id("itm_cleaned")
        text = self.item_repository.get_by_id("itm_text")
        excerpt = self.item_repository.get_detail_by_id("itm_excerpt")
        failed_feed_text = self.item_repository.get_detail_by_id("itm_failed_feed_text")
        source = self.item_repository.get_detail_by_id("itm_source")
        loading = self.item_repository.get_by_id("itm_loading")

        self.assertEqual(cleaned["reader_status"]["mode"], "cleaned")
        self.assertEqual(cleaned["reader_status"]["quality"], "ready")
        self.assertEqual(cleaned["reader_status"]["label"], "Pełny tekst")
        self.assertEqual(text["reader_status"]["mode"], "text_fallback")
        self.assertEqual(text["reader_status"]["label"], "Tekst z feedu")
        self.assertEqual(failed_feed_text["reader_status"]["mode"], "text_fallback")
        self.assertEqual(failed_feed_text["reader_status"]["quality"], "degraded")
        self.assertEqual(failed_feed_text["reader_status"]["label"], "Tekst z feedu")
        self.assertEqual(excerpt["reader_status"]["mode"], "excerpt")
        self.assertEqual(excerpt["reader_status"]["quality"], "degraded")
        self.assertEqual(excerpt["reader_status"]["label"], "Tylko skrót")
        self.assertEqual(
            excerpt["reader_status"]["diagnostic_reason"],
            "Ekstrakcja zgłosiła błąd techniczny. Szczegóły są dostępne w logach runtime.",
        )
        self.assertEqual(source["reader_status"]["mode"], "source_only")
        self.assertEqual(source["reader_status"]["quality"], "blocked")
        self.assertEqual(source["reader_status"]["diagnostic_reason"], "HTTP 403 while fetching article body")
        self.assertEqual(loading["reader_status"]["quality"], "loading")

    def test_source_health_includes_reading_readiness_axis(self) -> None:
        self.insert_channel("chn_ready", "Ready feed")
        self.insert_channel("chn_degraded", "Degraded feed")
        self.insert_channel("chn_excerpt_only", "Excerpt-only feed")
        self.insert_channel("chn_blocked", "Blocked feed")
        self.insert_channel("chn_empty", "Empty feed")
        self.insert_item("itm_ready", "chn_ready", cleaned_html="<article>Ready</article>", content_text="Ready")
        self.insert_item("itm_degraded_readable", "chn_degraded", content_text="Readable fallback")
        self.insert_item(
            "itm_degraded_failed",
            "chn_degraded",
            extraction_status="failed",
            extraction_error="Extraction failed",
        )
        self.insert_item("itm_excerpt_only", "chn_excerpt_only", excerpt="Only a feed summary is available")
        self.insert_item(
            "itm_blocked_failed",
            "chn_blocked",
            extraction_status="failed",
            extraction_error="Extraction failed",
        )

        payload = self.workspace_service.list_source_health()
        health_by_id = {entry["channel_id"]: entry for entry in payload["items"]}

        self.assertEqual(health_by_id["chn_ready"]["reading_readiness"], "ready")
        self.assertEqual(health_by_id["chn_ready"]["readable_items_7d"], 1)
        self.assertEqual(health_by_id["chn_ready"]["local_readable_items_7d"], 1)
        self.assertEqual(health_by_id["chn_ready"]["excerpt_fallback_items_7d"], 0)
        self.assertEqual(health_by_id["chn_ready"]["source_only_items_7d"], 0)
        self.assertEqual(health_by_id["chn_degraded"]["reading_readiness"], "degraded")
        self.assertEqual(health_by_id["chn_degraded"]["readable_items_7d"], 1)
        self.assertEqual(health_by_id["chn_degraded"]["local_readable_items_7d"], 1)
        self.assertEqual(health_by_id["chn_degraded"]["source_only_items_7d"], 1)
        self.assertEqual(health_by_id["chn_degraded"]["extraction_failed_items_7d"], 1)
        self.assertEqual(health_by_id["chn_excerpt_only"]["reading_readiness"], "degraded")
        self.assertEqual(health_by_id["chn_excerpt_only"]["readable_items_7d"], 1)
        self.assertEqual(health_by_id["chn_excerpt_only"]["local_readable_items_7d"], 0)
        self.assertEqual(health_by_id["chn_excerpt_only"]["excerpt_fallback_items_7d"], 1)
        self.assertIn("1 artykuł ma tylko skrót", health_by_id["chn_excerpt_only"]["reading_summary"])
        self.assertEqual(health_by_id["chn_blocked"]["reading_readiness"], "blocked")
        self.assertEqual(health_by_id["chn_blocked"]["source_only_items_7d"], 1)
        self.assertEqual(health_by_id["chn_empty"]["reading_readiness"], "unknown")

    def test_item_reextract_dry_run_and_write_are_item_scoped(self) -> None:
        ArticleFixtureHandler.routes = {
            "/article": (
                200,
                "text/html; charset=utf-8",
                """
                <html>
                  <body>
                    <main>
                      <article>
                        <h1>Re-extract target</h1>
                        <p>Ten artykuł ma wystarczająco dużo lokalnego tekstu, żeby po ponownej ekstrakcji przejść z trybu skrótu do pełnego czytania w aplikacji.</p>
                        <p>Drugi akapit stabilizuje minimalną długość ekstrakcji i pozwala testowi sprawdzić zapis bez dotykania innych pozycji w bazie oraz bez uruchamiania masowego backfillu.</p>
                      </article>
                    </main>
                  </body>
                </html>
                """,
            )
        }
        server = ThreadingHTTPServer(("127.0.0.1", 0), ArticleFixtureHandler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            self.insert_channel("chn_reextract", "Re-extract feed")
            self.insert_item(
                "itm_reextract",
                "chn_reextract",
                excerpt="Stary skrót po błędzie ekstrakcji.",
                extraction_status="failed",
                extraction_error="Source article returned HTTP 500.",
                source_url=f"{origin}/article",
            )
            service = ItemService(self.settings, self.item_repository)

            dry_run = service.reextract_item("itm_reextract", mode="dry_run")
            unchanged = self.item_repository.get_detail_by_id("itm_reextract")
            self.assertFalse(dry_run["write_applied"])
            self.assertEqual(dry_run["after"]["reader_status"]["mode"], "cleaned")
            self.assertEqual(unchanged["extraction_status"], "failed")
            self.assertEqual(unchanged["reader_status"]["mode"], "excerpt")

            write = service.reextract_item("itm_reextract", mode="write")
            updated = self.item_repository.get_detail_by_id("itm_reextract")
            self.assertTrue(write["write_applied"])
            self.assertEqual(write["item"]["reader_status"]["mode"], "cleaned")
            self.assertEqual(updated["extraction_status"], "completed")
            self.assertEqual(updated["reader_status"]["mode"], "cleaned")
            self.assertEqual(write["stop_reasons"], [])
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
