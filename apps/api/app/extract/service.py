from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from html import escape, unescape
from html.parser import HTMLParser
import logging
import re
from typing import Iterable
from urllib.parse import urlparse

import httpx

from app.config import Settings

from .models import ExtractionBatchSummary, ExtractionCandidate, ExtractionResult
from .repository import ExtractionRepository

logger = logging.getLogger("rssmaster.extract")

COMMENT_RE = re.compile(r"(?is)<!--.*?-->")
STRIP_CONTAINER_RE = re.compile(
    r"(?is)<(script|style|noscript|svg|canvas|iframe|template|nav|footer|header|form|button|input|select|textarea)\b.*?</\1>"
)
WHITESPACE_RE = re.compile(r"[ \t\r\f\v]+")
PARAGRAPH_BREAK_RE = re.compile(r"\n{3,}")
PREFERRED_FRAGMENT_RE = {
    tag: re.compile(rf"(?is)<{tag}\b[^>]*>(.*?)</{tag}>")
    for tag in ("article", "main", "body")
}
SUPPORTED_CONTENT_TYPES = ("text/html", "application/xhtml+xml")
MAX_RAW_HTML_LENGTH = 750_000
MAX_CONTENT_TEXT_LENGTH = 40_000
MAX_EXCERPT_LENGTH = 280
MIN_COMPLETED_TEXT_LENGTH = 120
MAX_BATCH_ITEMS = 25


@dataclass(slots=True, frozen=True)
class PreparedDocument:
    cleaned_html: str | None
    content_text: str | None
    excerpt: str | None


class ExtractionService:
    def __init__(self, settings: Settings, repository: ExtractionRepository) -> None:
        self.settings = settings
        self.repository = repository

    def extract_pending_for_entries(
        self,
        *,
        channel_id: str,
        dedupe_keys: Iterable[str],
        limit: int = MAX_BATCH_ITEMS,
    ) -> ExtractionBatchSummary:
        unique_dedupe_keys = list(dict.fromkeys(key for key in dedupe_keys if key))
        candidates = self.repository.list_pending_candidates(
            channel_id=channel_id,
            dedupe_keys=unique_dedupe_keys,
            limit=max(1, min(limit, MAX_BATCH_ITEMS)),
        )
        if not candidates:
            return ExtractionBatchSummary(processed=0, completed=0, failed=0)

        completed = 0
        failed = 0

        with httpx.Client(
            follow_redirects=True,
            headers={"User-Agent": "rssmaster/0.1.0 (+local-first extract)"},
            timeout=self.settings.fetch_timeout_seconds,
        ) as client:
            for candidate in candidates:
                self.repository.mark_running(candidate.id)
                result = self._extract_candidate(client=client, candidate=candidate)
                self.repository.persist_result(candidate.id, result=result)

                if result.extraction_status == "completed":
                    completed += 1
                else:
                    failed += 1

        return ExtractionBatchSummary(processed=len(candidates), completed=completed, failed=failed)

    def _extract_candidate(self, *, client: httpx.Client, candidate: ExtractionCandidate) -> ExtractionResult:
        attempted_at = utc_now()
        fallback_document = prepare_document(
            html_source=candidate.raw_html,
            fallback_text=coalesce_text(candidate.excerpt, candidate.title),
        )

        parsed = urlparse(candidate.source_url)
        if parsed.scheme not in {"http", "https"}:
            return ExtractionResult(
                raw_html=candidate.raw_html,
                cleaned_html=fallback_document.cleaned_html,
                content_text=fallback_document.content_text,
                excerpt=fallback_document.excerpt,
                raw_fetched_at=attempted_at,
                cleaned_at=attempted_at,
                extraction_status="skipped",
                extraction_error="Source article URL uses an unsupported scheme.",
            )

        try:
            response = client.get(candidate.source_url)
        except httpx.RequestError as error:
            return ExtractionResult(
                raw_html=candidate.raw_html,
                cleaned_html=fallback_document.cleaned_html,
                content_text=fallback_document.content_text,
                excerpt=fallback_document.excerpt,
                raw_fetched_at=attempted_at,
                cleaned_at=attempted_at,
                extraction_status="failed",
                extraction_error=f"Source article could not be fetched: {error}.",
            )

        raw_html = clamp_text(response.text or "", MAX_RAW_HTML_LENGTH) or candidate.raw_html
        if response.status_code >= 400:
            return ExtractionResult(
                raw_html=raw_html,
                cleaned_html=fallback_document.cleaned_html,
                content_text=fallback_document.content_text,
                excerpt=fallback_document.excerpt,
                raw_fetched_at=attempted_at,
                cleaned_at=attempted_at,
                extraction_status="failed",
                extraction_error=f"Source article returned HTTP {response.status_code}.",
            )

        content_type = (response.headers.get("content-type") or "").lower()
        if content_type and not any(kind in content_type for kind in SUPPORTED_CONTENT_TYPES):
            return ExtractionResult(
                raw_html=raw_html,
                cleaned_html=fallback_document.cleaned_html,
                content_text=fallback_document.content_text,
                excerpt=fallback_document.excerpt,
                raw_fetched_at=attempted_at,
                cleaned_at=attempted_at,
                extraction_status="failed",
                extraction_error=f"Source article returned unsupported content type '{content_type}'.",
            )

        prepared = prepare_document(html_source=raw_html, fallback_text=coalesce_text(candidate.excerpt, candidate.title))
        if prepared.content_text and len(prepared.content_text) >= MIN_COMPLETED_TEXT_LENGTH:
            return ExtractionResult(
                raw_html=raw_html,
                cleaned_html=prepared.cleaned_html,
                content_text=prepared.content_text,
                excerpt=prepared.excerpt,
                raw_fetched_at=attempted_at,
                cleaned_at=attempted_at,
                extraction_status="completed",
                extraction_error=None,
            )

        return ExtractionResult(
            raw_html=raw_html,
            cleaned_html=fallback_document.cleaned_html,
            content_text=fallback_document.content_text,
            excerpt=fallback_document.excerpt,
            raw_fetched_at=attempted_at,
            cleaned_at=attempted_at,
            extraction_status="failed",
            extraction_error="Readable article content was too short after bounded cleaning heuristics.",
        )


def prepare_document(*, html_source: str | None, fallback_text: str | None) -> PreparedDocument:
    primary_html = pick_preferred_fragment(html_source)
    primary_document = document_from_html(primary_html)
    if primary_document.content_text and len(primary_document.content_text) >= MIN_COMPLETED_TEXT_LENGTH:
        return primary_document

    secondary_document = document_from_html(html_source)
    if secondary_document.content_text and len(secondary_document.content_text) >= MIN_COMPLETED_TEXT_LENGTH:
        return secondary_document

    fallback_content = coalesce_text(
        secondary_document.content_text,
        primary_document.content_text,
        fallback_text,
    )
    if not fallback_content:
        return PreparedDocument(cleaned_html=None, content_text=None, excerpt=None)

    normalized = clamp_text(fallback_content, MAX_CONTENT_TEXT_LENGTH)
    cleaned_html = paragraphs_to_html(paragraphs_from_text(normalized))
    return PreparedDocument(
        cleaned_html=cleaned_html,
        content_text=normalized,
        excerpt=summarize_text(normalized),
    )


def document_from_html(html_source: str | None) -> PreparedDocument:
    if not html_source:
        return PreparedDocument(cleaned_html=None, content_text=None, excerpt=None)

    stripped = STRIP_CONTAINER_RE.sub("", COMMENT_RE.sub("", html_source))
    parser = BlockTextParser()

    try:
        parser.feed(stripped)
        parser.close()
    except Exception as error:  # pragma: no cover - HTMLParser safety net
        logger.debug("extract_parse_failure error=%s", error)
        return PreparedDocument(cleaned_html=None, content_text=None, excerpt=None)

    paragraphs = paragraphs_from_text(parser.text)
    if not paragraphs:
        return PreparedDocument(cleaned_html=None, content_text=None, excerpt=None)

    content_text = clamp_text("\n\n".join(paragraphs), MAX_CONTENT_TEXT_LENGTH)
    return PreparedDocument(
        cleaned_html=paragraphs_to_html(paragraphs_from_text(content_text)),
        content_text=content_text,
        excerpt=summarize_text(content_text),
    )


def pick_preferred_fragment(html_source: str | None) -> str | None:
    if not html_source:
        return None

    for tag, pattern in PREFERRED_FRAGMENT_RE.items():
        matches = [match.group(1) for match in pattern.finditer(html_source)]
        if not matches:
            continue
        largest = max(matches, key=len)
        if largest.strip():
            logger.debug("extract_fragment_selected fragment=%s", tag)
            return largest

    return html_source


def paragraphs_from_text(text: str | None) -> list[str]:
    if not text:
        return []

    normalized = PARAGRAPH_BREAK_RE.sub("\n\n", WHITESPACE_RE.sub(" ", text).replace("\xa0", " ")).strip()
    if not normalized:
        return []

    paragraphs = [paragraph.strip(" \n") for paragraph in normalized.split("\n\n")]
    return [paragraph for paragraph in paragraphs if paragraph]


def paragraphs_to_html(paragraphs: list[str]) -> str | None:
    if not paragraphs:
        return None
    return "\n".join(f"<p>{escape(paragraph)}</p>" for paragraph in paragraphs)


def summarize_text(text: str | None) -> str | None:
    if not text:
        return None
    normalized = " ".join(text.split())
    if not normalized:
        return None
    return normalized[:MAX_EXCERPT_LENGTH]


def coalesce_text(*candidates: str | None) -> str | None:
    for candidate in candidates:
        if candidate and candidate.strip():
            return candidate.strip()
    return None


def clamp_text(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    if len(value) <= limit:
        return value
    return value[:limit]


class BlockTextParser(HTMLParser):
    BLOCK_TAGS = {
        "article",
        "aside",
        "blockquote",
        "br",
        "dd",
        "div",
        "dl",
        "dt",
        "figcaption",
        "figure",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "hr",
        "li",
        "main",
        "ol",
        "p",
        "pre",
        "section",
        "table",
        "td",
        "th",
        "tr",
        "ul",
    }
    SKIP_TAGS = {"head", "script", "style", "noscript", "svg", "canvas", "iframe", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0

    @property
    def text(self) -> str:
        raw_text = "".join(self._parts)
        normalized_lines: list[str] = []
        for line in raw_text.splitlines():
            normalized = WHITESPACE_RE.sub(" ", line).strip()
            if normalized:
                normalized_lines.append(normalized)
                continue
            if normalized_lines and normalized_lines[-1] != "":
                normalized_lines.append("")

        return PARAGRAPH_BREAK_RE.sub("\n\n", "\n".join(normalized_lines)).strip()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        if normalized_tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if normalized_tag in self.BLOCK_TAGS:
            self._ensure_break()

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        if normalized_tag in self.SKIP_TAGS:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if normalized_tag in self.BLOCK_TAGS:
            self._ensure_break()

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        normalized = WHITESPACE_RE.sub(" ", unescape(data).replace("\xa0", " ")).strip()
        if not normalized:
            return
        if self._parts and not self._parts[-1].endswith(("\n", " ")):
            self._parts.append(" ")
        self._parts.append(normalized)

    def _ensure_break(self) -> None:
        if not self._parts:
            return
        if self._parts[-1].endswith("\n\n"):
            return
        if self._parts[-1].endswith("\n"):
            self._parts.append("\n")
            return
        self._parts.append("\n\n")


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
