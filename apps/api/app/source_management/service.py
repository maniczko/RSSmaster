from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import sqlite3
from typing import Any
from uuid import uuid4
from xml.etree import ElementTree

from app.channels.service import ChannelDiscoveryService, FeedMetadata, local_name, normalize_url, prepare_input_url
from app.config import Settings
from app.errors import ApiError

from .models import SourceActionRequest, SourceCreateRequest
from .repository import (
    SOURCE_MANAGEMENT_CONTROLS_KEY,
    SOURCE_MANAGEMENT_LAYOUT_KEY,
    SourceManagementRepository,
)

LAYOUT_VERSION = 1
CONTROLS_VERSION = 1
CONTROL_FIELDS = (
    "paused_at",
    "pause_reason",
    "muted_at",
    "muted_until",
    "mute_reason",
    "snoozed_at",
    "snoozed_until",
    "snooze_reason",
    "updated_at",
    "updated_by",
)
ACTIVE_CONTROL_FIELDS = tuple(field for field in CONTROL_FIELDS if field not in {"updated_at", "updated_by"})


@dataclass(slots=True, frozen=True)
class ParsedOpmlFeed:
    title: str
    feed_url: str
    site_url: str | None
    description: str | None
    language: str | None
    folder_path: tuple[str, ...]


@dataclass(slots=True, frozen=True)
class ParsedOpmlDocument:
    feeds: list[ParsedOpmlFeed]
    invalid_feeds: int
    duplicate_feeds: int
    warnings: list[str]
    folder_counts: dict[tuple[str, ...], int]


class SourceManagementService:
    def __init__(self, settings: Settings, repository: SourceManagementRepository) -> None:
        self.settings = settings
        self.repository = repository
        self.discovery = ChannelDiscoveryService(settings)

    def preview_source(self, *, input_url: str) -> dict[str, object]:
        preview = self.discovery.preview(input_url)
        normalized_input_url = prepare_input_url(input_url)
        layout = self._load_layout_document()
        controls = self._load_controls_document()
        now = datetime.now(UTC)

        existing_sources = self.repository.list_sources_by_feed_urls([feed.feed_url for feed in preview.feeds])
        candidates = [
            self._build_preview_candidate(
                feed=feed,
                source=existing_sources.get(feed.feed_url),
                layout=layout,
                controls=controls,
                now=now,
            )
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
                "existing_source": None,
            }

        existing_source = existing_sources.get(preview.feed.feed_url)
        return {
            "status": "already_subscribed" if existing_source is not None else "ready",
            "input_url": normalized_input_url,
            "discovery": discovery,
            "feed": self._build_preview_candidate(
                feed=preview.feed,
                source=existing_source,
                layout=layout,
                controls=controls,
                now=now,
            ),
            "candidates": candidates,
            "existing_source": (
                self._build_source_model(existing_source, layout=layout, controls=controls, now=now)
                if existing_source is not None
                else None
            ),
        }

    def create_source(self, payload: SourceCreateRequest) -> dict[str, object]:
        target_url = payload.feed_url or payload.input_url
        if target_url is None:
            raise ApiError(
                status_code=400,
                code="missing_source_url",
                message="Source create requires a website URL or feed URL.",
                details={},
                retryable=False,
            )

        discovery = self.discovery.discover(target_url)
        layout = self._load_layout_document()
        controls = self._load_controls_document()
        now = datetime.now(UTC)
        existing_sources = self.repository.list_sources_by_feed_urls([discovery.feed.feed_url])
        existing_source = existing_sources.get(discovery.feed.feed_url)
        status = "created"
        source_id: str

        if existing_source is not None:
            if payload.on_duplicate == "error":
                raise ApiError(
                    status_code=409,
                    code="duplicate_source",
                    message="This source is already in your library.",
                    details={
                        "source_id": existing_source["id"],
                        "feed_url": existing_source["feed_url"],
                        "state": existing_source["state"],
                    },
                    retryable=False,
                )

            source_id = str(existing_source["id"])
            if payload.on_duplicate == "reactivate" and existing_source["state"] != "active":
                self.repository.commit_source_updates(
                    source_id,
                    category=payload.category,
                    update_category="category" in payload.model_fields_set,
                    state="active",
                    update_state=True,
                    layout_value=None,
                    controls_value=None,
                    updated_by=payload.updated_by,
                )
                status = "reactivated"
            else:
                status = "existing"
                if "category" in payload.model_fields_set:
                    self.repository.commit_source_updates(
                        source_id,
                        category=payload.category,
                        update_category=True,
                        state=None,
                        update_state=False,
                        layout_value=None,
                        controls_value=None,
                        updated_by=payload.updated_by,
                    )
        else:
            try:
                source_id = self.repository.create_source(
                    title=discovery.feed.title,
                    site_url=discovery.feed.site_url,
                    feed_url=discovery.feed.feed_url,
                    normalized_feed_url=discovery.feed.feed_url,
                    description=discovery.feed.description,
                    language=discovery.feed.language,
                    category=payload.category,
                )
            except sqlite3.IntegrityError as error:
                if payload.on_duplicate == "error":
                    raise ApiError(
                        status_code=409,
                        code="duplicate_source",
                        message="This source is already in your library.",
                        details={"feed_url": discovery.feed.feed_url},
                        retryable=False,
                    ) from error
                refreshed = self.repository.list_sources_by_feed_urls([discovery.feed.feed_url]).get(discovery.feed.feed_url)
                if refreshed is None:
                    raise
                source_id = str(refreshed["id"])
                status = "existing"

        layout_dirty = self._apply_create_membership(payload, layout=layout, source_id=source_id, now=utc_now())
        if layout_dirty:
            layout["updated_at"] = utc_now()
            self.repository.save_documents(
                layout_value=layout,
                controls_value=None,
                updated_by=payload.updated_by,
            )

        source_response = self.get_source(source_id)
        return {
            "status": status,
            "source": source_response["source"],
            "discovery": {
                "mode": discovery.mode,
                "resolved_feed_url": discovery.feed.feed_url,
                "candidates": discovery.candidates,
            },
            "initial_sync_run": None,
        }

    def restore_source(self, channel_id: str) -> dict[str, object]:
        source = self.repository.get_source(channel_id)
        if source is None:
            raise ApiError(
                status_code=404,
                code="source_not_found",
                message="Source was not found.",
                details={"channel_id": channel_id},
                retryable=False,
            )
        if source["state"] == "archived":
            self.repository.commit_source_updates(
                channel_id,
                category=None,
                update_category=False,
                state="active",
                update_state=True,
                layout_value=None,
                controls_value=None,
                updated_by=None,
            )

        return self.get_source(channel_id)

    def get_source(self, channel_id: str) -> dict[str, object]:
        source = self.repository.get_source(channel_id)
        if source is None:
            raise ApiError(
                status_code=404,
                code="source_not_found",
                message="Source was not found.",
                details={"channel_id": channel_id},
                retryable=False,
            )

        layout = self._load_layout_document()
        controls = self._load_controls_document()
        now = datetime.now(UTC)
        recent_items = self.repository.list_recent_items(channel_id, limit=5)

        return {
            "source": self._build_source_read_model(
                source,
                layout=layout,
                controls=controls,
                now=now,
                recent_items=recent_items,
            )
        }

    def list_collections(self) -> dict[str, object]:
        layout = self._load_layout_document()
        source_ids = {str(source["id"]) for source in self.repository.list_sources(include_archived=True)}
        counts = self._build_membership_counts(layout, source_ids)

        folders = [
            {
                "id": folder["id"],
                "name": folder["name"],
                "path": list(folder["path"]),
                "description": folder.get("description"),
                "color": folder.get("color"),
                "source_count": counts["folders"].get(folder["id"], 0),
                "created_at": folder["created_at"],
                "updated_at": folder["updated_at"],
            }
            for folder in sorted(layout["folders"], key=lambda item: ([segment.casefold() for segment in item["path"]], item["id"]))
        ]
        bundles = [
            {
                "id": bundle["id"],
                "name": bundle["name"],
                "description": bundle.get("description"),
                "color": bundle.get("color"),
                "source_count": counts["bundles"].get(bundle["id"], 0),
                "created_at": bundle["created_at"],
                "updated_at": bundle["updated_at"],
            }
            for bundle in sorted(layout["bundles"], key=lambda item: (item["name"].casefold(), item["id"]))
        ]
        return {
            "folders": folders,
            "bundles": bundles,
            "updated_at": layout.get("updated_at"),
        }

    def get_feed_health_center(self, *, issue_limit: int) -> dict[str, object]:
        layout = self._load_layout_document()
        controls = self._load_controls_document()
        now = datetime.now(UTC)
        sources = self.repository.list_sources(include_archived=False)

        summary = {
            "total_sources": len(sources),
            "active_sources": 0,
            "paused_sources": 0,
            "muted_sources": 0,
            "snoozed_sources": 0,
            "healthy_sources": 0,
            "warning_sources": 0,
            "error_sources": 0,
            "unknown_sources": 0,
        }
        issues: list[dict[str, object]] = []

        for source in sources:
            source_model = self._build_source_model(source, layout=layout, controls=controls, now=now)
            controls_model = source_model["controls"]
            health_status = source_model["health"]["status"]

            if source_model["state"] == "active":
                summary["active_sources"] += 1
            if controls_model["is_paused"]:
                summary["paused_sources"] += 1
            if controls_model["is_muted"]:
                summary["muted_sources"] += 1
            if controls_model["is_snoozed"]:
                summary["snoozed_sources"] += 1
            summary[f"{health_status}_sources"] += 1

            if health_status != "healthy" or controls_model["is_paused"] or controls_model["is_muted"] or controls_model["is_snoozed"]:
                issues.append(
                    {
                        "source_id": source_model["id"],
                        "title": source_model["title"],
                        "category": source_model["category"],
                        "state": source_model["state"],
                        "unread_count": source_model["unread_count"],
                        "health": source_model["health"],
                        "controls": source_model["controls"],
                        "groups": source_model["groups"],
                    }
                )

        issues.sort(key=self._issue_sort_key)
        return {
            "checked_at": utc_now(),
            "summary": summary,
            "issues": issues[:issue_limit],
            "recent_runs": self.repository.list_recent_sync_runs(limit=5),
        }

    def apply_action(self, channel_id: str, payload: SourceActionRequest) -> dict[str, object]:
        source = self.repository.get_source(channel_id)
        if source is None:
            raise ApiError(
                status_code=404,
                code="source_not_found",
                message="Source was not found.",
                details={"channel_id": channel_id},
                retryable=False,
            )

        layout = self._load_layout_document()
        controls = self._load_controls_document()
        now = utc_now()
        now_dt = parse_utc(now)
        updated_by = payload.updated_by

        category = source.get("category")
        update_category = False
        state = str(source["state"])
        update_state = False
        layout_dirty = False
        controls_dirty = False

        entry = self._get_channel_control_entry(controls, channel_id)

        if payload.action == "pause":
            self._ensure_not_archived(source, action="pause")
            if state != "inactive":
                state = "inactive"
                update_state = True
            entry["paused_at"] = now
            entry["pause_reason"] = payload.reason
            entry["updated_at"] = now
            entry["updated_by"] = updated_by
            controls_dirty = True
        elif payload.action == "resume":
            self._ensure_not_archived(source, action="resume")
            if state != "active":
                state = "active"
                update_state = True
            self._clear_control_fields(entry, ("paused_at", "pause_reason"))
            entry["updated_at"] = now
            entry["updated_by"] = updated_by
            controls_dirty = True
        elif payload.action == "mute":
            muted_until = self._validate_optional_future_timestamp(
                payload.until_at,
                action="mute",
                required=False,
                now=now_dt,
            )
            entry["muted_at"] = now
            entry["muted_until"] = muted_until
            entry["mute_reason"] = payload.reason
            entry["updated_at"] = now
            entry["updated_by"] = updated_by
            controls_dirty = True
        elif payload.action == "unmute":
            self._clear_control_fields(entry, ("muted_at", "muted_until", "mute_reason"))
            entry["updated_at"] = now
            entry["updated_by"] = updated_by
            controls_dirty = True
        elif payload.action == "snooze":
            snoozed_until = self._validate_optional_future_timestamp(
                payload.until_at,
                action="snooze",
                required=True,
                now=now_dt,
            )
            entry["snoozed_at"] = now
            entry["snoozed_until"] = snoozed_until
            entry["snooze_reason"] = payload.reason
            entry["updated_at"] = now
            entry["updated_by"] = updated_by
            controls_dirty = True
        elif payload.action == "unsnooze":
            self._clear_control_fields(entry, ("snoozed_at", "snoozed_until", "snooze_reason"))
            entry["updated_at"] = now
            entry["updated_by"] = updated_by
            controls_dirty = True
        elif payload.action == "regroup":
            field_set = payload.model_fields_set
            if not {"category", "folder", "bundles"} & field_set:
                raise ApiError(
                    status_code=400,
                    code="invalid_regroup_request",
                    message="Regroup requires category, folder, or bundles changes.",
                    details={"channel_id": channel_id},
                    retryable=False,
                )

            membership = self._get_membership_entry(layout, channel_id)
            if "category" in field_set:
                category = payload.category
                update_category = True

            if "folder" in field_set:
                if payload.folder is None:
                    membership["folder_id"] = None
                    layout_dirty = True
                else:
                    folder, created = self._resolve_folder_target(layout, payload.folder.model_dump(), now=now)
                    membership["folder_id"] = folder["id"]
                    layout_dirty = True

            if "bundles" in field_set:
                resolved_bundle_ids: list[str] = []
                for target in payload.bundles or []:
                    bundle, _ = self._resolve_bundle_target(layout, target.model_dump(), now=now)
                    if bundle["id"] not in resolved_bundle_ids:
                        resolved_bundle_ids.append(bundle["id"])
                membership["bundle_ids"] = resolved_bundle_ids
                layout_dirty = True

            membership["updated_at"] = now
            membership["updated_by"] = updated_by
            self._write_membership_entry(layout, channel_id, membership)
        else:  # pragma: no cover - defensive guard for future literal drift
            raise ApiError(
                status_code=400,
                code="unsupported_source_action",
                message="Unsupported source action.",
                details={"action": payload.action},
                retryable=False,
            )

        if controls_dirty:
            self._write_channel_control_entry(controls, channel_id, entry)
        if controls_dirty:
            controls["updated_at"] = now
        if layout_dirty:
            layout["updated_at"] = now

        self.repository.commit_source_updates(
            channel_id,
            category=category if update_category else None,
            update_category=update_category,
            state=state if update_state else None,
            update_state=update_state,
            layout_value=layout if layout_dirty else None,
            controls_value=controls if controls_dirty else None,
            updated_by=updated_by,
        )

        source_response = self.get_source(channel_id)
        return {
            "action": payload.action,
            "source": source_response["source"],
        }

    def preview_opml_import(self, *, opml_content: str) -> dict[str, object]:
        parsed = self._parse_opml_document(opml_content)
        existing_sources = self.repository.list_sources_by_feed_urls([feed.feed_url for feed in parsed.feeds])

        feeds = [
            {
                "title": feed.title,
                "feed_url": feed.feed_url,
                "site_url": feed.site_url,
                "folder_path": list(feed.folder_path),
                "already_subscribed": feed.feed_url in existing_sources,
                "existing_source_id": (
                    str(existing_sources[feed.feed_url]["id"])
                    if feed.feed_url in existing_sources
                    else None
                ),
            }
            for feed in sorted(parsed.feeds, key=lambda item: (list(map(str.casefold, item.folder_path)), item.title.casefold(), item.feed_url))
        ]

        return {
            "summary": build_opml_summary(parsed=parsed, existing_feed_count=len(existing_sources)),
            "folders": [
                {"path": list(path), "feed_count": count}
                for path, count in sorted(parsed.folder_counts.items(), key=lambda item: ([segment.casefold() for segment in item[0]], item[1]))
            ],
            "feeds": feeds,
            "warnings": parsed.warnings,
        }

    def import_opml(self, payload: dict[str, object]) -> dict[str, object]:
        opml_content = str(payload["opml_content"])
        default_category = payload.get("default_category")
        updated_by = payload.get("updated_by")

        parsed = self._parse_opml_document(opml_content)
        initial_sources = self.repository.list_sources_by_feed_urls([feed.feed_url for feed in parsed.feeds])
        new_feeds = [feed for feed in parsed.feeds if feed.feed_url not in initial_sources]

        feeds_to_insert = [
            {
                "channel_id": f"chn_{uuid4().hex[:12]}",
                "title": feed.title,
                "feed_url": feed.feed_url,
                "site_url": feed.site_url,
                "description": feed.description,
                "language": feed.language,
            }
            for feed in new_feeds
        ]

        created_source_ids: set[str] = set()
        if feeds_to_insert:
            created_source_ids = set(
                self.repository.apply_opml_import(
                    feeds=feeds_to_insert,
                    layout_value=None,
                    default_category=default_category if isinstance(default_category, str) else None,
                    updated_by=updated_by if isinstance(updated_by, str) else None,
                )
            )

        all_sources = self.repository.list_sources_by_feed_urls([feed.feed_url for feed in parsed.feeds])
        layout = self._load_layout_document()
        created_folder_ids: list[str] = []
        layout_dirty = False

        for feed in parsed.feeds:
            source = all_sources.get(feed.feed_url)
            if source is None or not feed.folder_path:
                continue
            folder, created = self._ensure_folder_for_path(layout, list(feed.folder_path), now=utc_now())
            membership = self._get_membership_entry(layout, str(source["id"]))
            if membership.get("folder_id") != folder["id"]:
                membership["folder_id"] = folder["id"]
                membership["updated_at"] = utc_now()
                membership["updated_by"] = updated_by if isinstance(updated_by, str) else None
                self._write_membership_entry(layout, str(source["id"]), membership)
                layout_dirty = True
            if created and folder["id"] not in created_folder_ids:
                created_folder_ids.append(folder["id"])
                layout_dirty = True

        if layout_dirty:
            layout["updated_at"] = utc_now()
            self.repository.save_documents(
                layout_value=layout,
                controls_value=None,
                updated_by=updated_by if isinstance(updated_by, str) else None,
            )

        created_sources_map = self.repository.list_sources_by_ids(sorted(created_source_ids))
        controls = self._load_controls_document()
        now = datetime.now(UTC)

        created_sources = [
            self._build_source_model(source, layout=layout, controls=controls, now=now)
            for source in created_sources_map.values()
        ]
        created_sources.sort(key=lambda item: (item["title"].casefold(), item["id"]))

        return {
            "summary": build_opml_summary(parsed=parsed, existing_feed_count=len(parsed.feeds) - len(created_source_ids)),
            "created_sources": created_sources,
            "existing_source_ids": sorted(
                str(source["id"])
                for feed_url, source in all_sources.items()
                if str(source["id"]) not in created_source_ids and feed_url in {feed.feed_url for feed in parsed.feeds}
            ),
            "created_folder_ids": created_folder_ids,
            "warnings": parsed.warnings,
        }

    def export_opml(self, *, include_archived: bool) -> dict[str, object]:
        generated_at = utc_now()
        sources = self.repository.list_sources(include_archived=include_archived)
        layout = self._load_layout_document()

        root = ElementTree.Element("opml", version="2.0")
        head = ElementTree.SubElement(root, "head")
        ElementTree.SubElement(head, "title").text = "rssmaster export"
        ElementTree.SubElement(head, "dateCreated").text = generated_at
        body = ElementTree.SubElement(root, "body")

        grouped_sources: dict[tuple[str, ...], list[dict[str, object]]] = {}
        for source in sources:
            folder = self._resolve_folder_reference(layout, str(source["id"]))
            folder_path = tuple(folder["path"]) if folder is not None else ()
            grouped_sources.setdefault(folder_path, []).append(source)

        folder_nodes: dict[tuple[str, ...], ElementTree.Element] = {(): body}
        for path in sorted((candidate for candidate in grouped_sources if candidate), key=lambda item: (len(item), [segment.casefold() for segment in item])):
            parent = folder_nodes[path[:-1]]
            folder_nodes[path] = ElementTree.SubElement(
                parent,
                "outline",
                {"text": path[-1], "title": path[-1]},
            )

        for path, path_sources in sorted(grouped_sources.items(), key=lambda item: ([segment.casefold() for segment in item[0]], len(item[0]))):
            parent = folder_nodes[path]
            for source in sorted(path_sources, key=lambda item: (str(item["title"]).casefold(), str(item["id"]))):
                attributes = {
                    "text": str(source["title"]),
                    "title": str(source["title"]),
                    "type": "rss",
                    "xmlUrl": str(source["feed_url"]),
                }
                if source.get("site_url"):
                    attributes["htmlUrl"] = str(source["site_url"])
                if source.get("category"):
                    attributes["category"] = str(source["category"])
                ElementTree.SubElement(parent, "outline", attributes)

        ElementTree.indent(root)
        opml_content = ElementTree.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")

        return {
            "generated_at": generated_at,
            "source_count": len(sources),
            "folder_count": len(layout["folders"]),
            "bundle_count": len(layout["bundles"]),
            "opml_content": opml_content,
        }

    def _load_layout_document(self) -> dict[str, Any]:
        record = self.repository.get_document(SOURCE_MANAGEMENT_LAYOUT_KEY)
        value = dict(record["value"]) if record else {}
        folders = [self._sanitize_folder(folder) for folder in value.get("folders", []) if isinstance(folder, dict)]
        bundles = [self._sanitize_bundle(bundle) for bundle in value.get("bundles", []) if isinstance(bundle, dict)]
        membership = {
            str(channel_id): self._sanitize_membership(entry)
            for channel_id, entry in (value.get("membership", {}) or {}).items()
            if isinstance(entry, dict)
        }
        return {
            "version": int(value.get("version") or LAYOUT_VERSION),
            "folders": folders,
            "bundles": bundles,
            "membership": membership,
            "updated_at": value.get("updated_at"),
        }

    def _load_controls_document(self) -> dict[str, Any]:
        record = self.repository.get_document(SOURCE_MANAGEMENT_CONTROLS_KEY)
        value = dict(record["value"]) if record else {}
        channels = {
            str(channel_id): self._sanitize_control_entry(entry)
            for channel_id, entry in (value.get("channels", {}) or {}).items()
            if isinstance(entry, dict)
        }
        return {
            "version": int(value.get("version") or CONTROLS_VERSION),
            "channels": channels,
            "updated_at": value.get("updated_at"),
        }

    def _build_source_model(
        self,
        source: dict[str, object],
        *,
        layout: dict[str, Any],
        controls: dict[str, Any],
        now: datetime,
    ) -> dict[str, object]:
        return {
            "id": source["id"],
            "title": source["title"],
            "site_url": source.get("site_url"),
            "feed_url": source["feed_url"],
            "description": source.get("description"),
            "language": source.get("language"),
            "category": source.get("category"),
            "state": source["state"],
            "unread_count": int(source.get("unread_count") or 0),
            "created_at": source["created_at"],
            "updated_at": source["updated_at"],
            "health": source["health"],
            "controls": self._build_control_state(source, controls=controls, now=now),
            "groups": self._build_group_membership(source_id=str(source["id"]), layout=layout),
        }

    def _build_source_read_model(
        self,
        source: dict[str, object],
        *,
        layout: dict[str, Any],
        controls: dict[str, Any],
        now: datetime,
        recent_items: list[dict[str, object]],
    ) -> dict[str, object]:
        model = self._build_source_model(source, layout=layout, controls=controls, now=now)
        model["recent_items"] = recent_items
        return model

    def _build_preview_candidate(
        self,
        *,
        feed: FeedMetadata,
        source: dict[str, object] | None,
        layout: dict[str, Any],
        controls: dict[str, Any],
        now: datetime,
    ) -> dict[str, object]:
        if source is None:
            return {
                "candidate_id": build_source_candidate_id(feed.feed_url),
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
                "validation": build_source_preview_validation(feed),
                "already_subscribed": False,
                "existing_source_id": None,
                "existing_state": None,
                "controls": None,
                "groups": None,
            }

        source_model = self._build_source_model(source, layout=layout, controls=controls, now=now)
        return {
            "candidate_id": build_source_candidate_id(feed.feed_url),
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
            "validation": build_source_preview_validation(feed),
            "already_subscribed": True,
            "existing_source_id": source_model["id"],
            "existing_state": source_model["state"],
            "controls": source_model["controls"],
            "groups": source_model["groups"],
        }

    def _apply_create_membership(
        self,
        payload: SourceCreateRequest,
        *,
        layout: dict[str, Any],
        source_id: str,
        now: str,
    ) -> bool:
        if payload.folder is None and payload.bundles is None:
            return False

        membership = self._get_membership_entry(layout, source_id)
        dirty = False

        if payload.folder is not None:
            folder, _ = self._resolve_folder_target(layout, payload.folder.model_dump(), now=now)
            if membership.get("folder_id") != folder["id"]:
                membership["folder_id"] = folder["id"]
                dirty = True

        if payload.bundles is not None:
            bundle_ids: list[str] = []
            for target in payload.bundles:
                bundle, _ = self._resolve_bundle_target(layout, target.model_dump(), now=now)
                if bundle["id"] not in bundle_ids:
                    bundle_ids.append(bundle["id"])
            if membership.get("bundle_ids") != bundle_ids:
                membership["bundle_ids"] = bundle_ids
                dirty = True

        if dirty:
            membership["updated_at"] = now
            membership["updated_by"] = payload.updated_by
            self._write_membership_entry(layout, source_id, membership)

        return dirty

    def _build_control_state(
        self,
        source: dict[str, object],
        *,
        controls: dict[str, Any],
        now: datetime,
    ) -> dict[str, object]:
        entry = controls["channels"].get(str(source["id"]), {})
        muted_until = normalize_optional_timestamp(entry.get("muted_until"))
        snoozed_until = normalize_optional_timestamp(entry.get("snoozed_until"))
        muted_until_dt = parse_optional_utc(muted_until)
        snoozed_until_dt = parse_optional_utc(snoozed_until)

        is_muted = bool(entry.get("muted_at")) and (muted_until_dt is None or muted_until_dt > now)
        is_snoozed = snoozed_until_dt is not None and snoozed_until_dt > now

        next_resume_candidates = [candidate for candidate in (muted_until, snoozed_until) if candidate]
        next_resume_at = min(next_resume_candidates) if next_resume_candidates else None

        return {
            "is_paused": source["state"] == "inactive",
            "is_muted": is_muted,
            "is_snoozed": is_snoozed,
            "paused_at": normalize_optional_timestamp(entry.get("paused_at")),
            "pause_reason": normalize_optional_text(entry.get("pause_reason")),
            "muted_at": normalize_optional_timestamp(entry.get("muted_at")),
            "muted_until": muted_until,
            "mute_reason": normalize_optional_text(entry.get("mute_reason")),
            "snoozed_at": normalize_optional_timestamp(entry.get("snoozed_at")),
            "snoozed_until": snoozed_until,
            "snooze_reason": normalize_optional_text(entry.get("snooze_reason")),
            "next_resume_at": next_resume_at,
            "updated_at": normalize_optional_timestamp(entry.get("updated_at")),
        }

    def _build_group_membership(self, *, source_id: str, layout: dict[str, Any]) -> dict[str, object]:
        membership = layout["membership"].get(source_id, {})
        folder_id = membership.get("folder_id")
        bundle_ids = membership.get("bundle_ids") or []

        folder = next((candidate for candidate in layout["folders"] if candidate["id"] == folder_id), None)
        bundles = [
            bundle
            for bundle in layout["bundles"]
            if bundle["id"] in bundle_ids
        ]
        bundles.sort(key=lambda item: (item["name"].casefold(), item["id"]))

        return {
            "folder": (
                {
                    "id": folder["id"],
                    "name": folder["name"],
                    "path": list(folder["path"]),
                    "color": folder.get("color"),
                }
                if folder is not None
                else None
            ),
            "bundles": [
                {
                    "id": bundle["id"],
                    "name": bundle["name"],
                    "color": bundle.get("color"),
                }
                for bundle in bundles
            ],
        }

    def _build_membership_counts(self, layout: dict[str, Any], source_ids: set[str]) -> dict[str, Counter[str]]:
        folder_counts: Counter[str] = Counter()
        bundle_counts: Counter[str] = Counter()

        for source_id, membership in layout["membership"].items():
            if source_id not in source_ids:
                continue
            folder_id = membership.get("folder_id")
            if folder_id:
                folder_counts[str(folder_id)] += 1
            for bundle_id in membership.get("bundle_ids", []):
                if bundle_id:
                    bundle_counts[str(bundle_id)] += 1

        return {
            "folders": folder_counts,
            "bundles": bundle_counts,
        }

    def _issue_sort_key(self, issue: dict[str, object]) -> tuple[int, int, str]:
        health_status = str(issue["health"]["status"])
        controls = issue["controls"]
        if health_status == "error":
            rank = 0
        elif health_status == "warning":
            rank = 1
        elif health_status == "unknown":
            rank = 2
        elif controls["is_paused"] or controls["is_muted"] or controls["is_snoozed"]:
            rank = 3
        else:
            rank = 4
        return (rank, -int(issue["unread_count"]), str(issue["title"]).casefold())

    def _ensure_not_archived(self, source: dict[str, object], *, action: str) -> None:
        if source["state"] == "archived":
            raise ApiError(
                status_code=409,
                code="source_archived",
                message=f"Archived sources cannot be changed with '{action}'.",
                details={"channel_id": source["id"], "action": action},
                retryable=False,
            )

    def _validate_optional_future_timestamp(
        self,
        value: str | None,
        *,
        action: str,
        required: bool,
        now: datetime,
    ) -> str | None:
        normalized = normalize_optional_timestamp(value)
        if normalized is None:
            if required:
                raise ApiError(
                    status_code=400,
                    code="missing_until_at",
                    message=f"'{action}' requires a future until_at timestamp.",
                    details={"action": action},
                    retryable=False,
                )
            return None

        parsed = parse_optional_utc(normalized)
        if parsed is None or parsed <= now:
            raise ApiError(
                status_code=400,
                code="invalid_until_at",
                message=f"'{action}' requires until_at to be a future ISO 8601 timestamp.",
                details={"action": action, "until_at": normalized},
                retryable=False,
            )
        return normalized

    def _resolve_folder_target(
        self,
        layout: dict[str, Any],
        target: dict[str, object],
        *,
        now: str,
    ) -> tuple[dict[str, Any], bool]:
        if target.get("id"):
            folder = next((candidate for candidate in layout["folders"] if candidate["id"] == target["id"]), None)
            if folder is None:
                raise ApiError(
                    status_code=404,
                    code="source_folder_not_found",
                    message="Folder was not found.",
                    details={"folder_id": target["id"]},
                    retryable=False,
                )
            return folder, False

        path = [segment for segment in normalize_path_segments(target.get("path")) or []]
        name = normalize_optional_text(target.get("name"))
        if name:
            if path:
                path[-1] = name
            else:
                path = [name]

        if not path:
            raise ApiError(
                status_code=400,
                code="invalid_folder_target",
                message="Folder regroup target requires a name or path.",
                details={},
                retryable=False,
            )

        signature = canonical_path(path)
        existing = next((candidate for candidate in layout["folders"] if canonical_path(candidate["path"]) == signature), None)
        if existing is not None:
            return existing, False

        folder = {
            "id": f"fld_{uuid4().hex[:12]}",
            "name": path[-1],
            "path": path,
            "description": normalize_optional_text(target.get("description")),
            "color": normalize_optional_text(target.get("color")),
            "created_at": now,
            "updated_at": now,
        }
        layout["folders"].append(folder)
        return folder, True

    def _resolve_bundle_target(
        self,
        layout: dict[str, Any],
        target: dict[str, object],
        *,
        now: str,
    ) -> tuple[dict[str, Any], bool]:
        if target.get("id"):
            bundle = next((candidate for candidate in layout["bundles"] if candidate["id"] == target["id"]), None)
            if bundle is None:
                raise ApiError(
                    status_code=404,
                    code="source_bundle_not_found",
                    message="Bundle was not found.",
                    details={"bundle_id": target["id"]},
                    retryable=False,
                )
            return bundle, False

        name = normalize_optional_text(target.get("name"))
        if not name:
            raise ApiError(
                status_code=400,
                code="invalid_bundle_target",
                message="Bundle regroup target requires an id or name.",
                details={},
                retryable=False,
            )

        existing = next((candidate for candidate in layout["bundles"] if candidate["name"].casefold() == name.casefold()), None)
        if existing is not None:
            return existing, False

        bundle = {
            "id": f"bnd_{uuid4().hex[:12]}",
            "name": name,
            "description": normalize_optional_text(target.get("description")),
            "color": normalize_optional_text(target.get("color")),
            "created_at": now,
            "updated_at": now,
        }
        layout["bundles"].append(bundle)
        return bundle, True

    def _ensure_folder_for_path(
        self,
        layout: dict[str, Any],
        path: list[str],
        *,
        now: str,
    ) -> tuple[dict[str, Any], bool]:
        target = {"path": path}
        return self._resolve_folder_target(layout, target, now=now)

    def _resolve_folder_reference(self, layout: dict[str, Any], source_id: str) -> dict[str, Any] | None:
        membership = layout["membership"].get(source_id, {})
        folder_id = membership.get("folder_id")
        return next((candidate for candidate in layout["folders"] if candidate["id"] == folder_id), None)

    @staticmethod
    def _get_channel_control_entry(controls: dict[str, Any], channel_id: str) -> dict[str, Any]:
        entry = controls["channels"].get(channel_id)
        if isinstance(entry, dict):
            return dict(entry)
        return {}

    @staticmethod
    def _write_channel_control_entry(controls: dict[str, Any], channel_id: str, entry: dict[str, Any]) -> None:
        if any(entry.get(field) for field in ACTIVE_CONTROL_FIELDS):
            controls["channels"][channel_id] = entry
            return
        controls["channels"].pop(channel_id, None)

    @staticmethod
    def _get_membership_entry(layout: dict[str, Any], channel_id: str) -> dict[str, Any]:
        entry = layout["membership"].get(channel_id)
        if isinstance(entry, dict):
            return dict(entry)
        return {"folder_id": None, "bundle_ids": []}

    @staticmethod
    def _write_membership_entry(layout: dict[str, Any], channel_id: str, membership: dict[str, Any]) -> None:
        has_folder = bool(membership.get("folder_id"))
        has_bundles = bool(membership.get("bundle_ids"))
        if has_folder or has_bundles:
            layout["membership"][channel_id] = {
                "folder_id": membership.get("folder_id"),
                "bundle_ids": [bundle_id for bundle_id in membership.get("bundle_ids", []) if bundle_id],
                "updated_at": membership.get("updated_at"),
                "updated_by": membership.get("updated_by"),
            }
            return
        layout["membership"].pop(channel_id, None)

    @staticmethod
    def _clear_control_fields(entry: dict[str, Any], fields: tuple[str, ...]) -> None:
        for field in fields:
            entry.pop(field, None)

    @staticmethod
    def _sanitize_folder(folder: dict[str, Any]) -> dict[str, Any]:
        path = normalize_path_segments(folder.get("path")) or [normalize_optional_text(folder.get("name")) or "Folder"]
        return {
            "id": str(folder.get("id") or f"fld_{uuid4().hex[:12]}"),
            "name": path[-1],
            "path": path,
            "description": normalize_optional_text(folder.get("description")),
            "color": normalize_optional_text(folder.get("color")),
            "created_at": normalize_optional_timestamp(folder.get("created_at")) or utc_now(),
            "updated_at": normalize_optional_timestamp(folder.get("updated_at")) or utc_now(),
        }

    @staticmethod
    def _sanitize_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
        name = normalize_optional_text(bundle.get("name")) or "Bundle"
        return {
            "id": str(bundle.get("id") or f"bnd_{uuid4().hex[:12]}"),
            "name": name,
            "description": normalize_optional_text(bundle.get("description")),
            "color": normalize_optional_text(bundle.get("color")),
            "created_at": normalize_optional_timestamp(bundle.get("created_at")) or utc_now(),
            "updated_at": normalize_optional_timestamp(bundle.get("updated_at")) or utc_now(),
        }

    @staticmethod
    def _sanitize_membership(entry: dict[str, Any]) -> dict[str, Any]:
        return {
            "folder_id": normalize_optional_text(entry.get("folder_id")),
            "bundle_ids": [normalize_optional_text(item) for item in entry.get("bundle_ids", []) if normalize_optional_text(item)],
            "updated_at": normalize_optional_timestamp(entry.get("updated_at")),
            "updated_by": normalize_optional_text(entry.get("updated_by")),
        }

    @staticmethod
    def _sanitize_control_entry(entry: dict[str, Any]) -> dict[str, Any]:
        return {
            "paused_at": normalize_optional_timestamp(entry.get("paused_at")),
            "pause_reason": normalize_optional_text(entry.get("pause_reason")),
            "muted_at": normalize_optional_timestamp(entry.get("muted_at")),
            "muted_until": normalize_optional_timestamp(entry.get("muted_until")),
            "mute_reason": normalize_optional_text(entry.get("mute_reason")),
            "snoozed_at": normalize_optional_timestamp(entry.get("snoozed_at")),
            "snoozed_until": normalize_optional_timestamp(entry.get("snoozed_until")),
            "snooze_reason": normalize_optional_text(entry.get("snooze_reason")),
            "updated_at": normalize_optional_timestamp(entry.get("updated_at")),
            "updated_by": normalize_optional_text(entry.get("updated_by")),
        }

    def _parse_opml_document(self, opml_content: str) -> ParsedOpmlDocument:
        try:
            root = ElementTree.fromstring(opml_content)
        except ElementTree.ParseError as error:
            raise ApiError(
                status_code=422,
                code="invalid_opml",
                message="OPML content could not be parsed.",
                details={},
                retryable=False,
            ) from error

        if local_name(root.tag) != "opml":
            raise ApiError(
                status_code=422,
                code="invalid_opml",
                message="Expected an OPML document.",
                details={},
                retryable=False,
            )

        body = next((child for child in root if local_name(child.tag) == "body"), None)
        if body is None:
            raise ApiError(
                status_code=422,
                code="invalid_opml",
                message="OPML body element is missing.",
                details={},
                retryable=False,
            )

        feeds: list[ParsedOpmlFeed] = []
        invalid_feeds = 0
        duplicate_feeds = 0
        warnings: list[str] = []
        folder_counts: Counter[tuple[str, ...]] = Counter()
        seen_feed_urls: dict[str, tuple[str, ...]] = {}

        def walk(node: ElementTree.Element, current_path: list[str]) -> None:
            nonlocal invalid_feeds, duplicate_feeds

            label = normalize_optional_text(node.attrib.get("text")) or normalize_optional_text(node.attrib.get("title"))
            feed_url = normalize_optional_text(node.attrib.get("xmlUrl")) or normalize_optional_text(node.attrib.get("xmlurl"))
            site_url = normalize_optional_text(node.attrib.get("htmlUrl")) or normalize_optional_text(node.attrib.get("htmlurl"))

            if feed_url:
                try:
                    normalized_feed_url = normalize_url(feed_url)
                except ApiError:
                    invalid_feeds += 1
                    warnings.append(f"Skipped invalid feed URL: {feed_url}")
                    return

                normalized_site_url: str | None = None
                if site_url:
                    try:
                        normalized_site_url = normalize_url(site_url)
                    except ApiError:
                        warnings.append(f"Ignored invalid site URL for {normalized_feed_url}: {site_url}")

                folder_path = tuple(current_path)
                if normalized_feed_url in seen_feed_urls:
                    duplicate_feeds += 1
                    if seen_feed_urls[normalized_feed_url] != folder_path:
                        warnings.append(
                            f"Feed {normalized_feed_url} appeared in multiple folders; only the first occurrence was kept."
                        )
                    return

                seen_feed_urls[normalized_feed_url] = folder_path
                if folder_path:
                    folder_counts[folder_path] += 1
                feeds.append(
                    ParsedOpmlFeed(
                        title=label or normalized_feed_url,
                        feed_url=normalized_feed_url,
                        site_url=normalized_site_url,
                        description=None,
                        language=None,
                        folder_path=folder_path,
                    )
                )
                return

            next_path = list(current_path)
            if label:
                next_path.append(label)

            for child in node:
                if local_name(child.tag) == "outline":
                    walk(child, next_path)

        for child in body:
            if local_name(child.tag) == "outline":
                walk(child, [])

        return ParsedOpmlDocument(
            feeds=feeds,
            invalid_feeds=invalid_feeds,
            duplicate_feeds=duplicate_feeds,
            warnings=warnings,
            folder_counts=dict(folder_counts),
        )


def build_opml_summary(*, parsed: ParsedOpmlDocument, existing_feed_count: int) -> dict[str, int]:
    new_feeds = max(0, len(parsed.feeds) - existing_feed_count)
    return {
        "total_feeds": len(parsed.feeds),
        "new_feeds": new_feeds,
        "existing_feeds": existing_feed_count,
        "invalid_feeds": parsed.invalid_feeds,
        "duplicate_feeds": parsed.duplicate_feeds,
        "folder_count": len(parsed.folder_counts),
    }


def build_source_candidate_id(feed_url: str) -> str:
    digest = hashlib.sha1(feed_url.encode("utf-8")).hexdigest()[:16]
    return f"feed_{digest}"


def build_source_preview_validation(feed: FeedMetadata) -> dict[str, object]:
    return {
        "reachable": True,
        "feed_kind": infer_feed_kind(feed.feed_url),
        "item_count_sampled": len(feed.sample_items),
        "warnings": [],
    }


def infer_feed_kind(feed_url: str) -> str:
    lowered = feed_url.lower()
    if "atom" in lowered:
        return "atom"
    if lowered.endswith(".rdf") or "rdf" in lowered:
        return "rdf"
    return "rss"


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def parse_optional_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return parse_utc(value)
    except ValueError:
        return None


def normalize_optional_text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    cleaned = value.strip()
    return cleaned or None


def normalize_path_segments(value: object) -> list[str] | None:
    if value is None or not isinstance(value, list):
        return None
    normalized: list[str] = []
    for item in value:
        cleaned = normalize_optional_text(item)
        if cleaned:
            normalized.append(cleaned)
    return normalized or None


def normalize_optional_timestamp(value: object) -> str | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None
    parsed = parse_optional_utc(normalized)
    if parsed is None:
        return None
    return parsed.isoformat().replace("+00:00", "Z")


def canonical_path(path: list[str]) -> str:
    return "/".join(segment.casefold() for segment in path)
