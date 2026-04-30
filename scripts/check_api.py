from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import time

from runtime_helpers import ROOT_DIR, reexec_with_venv

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

TEMP_DIR = Path(tempfile.mkdtemp(prefix="rssmaster-api-check-"))
os.environ["RSSMASTER_DATABASE_PATH"] = str(TEMP_DIR / "rssmaster-check.db")
os.environ["RSSMASTER_ACCOUNTS_DATABASE_PATH"] = str(TEMP_DIR / "rssmaster-accounts-check.db")
os.environ["RSSMASTER_ACCOUNTS_WORKSPACE_DIR"] = str(TEMP_DIR / "accounts")
os.environ["RSSMASTER_ACCOUNTS_COOKIE_NAME"] = "rssmaster_api_check_session"
os.environ["RSSMASTER_FETCH_TIMEOUT_SECONDS"] = "5"

sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))
ROUTE_MANIFEST_PATH = ROOT_DIR / "docs" / "api-route-manifest.json"
API_CONTRACT_PATH = ROOT_DIR / "docs" / "api-contract.md"
VALID_ROUTE_STABILITIES = {"stable", "experimental", "compatibility", "diagnostic", "internal"}

try:
    from fastapi.testclient import TestClient
    from app.main import app
    from app.config import get_settings
    from app.db.initializer import REQUIRED_TABLES, connect
except ModuleNotFoundError as error:
    print("Missing backend dependencies. Run `npm run bootstrap:api` first.")
    raise SystemExit(1) from error


def recent_rss_date(*, days_ago: int, hours_ago: int = 0) -> str:
    published_at = datetime.now(UTC) - timedelta(days=days_ago, hours=hours_ago)
    return format_datetime(published_at, usegmt=True)


def recent_iso_timestamp(*, days_ago: int, hours_ago: int = 0) -> str:
    value = datetime.now(UTC) - timedelta(days=days_ago, hours=hours_ago)
    return value.isoformat().replace("+00:00", "Z")


def rss_item(*, site_url: str, item_guid: str, title: str = "Entry") -> str:
    return f"""
    <item>
      <title>{title}</title>
      <link>{site_url}/{item_guid}</link>
      <guid>{item_guid}</guid>
      <description>{title} summary prepared for local verification.</description>
      <pubDate>{recent_rss_date(days_ago=1)}</pubDate>
    </item>
    """


def rss_feed(*, title: str, site_url: str, item_guids: list[str], published_at: str) -> str:
    items = "\n".join(
        rss_item_with_date(
            site_url=site_url,
            item_guid=item_guid,
            title=f"{title} {index + 1}",
            published_at=published_at,
        )
        for index, item_guid in enumerate(item_guids)
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>{title}</title>
    <link>{site_url}</link>
    <description>{title} feed</description>
    <language>en</language>
    {items}
  </channel>
</rss>
"""


def rss_item_with_date(*, site_url: str, item_guid: str, title: str, published_at: str) -> str:
    return f"""
    <item>
      <title>{title}</title>
      <link>{site_url}/{item_guid}</link>
      <guid>{item_guid}</guid>
      <description>{title} summary prepared for local verification.</description>
      <pubDate>{published_at}</pubDate>
    </item>
    """


def article_html(*, title: str, deck: str, paragraphs: list[str]) -> str:
    rendered_paragraphs = "\n".join(f"<p>{paragraph}</p>" for paragraph in paragraphs)
    return f"""
    <html>
      <head>
        <title>{title}</title>
      </head>
      <body>
        <main>
          <article>
            <header>
              <h1>{title}</h1>
              <p>{deck}</p>
            </header>
            {rendered_paragraphs}
          </article>
        </main>
      </body>
    </html>
    """


def premium_cleanup_article_html(*, title: str, deck: str, paragraphs: list[str]) -> str:
    rendered_paragraphs = "\n".join(f"<p>{paragraph}</p>" for paragraph in paragraphs)
    return f"""
    <html>
      <head>
        <title>{title}</title>
        <meta property="og:title" content="{title}" />
        <meta property="og:image" content="/images/direct-hero-2048x1365.jpg" />
        <meta property="og:image:alt" content="Direct premium hero" />
      </head>
      <body>
        <main>
          <article>
            <header>
              <img src="/theme/icon-star.svg" alt="Theme badge" />
              <p>Header promo should not survive.</p>
            </header>
            <div id="piano-paywall" class="piano-experience-container">
              <section>
                <h1>{title}</h1>
                <p>{deck}</p>
              </section>
              {rendered_paragraphs}
              <figure>
                <img src="/images/editorial-photo.jpg" alt="Editorial photo" />
                <figcaption>Editorial caption</figcaption>
              </figure>
              <figure>
                <img src="/theme/icon-lightbulb.svg" alt="" />
                <figcaption>Placeholder caption should not keep theme chrome alive.</figcaption>
              </figure>
              <div class="wp-content-text-raw">
                <h2 data-video-title="true">Related video headline should not survive.</h2>
              </div>
              <div class="wp-content-part-video">
                <div class="video-placeholder">Inline video chrome should not survive.</div>
              </div>
              <nav>
                <a href="/direct-home/related-direct-story">Related direct feed story</a>
                <img src="/theme/icon-star.svg" alt="Theme badge" />
              </nav>
              <div class="wp-content-part-teaser">
                <a class="teaser-inline" href="/direct-home/related-direct-story-2">
                  <img src="/images/related-card.jpg" alt="Related card" />
                  <span>Second related teaser should not survive.</span>
                </a>
              </div>
              <div class="teaser-inline">
                <img role="presentation" src="/theme/pattern-divider.png" />
              </div>
              <div
                id="elevenlabs-audionative-widget"
                data-playerurl="https://elevenlabs.io/player/index.html"
                data-projectid="direct-premium"
              >
                Loading the <a href="https://elevenlabs.io/text-to-speech">Elevenlabs Text to Speech</a>
                AudioNative Player...
              </div>
              <div id="piano-post-content-1" class="piano-experience-container"></div>
              <footer>
                <p>Footer promo CTA should not survive.</p>
              </footer>
            </div>
          </article>
        </main>
      </body>
    </html>
    """


def assert_forbidden_fragments_absent(value: str, *, fragments: list[str]) -> None:
    for fragment in fragments:
        assert fragment not in value, f"Unexpected fragment '{fragment}' in payload: {value}"


def assert_item_page_contract(
    payload: dict[str, object],
    *,
    expected_limit: int,
    expected_count: int,
    expect_has_more: bool,
) -> list[dict[str, object]]:
    items = payload["items"]
    assert isinstance(items, list)
    assert len(items) == expected_count, json.dumps(payload, indent=2)

    page = payload["page"]
    assert isinstance(page, dict), json.dumps(payload, indent=2)
    assert page["limit"] == expected_limit
    assert page["has_more"] is expect_has_more
    next_cursor = page["next_cursor"]
    if expect_has_more:
        assert isinstance(next_cursor, str) and next_cursor
    else:
        assert next_cursor is None

    return items


def assert_item_ids(items: list[dict[str, object]], expected_ids: list[str]) -> None:
    actual_ids = [str(item["id"]) for item in items]
    assert actual_ids == expected_ids, json.dumps(actual_ids, indent=2)


class SampleFeedHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        routes = self.server.routes  # type: ignore[attr-defined]
        route = routes.get(self.path)
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


def route_key(route: dict[str, object]) -> tuple[str, str]:
    return str(route["method"]).upper(), str(route["path"])


def collect_fastapi_route_keys() -> set[tuple[str, str]]:
    route_keys: set[tuple[str, str]] = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not path or not methods:
            continue
        for method in methods:
            method_name = str(method).upper()
            if method_name in {"HEAD", "OPTIONS"}:
                continue
            route_keys.add((method_name, str(path)))
    return route_keys


def load_route_manifest() -> list[dict[str, object]]:
    payload = json.loads(ROUTE_MANIFEST_PATH.read_text(encoding="utf-8"))
    assert payload.get("schema_version") == 1, "docs/api-route-manifest.json schema_version must be 1"
    routes = payload.get("routes")
    assert isinstance(routes, list) and routes, "docs/api-route-manifest.json must define a non-empty routes list"
    for route in routes:
        assert isinstance(route, dict), f"Route manifest entry must be an object: {route!r}"
        assert route.get("method") and route.get("path"), f"Route manifest entry missing method/path: {route!r}"
        assert route.get("surface"), f"Route manifest entry missing surface: {route!r}"
        stability = route.get("stability")
        assert stability in VALID_ROUTE_STABILITIES, f"Route manifest entry has invalid stability: {route!r}"
    return routes


def assert_route_manifest_matches_app() -> None:
    manifest_routes = load_route_manifest()
    expected = {route_key(route) for route in manifest_routes}
    assert len(expected) == len(manifest_routes), "docs/api-route-manifest.json contains duplicate method/path entries"

    actual = collect_fastapi_route_keys()
    missing = sorted(expected - actual)
    unexpected = sorted(actual - expected)
    assert not missing, f"Route manifest lists routes missing from FastAPI app: {missing}"
    assert not unexpected, f"FastAPI app exposes undocumented routes: {unexpected}"

    contract_text = API_CONTRACT_PATH.read_text(encoding="utf-8")
    assert "docs/api-route-manifest.json" in contract_text, "docs/api-contract.md must reference docs/api-route-manifest.json"
    for stability in sorted(VALID_ROUTE_STABILITIES):
        assert f"`{stability}`" in contract_text, f"docs/api-contract.md must explain route stability `{stability}`"


def main() -> int:
    assert_route_manifest_matches_app()

    server = ThreadingHTTPServer(("127.0.0.1", 0), SampleFeedHandler)
    base_url = f"http://127.0.0.1:{server.server_port}"
    broken_server = ThreadingHTTPServer(("127.0.0.1", 0), SampleFeedHandler)
    broken_base_url = f"http://127.0.0.1:{broken_server.server_port}"
    premium_cleanup_forbidden_text = [
        "Related direct feed story",
        "Related video headline should not survive.",
        "Inline video chrome should not survive.",
        "Second related teaser should not survive.",
        "Header promo should not survive.",
        "Footer promo CTA should not survive.",
        "Elevenlabs",
        "AudioNative Player",
        "Theme badge",
    ]
    premium_cleanup_forbidden_html = [
        *premium_cleanup_forbidden_text,
        "/theme/icon-star.svg",
        "/theme/icon-lightbulb.svg",
        "/images/related-card.jpg",
        "/theme/pattern-divider.png",
    ]
    direct_feed_date = recent_rss_date(days_ago=1)
    metadata_feed_date = recent_rss_date(days_ago=2)
    alpha_feed_date = recent_rss_date(days_ago=3)
    beta_feed_date = recent_rss_date(days_ago=4)
    heuristic_feed_date = recent_rss_date(days_ago=1, hours_ago=6)
    server.routes = {
        "/feeds/direct.xml": (
            200,
            "application/rss+xml",
            rss_feed(
                title="Direct Feed",
                site_url=f"{base_url}/direct-home",
                item_guids=["direct-1"],
                published_at=direct_feed_date,
            ),
        ),
        "/feeds/meta.xml": (
            200,
            "application/rss+xml",
            rss_feed(
                title="Metadata Feed",
                site_url=f"{base_url}/metadata-home",
                item_guids=["meta-1"],
                published_at=metadata_feed_date,
            ),
        ),
        "/feeds/alpha.xml": (
            200,
            "application/rss+xml",
            rss_feed(
                title="Alpha Feed",
                site_url=f"{base_url}/alpha-home",
                item_guids=["alpha-1"],
                published_at=alpha_feed_date,
            ),
        ),
        "/feeds/beta.xml": (
            200,
            "application/rss+xml",
            rss_feed(
                title="Beta Feed",
                site_url=f"{base_url}/beta-home",
                item_guids=["beta-1"],
                published_at=beta_feed_date,
            ),
        ),
        "/feed": (
            200,
            "application/rss+xml",
            rss_feed(
                title="Heuristic Feed",
                site_url=f"{base_url}/heuristic-home",
                item_guids=["heuristic-1"],
                published_at=heuristic_feed_date,
            ),
        ),
        "/direct-home/direct-1": (
            200,
            "text/html; charset=utf-8",
            premium_cleanup_article_html(
                title="Direct Feed 1",
                deck="Direct extraction route used by the release smoke test.",
                paragraphs=[
                    "This article gives the extraction worker a clear article body with enough readable prose to cross the bounded content threshold and persist cleaned HTML for downstream digest readiness checks.",
                    "It also proves that the sync pipeline can move from feed ingestion to source fetch without relying on the raw RSS summary as the only content representation available in SQLite.",
                ],
            ),
        ),
        "/metadata-home/meta-1": (
            200,
            "text/html; charset=utf-8",
            article_html(
                title="Metadata Feed 1",
                deck="Metadata-discovered article for the recovery sync path.",
                paragraphs=[
                    "The metadata-discovered feed verifies that a homepage with rel alternate tags can still flow into extraction after a previously failing sync pass is retried and the upstream feed becomes healthy again.",
                    "A successful extraction here matters because the release checklist needs evidence that autodiscovery does not stop at channel creation and can still end in digest-ready article content.",
                ],
            ),
        ),
        "/heuristic-home/heuristic-1": (
            200,
            "text/html; charset=utf-8",
            article_html(
                title="Heuristic Feed 1",
                deck="Heuristic fallback article used in the compact end-to-end test.",
                paragraphs=[
                    "This route confirms that heuristic feed discovery can still lead to a readable article body and that the stored item becomes eligible for later digest packaging once extraction completes.",
                    "The wording is intentionally long so the cleaner produces paragraphs, text content, and a stable digest visibility status instead of falling back to a short excerpt-only record.",
                ],
            ),
        ),
        "/sites/with-head": (
            200,
            "text/html; charset=utf-8",
            f"""
            <html>
              <head>
                <title>Metadata Home</title>
                <link rel="alternate" type="application/rss+xml" href="{base_url}/feeds/meta.xml" />
              </head>
              <body>Metadata-backed site</body>
            </html>
            """,
        ),
        "/sites/ambiguous": (
            200,
            "text/html; charset=utf-8",
            f"""
            <html>
              <head>
                <title>Ambiguous Home</title>
                <link rel="alternate" type="application/rss+xml" href="{base_url}/feeds/alpha.xml" />
                <link rel="alternate" type="application/atom+xml" href="{base_url}/feeds/beta.xml" />
              </head>
              <body>Ambiguous site</body>
            </html>
            """,
        ),
        "/sites/heuristic": (
            200,
            "text/html; charset=utf-8",
            """
            <html>
              <head>
                <title>Heuristic Home</title>
              </head>
              <body>No feed metadata here.</body>
            </html>
            """,
        ),
    }
    broken_server.routes = {
        "/sites/broken": (
            200,
            "text/html; charset=utf-8",
            """
            <html>
              <head><title>Broken</title></head>
              <body>Still not a feed.</body>
            </html>
            """,
        ),
    }
    thread = Thread(target=server.serve_forever, daemon=True)
    broken_thread = Thread(target=broken_server.serve_forever, daemon=True)
    thread.start()
    broken_thread.start()

    try:
        settings = get_settings()

        with TestClient(app) as client:
            def wait_for_run(run_id: str) -> dict[str, object]:
                for _ in range(20):
                    response = client.get(f"/api/v1/sync/runs/{run_id}")
                    assert response.status_code == 200, response.text
                    payload = response.json()["run"]
                    if payload["status"] in {"completed", "partial_success", "failed", "canceled"}:
                        return payload
                    time.sleep(0.05)

                raise AssertionError(f"Run {run_id} did not reach a terminal state in time.")

            health_response = client.get("/health")
            diagnostics_response = client.get("/diagnostics/startup")

            direct_response = client.post(
                "/api/v1/channels",
                json={"input_url": f"{base_url}/feeds/direct.xml", "category": "direct"},
            )
            metadata_response = client.post(
                "/api/v1/channels",
                json={"input_url": f"{base_url}/sites/with-head", "category": "metadata"},
            )
            heuristic_response = client.post(
                "/api/v1/channels",
                json={"input_url": f"{base_url}/sites/heuristic"},
            )
            duplicate_response = client.post(
                "/api/v1/channels",
                json={"input_url": f"{base_url}/feeds/direct.xml"},
            )
            ambiguous_response = client.post(
                "/api/v1/channels",
                json={"input_url": f"{base_url}/sites/ambiguous"},
            )
            broken_response = client.post(
                "/api/v1/channels",
                json={"input_url": f"{broken_base_url}/sites/broken"},
            )

            server.routes["/feeds/meta.xml"] = (
                503,
                "text/plain; charset=utf-8",
                "upstream unavailable",
            )
            partial_sync_response = client.post("/api/v1/sync/runs", json={"mode": "manual"})
            partial_sync_run = wait_for_run(partial_sync_response.json()["run"]["id"])
            sync_history_after_partial = client.get("/api/v1/sync/runs")

            server.routes["/feeds/meta.xml"] = (
                200,
                "application/rss+xml",
                rss_feed(
                    title="Metadata Feed",
                    site_url=f"{base_url}/metadata-home",
                    item_guids=["meta-1"],
                    published_at=metadata_feed_date,
                ),
            )
            recovery_sync_response = client.post("/api/v1/sync/runs", json={"mode": "manual"})
            recovery_sync_run = wait_for_run(recovery_sync_response.json()["run"]["id"])

            dedupe_sync_response = client.post("/api/v1/sync/runs", json={"mode": "manual"})
            dedupe_sync_run = wait_for_run(dedupe_sync_response.json()["run"]["id"])

            listed_channels = client.get("/api/v1/channels").json()["items"]
            direct_channel_id = next(
                item["id"] for item in listed_channels if item["feed_url"] == f"{base_url}/feeds/direct.xml"
            )
            metadata_channel_id = next(
                item["id"] for item in listed_channels if item["feed_url"] == f"{base_url}/feeds/meta.xml"
            )
            all_items_response = client.get("/api/v1/items")
            oldest_items_response = client.get(
                "/api/v1/items",
                params={"sort": "oldest"},
            )
            limited_items_response = client.get(
                "/api/v1/items",
                params={"limit": 2},
            )
            oldest_limited_items_response = client.get(
                "/api/v1/items",
                params={"limit": 2, "sort": "oldest"},
            )
            unread_items_response = client.get(
                "/api/v1/items",
                params={"is_read": "false"},
            )
            channel_filtered_items_response = client.get(
                "/api/v1/items",
                params={"channel_id": direct_channel_id},
            )
            category_filtered_items_response = client.get(
                "/api/v1/items",
                params={"category": "metadata"},
            )
            direct_only_cutoff = recent_iso_timestamp(days_ago=1, hours_ago=3)
            published_after_response = client.get(
                "/api/v1/items",
                params={"published_after": direct_only_cutoff},
            )
            published_before_response = client.get(
                "/api/v1/items",
                params={"published_before": direct_only_cutoff},
            )
            multi_channel_items_response = client.get(
                "/api/v1/items",
                params={"channel_id": f"{direct_channel_id},{metadata_channel_id}"},
            )
            multi_category_items_response = client.get(
                "/api/v1/items",
                params={"category": "direct,metadata"},
            )
            search_items_response = client.get(
                "/api/v1/items",
                params={"search": "metadata feed"},
            )
            invalid_time_filter_response = client.get(
                "/api/v1/items",
                params={"published_after": "not-a-timestamp"},
            )
            invalid_time_window_response = client.get(
                "/api/v1/items",
                params={
                    "published_after": recent_iso_timestamp(days_ago=1),
                    "published_before": recent_iso_timestamp(days_ago=2),
                },
            )
            favorite_empty_response = client.get(
                "/api/v1/items",
                params={"is_favorite": "true"},
            )
            direct_item_id = next(
                item["id"] for item in all_items_response.json()["items"] if item["channel_id"] == direct_channel_id
            )
            metadata_item_id = next(
                item["id"] for item in all_items_response.json()["items"] if item["channel_id"] == metadata_channel_id
            )
            heuristic_item_id = next(
                item["id"] for item in all_items_response.json()["items"] if item["channel_id"] == heuristic_response.json()["channel"]["id"]
            )
            inbox_view_response = client.get(
                "/api/v1/items",
                params={"view": "inbox"},
            )
            saved_view_initial_response = client.get(
                "/api/v1/items",
                params={"view": "saved"},
            )
            archive_view_initial_response = client.get(
                "/api/v1/items",
                params={"view": "archive"},
            )
            invalid_cursor_response = client.get(
                "/api/v1/items",
                params={"cursor": "not-a-valid-cursor"},
            )
            invalid_view_response = client.get(
                "/api/v1/items",
                params={"view": "later"},
            )
            invalid_sort_response = client.get(
                "/api/v1/items",
                params={"sort": "sideways"},
            )
            detail_item_response = client.get(f"/api/v1/items/{direct_item_id}")
            reextract_dry_run_response = client.post(
                f"/api/v1/items/{direct_item_id}/reextract",
                json={"mode": "dry_run"},
            )
            reextract_write_response = client.post(
                f"/api/v1/items/{direct_item_id}/reextract",
                json={"mode": "write"},
            )
            missing_reextract_response = client.post(
                "/api/v1/items/missing-item/reextract",
                json={"mode": "dry_run"},
            )
            missing_detail_item_response = client.get("/api/v1/items/missing-item")
            content_search_response = client.get(
                "/api/v1/items",
                params={"search": "bounded content threshold"},
            )
            update_item_response = client.patch(
                f"/api/v1/items/{direct_item_id}/state",
                json={"is_read": True, "library_action": "save", "digest_candidate": False},
            )
            no_item_state_updates_response = client.patch(
                f"/api/v1/items/{direct_item_id}/state",
                json={},
            )
            favorite_items_response = client.get(
                "/api/v1/items",
                params={"is_favorite": "true"},
            )
            unread_items_after_read_response = client.get(
                "/api/v1/items",
                params={"is_read": "false"},
            )
            saved_search_response = client.get(
                "/api/v1/items",
                params={"is_favorite": "true", "search": "bounded content threshold"},
            )
            unsave_item_response = client.patch(
                f"/api/v1/items/{direct_item_id}/state",
                json={"library_action": "unsave"},
            )
            favorite_empty_after_unsave_response = client.get(
                "/api/v1/items",
                params={"is_favorite": "true"},
            )
            resave_item_response = client.patch(
                f"/api/v1/items/{direct_item_id}/state",
                json={"library_action": "save"},
            )
            saved_view_response = client.get(
                "/api/v1/items",
                params={"view": "saved"},
            )
            inbox_view_after_save_response = client.get(
                "/api/v1/items",
                params={"view": "inbox"},
            )
            archive_item_response = client.patch(
                f"/api/v1/items/{metadata_item_id}/state",
                json={"library_action": "archive"},
            )
            archive_view_response = client.get(
                "/api/v1/items",
                params={"view": "archive"},
            )
            restore_item_response = client.patch(
                f"/api/v1/items/{metadata_item_id}/state",
                json={"library_action": "restore"},
            )
            archive_view_after_restore_response = client.get(
                "/api/v1/items",
                params={"view": "archive"},
            )
            read_items_response = client.get(
                "/api/v1/items",
                params={"is_read": "true"},
            )
            digest_disabled_items_response = client.get(
                "/api/v1/items",
                params={"digest_candidate": "false"},
            )
            delivery_settings_response = client.get("/api/v1/settings/delivery")
            update_delivery_settings_response = client.patch(
                "/api/v1/settings/delivery",
                json={
                    "smtp_host": "smtp.example.com",
                    "smtp_port": 587,
                    "smtp_username": "reader@example.com",
                    "smtp_password": "secret-password",
                    "smtp_from": "reader@example.com",
                    "kindle_email": "owner@kindle.com",
                },
            )
            delivery_settings_preflight_response = client.post(
                "/api/v1/settings/delivery/preflight",
                json={"check_connection": False},
            )
            digest_persisted_preview_response = client.post(
                "/api/v1/digests/preview",
                json={
                    "title": "Persisted Candidate Digest",
                    "digest_candidates_only": True,
                    "include_read": True,
                },
            )
            digest_preview_response = client.post(
                "/api/v1/digests/preview",
                json={
                    "item_ids": [item["id"] for item in all_items_response.json()["items"]],
                    "title": "Release Candidate Digest",
                    "digest_candidates_only": False,
                },
            )
            digest_build_response = client.post(
                "/api/v1/digests/build",
                json={
                    "item_ids": [item["id"] for item in all_items_response.json()["items"]],
                    "title": "Release Candidate Digest",
                    "digest_candidates_only": False,
                },
            )
            digest_history_response = client.get("/api/v1/digests/history")
            update_response = client.patch(
                f"/api/v1/channels/{direct_channel_id}",
                json={"category": "longform", "state": "inactive"},
            )
            inactive_channel_items_response = client.get(
                "/api/v1/items",
                params={"channel_id": direct_channel_id},
            )
            archive_response = client.delete(f"/api/v1/channels/{metadata_channel_id}")
            archived_channel_items_response = client.get(
                "/api/v1/items",
                params={"channel_id": metadata_channel_id},
            )
            archived_category_items_response = client.get(
                "/api/v1/items",
                params={"category": "metadata"},
            )
            archived_search_response = client.get(
                "/api/v1/items",
                params={"search": "metadata feed"},
            )
            scheduled_sync_response = client.post("/api/v1/sync/runs", json={"mode": "scheduled"})
            scheduled_sync_run = wait_for_run(scheduled_sync_response.json()["run"]["id"])
            manual_inactive_sync_response = client.post(
                "/api/v1/sync/runs",
                json={"mode": "manual", "channel_ids": [direct_channel_id]},
            )
            manual_inactive_sync_run = wait_for_run(manual_inactive_sync_response.json()["run"]["id"])
            channels_response = client.get("/api/v1/channels")
            archived_channels_response = client.get("/api/v1/channels", params={"state": "archived"})
            active_channels_response = client.get("/api/v1/channels", params={"state": "active"})
            cors_headers = {"Origin": "http://127.0.0.1:3000"}
            workspace_ranking_response = client.get(
                "/api/v1/workspace/ranking",
                params={"limit": 14},
                headers=cors_headers,
            )
            workspace_stories_response = client.get(
                "/api/v1/workspace/stories",
                params={"limit": 6},
                headers=cors_headers,
            )
            workspace_briefing_response = client.get(
                "/api/v1/workspace/briefing",
                headers=cors_headers,
            )
            workspace_source_health_response = client.get(
                "/api/v1/workspace/source-health",
                headers=cors_headers,
            )
            annotation_note_response = client.post(
                "/api/v1/workspace/annotations",
                json={
                    "item_id": heuristic_item_id,
                    "kind": "note",
                    "note_text": "Continuity note survives bundle replay.",
                },
                headers=cors_headers,
            )
            annotation_highlight_response = client.post(
                "/api/v1/workspace/annotations",
                json={
                    "item_id": heuristic_item_id,
                    "kind": "highlight",
                    "quote_text": "Heuristic Feed 1",
                    "color": "amber",
                },
                headers=cors_headers,
            )
            item_tags_response = client.put(
                f"/api/v1/workspace/items/{heuristic_item_id}/tags",
                json={"names": ["Continuity tag"]},
                headers=cors_headers,
            )
            collection_create_response = client.post(
                "/api/v1/workspace/collections",
                json={
                    "name": "Continuity collection",
                    "description": "Portable continuity bucket",
                    "item_id": heuristic_item_id,
                },
                headers=cors_headers,
            )
            saved_search_create_response = client.post(
                "/api/v1/workspace/saved-searches",
                json={
                    "name": "Continuity search",
                    "query": "heuristic feed",
                    "default_view": "saved",
                },
                headers=cors_headers,
            )
            workspace_export_response = client.get(
                "/api/v1/workspace/export",
                headers=cors_headers,
            )
            export_payload = workspace_export_response.json()
            heuristic_continuity_item = next(
                item
                for item in export_payload["continuity_items"]
                if item["id"] == heuristic_item_id
            )
            with connect(settings.database_file) as connection:
                connection.execute("DELETE FROM annotations")
                connection.execute("DELETE FROM item_tags")
                connection.execute("DELETE FROM tags")
                connection.execute("DELETE FROM collection_items")
                connection.execute("DELETE FROM collections")
                connection.execute("DELETE FROM saved_searches")
                connection.commit()
            continuity_import_response = client.post(
                "/api/v1/workspace/continuity/import",
                json={
                    "sources_opml": export_payload["sources_opml"],
                    "continuity_items": [
                        {
                            "item_id": heuristic_continuity_item["id"],
                            "source_url": heuristic_continuity_item["source_url"],
                            "is_read": True,
                            "is_favorite": True,
                            "digest_candidate": False,
                            "is_archived": True,
                        }
                    ],
                    "annotations": export_payload["annotations"],
                    "tags": export_payload["tags"],
                    "collections": export_payload["collections"],
                    "saved_searches": export_payload["saved_searches"],
                    "item_tags": export_payload["item_tags"],
                    "collection_items": export_payload["collection_items"],
                },
                headers=cors_headers,
            )

        assert health_response.status_code == 200, health_response.text
        assert diagnostics_response.status_code == 200, diagnostics_response.text
        assert diagnostics_response.json()["config"]["api_port"] == settings.api_port
        assert diagnostics_response.json()["startup"]["smtp_ready"] is settings.smtp_ready

        assert direct_response.status_code == 201, direct_response.text
        assert direct_response.json()["discovery"]["mode"] == "direct"

        assert metadata_response.status_code == 201, metadata_response.text
        assert metadata_response.json()["discovery"]["mode"] == "head_metadata"

        assert heuristic_response.status_code == 201, heuristic_response.text
        assert heuristic_response.json()["discovery"]["mode"] == "heuristic"

        assert duplicate_response.status_code == 409, duplicate_response.text
        assert duplicate_response.json()["error"]["code"] == "duplicate_channel"

        assert ambiguous_response.status_code == 422, ambiguous_response.text
        assert ambiguous_response.json()["error"]["code"] == "discovery_ambiguous"
        assert len(ambiguous_response.json()["error"]["details"]["candidates"]) == 2

        assert broken_response.status_code == 422, broken_response.text
        assert broken_response.json()["error"]["code"] == "discovery_failed"

        assert partial_sync_response.status_code == 202, partial_sync_response.text
        assert partial_sync_response.json()["run"]["status"] == "pending"
        assert partial_sync_run["status"] == "partial_success", json.dumps(partial_sync_run, indent=2)
        assert partial_sync_run["channels_total"] == 3
        assert partial_sync_run["channels_succeeded"] == 2
        assert partial_sync_run["channels_failed"] == 1
        assert partial_sync_run["items_seen"] == 2
        assert partial_sync_run["items_created"] == 2
        assert len(partial_sync_run["errors"]) == 1
        assert sync_history_after_partial.status_code == 200, sync_history_after_partial.text
        assert sync_history_after_partial.json()["items"][0]["id"] == partial_sync_run["id"]

        assert recovery_sync_response.status_code == 202, recovery_sync_response.text
        assert recovery_sync_run["status"] == "completed", json.dumps(recovery_sync_run, indent=2)
        assert recovery_sync_run["items_seen"] == 3
        assert recovery_sync_run["items_created"] == 1
        assert recovery_sync_run["channels_succeeded"] == 3

        assert dedupe_sync_response.status_code == 202, dedupe_sync_response.text
        assert dedupe_sync_run["status"] == "completed", json.dumps(dedupe_sync_run, indent=2)
        assert dedupe_sync_run["items_created"] == 0
        assert dedupe_sync_run["items_seen"] == 3

        assert all_items_response.status_code == 200, all_items_response.text
        all_items = assert_item_page_contract(
            all_items_response.json(),
            expected_limit=50,
            expected_count=3,
            expect_has_more=False,
        )
        expected_oldest_ids = [str(item["id"]) for item in reversed(all_items)]
        assert all(item["extraction_status"] == "completed" for item in all_items)
        assert all(item["has_cleaned_content"] is True for item in all_items)
        assert all(item["has_raw_content"] is True for item in all_items)
        assert all(item["reader_status"]["mode"] == "cleaned" for item in all_items)
        assert all(item["reader_status"]["quality"] == "ready" for item in all_items)
        assert all(item["reader_status"]["label"] == "Pełny tekst" for item in all_items)
        assert all(item["reader_status"]["primary_action"] == "read_in_app" for item in all_items)
        assert all(item["digest"]["status"] == "ready" for item in all_items)
        assert all(item["channel"]["state"] == "active" for item in all_items)
        assert all(item["library"]["state"] == "inbox" for item in all_items)
        assert all(item["library"]["is_archived"] is False for item in all_items)
        assert all("cleaned_html" not in item for item in all_items)
        assert all("content_text" not in item for item in all_items)

        assert oldest_items_response.status_code == 200, oldest_items_response.text
        oldest_items = assert_item_page_contract(
            oldest_items_response.json(),
            expected_limit=50,
            expected_count=3,
            expect_has_more=False,
        )
        assert_item_ids(oldest_items, expected_oldest_ids)

        assert limited_items_response.status_code == 200, limited_items_response.text
        limited_items = assert_item_page_contract(
            limited_items_response.json(),
            expected_limit=2,
            expected_count=2,
            expect_has_more=True,
        )
        assert_item_ids(limited_items, [str(item["id"]) for item in all_items[:2]])
        cursor_page_response = client.get(
            "/api/v1/items",
            params={"limit": 2, "cursor": limited_items_response.json()["page"]["next_cursor"]},
        )
        assert cursor_page_response.status_code == 200, cursor_page_response.text
        cursor_page_items = assert_item_page_contract(
            cursor_page_response.json(),
            expected_limit=2,
            expected_count=1,
            expect_has_more=False,
        )
        assert_item_ids(cursor_page_items, [str(item["id"]) for item in all_items[2:]])

        assert oldest_limited_items_response.status_code == 200, oldest_limited_items_response.text
        oldest_limited_items = assert_item_page_contract(
            oldest_limited_items_response.json(),
            expected_limit=2,
            expected_count=2,
            expect_has_more=True,
        )
        assert_item_ids(oldest_limited_items, expected_oldest_ids[:2])
        oldest_cursor_page_response = client.get(
            "/api/v1/items",
            params={"limit": 2, "sort": "oldest", "cursor": oldest_limited_items_response.json()["page"]["next_cursor"]},
        )
        assert oldest_cursor_page_response.status_code == 200, oldest_cursor_page_response.text
        oldest_cursor_items = assert_item_page_contract(
            oldest_cursor_page_response.json(),
            expected_limit=2,
            expected_count=1,
            expect_has_more=False,
        )
        assert_item_ids(oldest_cursor_items, expected_oldest_ids[2:])

        assert unread_items_response.status_code == 200, unread_items_response.text
        unread_items = assert_item_page_contract(
            unread_items_response.json(),
            expected_limit=50,
            expected_count=3,
            expect_has_more=False,
        )
        assert_item_ids(unread_items, [str(item["id"]) for item in all_items])

        assert inbox_view_response.status_code == 200, inbox_view_response.text
        inbox_items = assert_item_page_contract(
            inbox_view_response.json(),
            expected_limit=50,
            expected_count=3,
            expect_has_more=False,
        )
        assert_item_ids(inbox_items, [str(item["id"]) for item in all_items])

        assert saved_view_initial_response.status_code == 200, saved_view_initial_response.text
        assert_item_page_contract(
            saved_view_initial_response.json(),
            expected_limit=50,
            expected_count=0,
            expect_has_more=False,
        )

        assert archive_view_initial_response.status_code == 200, archive_view_initial_response.text
        assert_item_page_contract(
            archive_view_initial_response.json(),
            expected_limit=50,
            expected_count=0,
            expect_has_more=False,
        )

        assert channel_filtered_items_response.status_code == 200, channel_filtered_items_response.text
        assert len(channel_filtered_items_response.json()["items"]) == 1

        assert category_filtered_items_response.status_code == 200, category_filtered_items_response.text
        assert len(category_filtered_items_response.json()["items"]) == 1

        assert published_after_response.status_code == 200, published_after_response.text
        assert len(published_after_response.json()["items"]) == 1
        assert published_after_response.json()["items"][0]["channel_id"] == direct_channel_id

        assert published_before_response.status_code == 200, published_before_response.text
        assert len(published_before_response.json()["items"]) == 2
        assert {item["channel_id"] for item in published_before_response.json()["items"]} == {
            metadata_channel_id,
            heuristic_response.json()["channel"]["id"],
        }

        assert multi_channel_items_response.status_code == 200, multi_channel_items_response.text
        assert len(multi_channel_items_response.json()["items"]) == 2

        assert multi_category_items_response.status_code == 200, multi_category_items_response.text
        assert len(multi_category_items_response.json()["items"]) == 2

        assert search_items_response.status_code == 200, search_items_response.text
        assert len(search_items_response.json()["items"]) == 1
        assert search_items_response.json()["items"][0]["channel_id"] == metadata_channel_id
        assert search_items_response.json()["items"][0]["search_match"]["primary_field"] in {"title", "source"}
        assert "title" in search_items_response.json()["items"][0]["search_match"]["fields"]
        assert search_items_response.json()["items"][0]["search_match"]["snippet"]

        assert invalid_time_filter_response.status_code == 400, invalid_time_filter_response.text
        assert invalid_time_filter_response.json()["error"]["code"] == "invalid_item_time_filter"

        assert invalid_time_window_response.status_code == 400, invalid_time_window_response.text
        assert invalid_time_window_response.json()["error"]["code"] == "invalid_item_time_window"

        assert favorite_empty_response.status_code == 200, favorite_empty_response.text
        assert len(favorite_empty_response.json()["items"]) == 0

        assert invalid_cursor_response.status_code == 400, invalid_cursor_response.text
        assert invalid_cursor_response.json()["error"]["code"] == "invalid_item_cursor"

        assert invalid_view_response.status_code == 400, invalid_view_response.text
        assert invalid_view_response.json()["error"]["code"] == "invalid_item_view"

        assert invalid_sort_response.status_code == 400, invalid_sort_response.text
        assert invalid_sort_response.json()["error"]["code"] == "invalid_item_sort"

        assert detail_item_response.status_code == 200, detail_item_response.text
        assert detail_item_response.json()["item"]["id"] == direct_item_id
        assert detail_item_response.json()["item"]["cleaned_html"]
        assert "bounded content threshold" in detail_item_response.json()["item"]["content_text"]
        assert "<p>" in detail_item_response.json()["item"]["cleaned_html"]
        assert f'<img src="{base_url}/images/direct-hero-2048x1365.jpg" alt="Direct premium hero">' in detail_item_response.json()["item"]["cleaned_html"]
        assert f'<img src="{base_url}/images/editorial-photo.jpg" alt="Editorial photo">' in detail_item_response.json()["item"]["cleaned_html"]
        assert "Editorial caption" in detail_item_response.json()["item"]["cleaned_html"]
        assert "Editorial caption" in detail_item_response.json()["item"]["content_text"]
        assert_forbidden_fragments_absent(
            detail_item_response.json()["item"]["cleaned_html"],
            fragments=premium_cleanup_forbidden_html,
        )
        assert_forbidden_fragments_absent(
            detail_item_response.json()["item"]["content_text"],
            fragments=premium_cleanup_forbidden_text,
        )
        assert detail_item_response.json()["item"]["library"]["state"] == "inbox"
        assert detail_item_response.json()["item"]["reader_status"]["mode"] == "cleaned"
        assert "diagnostic_reason" in detail_item_response.json()["item"]["reader_status"]

        assert reextract_dry_run_response.status_code == 200, reextract_dry_run_response.text
        reextract_dry_payload = reextract_dry_run_response.json()
        assert reextract_dry_payload["mode"] == "dry_run"
        assert reextract_dry_payload["write_applied"] is False
        assert reextract_dry_payload["before"]["reader_status"]["mode"] == "cleaned"
        assert reextract_dry_payload["after"]["reader_status"]["mode"] == "cleaned"
        assert isinstance(reextract_dry_payload["stop_reasons"], list)
        assert reextract_dry_payload["item"]["id"] == direct_item_id

        assert reextract_write_response.status_code == 200, reextract_write_response.text
        reextract_write_payload = reextract_write_response.json()
        assert reextract_write_payload["mode"] == "write"
        assert reextract_write_payload["write_applied"] is True
        assert reextract_write_payload["after"]["reader_status"]["quality"] == "ready"
        assert reextract_write_payload["item"]["reader_status"]["mode"] == "cleaned"
        assert reextract_write_payload["stop_reasons"] == []

        assert missing_reextract_response.status_code == 404, missing_reextract_response.text
        assert missing_reextract_response.json()["error"]["code"] == "item_not_found"

        assert missing_detail_item_response.status_code == 404, missing_detail_item_response.text
        assert missing_detail_item_response.json()["error"]["code"] == "item_not_found"

        assert content_search_response.status_code == 200, content_search_response.text
        assert len(content_search_response.json()["items"]) == 1
        assert content_search_response.json()["items"][0]["id"] == direct_item_id
        assert content_search_response.json()["items"][0]["search_match"]["primary_field"] == "body"
        assert "body" in content_search_response.json()["items"][0]["search_match"]["fields"]
        assert "bounded content threshold" in content_search_response.json()["items"][0]["search_match"]["snippet"]

        assert update_item_response.status_code == 200, update_item_response.text
        assert update_item_response.json()["item"]["is_read"] is True
        assert update_item_response.json()["item"]["is_favorite"] is True
        assert update_item_response.json()["item"]["digest_candidate"] is False
        assert update_item_response.json()["item"]["digest"]["status"] == "excluded"
        assert update_item_response.json()["item"]["library"]["state"] == "saved"

        assert no_item_state_updates_response.status_code == 400, no_item_state_updates_response.text
        assert no_item_state_updates_response.json()["error"]["code"] == "no_item_state_updates"

        assert favorite_items_response.status_code == 200, favorite_items_response.text
        favorite_items = assert_item_page_contract(
            favorite_items_response.json(),
            expected_limit=50,
            expected_count=1,
            expect_has_more=False,
        )
        assert favorite_items[0]["id"] == direct_item_id

        assert unread_items_after_read_response.status_code == 200, unread_items_after_read_response.text
        unread_items_after_read = assert_item_page_contract(
            unread_items_after_read_response.json(),
            expected_limit=50,
            expected_count=2,
            expect_has_more=False,
        )
        assert direct_item_id not in {item["id"] for item in unread_items_after_read}

        assert saved_search_response.status_code == 200, saved_search_response.text
        saved_search_items = assert_item_page_contract(
            saved_search_response.json(),
            expected_limit=50,
            expected_count=1,
            expect_has_more=False,
        )
        assert saved_search_items[0]["id"] == direct_item_id

        assert unsave_item_response.status_code == 200, unsave_item_response.text
        assert unsave_item_response.json()["item"]["is_favorite"] is False
        assert unsave_item_response.json()["item"]["library"]["state"] == "inbox"
        assert favorite_empty_after_unsave_response.status_code == 200, favorite_empty_after_unsave_response.text
        assert_item_page_contract(
            favorite_empty_after_unsave_response.json(),
            expected_limit=50,
            expected_count=0,
            expect_has_more=False,
        )

        assert resave_item_response.status_code == 200, resave_item_response.text
        assert resave_item_response.json()["item"]["is_favorite"] is True
        assert resave_item_response.json()["item"]["library"]["state"] == "saved"

        assert saved_view_response.status_code == 200, saved_view_response.text
        saved_view_items = assert_item_page_contract(
            saved_view_response.json(),
            expected_limit=50,
            expected_count=1,
            expect_has_more=False,
        )
        assert saved_view_items[0]["id"] == direct_item_id

        assert inbox_view_after_save_response.status_code == 200, inbox_view_after_save_response.text
        inbox_after_save_items = assert_item_page_contract(
            inbox_view_after_save_response.json(),
            expected_limit=50,
            expected_count=2,
            expect_has_more=False,
        )
        assert direct_item_id not in {item["id"] for item in inbox_after_save_items}

        assert archive_item_response.status_code == 200, archive_item_response.text
        assert archive_item_response.json()["item"]["is_archived"] is True
        assert archive_item_response.json()["item"]["library"]["state"] == "archived"

        assert archive_view_response.status_code == 200, archive_view_response.text
        archive_view_items = assert_item_page_contract(
            archive_view_response.json(),
            expected_limit=50,
            expected_count=1,
            expect_has_more=False,
        )
        assert archive_view_items[0]["id"] == metadata_item_id

        assert restore_item_response.status_code == 200, restore_item_response.text
        assert restore_item_response.json()["item"]["is_archived"] is False
        assert restore_item_response.json()["item"]["library"]["state"] == "inbox"

        assert archive_view_after_restore_response.status_code == 200, archive_view_after_restore_response.text
        assert_item_page_contract(
            archive_view_after_restore_response.json(),
            expected_limit=50,
            expected_count=0,
            expect_has_more=False,
        )

        assert read_items_response.status_code == 200, read_items_response.text
        read_items = assert_item_page_contract(
            read_items_response.json(),
            expected_limit=50,
            expected_count=1,
            expect_has_more=False,
        )
        assert read_items[0]["id"] == direct_item_id

        assert digest_disabled_items_response.status_code == 200, digest_disabled_items_response.text
        digest_disabled_items = assert_item_page_contract(
            digest_disabled_items_response.json(),
            expected_limit=50,
            expected_count=1,
            expect_has_more=False,
        )
        assert digest_disabled_items[0]["id"] == direct_item_id
        assert digest_disabled_items[0]["digest"]["status"] == "excluded"

        assert delivery_settings_response.status_code == 200, delivery_settings_response.text
        assert delivery_settings_response.json()["settings"]["smtp_ready"] is False

        assert update_delivery_settings_response.status_code == 200, update_delivery_settings_response.text
        assert update_delivery_settings_response.json()["settings"]["smtp_ready"] is True
        assert update_delivery_settings_response.json()["settings"]["smtp_password"]["configured"] is True

        assert delivery_settings_preflight_response.status_code == 200, delivery_settings_preflight_response.text
        assert delivery_settings_preflight_response.json()["preflight"]["status"] == "ready"
        assert delivery_settings_preflight_response.json()["preflight"]["can_send"] is True

        assert digest_persisted_preview_response.status_code == 200, digest_persisted_preview_response.text
        persisted_digest_preview = digest_persisted_preview_response.json()["preview"]
        assert persisted_digest_preview["selection_mode"] == "digest_candidates"
        assert persisted_digest_preview["stats"]["article_count"] == 2
        assert persisted_digest_preview["stats"]["digest_candidate_count"] == 2
        persisted_digest_ids = {
            entry["item_id"]
            for entry in persisted_digest_preview["selection_snapshot"]
        }
        assert persisted_digest_ids == {metadata_item_id, heuristic_item_id}
        assert direct_item_id not in persisted_digest_ids

        assert digest_preview_response.status_code == 200, digest_preview_response.text
        assert digest_preview_response.json()["preview"]["stats"]["article_count"] == 3
        assert digest_preview_response.json()["preview"]["selection_mode"] == "explicit"

        assert digest_build_response.status_code == 201, digest_build_response.text
        built_digest_id = digest_build_response.json()["digest"]["id"]
        assert digest_build_response.json()["digest"]["title"] == "Release Candidate Digest"
        assert digest_build_response.json()["digest"]["article_count"] == 3
        assert digest_build_response.json()["digest"]["artifact"]["path"]

        digest_detail_response = client.get(f"/api/v1/digests/{built_digest_id}")
        delivery_preflight_response = client.post(
            "/api/v1/delivery/preflight",
            json={"digest_id": built_digest_id, "target_kind": "kindle"},
        )
        delivery_dispatch_response = client.post(
            "/api/v1/delivery/send",
            json={"digest_id": built_digest_id, "target_kind": "kindle", "mode": "dry_run"},
        )
        delivery_logs_response = client.get(
            "/api/v1/delivery/logs",
            params={"digest_id": built_digest_id},
        )

        assert digest_history_response.status_code == 200, digest_history_response.text
        assert len(digest_history_response.json()["items"]) == 1
        assert digest_history_response.json()["items"][0]["id"] == built_digest_id

        assert digest_detail_response.status_code == 200, digest_detail_response.text
        assert digest_detail_response.json()["digest"]["id"] == built_digest_id

        assert delivery_preflight_response.status_code == 200, delivery_preflight_response.text
        assert delivery_preflight_response.json()["preflight"]["status"] == "ready"
        assert delivery_preflight_response.json()["preflight"]["artifact"]["artifact_exists"] is True

        assert delivery_dispatch_response.status_code == 200, delivery_dispatch_response.text
        assert delivery_dispatch_response.json()["run"]["status"] == "completed"
        assert delivery_dispatch_response.json()["log"]["status"] == "skipped"

        assert delivery_logs_response.status_code == 200, delivery_logs_response.text
        assert len(delivery_logs_response.json()["items"]) == 1
        assert delivery_logs_response.json()["items"][0]["digest_id"] == built_digest_id

        assert update_response.status_code == 200, update_response.text
        assert update_response.json()["channel"]["category"] == "longform"
        assert update_response.json()["channel"]["state"] == "inactive"

        assert inactive_channel_items_response.status_code == 200, inactive_channel_items_response.text
        assert inactive_channel_items_response.json()["items"][0]["channel"]["state"] == "inactive"
        assert inactive_channel_items_response.json()["items"][0]["channel"]["category"] == "longform"

        assert archive_response.status_code == 200, archive_response.text
        assert archive_response.json()["channel"]["state"] == "archived"

        assert archived_channel_items_response.status_code == 200, archived_channel_items_response.text
        archived_channel_items = assert_item_page_contract(
            archived_channel_items_response.json(),
            expected_limit=50,
            expected_count=1,
            expect_has_more=False,
        )
        assert archived_channel_items[0]["channel"]["state"] == "archived"
        assert archived_channel_items[0]["channel_id"] == metadata_channel_id

        assert archived_category_items_response.status_code == 200, archived_category_items_response.text
        archived_category_items = assert_item_page_contract(
            archived_category_items_response.json(),
            expected_limit=50,
            expected_count=1,
            expect_has_more=False,
        )
        assert archived_category_items[0]["channel"]["state"] == "archived"

        assert archived_search_response.status_code == 200, archived_search_response.text
        archived_search_items = assert_item_page_contract(
            archived_search_response.json(),
            expected_limit=50,
            expected_count=1,
            expect_has_more=False,
        )
        assert archived_search_items[0]["channel"]["state"] == "archived"
        assert archived_search_items[0]["channel_id"] == metadata_channel_id

        assert scheduled_sync_response.status_code == 202, scheduled_sync_response.text
        assert scheduled_sync_run["status"] == "completed", json.dumps(scheduled_sync_run, indent=2)
        assert scheduled_sync_run["trigger_kind"] == "scheduled"
        assert scheduled_sync_run["scope"]["mode"] == "scheduled"
        assert scheduled_sync_run["channels_total"] == 1
        assert scheduled_sync_run["channels_succeeded"] == 1
        assert scheduled_sync_run["items_created"] == 0

        assert manual_inactive_sync_response.status_code == 202, manual_inactive_sync_response.text
        assert manual_inactive_sync_run["status"] == "completed", json.dumps(manual_inactive_sync_run, indent=2)
        assert manual_inactive_sync_run["trigger_kind"] == "manual"
        assert manual_inactive_sync_run["scope"]["mode"] == "manual"
        assert manual_inactive_sync_run["channels_total"] == 1
        assert manual_inactive_sync_run["channels_succeeded"] == 1
        assert manual_inactive_sync_run["items_created"] == 0

        assert channels_response.status_code == 200, channels_response.text
        items = channels_response.json()["items"]
        assert len(items) == 3, json.dumps(items, indent=2)
        direct_channel = next(item for item in items if item["feed_url"] == f"{base_url}/feeds/direct.xml")
        heuristic_channel = next(item for item in items if item["feed_url"] == f"{base_url}/feed")
        archived_channel = next(item for item in archived_channels_response.json()["items"] if item["id"] == metadata_channel_id)
        assert direct_channel["unread_count"] == 0
        assert heuristic_channel["unread_count"] == 1
        assert archived_channel["unread_count"] == 1
        assert archived_channels_response.status_code == 200, archived_channels_response.text
        assert len(archived_channels_response.json()["items"]) == 1
        assert active_channels_response.status_code == 200, active_channels_response.text
        assert len(active_channels_response.json()["items"]) == 1

        for response in (
            workspace_ranking_response,
            workspace_stories_response,
            workspace_briefing_response,
            workspace_source_health_response,
            annotation_note_response,
            annotation_highlight_response,
            item_tags_response,
            collection_create_response,
            saved_search_create_response,
            workspace_export_response,
            continuity_import_response,
        ):
            assert response.status_code == 200, response.text
            assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:3000"

        ranking_payload = workspace_ranking_response.json()
        assert ranking_payload["generated_at"]
        assert 1 <= len(ranking_payload["items"]) <= 14
        assert all(not entry["item"]["is_read"] for entry in ranking_payload["items"])
        ranking_scores = [entry["breakdown"]["final_score"] for entry in ranking_payload["items"]]
        assert ranking_scores == sorted(ranking_scores, reverse=True)

        stories_payload = workspace_stories_response.json()
        assert 1 <= len(stories_payload["items"]) <= 6
        assert stories_payload["items"][0]["item_count"] >= 1
        for cluster in stories_payload["items"]:
            story_ids = [cluster["primary"]["id"], *[story["id"] for story in cluster["alternates"]]]
            assert len(story_ids) == len(set(story_ids)), json.dumps(cluster, indent=2)

        briefing_payload = workspace_briefing_response.json()["briefing"]
        assert briefing_payload["generated_at"]
        assert briefing_payload["stats"]["unread_count"] >= 0
        assert briefing_payload["stats"]["saved_count"] >= 0
        assert briefing_payload["recommended"]
        assert briefing_payload["stats"]["recommended_count"] == len(briefing_payload["recommended"])

        source_health_payload = workspace_source_health_response.json()
        assert len(source_health_payload["items"]) == 3
        for entry in source_health_payload["items"]:
            assert entry["reading_readiness"] in {"ready", "degraded", "blocked", "unknown"}
            assert isinstance(entry["reading_summary"], str) and entry["reading_summary"]
            assert isinstance(entry["readable_items_7d"], int)
            assert isinstance(entry["local_readable_items_7d"], int)
            assert isinstance(entry["excerpt_fallback_items_7d"], int)
            assert isinstance(entry["source_only_items_7d"], int)
            assert entry["readable_items_7d"] == entry["local_readable_items_7d"] + entry["excerpt_fallback_items_7d"]
            assert isinstance(entry["extraction_failed_items_7d"], int)
            assert "last_successful_fetch_at" in entry
            assert "last_error_message" in entry

        assert export_payload["exported_at"]
        assert export_payload["sources_opml"].startswith('<?xml version="1.0" encoding="UTF-8"?>')
        assert isinstance(export_payload["continuity_items"], list)
        assert len(export_payload["annotations"]) >= 2
        assert len(export_payload["tags"]) >= 1
        assert len(export_payload["collections"]) >= 1
        assert len(export_payload["saved_searches"]) >= 1
        assert isinstance(export_payload["item_tags"], list)
        assert isinstance(export_payload["collection_items"], list)

        continuity_import_payload = continuity_import_response.json()
        assert continuity_import_payload["imported_source_count"] == 0
        assert continuity_import_payload["duplicate_source_count"] >= 0
        assert continuity_import_payload["matched_item_count"] == 1
        assert continuity_import_payload["unmatched_item_count"] == 0
        assert continuity_import_payload["restored_read_count"] == 1
        assert continuity_import_payload["restored_saved_count"] == 1
        assert continuity_import_payload["restored_digest_count"] == 0
        assert continuity_import_payload["restored_archive_count"] == 1
        assert continuity_import_payload["restored_annotation_count"] == 2
        assert continuity_import_payload["restored_tag_assignment_count"] == 1
        assert continuity_import_payload["restored_collection_count"] == 1
        assert continuity_import_payload["restored_collection_item_count"] == 1
        assert continuity_import_payload["restored_saved_search_count"] == 1
        assert continuity_import_payload["matched_items"][0]["item_id"] == heuristic_item_id

        with connect(settings.database_file) as connection:
            rows = connection.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                """
            ).fetchall()
            sync_rows = connection.execute(
                """
                SELECT status, success_count, failure_count
                FROM job_runs
                WHERE job_type = 'sync'
                ORDER BY created_at ASC
                """
            ).fetchall()
            direct_item_row = connection.execute(
                """
                SELECT is_read, is_favorite, digest_candidate, extraction_status, cleaned_html, content_text
                FROM items
                WHERE id = ?
                """,
                [direct_item_id],
            ).fetchone()
            heuristic_item_row = connection.execute(
                """
                SELECT is_read, is_favorite, archived_at, digest_candidate
                FROM items
                WHERE id = ?
                """,
                [heuristic_item_id],
            ).fetchone()
            item_count = connection.execute("SELECT COUNT(*) AS count FROM items").fetchone()["count"]
            extraction_rows = connection.execute(
                """
                SELECT extraction_status, COUNT(*) AS count
                FROM items
                GROUP BY extraction_status
                ORDER BY extraction_status ASC
                """
            ).fetchall()
            cleaned_item_count = connection.execute(
                """
                SELECT COUNT(*) AS count
                FROM items
                WHERE cleaned_html IS NOT NULL AND cleaned_html != ''
                """
            ).fetchone()["count"]
            digest_history_count = connection.execute("SELECT COUNT(*) AS count FROM digest_history").fetchone()["count"]
            delivery_log_count = connection.execute("SELECT COUNT(*) AS count FROM delivery_logs").fetchone()["count"]
            settings_count = connection.execute("SELECT COUNT(*) AS count FROM settings").fetchone()["count"]
        actual_tables = {row["name"] for row in rows}
        missing_tables = REQUIRED_TABLES - actual_tables
        assert not missing_tables, f"Missing schema tables: {sorted(missing_tables)}"
        assert len(sync_rows) == 5, sync_rows
        assert sync_rows[0]["status"] == "partial_success"
        assert sync_rows[1]["status"] == "completed"
        assert sync_rows[2]["status"] == "completed"
        assert sync_rows[3]["status"] == "completed"
        assert sync_rows[4]["status"] == "completed"
        assert direct_item_row["is_read"] == 1
        assert direct_item_row["is_favorite"] == 1
        assert direct_item_row["digest_candidate"] == 0
        assert direct_item_row["extraction_status"] == "completed"
        assert direct_item_row["cleaned_html"]
        assert direct_item_row["content_text"]
        assert f'<img src="{base_url}/images/direct-hero-2048x1365.jpg" alt="Direct premium hero">' in direct_item_row["cleaned_html"]
        assert f'<img src="{base_url}/images/editorial-photo.jpg" alt="Editorial photo">' in direct_item_row["cleaned_html"]
        assert "Editorial caption" in direct_item_row["cleaned_html"]
        assert "Editorial caption" in direct_item_row["content_text"]
        assert_forbidden_fragments_absent(
            direct_item_row["cleaned_html"],
            fragments=premium_cleanup_forbidden_html,
        )
        assert_forbidden_fragments_absent(
            direct_item_row["content_text"],
            fragments=premium_cleanup_forbidden_text,
        )
        assert heuristic_item_row["is_read"] == 1
        assert heuristic_item_row["is_favorite"] == 1
        assert heuristic_item_row["digest_candidate"] == 0
        assert heuristic_item_row["archived_at"] is not None
        assert item_count == 3
        assert [(row["extraction_status"], row["count"]) for row in extraction_rows] == [("completed", 3)]
        assert cleaned_item_count == 3
        assert digest_history_count == 1
        assert delivery_log_count == 1
        assert settings_count == 1

        print("API checks passed.")
        return 0
    finally:
        server.shutdown()
        server.server_close()
        broken_server.shutdown()
        broken_server.server_close()
        shutil.rmtree(TEMP_DIR, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
