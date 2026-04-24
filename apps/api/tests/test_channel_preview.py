from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

import httpx

from app.errors import ApiError
from app.channels.service import ChannelService
from app.config import Settings


def build_feed(
    *,
    title: str = "Example Feed",
    site_url: str = "https://example.com",
    description: str = "Opis feedu",
    items: str,
) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>{title}</title>
    <link>{site_url}</link>
    <description>{description}</description>
    <language>pl</language>
    {items}
  </channel>
</rss>
"""


class ChannelPreviewTests(unittest.TestCase):
    def make_service(self, resources: dict[str, dict[str, str] | Exception | None]) -> ChannelService:
        repository = Mock()
        repository.list_by_normalized_feed_urls.return_value = {}

        service = ChannelService(Settings(environment="test"), repository)

        def fake_fetch(url: str, *, strict: bool) -> dict[str, str] | None:
            del strict
            result = resources.get(url)
            if isinstance(result, Exception):
                raise result
            return result

        service.discovery._fetch = fake_fetch  # type: ignore[method-assign]
        return service

    def test_direct_preview_returns_sample_items_and_cadence_estimate(self) -> None:
        feed_xml = build_feed(
            items="""
            <item>
              <title>Pierwszy wpis</title>
              <link>https://example.com/posts/first</link>
              <pubDate>Mon, 14 Apr 2026 08:00:00 GMT</pubDate>
              <description><![CDATA[<p><img src="/images/first.jpg" />Lead</p>]]></description>
            </item>
            <item>
              <title>Drugi wpis</title>
              <link>https://example.com/posts/second</link>
              <pubDate>Fri, 10 Apr 2026 08:00:00 GMT</pubDate>
            </item>
            <item>
              <title>Trzeci wpis</title>
              <link>https://example.com/posts/third</link>
              <pubDate>Tue, 07 Apr 2026 08:00:00 GMT</pubDate>
            </item>
            """,
        )
        service = self.make_service(
            {
                "https://example.com/": {
                    "body": feed_xml,
                    "content_type": "application/rss+xml",
                    "final_url": "https://example.com/feed.xml",
                }
            }
        )

        payload = service.preview_channel(input_url="https://example.com")

        self.assertEqual(payload["status"], "ready")
        preview = payload["feed"]
        assert isinstance(preview, dict)
        self.assertEqual(preview["feed_url"], "https://example.com/feed.xml")
        self.assertEqual(preview["estimated_items_per_week"], 3)
        self.assertEqual(len(preview["sample_items"]), 3)
        self.assertEqual(preview["sample_items"][0]["title"], "Pierwszy wpis")
        self.assertEqual(preview["sample_items"][0]["image_url"], "https://example.com/images/first.jpg")
        self.assertEqual(preview["sample_items"][1]["published_at"], "2026-04-10T08:00:00Z")

    def test_homepage_autodiscovery_keeps_sample_items(self) -> None:
        homepage_html = """
        <html>
          <head>
            <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
          </head>
          <body>Example</body>
        </html>
        """
        feed_xml = build_feed(
            title="Homepage feed",
            site_url="https://example.com",
            items="""
            <item>
              <title>Autodetected entry</title>
              <link>https://example.com/posts/autodetected</link>
              <pubDate>Mon, 14 Apr 2026 08:00:00 GMT</pubDate>
            </item>
            <item>
              <title>Another entry</title>
              <link>https://example.com/posts/another</link>
              <pubDate>Sun, 13 Apr 2026 08:00:00 GMT</pubDate>
            </item>
            """,
        )
        service = self.make_service(
            {
                "https://example.com/": {
                    "body": homepage_html,
                    "content_type": "text/html; charset=utf-8",
                    "final_url": "https://example.com/",
                },
                "https://example.com/feed.xml": {
                    "body": feed_xml,
                    "content_type": "application/rss+xml",
                    "final_url": "https://example.com/feed.xml",
                },
                "https://example.com/feed": None,
                "https://example.com/rss": None,
                "https://example.com/atom.xml": None,
            }
        )

        payload = service.preview_channel(input_url="example.com")

        self.assertEqual(payload["status"], "ready")
        self.assertEqual(payload["discovery"]["mode"], "head_metadata")
        preview = payload["feed"]
        assert isinstance(preview, dict)
        self.assertEqual(preview["title"], "Homepage feed")
        self.assertEqual(len(preview["sample_items"]), 2)
        self.assertEqual(preview["sample_items"][0]["title"], "Autodetected entry")

    def test_cadence_estimate_is_null_with_insufficient_dates(self) -> None:
        feed_xml = build_feed(
            items="""
            <item>
              <title>Only dated entry</title>
              <link>https://example.com/posts/only</link>
              <pubDate>Mon, 14 Apr 2026 08:00:00 GMT</pubDate>
            </item>
            <item>
              <title>Undated entry</title>
              <link>https://example.com/posts/undated</link>
            </item>
            """,
        )
        service = self.make_service(
            {
                "https://example.com/": {
                    "body": feed_xml,
                    "content_type": "application/rss+xml",
                    "final_url": "https://example.com/feed.xml",
                }
            }
        )

        payload = service.preview_channel(input_url="https://example.com")

        preview = payload["feed"]
        assert isinstance(preview, dict)
        self.assertIsNone(preview["estimated_items_per_week"])
        self.assertEqual(len(preview["sample_items"]), 2)

    def test_multiple_candidates_response_still_returns_candidates(self) -> None:
        homepage_html = """
        <html>
          <head>
            <link rel="alternate" type="application/rss+xml" href="/feed-a.xml" />
            <link rel="alternate" type="application/atom+xml" href="/feed-b.xml" />
          </head>
        </html>
        """
        feed_a = build_feed(
            title="Feed A",
            items="""
            <item>
              <title>A1</title>
              <link>https://example.com/a1</link>
              <pubDate>Mon, 14 Apr 2026 08:00:00 GMT</pubDate>
            </item>
            """,
        )
        feed_b = build_feed(
            title="Feed B",
            items="""
            <item>
              <title>B1</title>
              <link>https://example.com/b1</link>
              <pubDate>Sun, 13 Apr 2026 08:00:00 GMT</pubDate>
            </item>
            """,
        )
        service = self.make_service(
            {
                "https://example.com/": {
                    "body": homepage_html,
                    "content_type": "text/html; charset=utf-8",
                    "final_url": "https://example.com/",
                },
                "https://example.com/feed-a.xml": {
                    "body": feed_a,
                    "content_type": "application/rss+xml",
                    "final_url": "https://example.com/feed-a.xml",
                },
                "https://example.com/feed-b.xml": {
                    "body": feed_b,
                    "content_type": "application/rss+xml",
                    "final_url": "https://example.com/feed-b.xml",
                },
                "https://example.com/feed": None,
                "https://example.com/rss": None,
                "https://example.com/atom.xml": None,
            }
        )

        payload = service.preview_channel(input_url="https://example.com")

        self.assertEqual(payload["status"], "multiple_candidates")
        self.assertIsNone(payload["feed"])
        self.assertEqual(len(payload["candidates"]), 2)
        self.assertEqual(payload["candidates"][0]["sample_items"][0]["title"], "A1")
        self.assertEqual(payload["candidates"][1]["sample_items"][0]["title"], "B1")

    def test_preview_discovery_failure_remains_expected_422(self) -> None:
        homepage_html = """
        <html>
          <head>
            <title>No feeds here</title>
          </head>
          <body>Example</body>
        </html>
        """
        service = self.make_service(
            {
                "https://example.com/": {
                    "body": homepage_html,
                    "content_type": "text/html; charset=utf-8",
                    "final_url": "https://example.com/",
                },
                "https://example.com/feed": None,
                "https://example.com/rss": None,
                "https://example.com/atom.xml": None,
            }
        )

        with self.assertRaises(ApiError) as context:
            service.preview_channel(input_url="https://example.com")

        error = context.exception
        self.assertEqual(error.status_code, 422)
        self.assertEqual(error.code, "discovery_failed")
        self.assertFalse(error.retryable)
        self.assertEqual(error.details["preview_failure_kind"], "discovery")

    def test_preview_transport_failure_becomes_503(self) -> None:
        service = ChannelService(Settings(environment="test"), Mock())
        service.repository.list_by_normalized_feed_urls.return_value = {}

        request = httpx.Request("GET", "https://example.com/")
        request_error = httpx.RequestError("network down", request=request)

        with patch("app.channels.service.httpx.Client.get", side_effect=request_error):
            with self.assertRaises(ApiError) as context:
                service.preview_channel(input_url="https://example.com")

        error = context.exception
        self.assertEqual(error.status_code, 503)
        self.assertEqual(error.code, "source_unreachable")
        self.assertTrue(error.retryable)
        self.assertEqual(error.details["preview_failure_kind"], "transport")


if __name__ == "__main__":
    unittest.main()
