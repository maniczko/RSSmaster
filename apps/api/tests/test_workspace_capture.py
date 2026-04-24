from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from app.config import Settings
from app.db.initializer import ensure_database
from app.workspace.repository import WorkspaceRepository
from app.workspace.service import WorkspaceService


class _FakeHttpClient:
    def __init__(self, response: httpx.Response) -> None:
        self._response = response
        self.requested_urls: list[str] = []

    def __enter__(self) -> _FakeHttpClient:
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False

    def get(self, url: str) -> httpx.Response:
        self.requested_urls.append(url)
        return self._response


class WorkspaceCaptureTests(unittest.TestCase):
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
        self.repository = WorkspaceRepository(self.database_path)
        self.service = WorkspaceService(self.settings, self.repository)

    def tearDown(self) -> None:
        self.service = None
        self.repository = None
        self.tempdir.cleanup()

    @staticmethod
    def make_response(url: str) -> httpx.Response:
        html = """
        <html>
          <head>
            <title>Captured article</title>
          </head>
          <body>
            <article>
              <h1>Captured article</h1>
              <p>Lead paragraph with enough text to become readable content.</p>
            </article>
          </body>
        </html>
        """
        request = httpx.Request("GET", url)
        return httpx.Response(200, request=request, text=html)

    def test_capture_note_creates_item_level_note_annotation(self) -> None:
        response = self.make_response("https://example.com/article")

        with patch("app.workspace.service.httpx.Client", return_value=_FakeHttpClient(response)):
            payload = self.service.capture_url(
                {
                    "url": "https://example.com/article",
                    "title": "Captured article override",
                    "note": "Remember why this matters",
                }
            )

        item_id = str(payload["item"]["id"])
        annotations = self.repository.list_annotations(item_id=item_id, search=None, limit=10)

        self.assertEqual(len(annotations), 1)
        self.assertEqual(annotations[0]["kind"], "note")
        self.assertEqual(annotations[0]["note_text"], "Remember why this matters")

    def test_duplicate_capture_reuses_item_without_duplicating_identical_note(self) -> None:
        response = self.make_response("https://example.com/article")

        with patch("app.workspace.service.httpx.Client", return_value=_FakeHttpClient(response)):
            first = self.service.capture_url(
                {
                    "url": "https://example.com/article",
                    "note": "Remember why this matters",
                }
            )
            second = self.service.capture_url(
                {
                    "url": "https://example.com/article",
                    "note": "Remember why this matters",
                }
            )

        item_id = str(first["item"]["id"])
        annotations = self.repository.list_annotations(item_id=item_id, search=None, limit=10)

        self.assertEqual(first["item"]["id"], second["item"]["id"])
        self.assertEqual(len(annotations), 1)
        self.assertEqual(annotations[0]["note_text"], "Remember why this matters")

    def test_duplicate_capture_accepts_a_new_distinct_note_for_the_same_item(self) -> None:
        response = self.make_response("https://example.com/article")

        with patch("app.workspace.service.httpx.Client", return_value=_FakeHttpClient(response)):
            first = self.service.capture_url(
                {
                    "url": "https://example.com/article",
                    "note": "Remember why this matters",
                }
            )
            second = self.service.capture_url(
                {
                    "url": "https://example.com/article",
                    "note": "Alternative follow-up angle",
                }
            )

        item_id = str(first["item"]["id"])
        annotations = self.repository.list_annotations(item_id=item_id, search=None, limit=10)
        note_texts = [str(entry["note_text"]) for entry in annotations]

        self.assertEqual(first["item"]["id"], second["item"]["id"])
        self.assertCountEqual(
            note_texts,
            [
                "Remember why this matters",
                "Alternative follow-up angle",
            ],
        )


if __name__ == "__main__":
    unittest.main()
