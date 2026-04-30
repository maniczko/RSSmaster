from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
import hashlib
import logging
import re
from typing import Any
from urllib.parse import urljoin
from xml.etree import ElementTree

import httpx

from app.config import Settings
from app.extract.repository import ExtractionRepository
from app.extract.service import ExtractionService
from app.errors import ApiError
from app.channels.service import child_text, local_name, normalize_url

from .models import SyncRunMode, SyncRunTriggerKind
from .repository import SyncRepository

logger = logging.getLogger("rssmaster.sync")

TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


@dataclass(slots=True, frozen=True)
class ParsedFeedItem:
    guid: str | None
    source_url: str
    normalized_source_url: str
    title: str
    author: str | None
    excerpt: str | None
    raw_html: str | None
    published_at: str | None
    raw_fetched_at: str
    dedupe_key: str
    content_hash: str | None


@dataclass(slots=True, frozen=True)
class ChannelSyncResult:
    items_seen: int
    items_created: int
    items_skipped: int
    items_extracted: int
    items_extraction_failed: int


class SyncService:
    def __init__(self, settings: Settings, repository: SyncRepository) -> None:
        self.settings = settings
        self.repository = repository

    def list_runs(self, *, limit: int) -> list[dict[str, object]]:
        return self.repository.list_runs(limit=limit)

    def get_run(self, run_id: str) -> dict[str, object]:
        run = self.repository.get_run(run_id)
        if run is None:
            raise ApiError(
                status_code=404,
                code="sync_run_not_found",
                message="Sync run was not found.",
                details={"run_id": run_id},
                retryable=False,
            )
        return run

    def create_run(
        self,
        *,
        channel_ids: list[str] | None,
        mode: SyncRunMode,
        trigger_kind: SyncRunTriggerKind | None = None,
    ) -> dict[str, object]:
        targets = self.repository.list_target_channels(channel_ids=channel_ids, mode=mode)
        if not targets:
            raise ApiError(
                status_code=400,
                code="no_sync_targets",
                message="No eligible channels are available for sync.",
                details={"channel_ids": channel_ids or []},
                retryable=False,
            )

        scope = build_run_scope(channel_ids=channel_ids, targets=targets, mode=mode)
        return self.repository.create_run(
            scope=scope,
            trigger_kind=resolve_trigger_kind(mode=mode, trigger_kind=trigger_kind),
            mode=mode,
        )

    def create_manual_run(self, *, channel_ids: list[str] | None) -> dict[str, object]:
        return self.create_run(channel_ids=channel_ids, mode="manual", trigger_kind="manual")

    def execute_run(self, run_id: str) -> None:
        run = self.repository.get_run(run_id)
        if run is None:
            logger.warning("sync_run_missing run_id=%s", run_id)
            return

        mode = resolve_run_mode(run.get("scope"))
        channel_ids = [
            channel_id
            for channel_id in run["scope"].get("channel_ids", [])
            if isinstance(channel_id, str) and channel_id
        ]
        targets = self.repository.list_target_channels(channel_ids=channel_ids, mode=mode)
        total_count = len(targets)
        started_at = utc_now()
        self.repository.mark_run_running(run_id, started_at=started_at, total_count=total_count)

        success_count = 0
        failure_count = 0
        items_seen = 0
        items_created = 0
        items_skipped = 0
        errors: list[dict[str, object]] = []

        for channel in targets:
            fetched_at = utc_now()
            try:
                result = self._sync_channel(channel)
                self.repository.record_channel_success(channel["id"], fetched_at=fetched_at)
                success_count += 1
                items_seen += result.items_seen
                items_created += result.items_created
                items_skipped += result.items_skipped
            except ApiError as error:
                failure_count += 1
                self.repository.record_channel_failure(
                    channel["id"],
                    fetched_at=fetched_at,
                    error_code=error.code,
                    error_message=error.message,
                )
                errors.append(
                    {
                        "channel_id": channel["id"],
                        "channel_title": channel["title"],
                        "code": error.code,
                        "message": error.message,
                    }
                )
            except Exception as error:  # pragma: no cover - defensive safety net
                logger.exception("Unexpected sync failure", exc_info=error)
                failure_count += 1
                self.repository.record_channel_failure(
                    channel["id"],
                    fetched_at=fetched_at,
                    error_code="sync_internal_error",
                    error_message="Unexpected sync failure.",
                )
                errors.append(
                    {
                        "channel_id": channel["id"],
                        "channel_title": channel["title"],
                        "code": "sync_internal_error",
                        "message": "Unexpected sync failure.",
                    }
                )

            self.repository.update_run_progress(
                run_id,
                total_count=total_count,
                success_count=success_count,
                failure_count=failure_count,
                items_seen=items_seen,
                items_created=items_created,
                items_skipped=items_skipped,
                errors=errors,
            )

        completed_at = utc_now()
        duration_ms = max(0, int((parse_utc(completed_at) - parse_utc(started_at)).total_seconds() * 1000))

        if failure_count and success_count:
            status = "partial_success"
            error_code = "sync_partial_failure"
            error_message = f"{failure_count} of {total_count} channel(s) failed during sync."
        elif failure_count:
            status = "failed"
            error_code = "sync_failed"
            error_message = "All requested channels failed during sync."
        else:
            status = "completed"
            error_code = None
            error_message = None

        self.repository.complete_run(
            run_id,
            status=status,
            completed_at=completed_at,
            duration_ms=duration_ms,
            total_count=total_count,
            success_count=success_count,
            failure_count=failure_count,
            items_seen=items_seen,
            items_created=items_created,
            items_skipped=items_skipped,
            errors=errors,
            error_code=error_code,
            error_message=error_message,
        )

    def _sync_channel(self, channel: dict[str, object]) -> ChannelSyncResult:
        with httpx.Client(
            follow_redirects=True,
            headers={"User-Agent": "rssmaster/0.1.0 (+local-first)"},
            timeout=self.settings.fetch_timeout_seconds,
        ) as client:
            try:
                response = client.get(str(channel["feed_url"]))
            except httpx.RequestError as error:
                raise ApiError(
                    status_code=503,
                    code="sync_source_unreachable",
                    message=f"Could not fetch feed for {channel['title']}.",
                    details={"feed_url": channel["feed_url"], "reason": str(error)},
                    retryable=True,
                ) from error

        if response.status_code >= 400:
            raise ApiError(
                status_code=503,
                code="sync_source_unreachable",
                message=f"Feed for {channel['title']} returned HTTP {response.status_code}.",
                details={"feed_url": channel["feed_url"], "status_code": response.status_code},
                retryable=response.status_code >= 500,
            )

        fetched_at = utc_now()
        entries, skipped = self._parse_entries(
            content=response.text,
            resolved_url=normalize_url(str(response.url)),
            channel_id=str(channel["id"]),
            fetched_at=fetched_at,
        )
        created = self.repository.insert_items(
            str(channel["id"]),
            entries=[entry_to_record(entry) for entry in entries],
        )
        extraction_summary = self._extract_pending_items(
            channel_id=str(channel["id"]),
            entries=entries,
        )

        logger.info(
            "sync_channel channel_id=%s title=%s items_seen=%s items_created=%s items_skipped=%s items_extracted=%s items_extraction_failed=%s",
            channel["id"],
            channel["title"],
            len(entries),
            created,
            skipped,
            extraction_summary.completed if extraction_summary else 0,
            extraction_summary.failed if extraction_summary else 0,
        )

        return ChannelSyncResult(
            items_seen=len(entries),
            items_created=created,
            items_skipped=skipped,
            items_extracted=extraction_summary.completed if extraction_summary else 0,
            items_extraction_failed=extraction_summary.failed if extraction_summary else 0,
        )

    def _parse_entries(
        self,
        *,
        content: str,
        resolved_url: str,
        channel_id: str,
        fetched_at: str,
    ) -> tuple[list[ParsedFeedItem], int]:
        try:
            root = ElementTree.fromstring(content)
        except ElementTree.ParseError as error:
            raise ApiError(
                status_code=422,
                code="sync_feed_invalid",
                message="Feed response could not be parsed as RSS or Atom.",
                details={"feed_url": resolved_url},
                retryable=False,
            ) from error

        root_name = local_name(root.tag)
        if root_name == "rss":
            channel = next((child for child in root if local_name(child.tag) == "channel"), None)
            if channel is None:
                raise ApiError(
                    status_code=422,
                    code="sync_feed_invalid",
                    message="RSS feed is missing a channel element.",
                    details={"feed_url": resolved_url},
                    retryable=False,
                )
            items = [child for child in channel if local_name(child.tag) == "item"]
            return self._parse_rss_items(items=items, resolved_url=resolved_url, channel_id=channel_id, fetched_at=fetched_at)

        if root_name == "feed":
            items = [child for child in root if local_name(child.tag) == "entry"]
            return self._parse_atom_items(items=items, resolved_url=resolved_url, channel_id=channel_id, fetched_at=fetched_at)

        if root_name == "rdf":
            items = [child for child in root if local_name(child.tag) == "item"]
            return self._parse_rss_items(items=items, resolved_url=resolved_url, channel_id=channel_id, fetched_at=fetched_at)

        raise ApiError(
            status_code=422,
            code="sync_feed_invalid",
            message="Feed response is not a supported RSS or Atom document.",
            details={"feed_url": resolved_url},
            retryable=False,
        )

    def _parse_rss_items(
        self,
        *,
        items: list[ElementTree.Element],
        resolved_url: str,
        channel_id: str,
        fetched_at: str,
    ) -> tuple[list[ParsedFeedItem], int]:
        parsed: list[ParsedFeedItem] = []
        skipped = 0

        for item in items:
            title = child_text(item, {"title"}) or "Untitled entry"
            link = child_text(item, {"link"})
            guid = child_text(item, {"guid"})
            source_url = first_supported_url(link, guid, resolved_url)
            if source_url is None:
                skipped += 1
                continue

            raw_html = child_text(item, {"encoded", "description"})
            excerpt = summarize_content(raw_html)
            author = child_text(item, {"creator", "author"})
            published_at = normalize_datetime(child_text(item, {"pubdate", "published", "updated"}))
            parsed.append(
                build_item(
                    channel_id=channel_id,
                    fetched_at=fetched_at,
                    guid=guid,
                    source_url=source_url,
                    title=title,
                    author=author,
                    excerpt=excerpt,
                    raw_html=raw_html,
                    published_at=published_at,
                )
            )

        return parsed, skipped

    def _parse_atom_items(
        self,
        *,
        items: list[ElementTree.Element],
        resolved_url: str,
        channel_id: str,
        fetched_at: str,
    ) -> tuple[list[ParsedFeedItem], int]:
        parsed: list[ParsedFeedItem] = []
        skipped = 0

        for item in items:
            title = child_text(item, {"title"}) or "Untitled entry"
            guid = child_text(item, {"id"})
            source_url = atom_entry_url(item, resolved_url) or first_supported_url(guid, None, resolved_url)
            if source_url is None:
                skipped += 1
                continue

            raw_html = child_text(item, {"content", "summary"})
            excerpt = summarize_content(raw_html)
            author = atom_author(item)
            published_at = normalize_datetime(child_text(item, {"published", "updated"}))
            parsed.append(
                build_item(
                    channel_id=channel_id,
                    fetched_at=fetched_at,
                    guid=guid,
                    source_url=source_url,
                    title=title,
                    author=author,
                    excerpt=excerpt,
                    raw_html=raw_html,
                    published_at=published_at,
                )
            )

        return parsed, skipped

    def _extract_pending_items(
        self,
        *,
        channel_id: str,
        entries: list[ParsedFeedItem],
    ):
        if not entries:
            return None

        dedupe_keys = [entry.dedupe_key for entry in entries if entry.dedupe_key]
        if not dedupe_keys:
            return None

        service = ExtractionService(
            settings=self.settings,
            repository=ExtractionRepository(self.repository.database_path),
        )
        return service.extract_pending_for_entries(channel_id=channel_id, dedupe_keys=dedupe_keys)


def entry_to_record(entry: ParsedFeedItem) -> dict[str, object]:
    return {
        "guid": entry.guid,
        "source_url": entry.source_url,
        "normalized_source_url": entry.normalized_source_url,
        "title": entry.title,
        "author": entry.author,
        "excerpt": entry.excerpt,
        "raw_html": entry.raw_html,
        "published_at": entry.published_at,
        "raw_fetched_at": entry.raw_fetched_at,
        "dedupe_key": entry.dedupe_key,
        "content_hash": entry.content_hash,
    }


def resolve_trigger_kind(
    *,
    mode: SyncRunMode,
    trigger_kind: SyncRunTriggerKind | None,
) -> SyncRunTriggerKind:
    if trigger_kind is not None:
        return trigger_kind
    return "scheduled" if mode == "scheduled" else "manual"


def resolve_run_mode(scope: object) -> SyncRunMode:
    if isinstance(scope, dict) and scope.get("mode") == "scheduled":
        return "scheduled"
    return "manual"


def build_run_scope(
    *,
    channel_ids: list[str] | None,
    targets: list[dict[str, object]],
    mode: SyncRunMode,
) -> dict[str, object]:
    return {
        "channel_ids": [channel["id"] for channel in targets],
        "selection": "explicit" if channel_ids else "active",
        "mode": mode,
    }


def build_item(
    *,
    channel_id: str,
    fetched_at: str,
    guid: str | None,
    source_url: str,
    title: str,
    author: str | None,
    excerpt: str | None,
    raw_html: str | None,
    published_at: str | None,
) -> ParsedFeedItem:
    normalized_source_url = normalize_url(source_url)
    dedupe_seed = guid or normalized_source_url or f"{title}|{published_at or ''}"
    dedupe_key = hashlib.sha256(f"{channel_id}|{dedupe_seed}".encode("utf-8")).hexdigest()
    content_basis = raw_html or excerpt or title
    content_hash = hashlib.sha256(content_basis.encode("utf-8")).hexdigest() if content_basis else None

    return ParsedFeedItem(
        guid=guid,
        source_url=source_url,
        normalized_source_url=normalized_source_url,
        title=title,
        author=author,
        excerpt=excerpt,
        raw_html=raw_html,
        published_at=published_at,
        raw_fetched_at=fetched_at,
        dedupe_key=dedupe_key,
        content_hash=content_hash,
    )


def atom_entry_url(entry: ElementTree.Element, base_url: str) -> str | None:
    for child in entry:
        if local_name(child.tag) != "link":
            continue
        href = child.attrib.get("href")
        rel = (child.attrib.get("rel") or "alternate").lower()
        if not href or rel not in {"alternate", ""}:
            continue
        return first_supported_url(urljoin(base_url, href), None, base_url)
    return None


def atom_author(entry: ElementTree.Element) -> str | None:
    for child in entry:
        if local_name(child.tag) != "author":
            continue
        name = child_text(child, {"name"})
        if name:
            return name
    return None


def first_supported_url(primary: str | None, secondary: str | None, base_url: str) -> str | None:
    for candidate in (primary, secondary):
        if not candidate:
            continue
        try:
            return normalize_url(urljoin(base_url, candidate))
        except ApiError:
            continue
    return None


def summarize_content(raw_html: str | None) -> str | None:
    if not raw_html:
        return None
    cleaned = WHITESPACE_RE.sub(" ", TAG_RE.sub(" ", raw_html)).strip()
    if not cleaned:
        return None
    return cleaned[:280]


def normalize_datetime(raw_value: str | None) -> str | None:
    if not raw_value:
        return None

    candidate = raw_value.strip()
    if not candidate:
        return None

    try:
        parsed = parsedate_to_datetime(candidate)
    except (TypeError, ValueError, IndexError):
        parsed = None

    if parsed is None:
        normalized = candidate.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)

    return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
