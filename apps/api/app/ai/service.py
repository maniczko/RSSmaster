from __future__ import annotations

from datetime import UTC, datetime
from html import unescape
import json
import logging
import re
from typing import Any, Callable

import httpx

from app.config import Settings
from app.errors import ApiError
from app.items.repository import ItemRepository
from app.settings.service import SettingsService

from .models import ArticleAIInsightModel

logger = logging.getLogger("rssmaster.ai")

OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses"
OPENAI_INSIGHT_TIMEOUT_SECONDS = 45
ARTICLE_INPUT_CHAR_LIMIT = 9000


class AIArticleInsightService:
    def __init__(
        self,
        *,
        settings: Settings,
        item_repository: ItemRepository,
        settings_service: SettingsService,
        client_factory: Callable[..., httpx.Client] = httpx.Client,
    ) -> None:
        self.settings = settings
        self.item_repository = item_repository
        self.settings_service = settings_service
        self.client_factory = client_factory

    def generate_item_insight(self, item_id: str) -> dict[str, object]:
        resolved_ai = self.settings_service.get_resolved_ai_settings()
        if not resolved_ai.ready:
            raise ApiError(
                status_code=409,
                code="ai_not_ready",
                message="AI nie jest jeszcze gotowe. Włącz AI, zapisz klucz OpenAI i uruchom preflight w Ustawieniach.",
                details={
                    "settings_route": "/settings",
                    "missing": build_missing_ai_fields(resolved_ai),
                },
                retryable=False,
            )

        item = self.item_repository.get_detail_by_id(item_id)
        if item is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": item_id},
                retryable=False,
            )

        article_text = build_article_input_text(item)
        if len(article_text.split()) < 30:
            raise ApiError(
                status_code=422,
                code="item_not_readable_for_ai",
                message="Artykuł ma za mało lokalnego tekstu, żeby wygenerować sensowny insight AI.",
                details={
                    "item_id": item_id,
                    "reader_status": item.get("reader_status"),
                    "suggested_action": "reextract_or_open_source",
                },
                retryable=False,
            )

        request_payload = build_openai_responses_payload(
            item=item,
            article_text=article_text,
            model=resolved_ai.chat_model,
        )
        headers = {
            "Authorization": f"Bearer {resolved_ai.openai_api_key}",
            "Content-Type": "application/json",
        }

        try:
            with self.client_factory(timeout=OPENAI_INSIGHT_TIMEOUT_SECONDS) as client:
                response = client.post(OPENAI_RESPONSES_API_URL, headers=headers, json=request_payload)
        except httpx.TimeoutException as error:
            logger.warning("openai_article_insight_timeout item_id=%s", item_id)
            raise ApiError(
                status_code=504,
                code="ai_provider_timeout",
                message="OpenAI nie odpowiedziało na czas podczas generowania insightu artykułu.",
                details={"item_id": item_id},
                retryable=True,
            ) from error
        except httpx.RequestError as error:
            logger.warning("openai_article_insight_request_failed item_id=%s error=%s", item_id, error)
            raise ApiError(
                status_code=503,
                code="ai_provider_unreachable",
                message="Nie udało się połączyć z OpenAI podczas generowania insightu artykułu.",
                details={"item_id": item_id},
                retryable=True,
            ) from error

        if response.status_code >= 400:
            logger.warning("openai_article_insight_failed item_id=%s status=%s", item_id, response.status_code)
            raise ApiError(
                status_code=502,
                code="ai_provider_error",
                message="OpenAI odrzuciło żądanie insightu artykułu. Sprawdź klucz, model i limity konta.",
                details={
                    "item_id": item_id,
                    "provider_status": response.status_code,
                    "provider_request_id": response.headers.get("x-request-id"),
                },
                retryable=response.status_code >= 500 or response.status_code == 429,
            )

        try:
            raw_payload = response.json()
            model_payload = json.loads(extract_response_text(raw_payload))
            insight = ArticleAIInsightModel.model_validate(
                {
                    **model_payload,
                    "item_id": item_id,
                    "model": str(raw_payload.get("model") or resolved_ai.chat_model),
                    "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                    "source": "openai",
                }
            )
        except (ValueError, TypeError) as error:
            logger.warning("openai_article_insight_invalid_response item_id=%s", item_id)
            raise ApiError(
                status_code=502,
                code="ai_invalid_response",
                message="OpenAI zwróciło odpowiedź, której RSSmaster nie umie bezpiecznie odczytać.",
                details={"item_id": item_id},
                retryable=True,
            ) from error

        return {"insight": insight.model_dump()}


def build_missing_ai_fields(resolved_ai: object) -> list[str]:
    missing: list[str] = []
    if not bool(getattr(resolved_ai, "enabled", False)):
        missing.append("enabled")
    if not bool(getattr(resolved_ai, "openai_api_key", None)):
        missing.append("openai_api_key")
    if not bool(getattr(resolved_ai, "chat_model", None)):
        missing.append("chat_model")
    if not bool(getattr(resolved_ai, "embedding_model", None)):
        missing.append("embedding_model")
    return missing


def build_article_input_text(item: dict[str, object]) -> str:
    candidates = [
        strip_html(item.get("cleaned_html")),
        normalize_text(item.get("content_text")),
        normalize_text(item.get("excerpt")),
    ]
    best = next((candidate for candidate in candidates if candidate), "")
    return best[:ARTICLE_INPUT_CHAR_LIMIT].strip()


def build_openai_responses_payload(*, item: dict[str, object], article_text: str, model: str) -> dict[str, object]:
    source = item.get("channel")
    channel_title = source.get("title") if isinstance(source, dict) else None
    metadata = {
        "title": item.get("title"),
        "author": item.get("author"),
        "source": channel_title,
        "published_at": item.get("published_at"),
        "reader_status": item.get("reader_status"),
    }

    return {
        "model": model,
        "instructions": (
            "Jesteś asystentem czytania RSSmaster. Odpowiadasz po polsku, krótko i praktycznie. "
            "Nie wymyślaj faktów spoza artykułu. Oceń wyłącznie lokalnie dostarczony tekst."
        ),
        "input": (
            "Wygeneruj insight dla artykułu w aplikacji RSSmaster.\n"
            f"Metadane: {json.dumps(metadata, ensure_ascii=False)}\n\n"
            f"Tekst artykułu:\n{article_text}"
        ),
        "max_output_tokens": 700,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "rssmaster_article_insight",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "summary": {"type": "string"},
                        "key_points": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 5,
                            "items": {"type": "string"},
                        },
                        "tags": {
                            "type": "array",
                            "minItems": 2,
                            "maxItems": 6,
                            "items": {"type": "string"},
                        },
                        "reading_time_hint": {"type": "string"},
                        "relevance_score": {"type": "integer", "minimum": 1, "maximum": 100},
                        "digest_recommendation": {
                            "type": "string",
                            "enum": ["include", "maybe", "skip"],
                        },
                    },
                    "required": [
                        "summary",
                        "key_points",
                        "tags",
                        "reading_time_hint",
                        "relevance_score",
                        "digest_recommendation",
                    ],
                },
            }
        },
    }


def extract_response_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    output = payload.get("output")
    if isinstance(output, list):
        for entry in output:
            if not isinstance(entry, dict):
                continue
            content = entry.get("content")
            if not isinstance(content, list):
                continue
            for content_entry in content:
                if not isinstance(content_entry, dict):
                    continue
                text = content_entry.get("text")
                if isinstance(text, str) and text.strip():
                    return text

    raise ValueError("missing output text")


def strip_html(value: object) -> str:
    if not isinstance(value, str):
        return ""
    without_tags = re.sub(r"<[^>]+>", " ", value)
    return normalize_text(unescape(without_tags))


def normalize_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split()).strip()
