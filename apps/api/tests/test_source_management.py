from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.channels.service import DiscoveryOutcome, DiscoveryPreviewOutcome, FeedMetadata, FeedPreviewItem
from app.config import Settings
from app.db.initializer import ensure_database
from app.source_management.models import SourceCreateRequest
from app.source_management.repository import SourceManagementRepository
from app.source_management.service import SourceManagementService


def build_feed(feed_url: str = "https://example.com/feed.xml") -> FeedMetadata:
    return FeedMetadata(
        title="Example Feed",
        site_url="https://example.com",
        feed_url=feed_url,
        description="Opis feedu",
        language="pl",
        estimated_items_per_week=4,
        sample_items=[
            FeedPreviewItem(
                title="Pierwszy wpis",
                url="https://example.com/posts/first",
                published_at="2026-04-30T08:00:00Z",
                image_url=None,
            )
        ],
    )


class SourceManagementServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.database_path = Path(self.tempdir.name) / "rssmaster-test.db"
        ensure_database(self.database_path)
        self.settings = Settings(
            **{
                "RSSMASTER_ENV": "test",
                "RSSMASTER_DATABASE_PATH": str(self.database_path),
            }
        )
        self.repository = SourceManagementRepository(self.database_path)
        self.service = SourceManagementService(self.settings, self.repository)

    def tearDown(self) -> None:
        self.service = None
        self.repository = None
        self.tempdir.cleanup()

    def mock_discovery(self, feed: FeedMetadata) -> None:
        self.service.discovery.discover = lambda input_url: DiscoveryOutcome(  # type: ignore[method-assign]
            mode="direct",
            feed=feed,
            candidates=[feed.feed_url],
        )
        self.service.discovery.preview = lambda input_url: DiscoveryPreviewOutcome(  # type: ignore[method-assign]
            status="resolved",
            mode="direct",
            feed=feed,
            feeds=[feed],
            candidate_urls=[feed.feed_url],
        )

    def test_create_source_returns_created_then_existing_duplicate(self) -> None:
        feed = build_feed()
        self.mock_discovery(feed)

        created = self.service.create_source(SourceCreateRequest(input_url="https://example.com"))
        duplicate = self.service.create_source(SourceCreateRequest(feed_url=feed.feed_url))

        self.assertEqual(created["status"], "created")
        self.assertEqual(duplicate["status"], "existing")
        self.assertEqual(created["source"]["id"], duplicate["source"]["id"])
        self.assertEqual(created["discovery"]["resolved_feed_url"], feed.feed_url)

    def test_duplicate_archived_source_can_be_reactivated(self) -> None:
        feed = build_feed("https://archive.example.com/feed.xml")
        self.mock_discovery(feed)
        created = self.service.create_source(SourceCreateRequest(input_url="https://archive.example.com"))
        source_id = str(created["source"]["id"])

        self.repository.commit_source_updates(
            source_id,
            category=None,
            update_category=False,
            state="archived",
            update_state=True,
            layout_value=None,
            controls_value=None,
            updated_by=None,
        )

        existing = self.service.create_source(
            SourceCreateRequest(feed_url=feed.feed_url, on_duplicate="return_existing")
        )
        reactivated = self.service.create_source(
            SourceCreateRequest(feed_url=feed.feed_url, on_duplicate="reactivate")
        )

        self.assertEqual(existing["status"], "existing")
        self.assertEqual(existing["source"]["state"], "archived")
        self.assertEqual(reactivated["status"], "reactivated")
        self.assertEqual(reactivated["source"]["state"], "active")

    def test_preview_source_exposes_stable_candidate_ux_fields(self) -> None:
        feed = build_feed("https://preview.example.com/rss.xml")
        self.mock_discovery(feed)

        payload = self.service.preview_source(input_url="https://preview.example.com")
        preview = payload["feed"]
        assert isinstance(preview, dict)

        self.assertEqual(payload["status"], "ready")
        self.assertTrue(preview["candidate_id"])
        self.assertEqual(preview["validation"]["reachable"], True)
        self.assertEqual(preview["validation"]["feed_kind"], "rss")
        self.assertEqual(preview["validation"]["item_count_sampled"], 1)
        self.assertEqual(preview["sample_items"][0]["title"], "Pierwszy wpis")

    def test_opml_import_returns_created_source_ids_and_duplicate_summary(self) -> None:
        opml = """<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Rynki">
      <outline text="Alpha" title="Alpha" type="rss" xmlUrl="https://alpha.example.com/feed.xml" htmlUrl="https://alpha.example.com" />
      <outline text="Beta" title="Beta" type="rss" xmlUrl="https://beta.example.com/feed.xml" />
    </outline>
    <outline text="Alpha duplicate" title="Alpha duplicate" type="rss" xmlUrl="https://alpha.example.com/feed.xml" />
  </body>
</opml>"""

        first = self.service.import_opml({"opml_content": opml})
        second = self.service.import_opml({"opml_content": opml})

        self.assertEqual(first["summary"]["new_feeds"], 2)
        self.assertEqual(len(first["created_sources"]), 2)
        self.assertTrue(all(str(source["id"]).startswith("chn_") for source in first["created_sources"]))
        self.assertEqual(first["summary"]["duplicate_feeds"], 1)
        self.assertEqual(second["summary"]["new_feeds"], 0)
        self.assertEqual(len(second["created_sources"]), 0)
        self.assertEqual(len(second["existing_source_ids"]), 2)


if __name__ == "__main__":
    unittest.main()
