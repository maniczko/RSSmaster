from __future__ import annotations

import unittest

from app.workspace.service import build_story_cluster_response_items, serialize_item_card


def make_row(*, cluster_id: str, item_id: str, rank_index: int, title: str) -> dict[str, object]:
    return {
        "id": cluster_id,
        "item_id": item_id,
        "headline": "Wspolny temat",
        "item_count": 3,
        "category": "rynek",
        "rank_index": rank_index,
        "channel_id": "chn_market",
        "title": title,
        "author": "Autor",
        "source_url": f"https://example.com/{item_id}",
        "excerpt": f"Skrot {item_id}",
        "published_at": "2026-04-19T08:00:00+00:00",
        "is_read": False,
        "is_favorite": False,
        "digest_candidate": True,
        "channel_title": "Rynek",
        "channel_category": "biznes",
        "channel_feed_url": "https://example.com/feed.xml",
    }


class StoryClusterSerializationTests(unittest.TestCase):
    def test_serialize_item_card_prefers_item_id_when_present(self) -> None:
        item = serialize_item_card(make_row(cluster_id="stc_duplicate", item_id="itm_real", rank_index=0, title="Historia"))

        self.assertEqual(item["id"], "itm_real")

    def test_cluster_payload_dedupes_duplicate_story_ids(self) -> None:
        rows = [
            make_row(cluster_id="stc_duplicate", item_id="itm_lead", rank_index=0, title="Lead"),
            make_row(cluster_id="stc_duplicate", item_id="itm_lead", rank_index=1, title="Lead duplicate"),
            make_row(cluster_id="stc_duplicate", item_id="itm_alt", rank_index=2, title="Alternate"),
        ]

        items = build_story_cluster_response_items(rows, limit=6)

        self.assertEqual(len(items), 1)
        cluster = items[0]
        story_ids = [cluster["primary"]["id"], *[story["id"] for story in cluster["alternates"]]]
        self.assertEqual(story_ids, ["itm_lead", "itm_alt"])

    def test_cluster_promotes_first_story_when_primary_rank_is_missing(self) -> None:
        rows = [
            make_row(cluster_id="stc_missing_primary", item_id="itm_alt_1", rank_index=1, title="Alternate 1"),
            make_row(cluster_id="stc_missing_primary", item_id="itm_alt_2", rank_index=2, title="Alternate 2"),
        ]

        items = build_story_cluster_response_items(rows, limit=6)

        self.assertEqual(items[0]["primary"]["id"], "itm_alt_1")
        self.assertEqual([story["id"] for story in items[0]["alternates"]], ["itm_alt_2"])
