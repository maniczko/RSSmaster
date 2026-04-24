from __future__ import annotations

import logging
import sqlite3
from datetime import UTC, datetime
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import Literal
from urllib.parse import urljoin, urlsplit, urlunsplit
from xml.etree import ElementTree

import httpx

from app.config import Settings
from app.errors import ApiError

from .repository import ChannelRepository

logger = logging.getLogger("rssmaster.channels")

FEED_MIME_TYPES = {
    "application/atom+xml",
    "application/rdf+xml",
    "application/rss+xml",
    "application/xml",
    "text/xml",
}
HEURISTIC_PATHS = ("/feed", "/rss", "/atom.xml")


@dataclass(slots=True, frozen=True)
class FeedMetadata:
    title: str
    site_url: str | None
    feed_url: str
    description: str | None
    language: str | None
    estimated_items_per_week: int | None
    sample_items: list["FeedPreviewItem"]


@dataclass(slots=True, frozen=True)
class FeedPreviewItem:
    title: str
    url: str
    published_at: str | None
    image_url: str | None


@dataclass(slots=True, frozen=True)
class FeedCandidate:
    url: str
    score: int


@dataclass(slots=True, frozen=True)
class DiscoveryOutcome:
    mode: Literal["direct", "head_metadata", "heuristic"]
    feed: FeedMetadata
    candidates: list[str]


@dataclass(slots=True, frozen=True)
class DiscoveryPreviewOutcome:
    status: Literal["resolved", "multiple_candidates"]
    mode: Literal["direct", "head_metadata", "heuristic"]
    feed: FeedMetadata | None
    feeds: list[FeedMetadata]
    candidate_urls: list[str]


class FeedLinkParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self._inside_head = False
        self._candidates: dict[str, int] = {}

    @property
    def candidates(self) -> list[FeedCandidate]:
        return [FeedCandidate(url=url, score=score) for url, score in self._candidates.items()]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized_tag = tag.lower()
        if normalized_tag == "head":
            self._inside_head = True
            return
        if not self._inside_head or normalized_tag != "link":
            return

        attributes = {key.lower(): value for key, value in attrs if key}
        href = attributes.get("href")
        if not href:
            return

        rel_tokens = {token for token in (attributes.get("rel") or "").lower().split() if token}
        link_type = (attributes.get("type") or "").split(";", maxsplit=1)[0].strip().lower()
        try:
            absolute_url = normalize_url(urljoin(self.base_url, href))
        except ApiError:
            return

        score = 0
        if "alternate" in rel_tokens:
            score += 5
        if link_type in {"application/rss+xml", "application/atom+xml"}:
            score += 10
        elif link_type in FEED_MIME_TYPES:
            score += 6
        elif any(token in absolute_url.lower() for token in ("feed", "rss", "atom")):
            score += 3
        else:
            return

        if score > self._candidates.get(absolute_url, -1):
            self._candidates[absolute_url] = score

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "head":
            self._inside_head = False


class FirstImageParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.image_url: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self.image_url is not None or tag.lower() != "img":
            return

        attributes = {key.lower(): value for key, value in attrs if key}
        src = attributes.get("src")
        if not src:
            return

        normalized = try_normalize_url(urljoin(self.base_url, src))
        if normalized:
            self.image_url = normalized


class ChannelDiscoveryService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def discover(self, input_url: str) -> DiscoveryOutcome:
        preview = self.preview(input_url)
        if preview.status == "multiple_candidates" or preview.feed is None:
            raise ApiError(
                status_code=422,
                code="discovery_ambiguous",
                message="Multiple valid feeds were discovered. Choose a direct feed URL to continue.",
                details={
                    "candidates": [feed.feed_url for feed in preview.feeds],
                    "mode": preview.mode,
                    "preview_failure_kind": "discovery",
                },
                retryable=False,
            )

        return DiscoveryOutcome(
            mode=preview.mode,
            feed=preview.feed,
            candidates=preview.candidate_urls,
        )

    def preview(self, input_url: str) -> DiscoveryPreviewOutcome:
        normalized_input_url = prepare_input_url(input_url)
        initial_resource = self._fetch(normalized_input_url, strict=True)
        initial_feed = self._parse_feed(initial_resource["body"], initial_resource["final_url"])

        if initial_feed is not None:
            logger.info(
                "channel_discovery resolved direct feed: input_url=%s resolved_feed_url=%s",
                normalized_input_url,
                initial_feed.feed_url,
            )
            return DiscoveryPreviewOutcome(
                status="resolved",
                mode="direct",
                feed=initial_feed,
                feeds=[initial_feed],
                candidate_urls=[initial_feed.feed_url],
            )

        body = initial_resource["body"]
        candidate_urls: list[str] = []
        if looks_like_html(body, initial_resource["content_type"]):
            parser = FeedLinkParser(initial_resource["final_url"])
            parser.feed(body)
            head_candidates = sorted(parser.candidates, key=lambda candidate: (-candidate.score, candidate.url))
            if head_candidates:
                head_result = self._build_preview_outcome(
                    head_candidates,
                    source_mode="head_metadata",
                    input_url=normalized_input_url,
                )
                if head_result is not None:
                    return head_result
                candidate_urls.extend(candidate.url for candidate in head_candidates)

        heuristic_candidates = [
            FeedCandidate(url=normalize_url(urljoin(site_origin(initial_resource["final_url"]), path)), score=1)
            for path in HEURISTIC_PATHS
        ]
        heuristic_result = self._build_preview_outcome(
            heuristic_candidates,
            source_mode="heuristic",
            input_url=normalized_input_url,
        )
        if heuristic_result is not None:
            return heuristic_result

        raise ApiError(
            status_code=422,
            code="discovery_failed",
            message="Could not find a valid RSS or Atom feed for the provided URL.",
            details={
                "attempted_urls": [normalized_input_url, *candidate_urls, *(candidate.url for candidate in heuristic_candidates)],
                "preview_failure_kind": "discovery",
            },
            retryable=False,
        )

    def _build_preview_outcome(
        self,
        candidates: list[FeedCandidate],
        *,
        source_mode: Literal["head_metadata", "heuristic"],
        input_url: str,
    ) -> DiscoveryPreviewOutcome | None:
        ordered_feeds = self._collect_candidate_feeds(candidates)
        ordered_candidates = sorted({candidate.url for candidate in candidates})

        if len(ordered_feeds) == 1:
            feed = ordered_feeds[0]
            logger.info(
                "channel_discovery resolved %s feed: input_url=%s resolved_feed_url=%s candidates=%s",
                source_mode,
                input_url,
                feed.feed_url,
                ordered_candidates,
            )
            return DiscoveryPreviewOutcome(
                status="resolved",
                mode=source_mode,
                feed=feed,
                feeds=ordered_feeds,
                candidate_urls=ordered_candidates,
            )

        if len(ordered_feeds) > 1:
            logger.info(
                "channel_discovery ambiguous %s feed: input_url=%s candidates=%s",
                source_mode,
                input_url,
                [feed.feed_url for feed in ordered_feeds],
            )
            return DiscoveryPreviewOutcome(
                status="multiple_candidates",
                mode=source_mode,
                feed=None,
                feeds=ordered_feeds,
                candidate_urls=[feed.feed_url for feed in ordered_feeds],
            )

        return None

    def _collect_candidate_feeds(self, candidates: list[FeedCandidate]) -> list[FeedMetadata]:
        valid_feeds: list[FeedMetadata] = []
        for candidate in candidates:
            resource = self._fetch(candidate.url, strict=False)
            if resource is None:
                continue

            feed = self._parse_feed(resource["body"], resource["final_url"])
            if feed is None:
                continue
            valid_feeds.append(feed)

        deduped_feeds = {feed.feed_url: feed for feed in valid_feeds}
        return [deduped_feeds[key] for key in sorted(deduped_feeds)]

    def _fetch(self, url: str, *, strict: bool) -> dict[str, str] | None:
        try:
            with httpx.Client(
                follow_redirects=True,
                headers={"User-Agent": "rssmaster/0.1.0 (+local-first)"},
                timeout=self.settings.fetch_timeout_seconds,
            ) as client:
                response = client.get(url)
        except httpx.RequestError as error:
            if strict:
                raise ApiError(
                    status_code=503,
                    code="source_unreachable",
                    message="Could not fetch the provided URL.",
                    details={
                        "input_url": url,
                        "reason": str(error),
                        "preview_failure_kind": "transport",
                    },
                    retryable=True,
                ) from error
            return None

        if response.status_code >= 400:
            if strict:
                raise ApiError(
                    status_code=422,
                    code="source_unreachable",
                    message="The provided URL returned an error response.",
                    details={
                        "input_url": url,
                        "status_code": response.status_code,
                        "preview_failure_kind": "discovery",
                    },
                    retryable=False,
                )
            return None

        return {
            "body": response.text,
            "content_type": response.headers.get("content-type", "").lower(),
            "final_url": normalize_url(str(response.url)),
        }

    @staticmethod
    def _parse_feed(content: str, resolved_url: str) -> FeedMetadata | None:
        stripped = content.lstrip()
        if not stripped.startswith("<"):
            return None

        try:
            root = ElementTree.fromstring(content)
        except ElementTree.ParseError:
            return None

        root_name = local_name(root.tag)
        if root_name == "rss":
            channel = next((child for child in root if local_name(child.tag) == "channel"), None)
            if channel is None:
                return None
            title = child_text(channel, {"title"})
            site_url = child_text(channel, {"link"})
            description = child_text(channel, {"description"})
            language = child_text(channel, {"language"})
            entry_nodes = [child for child in channel if local_name(child.tag) == "item"]
        elif root_name == "feed":
            title = child_text(root, {"title"})
            description = child_text(root, {"subtitle"})
            language = root.attrib.get("{http://www.w3.org/XML/1998/namespace}lang")
            site_url = None
            for child in root:
                if local_name(child.tag) != "link":
                    continue
                rel = (child.attrib.get("rel") or "alternate").lower()
                href = child.attrib.get("href")
                if href and rel in {"alternate", ""}:
                    site_url = urljoin(resolved_url, href)
                    break
            entry_nodes = [child for child in root if local_name(child.tag) == "entry"]
        elif root_name == "rdf":
            channel = next((child for child in root if local_name(child.tag) == "channel"), None)
            if channel is None:
                return None
            title = child_text(channel, {"title"})
            site_url = child_text(channel, {"link"})
            description = child_text(channel, {"description"})
            language = child_text(channel, {"language"})
            entry_nodes = [child for child in root if local_name(child.tag) == "item"]
        else:
            return None

        if not title:
            title = urlsplit(resolved_url).netloc or resolved_url

        normalized_site_url = normalize_url(urljoin(resolved_url, site_url)) if site_url else None
        feed_url = normalize_url(resolved_url)
        parsed_entries = [build_feed_preview_item(entry, base_url=normalized_site_url or feed_url, fallback_url=feed_url) for entry in entry_nodes[:12]]
        sample_items = [entry for entry in parsed_entries[:3] if entry is not None]
        estimated_items_per_week = estimate_items_per_week(parsed_entries)
        return FeedMetadata(
            title=title,
            site_url=normalized_site_url,
            feed_url=feed_url,
            description=description,
            language=language,
            estimated_items_per_week=estimated_items_per_week,
            sample_items=sample_items,
        )


class ChannelService:
    def __init__(self, settings: Settings, repository: ChannelRepository) -> None:
        self.settings = settings
        self.repository = repository
        self.discovery = ChannelDiscoveryService(settings)

    def add_channel(self, *, input_url: str, category: str | None) -> tuple[dict[str, object], DiscoveryOutcome]:
        discovery = self.discovery.discover(input_url)
        existing_channel = self.repository.get_by_normalized_feed_url(discovery.feed.feed_url)
        if existing_channel is not None:
            raise ApiError(
                status_code=409,
                code="duplicate_channel",
                message="This feed is already subscribed.",
                details={
                    "channel_id": existing_channel["id"],
                    "feed_url": existing_channel["feed_url"],
                },
                retryable=False,
            )

        try:
            channel = self.repository.create_channel(
                title=discovery.feed.title,
                site_url=discovery.feed.site_url,
                feed_url=discovery.feed.feed_url,
                normalized_feed_url=discovery.feed.feed_url,
                description=discovery.feed.description,
                language=discovery.feed.language,
                category=category,
            )
        except sqlite3.IntegrityError as error:
            raise ApiError(
                status_code=409,
                code="duplicate_channel",
                message="This feed is already subscribed.",
                details={"feed_url": discovery.feed.feed_url},
                retryable=False,
            ) from error

        return channel, discovery

    def preview_channel(self, *, input_url: str) -> dict[str, object]:
        preview = self.discovery.preview(input_url)
        normalized_input_url = prepare_input_url(input_url)
        existing_channels = self.repository.list_by_normalized_feed_urls([feed.feed_url for feed in preview.feeds])

        candidates = [
            build_preview_candidate(feed, existing_channels.get(feed.feed_url))
            for feed in preview.feeds
        ]

        discovery = {
            "mode": preview.mode,
            "resolved_feed_url": preview.feed.feed_url if preview.feed is not None else None,
            "candidates": preview.candidate_urls,
        }

        if preview.status == "multiple_candidates" or preview.feed is None:
            return {
                "status": "multiple_candidates",
                "input_url": normalized_input_url,
                "discovery": discovery,
                "feed": None,
                "candidates": candidates,
                "existing_channel": None,
            }

        existing_channel = existing_channels.get(preview.feed.feed_url)
        return {
            "status": "already_subscribed" if existing_channel is not None else "ready",
            "input_url": normalized_input_url,
            "discovery": discovery,
            "feed": build_preview_candidate(preview.feed, existing_channel),
            "candidates": candidates,
            "existing_channel": existing_channel,
        }

    def get_channel_health(self, channel_id: str) -> dict[str, object]:
        channel = self.repository.get_by_id(channel_id)
        if channel is None:
            raise ApiError(
                status_code=404,
                code="channel_not_found",
                message="Channel was not found.",
                details={"channel_id": channel_id},
                retryable=False,
            )

        health = channel.get("health")
        if not isinstance(health, dict):
            raise RuntimeError("Channel health payload is missing.")

        return {
            "channel_id": channel_id,
            "health": health,
        }

    def update_channel(
        self,
        channel_id: str,
        *,
        category: str | None,
        update_category: bool,
        state: str | None,
        update_state: bool,
    ) -> dict[str, object]:
        existing_channel = self.repository.get_by_id(channel_id)
        if existing_channel is None:
            raise ApiError(
                status_code=404,
                code="channel_not_found",
                message="Channel was not found.",
                details={"channel_id": channel_id},
                retryable=False,
            )
        if not update_category and not update_state:
            raise ApiError(
                status_code=400,
                code="no_channel_updates",
                message="At least one channel field must be updated.",
                details={"channel_id": channel_id},
                retryable=False,
            )

        return self.repository.update_channel(
            channel_id,
            category=category,
            update_category=update_category,
            state=state,
            update_state=update_state,
        )

    def archive_channel(self, channel_id: str) -> dict[str, object]:
        existing_channel = self.repository.get_by_id(channel_id)
        if existing_channel is None:
            raise ApiError(
                status_code=404,
                code="channel_not_found",
                message="Channel was not found.",
                details={"channel_id": channel_id},
                retryable=False,
            )
        return self.repository.archive_channel(channel_id)


def prepare_input_url(raw_url: str) -> str:
    candidate = raw_url.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    return normalize_url(candidate)


def normalize_url(raw_url: str) -> str:
    parsed = urlsplit(raw_url)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ApiError(
            status_code=400,
            code="invalid_url",
            message="Only absolute http(s) URLs are supported.",
            details={"input_url": raw_url},
            retryable=False,
        )

    hostname = parsed.hostname.lower() if parsed.hostname else ""
    port = parsed.port
    default_port = (parsed.scheme.lower() == "http" and port == 80) or (parsed.scheme.lower() == "https" and port == 443)
    netloc = hostname if port is None or default_port else f"{hostname}:{port}"
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return urlunsplit((parsed.scheme.lower(), netloc, path, parsed.query, ""))


def site_origin(url: str) -> str:
    parsed = urlsplit(url)
    return urlunsplit((parsed.scheme, parsed.netloc, "/", "", ""))


def looks_like_html(content: str, content_type: str) -> bool:
    if "text/html" in content_type:
        return True
    lowered = content.lstrip().lower()
    return lowered.startswith("<!doctype html") or lowered.startswith("<html")


def local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", maxsplit=1)[-1].lower()
    if ":" in tag:
        return tag.rsplit(":", maxsplit=1)[-1].lower()
    return tag.lower()


def child_text(element: ElementTree.Element, names: set[str]) -> str | None:
    for child in element:
        if local_name(child.tag) in names and child.text:
            cleaned = child.text.strip()
            if cleaned:
                return cleaned
    return None


def build_feed_preview_item(
    entry: ElementTree.Element,
    *,
    base_url: str,
    fallback_url: str,
) -> FeedPreviewItem | None:
    title = child_text(entry, {"title"}) or "Bez tytulu"
    entry_url = resolve_entry_url(entry, base_url=base_url) or fallback_url
    published_at = resolve_entry_published_at(entry)
    image_url = resolve_entry_image_url(entry, base_url=base_url)

    normalized_url = try_normalize_url(entry_url) or fallback_url
    return FeedPreviewItem(
        title=title,
        url=normalized_url,
        published_at=published_at,
        image_url=image_url,
    )


def resolve_entry_url(entry: ElementTree.Element, *, base_url: str) -> str | None:
    if local_name(entry.tag) == "entry":
        for child in entry:
            if local_name(child.tag) != "link":
                continue
            rel = (child.attrib.get("rel") or "alternate").lower()
            href = child.attrib.get("href")
            if href and rel in {"alternate", ""}:
                return urljoin(base_url, href)
        for child in entry:
            if local_name(child.tag) == "id" and child.text:
                return child.text.strip()

    link = child_text(entry, {"link"})
    if link:
        return urljoin(base_url, link)

    guid = child_text(entry, {"guid"})
    if guid and "://" in guid:
        return guid.strip()

    return None


def resolve_entry_published_at(entry: ElementTree.Element) -> str | None:
    published = child_text(entry, {"published", "updated", "pubdate", "date"})
    if not published:
        return None
    return parse_feed_timestamp(published)


def resolve_entry_image_url(entry: ElementTree.Element, *, base_url: str) -> str | None:
    for node in entry.iter():
        node_name = local_name(node.tag)
        url_value = node.attrib.get("url")
        if url_value and node_name == "thumbnail":
            normalized = try_normalize_url(urljoin(base_url, url_value))
            if normalized:
                return normalized

        if url_value and node_name == "content":
            media_type = (node.attrib.get("type") or "").lower()
            if media_type.startswith("image/"):
                normalized = try_normalize_url(urljoin(base_url, url_value))
                if normalized:
                    return normalized

        if url_value and node_name == "enclosure":
            media_type = (node.attrib.get("type") or "").lower()
            if media_type.startswith("image/"):
                normalized = try_normalize_url(urljoin(base_url, url_value))
                if normalized:
                    return normalized

    for node in entry.iter():
        node_name = local_name(node.tag)
        if node_name not in {"description", "summary", "content", "encoded"} or not node.text:
            continue
        parser = FirstImageParser(base_url)
        try:
            parser.feed(node.text)
        except Exception:
            continue
        if parser.image_url:
            return parser.image_url

    return None


def estimate_items_per_week(entries: list[FeedPreviewItem | None]) -> int | None:
    timestamps = [parse_iso_timestamp(entry.published_at) for entry in entries if entry and entry.published_at]
    dated_entries = [timestamp for timestamp in timestamps if timestamp is not None]
    unique_entries = sorted(set(dated_entries))
    if len(unique_entries) < 2:
        return None

    newest = unique_entries[-1]
    oldest = unique_entries[0]
    span_days = max((newest - oldest).total_seconds() / 86400, 1)
    estimate = round((len(unique_entries) / span_days) * 7)
    return max(1, min(estimate, 999))


def parse_feed_timestamp(value: str) -> str | None:
    candidate = value.strip()
    if not candidate:
        return None

    normalized = candidate.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            parsed = parsedate_to_datetime(candidate)
        except (TypeError, ValueError, IndexError):
            return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse_iso_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def try_normalize_url(raw_url: str) -> str | None:
    try:
        return normalize_url(raw_url)
    except ApiError:
        return None


def build_preview_candidate(feed: FeedMetadata, existing_channel: dict[str, object] | None) -> dict[str, object]:
    return {
        "feed_url": feed.feed_url,
        "title": feed.title,
        "site_url": feed.site_url,
        "description": feed.description,
        "language": feed.language,
        "estimated_items_per_week": feed.estimated_items_per_week,
        "sample_items": [
            {
                "title": item.title,
                "url": item.url,
                "published_at": item.published_at,
                "image_url": item.image_url,
            }
            for item in feed.sample_items
        ],
        "already_subscribed": existing_channel is not None,
        "existing_channel_id": str(existing_channel["id"]) if existing_channel is not None else None,
    }
