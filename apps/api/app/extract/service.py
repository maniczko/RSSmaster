from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from html import escape, unescape
from html.parser import HTMLParser
import logging
import re
from typing import Iterable
from urllib.parse import urljoin, urlparse

import httpx

from app.config import Settings
from app.security import HtmlSanitizationPolicy, READER_HTML_POLICY, sanitize_html_fragment

from .models import ExtractionBatchSummary, ExtractionCandidate, ExtractionResult
from .repository import ExtractionRepository

logger = logging.getLogger("rssmaster.extract")

COMMENT_RE = re.compile(r"(?is)<!--.*?-->")
STRIP_CONTAINER_RE = re.compile(
    r"(?is)<(script|style|svg|canvas|iframe|template|nav|footer|form|button|input|select|textarea)\b.*?</\1>"
)
ELEVENLABS_WIDGET_RE = re.compile(
    r"(?is)<div\b[^>]*(?:id|class|data-playerurl)\s*=\s*(?:\"[^\"]*(?:elevenlabs|audionative)[^\"]*\"|'[^']*(?:elevenlabs|audionative)[^']*')[^>]*>.*?</div>"
)
INLINE_RELATED_BLOCK_RE = re.compile(
    r"(?is)<(?P<tag>p|div|section|aside)\b[^>]*>\s*(?:<[^>]+>\s*)*(?:przeczytaj|czytaj(?:\s+też|\s+tez)?|read\s+(?:also|more|next)|related|powiązane\s+artykuły|powiazane\s+artykuly|zobacz\s+również|zobacz\s+rowniez|źródło\s+zdjęć|dźwięk\s+został\s+wygenerowany\s+automatycznie(?:\s+i\s+może\s+zawierać\s+błędy)?)\b\s*:?.*?</(?P=tag)>"
)
HEADER_BLOCK_RE = re.compile(r"(?is)<header\b[^>]*>(.*?)</header>")
HEADER_HEADING_RE = re.compile(r"(?is)<h[1-6]\b")
WHITESPACE_RE = re.compile(r"[ \t\r\f\v]+")
PARAGRAPH_BREAK_RE = re.compile(r"\n{3,}")
IMAGE_SRC_RE = re.compile(r'(?is)<img\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']')
WORDPRESS_SIZE_SUFFIX_RE = re.compile(r"(?:-\d+x\d+|-scaled)(?=\.[a-z0-9]+$)", re.IGNORECASE)
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
IMAGE_URL_ATTRIBUTES = ("src", "data-src", "data-lazy-src", "data-original", "data-url")
PLACEHOLDER_IMAGE_MARKERS = ("placeholder", "spacer", "blank", "1x1", "pixel")
NOISY_TEXT_FRAGMENTS = (
    "Loading the Elevenlabs Text to Speech AudioNative Player...",
    "Loading the Elevenlabs Text to Speech AudioNative Player",
    "Dźwięk został wygenerowany automatycznie i może zawierać błędy",
    "Źródło zdjęć:",
)
META_IMAGE_KEYS = ("og:image", "twitter:image")
META_IMAGE_ALT_KEYS = ("og:image:alt", "twitter:image:alt")
META_TITLE_KEYS = ("og:title", "twitter:title")
NOISE_CONTAINER_TAGS = {"aside", "div", "li", "ol", "section", "ul"}
NOISE_CONTAINER_TOKEN_GROUPS = (
    frozenset({"content", "insights"}),
    frozenset({"floating", "bar"}),
    frozenset({"newsletter"}),
    frozenset({"part", "teaser"}),
    frozenset({"part", "video"}),
    frozenset({"posts", "teaser"}),
    frozenset({"promo"}),
    frozenset({"read", "more"}),
    frozenset({"read", "next"}),
    frozenset({"recommended"}),
    frozenset({"related"}),
    frozenset({"social", "share"}),
    frozenset({"sponsor"}),
    frozenset({"sponsored"}),
    frozenset({"subscription"}),
    frozenset({"taboola"}),
    frozenset({"teaser", "inline"}),
    frozenset({"widget"}),
)
DECORATIVE_MEDIA_TOKENS = frozenset(
    {
        "avatar",
        "background",
        "badge",
        "icon",
        "logo",
        "partner",
        "placeholder",
        "profile",
    }
)
DECORATIVE_MEDIA_SRC_MARKERS = (
    "/theme/",
    "/img/backgrounds/",
    "/img/icons/",
    "/logo",
    "/partners/",
)
XYZ_THEME_MEDIA_MARKER = "/wp-content/themes/xyz/img/"

EXTRACT_HTML_POLICY = HtmlSanitizationPolicy.create(
    allowed_tags=READER_HTML_POLICY.allowed_tags,
    allowed_attributes=READER_HTML_POLICY.allowed_attributes,
    allowed_url_schemes=READER_HTML_POLICY.allowed_url_schemes,
    blocked_tags=READER_HTML_POLICY.blocked_tags,
    allow_relative_urls=True,
    unwrap_disallowed_tags=READER_HTML_POLICY.unwrap_disallowed_tags,
    max_output_length=READER_HTML_POLICY.max_output_length,
)


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
            base_url=candidate.source_url,
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

        prepared = prepare_document(
            html_source=raw_html,
            fallback_text=coalesce_text(candidate.excerpt, candidate.title),
            base_url=str(response.url),
        )
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


def prepare_document(*, html_source: str | None, fallback_text: str | None, base_url: str | None = None) -> PreparedDocument:
    primary_html = pick_preferred_fragment(html_source)
    primary_document = document_from_html(primary_html, base_url=base_url, metadata_html_source=html_source)
    if primary_document.content_text and len(primary_document.content_text) >= MIN_COMPLETED_TEXT_LENGTH:
        return primary_document

    secondary_document = document_from_html(html_source, base_url=base_url, metadata_html_source=html_source)
    if secondary_document.content_text and len(secondary_document.content_text) >= MIN_COMPLETED_TEXT_LENGTH:
        return secondary_document

    fallback_content = coalesce_text(
        secondary_document.content_text,
        primary_document.content_text,
        fallback_text,
    )
    if not fallback_content:
        return PreparedDocument(
            cleaned_html=secondary_document.cleaned_html or primary_document.cleaned_html,
            content_text=None,
            excerpt=None,
        )

    normalized = clamp_text(fallback_content, MAX_CONTENT_TEXT_LENGTH)
    cleaned_html = secondary_document.cleaned_html or primary_document.cleaned_html
    if not cleaned_html:
        cleaned_html = paragraphs_to_html(paragraphs_from_text(normalized))
    return PreparedDocument(
        cleaned_html=cleaned_html,
        content_text=normalized,
        excerpt=summarize_text(normalized),
    )


def document_from_html(
    html_source: str | None,
    *,
    base_url: str | None = None,
    metadata_html_source: str | None = None,
) -> PreparedDocument:
    if not html_source:
        return PreparedDocument(cleaned_html=None, content_text=None, excerpt=None)

    stripped = strip_content_noise(
        STRIP_CONTAINER_RE.sub("", COMMENT_RE.sub("", html_source)),
        base_url=base_url,
    )
    normalized_html = normalize_rich_media_html(stripped, base_url=base_url)
    sanitized = sanitize_html_fragment(normalized_html, policy=EXTRACT_HTML_POLICY)
    parser = BlockTextParser()

    try:
        parser.feed(stripped)
        parser.close()
    except Exception as error:  # pragma: no cover - HTMLParser safety net
        logger.debug("extract_parse_failure error=%s", error)
        return PreparedDocument(cleaned_html=None, content_text=None, excerpt=None)

    paragraphs = paragraphs_from_text(strip_known_text_noise(parser.text))
    content_text = clamp_text("\n\n".join(paragraphs), MAX_CONTENT_TEXT_LENGTH) if paragraphs else None
    cleaned_html = absolutize_html_fragment(sanitized.html, base_url=base_url) if sanitized.html else None
    if not cleaned_html and content_text:
        cleaned_html = paragraphs_to_html(paragraphs_from_text(content_text))
    cleaned_html = inject_meta_hero_image(
        cleaned_html,
        html_source=metadata_html_source or html_source,
        base_url=base_url,
    )
    return PreparedDocument(
        cleaned_html=cleaned_html,
        content_text=content_text,
        excerpt=summarize_text(content_text),
    )


def normalize_rich_media_html(html_source: str | None, *, base_url: str | None) -> str | None:
    if not html_source:
        return None

    normalizer = RichMediaNormalizer(base_url=base_url)
    try:
        normalizer.feed(html_source)
        normalizer.close()
    except Exception as error:  # pragma: no cover - HTMLParser safety net
        logger.debug("extract_media_normalize_failure error=%s", error)
        return html_source

    normalized = normalizer.html.strip()
    return normalized or None


def strip_content_noise(html_source: str | None, *, base_url: str | None) -> str | None:
    if html_source is None:
        return None
    cleaned = ELEVENLABS_WIDGET_RE.sub("", html_source)
    cleaned = INLINE_RELATED_BLOCK_RE.sub("", cleaned)
    cleaned = strip_noise_headers(cleaned)

    stripper = ContentNoiseStripper(base_url=base_url)
    try:
        stripper.feed(cleaned)
        stripper.close()
    except Exception as error:  # pragma: no cover - HTMLParser safety net
        logger.debug("extract_content_noise_strip_failure error=%s", error)
        return cleaned

    return INLINE_RELATED_BLOCK_RE.sub("", stripper.html)


def strip_known_text_noise(text: str | None) -> str | None:
    if text is None:
        return None

    cleaned = text
    for fragment in NOISY_TEXT_FRAGMENTS:
        cleaned = cleaned.replace(fragment, " ")
    return cleaned


def inject_meta_hero_image(cleaned_html: str | None, *, html_source: str | None, base_url: str | None) -> str | None:
    if not cleaned_html or not html_source:
        return cleaned_html

    hero_image = extract_meta_hero_image(html_source, base_url=base_url)
    if hero_image is None:
        return cleaned_html

    if any(media_urls_match(hero_image.url, source) for source in extract_image_sources(cleaned_html)):
        return cleaned_html

    return f"<figure>{serialize_image_candidate(hero_image)}</figure>\n{cleaned_html}"


def extract_meta_hero_image(html_source: str | None, *, base_url: str | None) -> _ImageCandidate | None:
    if not html_source:
        return None

    parser = MetadataParser()
    try:
        parser.feed(html_source)
        parser.close()
    except Exception as error:  # pragma: no cover - HTMLParser safety net
        logger.debug("extract_metadata_parse_failure error=%s", error)
        return None

    image_url = first_text(parser.meta.get(key) for key in META_IMAGE_KEYS)
    resolved_url = resolve_media_url(image_url or "", base_url=base_url) if image_url else None
    if not resolved_url:
        return None

    return _ImageCandidate(
        url=resolved_url,
        alt=first_text(
            (
                first_text(parser.meta.get(key) for key in META_IMAGE_ALT_KEYS),
                first_text(parser.meta.get(key) for key in META_TITLE_KEYS),
                parser.title,
            )
        ),
    )


def extract_image_sources(html_fragment: str | None) -> list[str]:
    if not html_fragment:
        return []
    return [source.strip() for source in IMAGE_SRC_RE.findall(html_fragment) if source.strip()]


def media_urls_match(left: str, right: str) -> bool:
    return media_asset_signature(left) == media_asset_signature(right)


def media_asset_signature(value: str) -> str:
    parsed = urlparse(value.strip())
    normalized_path = WORDPRESS_SIZE_SUFFIX_RE.sub("", parsed.path.casefold())
    return f"{parsed.netloc.casefold()}{normalized_path}"


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


def absolutize_html_fragment(html_fragment: str | None, *, base_url: str | None) -> str | None:
    if not html_fragment or not base_url:
        return html_fragment

    parser = RelativeUrlRewriter(base_url=base_url)
    try:
        parser.feed(html_fragment)
        parser.close()
    except Exception as error:  # pragma: no cover - HTMLParser safety net
        logger.debug("extract_html_rewrite_failure error=%s", error)
        return html_fragment
    return parser.html


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


def strip_noise_headers(html_source: str) -> str:
    def _replace(match: re.Match[str]) -> str:
        header_html = match.group(0)
        if HEADER_HEADING_RE.search(header_html):
            return header_html
        return ""

    return HEADER_BLOCK_RE.sub(_replace, html_source)


def extract_host(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    return parsed.netloc.casefold() or None


def tokenize_attr_values(attrs: list[tuple[str, str | None]]) -> frozenset[str]:
    tokens: set[str] = set()
    for raw_name, raw_value in attrs:
        if not raw_name or not raw_value:
            continue
        name = raw_name.casefold()
        if name not in {"aria-label", "class", "id", "role"} and not name.startswith("data-"):
            continue
        for token in re.split(r"[^a-z0-9]+", raw_value.casefold()):
            if token:
                tokens.add(token)
    return frozenset(tokens)


def should_drop_noise_container(
    tag: str,
    attrs: list[tuple[str, str | None]],
    *,
    host: str | None,
) -> bool:
    if tag not in NOISE_CONTAINER_TAGS:
        return False

    tokens = tokenize_attr_values(attrs)
    if not tokens:
        return False

    for group in NOISE_CONTAINER_TOKEN_GROUPS:
        if group.issubset(tokens):
            return True

    for raw_name, raw_value in attrs:
        name = (raw_name or "").casefold()
        value = (raw_value or "").casefold()
        if name == "data-video-title" and value == "true":
            return True

    if host and host.endswith("xyz.pl") and {"share", "dropdown", "placement"}.issubset(tokens):
        return True

    return False


def should_drop_decorative_media(
    attrs: list[tuple[str, str | None]],
    *,
    host: str | None,
    inside_figure: bool,
) -> bool:
    src = first_text(first_attr(attrs, attr_name) for attr_name in ("src", "data-src", "data-original", "data-url")) or ""
    src_lower = src.casefold()
    tokens = tokenize_attr_values(attrs)
    alt = (first_attr(attrs, "alt") or "").strip()
    role = (first_attr(attrs, "role") or "").strip().casefold()
    has_decorative_src_marker = bool(src_lower and any(marker in src_lower for marker in DECORATIVE_MEDIA_SRC_MARKERS))
    has_host_theme_marker = bool(host and host.endswith("xyz.pl") and XYZ_THEME_MEDIA_MARKER in src_lower)

    if inside_figure and not ((has_decorative_src_marker or has_host_theme_marker) and not alt):
        return False

    if has_decorative_src_marker:
        return True
    if has_host_theme_marker:
        return True
    if role == "presentation" and not alt:
        return True
    if not alt and tokens & DECORATIVE_MEDIA_TOKENS:
        return True
    if {"profile", "image"}.issubset(tokens):
        return True

    return False


class ContentNoiseStripper(HTMLParser):
    VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, base_url: str | None) -> None:
        super().__init__(convert_charrefs=False)
        self.host = extract_host(base_url)
        self.parts: list[str] = []
        self._drop_depth = 0
        self._figure_depth = 0

    @property
    def html(self) -> str:
        return "".join(self.parts)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        if self._drop_depth:
            if normalized_tag not in self.VOID_TAGS:
                self._drop_depth += 1
            return

        if should_drop_noise_container(normalized_tag, attrs, host=self.host):
            if normalized_tag not in self.VOID_TAGS:
                self._drop_depth = 1
            return

        if normalized_tag in {"img", "source"} and should_drop_decorative_media(
            attrs,
            host=self.host,
            inside_figure=self._figure_depth > 0,
        ):
            return

        if normalized_tag == "figure":
            self._figure_depth += 1

        self.parts.append(self._serialize_tag(normalized_tag, attrs, close=False))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        if self._drop_depth:
            return
        if should_drop_noise_container(normalized_tag, attrs, host=self.host):
            return
        if normalized_tag in {"img", "source"} and should_drop_decorative_media(
            attrs,
            host=self.host,
            inside_figure=self._figure_depth > 0,
        ):
            return
        self.parts.append(self._serialize_tag(normalized_tag, attrs, close=True))

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        if self._drop_depth:
            if normalized_tag not in self.VOID_TAGS:
                self._drop_depth -= 1
            return

        if normalized_tag == "figure" and self._figure_depth:
            self._figure_depth -= 1

        if normalized_tag in self.VOID_TAGS:
            return
        self.parts.append(f"</{normalized_tag}>")

    def handle_data(self, data: str) -> None:
        if self._drop_depth:
            return
        self.parts.append(data)

    def handle_entityref(self, name: str) -> None:
        if self._drop_depth:
            return
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self._drop_depth:
            return
        self.parts.append(f"&#{name};")

    @staticmethod
    def _serialize_tag(tag: str, attrs: list[tuple[str, str | None]], *, close: bool) -> str:
        serialized_attrs: list[str] = []
        for raw_name, raw_value in attrs:
            name = raw_name.lower()
            if raw_value is None:
                serialized_attrs.append(f" {name}")
            else:
                serialized_attrs.append(f' {name}="{escape(raw_value, quote=True)}"')
        suffix = " /" if close and tag in {"br", "hr"} else ""
        return f"<{tag}{''.join(serialized_attrs)}{suffix}>"


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


class RelativeUrlRewriter(HTMLParser):
    VOID_TAGS = {"br", "hr", "img"}
    URL_ATTRIBUTES = {"href", "src"}

    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=False)
        self.base_url = base_url
        self.parts: list[str] = []

    @property
    def html(self) -> str:
        return "".join(self.parts)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.parts.append(self._serialize_tag(tag, attrs, close=False))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.parts.append(self._serialize_tag(tag, attrs, close=True))

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self.VOID_TAGS:
            return
        self.parts.append(f"</{tag.lower()}>")

    def handle_data(self, data: str) -> None:
        self.parts.append(escape(data))

    def handle_entityref(self, name: str) -> None:
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.parts.append(f"&#{name};")

    def _serialize_tag(self, tag: str, attrs: list[tuple[str, str | None]], *, close: bool) -> str:
        serialized_attrs: list[str] = []
        for raw_name, raw_value in attrs:
            name = raw_name.lower()
            value = raw_value or ""
            if name in self.URL_ATTRIBUTES and value:
                value = urljoin(self.base_url, value)
            if value:
                serialized_attrs.append(f' {name}="{escape(value, quote=True)}"')
            else:
                serialized_attrs.append(f" {name}")

        tag_name = tag.lower()
        suffix = " /" if close and tag_name in self.VOID_TAGS else ""
        return f"<{tag_name}{''.join(serialized_attrs)}{suffix}>"


class MetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self._title_parts: list[str] = []
        self._inside_title = False

    @property
    def title(self) -> str | None:
        normalized = " ".join("".join(self._title_parts).split())
        return normalized or None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        if normalized_tag == "meta":
            attr_map = {name.lower(): (value or "").strip() for name, value in attrs if name}
            key = (attr_map.get("property") or attr_map.get("name") or attr_map.get("itemprop") or "").strip().lower()
            content = (attr_map.get("content") or "").strip()
            if key and content and key not in self.meta:
                self.meta[key] = content
            return
        if normalized_tag == "title":
            self._inside_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._inside_title = False

    def handle_data(self, data: str) -> None:
        if self._inside_title:
            self._title_parts.append(data)


@dataclass(slots=True)
class _ImageCandidate:
    url: str
    alt: str | None = None
    title: str | None = None


def serialize_image_candidate(candidate: _ImageCandidate) -> str:
    attrs = [f' src="{escape(candidate.url, quote=True)}"']
    if candidate.alt is not None:
        attrs.append(f' alt="{escape(candidate.alt, quote=True)}"')
    if candidate.title:
        attrs.append(f' title="{escape(candidate.title, quote=True)}"')
    return f"<img{''.join(attrs)}>"


@dataclass(slots=True)
class _PictureContext:
    source_candidates: list[_ImageCandidate]
    image_candidates: list[_ImageCandidate]

    def pick(self) -> _ImageCandidate | None:
        if self.source_candidates:
            selected = self.source_candidates[0]
            return _ImageCandidate(
                url=selected.url,
                alt=first_text(candidate.alt for candidate in self.image_candidates) or selected.alt,
                title=first_text(candidate.title for candidate in self.image_candidates) or selected.title,
            )
        if self.image_candidates:
            return self.image_candidates[0]
        return None


class RichMediaNormalizer(HTMLParser):
    VOID_TAGS = {"br", "hr", "img", "source"}

    def __init__(self, base_url: str | None) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.parts: list[str] = []
        self._picture_stack: list[_PictureContext] = []
        self._noscript_stack: list[list[_ImageCandidate]] = []
        self._last_emitted_image_url: str | None = None

    @property
    def html(self) -> str:
        return "".join(self.parts)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        if normalized_tag == "noscript":
            self._noscript_stack.append([])
            return
        if normalized_tag == "picture":
            self._picture_stack.append(_PictureContext(source_candidates=[], image_candidates=[]))
            return
        if normalized_tag == "source":
            if self._picture_stack:
                self._record_picture_source(attrs)
            return
        if normalized_tag == "img":
            image_candidate = self._build_image_candidate(attrs)
            if image_candidate is None:
                return
            if self._noscript_stack:
                self._noscript_stack[-1].append(image_candidate)
                return
            if self._picture_stack:
                self._picture_stack[-1].image_candidates.append(image_candidate)
                return
            self._append_image_candidate(image_candidate)
            return

        if self._picture_stack or self._noscript_stack:
            return

        self.parts.append(self._serialize_passthrough_starttag(normalized_tag, attrs))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        if normalized_tag == "noscript":
            return
        if normalized_tag == "source":
            if self._picture_stack:
                self._record_picture_source(attrs)
            return
        if normalized_tag == "img":
            image_candidate = self._build_image_candidate(attrs)
            if image_candidate is None:
                return
            if self._noscript_stack:
                self._noscript_stack[-1].append(image_candidate)
                return
            if self._picture_stack:
                self._picture_stack[-1].image_candidates.append(image_candidate)
                return
            self._append_image_candidate(image_candidate)
            return
        if normalized_tag == "picture":
            self.handle_starttag(tag, attrs)
            self.handle_endtag(tag)
            return

        if self._picture_stack or self._noscript_stack:
            return

        self.parts.append(self._serialize_passthrough_starttag(normalized_tag, attrs, self_closing=True))

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        if normalized_tag == "noscript":
            if not self._noscript_stack:
                return
            candidates = self._noscript_stack.pop()
            if self._picture_stack:
                self._picture_stack[-1].image_candidates.extend(candidates)
                return
            if candidates and not self._previous_non_whitespace_part_is_image():
                self._append_image_candidate(candidates[0], dedupe=True)
            return
        if normalized_tag == "picture":
            if not self._picture_stack:
                return
            picture = self._picture_stack.pop()
            selected = picture.pick()
            if selected is None:
                return
            if self._noscript_stack:
                self._noscript_stack[-1].append(selected)
                return
            if self._picture_stack:
                self._picture_stack[-1].image_candidates.append(selected)
            else:
                self._append_image_candidate(selected)
            return

        if self._picture_stack or self._noscript_stack:
            return

        if normalized_tag in self.VOID_TAGS:
            return
        self.parts.append(f"</{normalized_tag}>")

    def handle_data(self, data: str) -> None:
        if self._picture_stack or self._noscript_stack:
            return
        self.parts.append(escape(data))

    def handle_entityref(self, name: str) -> None:
        if self._picture_stack or self._noscript_stack:
            return
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self._picture_stack or self._noscript_stack:
            return
        self.parts.append(f"&#{name};")

    def _record_picture_source(self, attrs: list[tuple[str, str | None]]) -> None:
        if not self._picture_stack:
            return
        source_url = self._pick_media_url(attrs)
        if not source_url:
            return
        self._picture_stack[-1].source_candidates.append(
            _ImageCandidate(
                url=source_url,
                alt=first_attr(attrs, "alt"),
                title=first_attr(attrs, "title"),
            )
        )

    def _build_image_candidate(self, attrs: list[tuple[str, str | None]]) -> _ImageCandidate | None:
        source_url = self._pick_media_url(attrs)
        if not source_url:
            return None
        return _ImageCandidate(
            url=source_url,
            alt=first_attr(attrs, "alt"),
            title=first_attr(attrs, "title"),
        )

    def _pick_media_url(self, attrs: list[tuple[str, str | None]]) -> str | None:
        values = dict((name.lower(), (value or "").strip()) for name, value in attrs if name)
        candidate = self._select_image_url(values)
        if candidate:
            return candidate

        for srcset_key in ("srcset", "data-srcset"):
            srcset_value = values.get(srcset_key)
            if not srcset_value:
                continue
            candidate = first_srcset_url(srcset_value, base_url=self.base_url)
            if candidate:
                return candidate

        return None

    def _select_image_url(self, attrs: dict[str, str]) -> str | None:
        for attr_name in IMAGE_URL_ATTRIBUTES:
            raw_value = attrs.get(attr_name)
            if not raw_value:
                continue
            if attr_name == "src" and is_placeholder_image_url(raw_value):
                continue
            resolved = resolve_media_url(raw_value, base_url=self.base_url)
            if resolved:
                return resolved
        return None

    def _serialize_img(self, candidate: _ImageCandidate) -> str:
        return serialize_image_candidate(candidate)

    def _append_image_candidate(self, candidate: _ImageCandidate, *, dedupe: bool = False) -> None:
        if dedupe and candidate.url == self._last_emitted_image_url:
            return
        self.parts.append(self._serialize_img(candidate))
        self._last_emitted_image_url = candidate.url

    def _previous_non_whitespace_part_is_image(self) -> bool:
        for part in reversed(self.parts):
            if not part.strip():
                continue
            return part.startswith("<img ")
        return False

    @staticmethod
    def _serialize_passthrough_starttag(tag: str, attrs: list[tuple[str, str | None]], *, self_closing: bool = False) -> str:
        serialized_attrs = []
        for raw_name, raw_value in attrs:
            name = raw_name.lower()
            if raw_value is None:
                serialized_attrs.append(f" {name}")
            else:
                serialized_attrs.append(f' {name}="{escape(raw_value, quote=True)}"')
        suffix = " /" if self_closing and tag in {"br", "hr"} else ""
        return f"<{tag}{''.join(serialized_attrs)}{suffix}>"


def first_attr(attrs: list[tuple[str, str | None]], name: str) -> str | None:
    for raw_name, raw_value in attrs:
        if raw_name.lower() != name:
            continue
        cleaned = (raw_value or "").strip()
        if cleaned:
            return cleaned
    return None


def first_text(values: Iterable[str | None]) -> str | None:
    for value in values:
        if value and value.strip():
            return value.strip()
    return None


def first_srcset_url(value: str, *, base_url: str | None) -> str | None:
    best_url: str | None = None
    best_weight = -1.0

    for candidate in value.split(","):
        normalized = candidate.strip()
        if not normalized:
            continue
        parts = normalized.split()
        if not parts:
            continue
        resolved = resolve_media_url(parts[0], base_url=base_url)
        if not resolved:
            continue
        descriptor = parts[1].strip().lower() if len(parts) > 1 else ""
        weight = 0.0
        if descriptor.endswith("w"):
            try:
                weight = float(descriptor[:-1])
            except ValueError:
                weight = 0.0
        elif descriptor.endswith("x"):
            try:
                weight = float(descriptor[:-1]) * 1000.0
            except ValueError:
                weight = 0.0
        if weight >= best_weight:
            best_url = resolved
            best_weight = weight

    return best_url


def is_placeholder_image_url(value: str) -> bool:
    lowered = value.strip().casefold()
    if not lowered:
        return True
    if lowered.startswith("data:"):
        return True
    return any(marker in lowered for marker in PLACEHOLDER_IMAGE_MARKERS)


def resolve_media_url(value: str, *, base_url: str | None) -> str | None:
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.startswith("data:"):
        return None

    parsed = urlparse(cleaned)
    if parsed.scheme:
        if parsed.scheme.lower() not in {"http", "https"}:
            return None
        return cleaned
    if base_url is None:
        return cleaned
    return urljoin(base_url, cleaned)


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
