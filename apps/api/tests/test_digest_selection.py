from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from typing import Any

from app.digests.service import DigestService


def make_digest_row(item_id: str, *, digest_candidate: bool = True, is_read: bool = False) -> dict[str, Any]:
    return {
        "id": item_id,
        "channel_id": "chn_digest",
        "channel_title": "Digest Feed",
        "category": "testing",
        "title": f"Article {item_id}",
        "author": "RSSmaster",
        "source_url": f"https://example.com/{item_id}",
        "excerpt": f"Excerpt for {item_id}",
        "published_at": "2026-04-28T08:00:00Z",
        "is_read": 1 if is_read else 0,
        "is_favorite": 0,
        "digest_candidate": 1 if digest_candidate else 0,
        "cleaned_html": f"<p>Clean body for {item_id}</p>",
        "content_text": None,
        "raw_html": None,
        "content_hash": f"hash-{item_id}",
    }


class FakeDigestRepository:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.last_selection_kwargs: dict[str, Any] | None = None

    def list_candidate_items(self, **kwargs: Any) -> list[dict[str, Any]]:
        self.last_selection_kwargs = kwargs
        rows = self.rows
        item_ids = kwargs.get("item_ids")
        if item_ids:
            wanted = set(item_ids)
            rows = [row for row in rows if row["id"] in wanted]
        if kwargs.get("digest_candidates_only"):
            rows = [row for row in rows if bool(row["digest_candidate"])]
        if not kwargs.get("include_read"):
            rows = [row for row in rows if not bool(row["is_read"])]
        return rows[: int(kwargs["limit"])]


class DigestSelectionTests(unittest.TestCase):
    def test_preview_uses_persisted_digest_candidates_without_explicit_item_ids(self) -> None:
        repository = FakeDigestRepository(
            [
                make_digest_row("itm_candidate_unread"),
                make_digest_row("itm_candidate_read", is_read=True),
                make_digest_row("itm_visible_non_candidate", digest_candidate=False),
            ]
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            service = DigestService(repository, artifact_root=Path(tmpdir), digest_max_items=25)

            preview = service.preview_digest(
                item_ids=None,
                category=None,
                title="Persisted Candidate Digest",
                period_start=None,
                period_end=None,
                limit=25,
                include_read=True,
                favorites_only=False,
                digest_candidates_only=True,
            )

        self.assertEqual(repository.last_selection_kwargs["item_ids"], None)
        self.assertTrue(repository.last_selection_kwargs["digest_candidates_only"])
        self.assertTrue(repository.last_selection_kwargs["include_read"])
        self.assertFalse(repository.last_selection_kwargs["favorites_only"])
        self.assertEqual(preview["selection_mode"], "digest_candidates")
        self.assertEqual(preview["stats"]["article_count"], 2)
        self.assertEqual(preview["stats"]["digest_candidate_count"], 2)
        self.assertEqual(
            [item["item_id"] for item in preview["selection_snapshot"]],
            ["itm_candidate_unread", "itm_candidate_read"],
        )
        self.assertEqual(preview["selection_snapshot"][0]["excerpt"], "Excerpt for itm_candidate_unread")
        self.assertIn("Clean body for itm_candidate_unread", preview["selection_snapshot"][0]["content_html"])
        self.assertGreater(preview["selection_snapshot"][0]["word_count"], 0)


if __name__ == "__main__":
    unittest.main()
