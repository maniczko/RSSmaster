from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.channels.repository import ChannelRepository
from app.config import Settings
from app.db.initializer import connect, ensure_database
from app.items.repository import ItemRepository
from app.workspace.repository import WorkspaceRepository
from app.workspace.service import WorkspaceService, summarize_source_warnings


class WorkspaceContinuityTests(unittest.TestCase):
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
        self.workspace_repository = WorkspaceRepository(self.database_path)
        self.item_repository = ItemRepository(self.database_path)
        self.channel_repository = ChannelRepository(self.database_path)
        self.service = WorkspaceService(self.settings, self.workspace_repository)

    def tearDown(self) -> None:
        self.service = None
        self.item_repository = None
        self.workspace_repository = None
        self.channel_repository = None
        self.tempdir.cleanup()

    def capture_item(self, source_url: str, title: str) -> str:
        channel_id = self.workspace_repository.ensure_capture_channel()
        return self.workspace_repository.insert_captured_item(
            channel_id=channel_id,
            source_url=source_url,
            normalized_source_url=source_url,
            title=title,
            excerpt=f"{title} excerpt",
            raw_html="<html><body><article><p>Captured body for continuity restore tests.</p></article></body></html>",
            cleaned_html="<article><p>Captured body for continuity restore tests.</p></article>",
            content_text="Captured body for continuity restore tests.",
            note=None,
        )

    def test_import_continuity_bundle_restores_item_state_by_source_url(self) -> None:
        item_id = self.capture_item("https://example.com/articles/continuity-a", "Continuity A")

        self.item_repository.update_item_state(
            item_id,
            is_read=False,
            update_is_read=True,
            is_favorite=True,
            update_is_favorite=True,
            is_archived=False,
            update_is_archived=True,
            digest_candidate=True,
            update_digest_candidate=True,
        )

        payload = self.service.import_continuity_bundle(
            {
                "continuity_items": [
                    {
                        "source_url": "https://example.com/articles/continuity-a",
                        "is_read": True,
                        "is_favorite": False,
                        "digest_candidate": False,
                        "is_archived": True,
                    },
                    {
                        "source_url": "https://example.com/articles/missing",
                        "is_read": True,
                        "is_favorite": True,
                        "digest_candidate": False,
                        "is_archived": False,
                    },
                ]
            }
        )

        item = self.item_repository.get_by_id(item_id)
        self.assertIsNotNone(item)
        self.assertTrue(bool(item["is_read"]))
        self.assertFalse(bool(item["is_favorite"]))
        self.assertFalse(bool(item["digest_candidate"]))
        self.assertTrue(bool(item["library"]["is_archived"]))

        self.assertEqual(payload["matched_item_count"], 1)
        self.assertEqual(payload["unmatched_item_count"], 1)
        self.assertEqual(payload["restored_read_count"], 1)
        self.assertEqual(payload["restored_saved_count"], 0)
        self.assertEqual(payload["restored_digest_count"], 0)
        self.assertEqual(payload["restored_archive_count"], 1)
        self.assertEqual(payload["matched_items"][0]["item_id"], item_id)
        self.assertEqual(payload["matched_items"][0]["source_url"], "https://example.com/articles/continuity-a")
        self.assertEqual(payload["unmatched_source_urls"], ["https://example.com/articles/missing"])

    def test_import_continuity_bundle_can_import_sources_opml_without_item_matches(self) -> None:
        payload = self.service.import_continuity_bundle(
            {
                "sources_opml": """<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Imported Feed" title="Imported Feed" type="rss" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com" />
  </body>
</opml>""",
                "continuity_items": [],
            }
        )

        imported_channel = self.channel_repository.get_by_normalized_feed_url("https://example.com/feed.xml")

        self.assertIsNotNone(imported_channel)
        self.assertEqual(payload["imported_source_count"], 1)
        self.assertEqual(payload["duplicate_source_count"], 0)
        self.assertEqual(payload["matched_item_count"], 0)
        self.assertEqual(payload["unmatched_item_count"], 0)

    def test_import_continuity_bundle_replays_annotations_tags_collections_and_saved_searches(self) -> None:
        item_id = self.capture_item("https://example.com/articles/continuity-knowledge", "Continuity Knowledge")

        self.service.create_annotation(
            {
                "item_id": item_id,
                "kind": "note",
                "note_text": "Remember this insight",
            }
        )
        self.service.create_annotation(
            {
                "item_id": item_id,
                "kind": "highlight",
                "quote_text": "Captured body for continuity restore tests.",
                "color": "amber",
            }
        )
        self.service.set_item_tags(item_id, ["Continuity tag"])
        self.service.create_collection(
            {
                "name": "Continuity collection",
                "description": "Portable knowledge bucket",
                "item_id": item_id,
            }
        )
        self.service.create_saved_search(
            {
                "name": "Continuity search",
                "query": "continuity knowledge",
                "default_view": "saved",
            }
        )

        export_payload = self.service.export_workspace()

        with connect(self.database_path) as connection:
            connection.execute("DELETE FROM annotations")
            connection.execute("DELETE FROM item_tags")
            connection.execute("DELETE FROM tags")
            connection.execute("DELETE FROM collection_items")
            connection.execute("DELETE FROM collections")
            connection.execute("DELETE FROM saved_searches")
            connection.commit()

        payload = self.service.import_continuity_bundle(
            {
                "continuity_items": export_payload["continuity_items"],
                "annotations": export_payload["annotations"],
                "tags": export_payload["tags"],
                "collections": export_payload["collections"],
                "saved_searches": export_payload["saved_searches"],
                "item_tags": export_payload["item_tags"],
                "collection_items": export_payload["collection_items"],
            }
        )

        annotations = self.workspace_repository.list_annotations(item_id=item_id, search=None, limit=10)
        tags = self.workspace_repository.list_item_tags(item_id)
        collections = self.workspace_repository.list_collections()
        saved_searches = self.workspace_repository.list_saved_searches()

        self.assertEqual(payload["matched_item_count"], 1)
        self.assertEqual(payload["restored_annotation_count"], 2)
        self.assertEqual(payload["restored_tag_assignment_count"], 1)
        self.assertEqual(payload["restored_collection_count"], 1)
        self.assertEqual(payload["restored_collection_item_count"], 1)
        self.assertEqual(payload["restored_saved_search_count"], 1)
        self.assertEqual({str(entry["kind"]) for entry in annotations}, {"note", "highlight"})
        self.assertEqual([str(entry["name"]) for entry in tags], ["Continuity tag"])
        self.assertEqual([str(entry["name"]) for entry in collections], ["Continuity collection"])
        self.assertEqual(collections[0]["item_count"], 1)
        self.assertEqual([str(entry["name"]) for entry in saved_searches], ["Continuity search"])

    def test_briefing_summary_deduplicates_source_warnings(self) -> None:
        source_health = [
            {
                "channel_id": "chn_local_single",
                "title": "Local Single Feed",
                "feed_url": "https://example.com/local-feed",
                "category": "local",
                "state": "active",
                "unread_count": 0,
                "health_status": "warning",
                "health_summary": "Never fetched successfully yet.",
                "group_name": "default",
                "control": {"tier": "default", "group_name": "default", "custom_source_cap": None},
            },
            {
                "channel_id": "chn_local_single_2",
                "title": "Local Single Feed",
                "feed_url": "https://example.com/local-feed-2",
                "category": "local",
                "state": "active",
                "unread_count": 0,
                "health_status": "warning",
                "health_summary": "Never fetched successfully yet.",
                "group_name": "default",
                "control": {"tier": "default", "group_name": "default", "custom_source_cap": None},
            },
            {
                "channel_id": "chn_news",
                "title": "Inne zrodlo",
                "feed_url": "https://example.com/news-feed",
                "category": "news",
                "state": "active",
                "unread_count": 0,
                "health_status": "warning",
                "health_summary": "Sync error: 429 Too many requests.",
                "group_name": "default",
                "control": {"tier": "priority", "group_name": "default", "custom_source_cap": None},
            },
        ]

        warnings = summarize_source_warnings(source_health, limit=4)

        self.assertEqual(len(warnings), 2)
        self.assertEqual(warnings[0], "Local Single Feed: Never fetched successfully yet.")
        self.assertEqual(warnings[1], "Inne zrodlo: Sync error: 429 Too many requests.")

    def test_briefing_stats_use_library_counts(self) -> None:
        inbox_item_id = self.capture_item("https://example.com/articles/briefing-inbox", "Briefing inbox")
        saved_item_id = self.capture_item("https://example.com/articles/briefing-saved", "Briefing saved")
        digest_item_id = self.capture_item("https://example.com/articles/briefing-digest", "Briefing digest")
        archived_item_id = self.capture_item("https://example.com/articles/briefing-archive", "Briefing archive")

        self.item_repository.update_item_state(
            saved_item_id,
            is_read=None,
            update_is_read=False,
            is_favorite=True,
            update_is_favorite=True,
            is_archived=None,
            update_is_archived=False,
            digest_candidate=None,
            update_digest_candidate=False,
        )
        self.item_repository.update_item_state(
            digest_item_id,
            is_read=False,
            update_is_read=True,
            is_favorite=None,
            update_is_favorite=False,
            is_archived=None,
            update_is_archived=False,
            digest_candidate=True,
            update_digest_candidate=True,
        )
        self.item_repository.update_item_state(
            archived_item_id,
            is_read=None,
            update_is_read=False,
            is_favorite=None,
            update_is_favorite=False,
            is_archived=True,
            update_is_archived=True,
            digest_candidate=None,
            update_digest_candidate=False,
        )
        self.item_repository.update_item_state(
            inbox_item_id,
            is_read=False,
            update_is_read=True,
            is_favorite=None,
            update_is_favorite=False,
            is_archived=None,
            update_is_archived=False,
            digest_candidate=None,
            update_digest_candidate=False,
        )

        payload = self.service.get_briefing()
        expected_unread_count = self.item_repository.count_items(
            self.service._filters(view="inbox", is_read=False, limit=1)
        )
        expected_saved_count = self.item_repository.count_items(
            self.service._filters(view="saved", limit=1)
        )
        expected_digest_count = self.item_repository.count_items(
            self.service._filters(view=None, digest_candidate=True, limit=1)
        )
        expected_archived_count = self.item_repository.count_items(
            self.service._filters(view="archive", limit=1)
        )

        self.assertEqual(payload["stats"]["unread_count"], expected_unread_count)
        self.assertEqual(payload["stats"]["saved_count"], expected_saved_count)
        self.assertEqual(payload["stats"]["digest_count"], expected_digest_count)
        self.assertEqual(payload["stats"]["archived_count"], expected_archived_count)


if __name__ == "__main__":
    unittest.main()
