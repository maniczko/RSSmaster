from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import httpx

from app.ai.service import AIArticleInsightService, build_article_input_text, build_openai_responses_payload
from app.config import Settings
from app.db.initializer import connect, ensure_database
from app.errors import ApiError
from app.items.repository import ItemRepository
from app.settings.repository import SettingsRepository
from app.settings.service import SettingsService


class _SuccessfulResponsesClient:
    calls: list[tuple[str, dict[str, str], dict[str, object]]] = []

    def __init__(self, *args, **kwargs) -> None:
        pass

    def __enter__(self) -> "_SuccessfulResponsesClient":
        return self

    def __exit__(self, *args) -> bool:
        return False

    def post(self, url: str, headers: dict[str, str], json: dict[str, object]) -> httpx.Response:
        self.calls.append((url, headers, json))
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={
                "model": "gpt-test",
                "output_text": json_dumps(
                    {
                        "summary": "Artykuł pokazuje najważniejszą zmianę i jej praktyczny skutek dla czytelnika.",
                        "key_points": ["Pierwszy konkret.", "Drugi konkret."],
                        "tags": ["biznes", "rynek"],
                        "reading_time_hint": "Krótka lektura do porannego przeglądu.",
                        "relevance_score": 82,
                        "digest_recommendation": "include",
                    }
                ),
            },
        )


class AIArticleInsightServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.database_path = Path(self.tempdir.name) / "rssmaster-ai.db"
        ensure_database(self.database_path)
        self._insert_channel()
        self._insert_item()

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def _settings(self, *, ai_enabled: bool = True, openai_api_key: str | None = "sk-test") -> Settings:
        return Settings(
            **{
                "RSSMASTER_ENV": "test",
                "RSSMASTER_DATABASE_PATH": str(self.database_path),
                "RSSMASTER_AI_ENABLED": ai_enabled,
                "RSSMASTER_OPENAI_API_KEY": openai_api_key,
                "RSSMASTER_OPENAI_CHAT_MODEL": "gpt-test",
                "RSSMASTER_OPENAI_EMBEDDING_MODEL": "text-embedding-test",
            }
        )

    def _service(self, *, ai_enabled: bool = True, openai_api_key: str | None = "sk-test") -> AIArticleInsightService:
        settings = self._settings(ai_enabled=ai_enabled, openai_api_key=openai_api_key)
        return AIArticleInsightService(
            settings=settings,
            item_repository=ItemRepository(self.database_path),
            settings_service=SettingsService(settings, SettingsRepository(self.database_path)),
            client_factory=_SuccessfulResponsesClient,
        )

    def _insert_channel(self) -> None:
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
                    "chn_ai",
                    "AI Source",
                    "https://example.com",
                    "https://example.com/feed.xml",
                    "https://example.com/feed.xml",
                    "AI test feed",
                    "pl",
                    "test",
                ],
            )
            connection.commit()

    def _insert_item(self, *, item_id: str = "itm_ai") -> None:
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
                    dedupe_key
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    item_id,
                    "chn_ai",
                    item_id,
                    f"https://example.com/{item_id}",
                    f"https://example.com/{item_id}",
                    "AI insight target",
                    "Reporter",
                    "Krótki opis artykułu.",
                    None,
                    "<article><p>To jest długi lokalny tekst artykułu, który pozwala przygotować sensowny insight dla czytelnika.</p><p>Drugi akapit dodaje kontekst, konsekwencje, ryzyka oraz praktyczne wnioski dla użytkownika czytnika RSSmaster.</p><p>Trzeci akapit stabilizuje minimalną długość wejścia i pozwala sprawdzić, że usługa nie odpala AI dla pustych skrótów.</p></article>",
                    "To jest długi lokalny tekst artykułu, który pozwala przygotować sensowny insight dla czytelnika. Drugi akapit dodaje kontekst, konsekwencje, ryzyka oraz praktyczne wnioski dla użytkownika czytnika RSSmaster. Trzeci akapit stabilizuje minimalną długość wejścia i pozwala sprawdzić, że usługa nie odpala AI dla pustych skrótów.",
                    "2026-05-11T08:00:00Z",
                    "completed",
                    f"dedupe::{item_id}",
                ],
            )
            connection.commit()

    def test_generate_item_insight_uses_openai_responses_without_exposing_secret(self) -> None:
        _SuccessfulResponsesClient.calls = []
        payload = self._service().generate_item_insight("itm_ai")

        insight = payload["insight"]
        self.assertEqual(insight["item_id"], "itm_ai")
        self.assertEqual(insight["summary"], "Artykuł pokazuje najważniejszą zmianę i jej praktyczny skutek dla czytelnika.")
        self.assertEqual(insight["digest_recommendation"], "include")
        self.assertEqual(insight["relevance_score"], 82)
        self.assertEqual(len(_SuccessfulResponsesClient.calls), 1)
        _, headers, request_payload = _SuccessfulResponsesClient.calls[0]
        self.assertEqual(headers["Authorization"], "Bearer sk-test")
        self.assertEqual(request_payload["model"], "gpt-test")
        self.assertNotIn("sk-test", json_dumps(payload))

    def test_ai_not_ready_returns_actionable_error_without_network_call(self) -> None:
        _SuccessfulResponsesClient.calls = []

        with self.assertRaises(ApiError) as context:
            self._service(ai_enabled=False, openai_api_key=None).generate_item_insight("itm_ai")

        self.assertEqual(context.exception.status_code, 409)
        self.assertEqual(context.exception.code, "ai_not_ready")
        self.assertEqual(context.exception.details["settings_route"], "/settings")
        self.assertIn("openai_api_key", context.exception.details["missing"])
        self.assertEqual(_SuccessfulResponsesClient.calls, [])

    def test_article_input_prefers_cleaned_html_and_strips_markup(self) -> None:
        item = ItemRepository(self.database_path).get_detail_by_id("itm_ai")

        text = build_article_input_text(item or {})

        self.assertIn("długi lokalny tekst artykułu", text)
        self.assertNotIn("<article>", text)

    def test_openai_payload_requests_structured_json(self) -> None:
        item = ItemRepository(self.database_path).get_detail_by_id("itm_ai")

        payload = build_openai_responses_payload(item=item or {}, article_text="Treść testowa " * 40, model="gpt-test")

        self.assertEqual(payload["model"], "gpt-test")
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")
        self.assertTrue(payload["text"]["format"]["strict"])
        self.assertIn("digest_recommendation", payload["text"]["format"]["schema"]["required"])


def json_dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    unittest.main()
