from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, datetime
from html import escape
import json
from typing import Iterable
from urllib.parse import urlparse
from uuid import uuid4
from xml.etree import ElementTree

import httpx

from app.channels.repository import ChannelRepository
from app.channels.service import normalize_url
from app.config import Settings
from app.errors import ApiError
from app.extract.service import prepare_document
from app.items.repository import ItemRepository

from .repository import WorkspaceRepository, parse_breakdown

STOPWORDS = {
    "a",
    "and",
    "as",
    "for",
    "from",
    "in",
    "is",
    "na",
    "o",
    "of",
    "on",
    "or",
    "the",
    "to",
    "w",
    "z",
}
TOPIC_STOPWORDS = STOPWORDS | {
    "2026",
    "2025",
    "2024",
    "bardziej",
    "będzie",
    "firma",
    "firmy",
    "jednak",
    "kolejny",
    "kolejna",
    "kolejne",
    "kurs",
    "kosztuje",
    "mówi",
    "nowy",
    "nowa",
    "nowe",
    "oraz",
    "polska",
    "polsce",
    "pozwala",
    "raport",
    "roku",
    "rynek",
    "temat",
    "tylko",
    "więcej",
    "zdaniem",
    "zlotego",
    "złotego",
}
LOW_SIGNAL_HEADLINE_PREFIXES = (
    "ile kosztuje ",
    "kurs ",
)
LOW_SIGNAL_HEADLINE_MARKERS = (
    "kurs dolara",
    "kurs euro",
    "kurs funta",
    "kurs franka",
    "kurs franka szwajcarskiego",
    "pln/usd",
    "pln/eur",
    "pln/gbp",
    "pln/chf",
)
LOW_SIGNAL_HEADLINE_PENALTY = 12.0
SAME_SOURCE_DUPLICATE_PENALTY = 8.0
MULTI_SOURCE_COVERAGE_BOOST = 4.0
LOW_SIGNAL_FAMILY_SATURATION_PENALTY = 6.0
FALLBACK_WINDOW_HOURS = (72, 120, 168, 336)
LEARNED_TOPIC_LIMIT = 6
LEARNED_SOURCE_LIMIT = 3
SIGNAL_ROW_LIMIT = 240
SEMANTIC_CLUSTER_KEYWORD_LIMIT = 6


class WorkspaceService:
    def __init__(self, settings: Settings, repository: WorkspaceRepository) -> None:
        self.settings = settings
        self.repository = repository
        self.channel_repository = ChannelRepository(settings.database_file)
        self.item_repository = ItemRepository(settings.database_file)

    def get_profile(self) -> dict[str, object]:
        return self._build_profile()

    def update_profile(self, payload: dict[str, object]) -> dict[str, object]:
        assignments: dict[str, object] = {}
        for field in (
            "name",
            "candidate_window_hours",
            "default_source_cap",
            "priority_source_cap",
            "emergency_source_cap",
            "daily_reading_goal",
        ):
            value = payload.get(field)
            if value is not None:
                assignments[field] = value
        interests = payload.get("interests")
        self.repository.update_profile(assignments=assignments, interests=interests)
        return self._build_profile()

    def get_ranking(self, *, limit: int = 12) -> dict[str, object]:
        profile = self.get_profile()
        ranked_state = self._refresh_story_clusters_and_rank(profile=profile, target_count=limit)
        items = [
            serialize_ranked_row(row)
            for row in self.repository.list_ranked_rows(limit=limit)
        ]
        return {
            "generated_at": ranked_state["generated_at"],
            "items": items,
        }

    def get_briefing(self) -> dict[str, object]:
        profile = self.get_profile()
        ranking = self.get_ranking(limit=max(6, int(profile["daily_reading_goal"])))
        recommended = ranking["items"]
        inbox = self.item_repository.list_items(
            self._filters(view="inbox", limit=200)
        ).items
        saved = self.item_repository.list_items(
            self._filters(view="saved", limit=200)
        ).items
        archive = self.item_repository.list_items(
            self._filters(view="archive", limit=200)
        ).items
        digest = self.item_repository.list_items(
            self._filters(view=None, digest_candidate=True, limit=200)
        ).items
        story_rows = self.list_story_clusters(limit=4)["items"]
        source_health = self.list_source_health()["items"]
        resume_item = next((item["item"] for item in recommended if not item["item"]["is_read"]), None)
        warning_lines = [
            f"{entry['title']}: {entry['health_summary']}"
            for entry in source_health
            if entry["health_status"] in {"warning", "error"}
        ][:4]
        summary_lines = [
            f"{len(recommended)} ranked candidates are ready now.",
            f"{len(saved)} saved article(s) remain in the active library.",
            f"{len(story_rows)} clustered story group(s) are available for de-duplicated reading.",
        ]
        if profile.get("learned_interests"):
            learned_preview = ", ".join(
                str(interest["label"]) for interest in list(profile["learned_interests"])[:3]
            )
            summary_lines.append(f"Learned interests steering the queue: {learned_preview}.")
        if warning_lines:
            summary_lines.append("Source watchlist: " + " | ".join(warning_lines))
        return {
            "generated_at": ranking["generated_at"],
            "stats": {
                "unread_count": len([item for item in inbox if not item["is_read"]]),
                "saved_count": len(saved),
                "digest_count": len(digest),
                "archived_count": len(archive),
                "recommended_count": len(recommended),
            },
            "summary_lines": summary_lines,
            "resume_item": resume_item,
            "recommended": recommended[:6],
            "source_warnings": warning_lines,
        }

    def list_annotations(self, *, item_id: str | None, search: str | None, limit: int) -> dict[str, object]:
        return {"items": self.repository.list_annotations(item_id=item_id, search=normalize_optional_text(search), limit=limit)}

    def create_annotation(self, payload: dict[str, object]) -> dict[str, object]:
        item_id = str(payload["item_id"])
        if self.item_repository.get_by_id(item_id) is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": item_id},
                retryable=False,
            )
        kind = str(payload["kind"])
        quote_text = normalize_optional_text(payload.get("quote_text"))
        note_text = normalize_optional_text(payload.get("note_text"))
        if kind == "highlight" and quote_text is None:
            raise ApiError(
                status_code=400,
                code="highlight_requires_quote",
                message="A highlight requires quote_text.",
                details={"item_id": item_id},
                retryable=False,
            )
        if kind == "note" and note_text is None:
            raise ApiError(
                status_code=400,
                code="note_requires_content",
                message="A note requires note_text.",
                details={"item_id": item_id},
                retryable=False,
            )
        return {
            "annotation": self.repository.create_annotation(
                item_id=item_id,
                kind=kind,
                quote_text=quote_text,
                note_text=note_text,
                color=normalize_optional_text(payload.get("color")),
            )
        }

    def update_annotation(self, annotation_id: str, payload: dict[str, object]) -> dict[str, object]:
        try:
            annotation = self.repository.update_annotation(
                annotation_id,
                note_text=normalize_optional_text(payload.get("note_text")) if "note_text" in payload else None,
                color=normalize_optional_text(payload.get("color")) if "color" in payload else None,
                archived=payload.get("archived") if "archived" in payload else None,
            )
        except RuntimeError as error:
            raise ApiError(
                status_code=404,
                code="annotation_not_found",
                message="Annotation was not found.",
                details={"annotation_id": annotation_id},
                retryable=False,
            ) from error
        return {"annotation": annotation}

    def list_tags(self) -> dict[str, object]:
        return {"items": self.repository.list_tags()}

    def create_tag(self, payload: dict[str, object]) -> dict[str, object]:
        return {"tag": self.repository.create_tag(name=str(payload["name"]).strip(), color=normalize_optional_text(payload.get("color")))}

    def get_item_tags(self, item_id: str) -> dict[str, object]:
        if self.item_repository.get_by_id(item_id) is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": item_id},
                retryable=False,
            )
        return {"item_id": item_id, "tags": self.repository.list_item_tags(item_id)}

    def set_item_tags(self, item_id: str, names: Iterable[str]) -> dict[str, object]:
        if self.item_repository.get_by_id(item_id) is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": item_id},
                retryable=False,
            )
        requested_names = [normalize_optional_text(name) for name in names]
        cleaned_names = sorted({name for name in requested_names if name}, key=str.casefold)
        tags = [self.repository.create_tag(name=name, color=None) for name in cleaned_names]
        assigned = self.repository.set_item_tags(item_id=item_id, tag_ids=[str(tag["id"]) for tag in tags])
        return {"item_id": item_id, "tags": assigned}

    def list_collections(self) -> dict[str, object]:
        return {"items": self.repository.list_collections()}

    def create_collection(self, payload: dict[str, object]) -> dict[str, object]:
        item_id = normalize_optional_text(payload.get("item_id"))
        if item_id and self.item_repository.get_by_id(item_id) is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": item_id},
                retryable=False,
            )
        return {
            "collection": self.repository.create_collection(
                name=str(payload["name"]).strip(),
                description=normalize_optional_text(payload.get("description")),
                item_id=item_id,
            )
        }

    def add_collection_item(self, collection_id: str, *, item_id: str) -> dict[str, object]:
        if self.item_repository.get_by_id(item_id) is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": item_id},
                retryable=False,
            )
        try:
            collection = self.repository.add_collection_item(collection_id=collection_id, item_id=item_id)
        except RuntimeError as error:
            raise ApiError(
                status_code=404,
                code="collection_not_found",
                message="Collection was not found.",
                details={"collection_id": collection_id},
                retryable=False,
            ) from error
        return {"collection": collection}

    def list_saved_searches(self) -> dict[str, object]:
        return {"items": self.repository.list_saved_searches()}

    def create_saved_search(self, payload: dict[str, object]) -> dict[str, object]:
        query = normalize_optional_text(payload.get("query"))
        if query is None:
            raise ApiError(
                status_code=400,
                code="saved_search_requires_query",
                message="Saved searches require a query string.",
                details={},
                retryable=False,
            )
        saved_search = self.repository.create_saved_search(
            name=str(payload["name"]).strip(),
            query=query,
            default_view=str(payload["default_view"]),
        )
        return {"items": [saved_search, *self.repository.list_saved_searches()[:-1]]}

    def list_source_groups(self) -> dict[str, object]:
        return {"items": self.repository.list_source_groups()}

    def create_source_group(self, payload: dict[str, object]) -> dict[str, object]:
        return {
            "group": self.repository.create_source_group(
                name=str(payload["name"]).strip(),
                description=normalize_optional_text(payload.get("description")),
                color=normalize_optional_text(payload.get("color")),
            )
        }

    def update_channel_control(self, channel_id: str, payload: dict[str, object]) -> dict[str, object]:
        if self.channel_repository.get_by_id(channel_id) is None:
            raise ApiError(
                status_code=404,
                code="channel_not_found",
                message="Channel was not found.",
                details={"channel_id": channel_id},
                retryable=False,
            )
        control = self.repository.update_channel_control(
            channel_id,
            group_id=payload.get("group_id") if "group_id" in payload else None,
            tier=payload.get("tier") if "tier" in payload else None,
            custom_source_cap=payload.get("custom_source_cap") if "custom_source_cap" in payload else None,
            paused_until=payload.get("paused_until") if "paused_until" in payload else None,
            snoozed_until=payload.get("snoozed_until") if "snoozed_until" in payload else None,
            notes=normalize_optional_text(payload.get("notes")) if "notes" in payload else None,
        )
        return {"control": normalize_control(channel_id, control)}

    def list_source_health(self) -> dict[str, object]:
        controls = self.repository.list_channel_controls()
        channels = self.channel_repository.list_channels(state=None, category=None, limit=500)
        items = []
        for channel in channels:
            control = normalize_control(channel["id"], controls.get(str(channel["id"])))
            items.append(
                {
                    "channel_id": channel["id"],
                    "title": channel["title"],
                    "feed_url": channel["feed_url"],
                    "category": channel["category"],
                    "state": channel["state"],
                    "unread_count": channel["unread_count"],
                    "health_status": channel["health"]["status"],
                    "health_summary": channel["health"]["summary"],
                    "group_name": control["group_name"],
                    "control": control,
                }
            )
        return {"items": items}

    def export_opml(self) -> dict[str, object]:
        channels = self.repository.list_channels_for_opml()
        outlines = []
        for channel in channels:
            attributes = [
                'type="rss"',
                f'text="{escape(channel["title"])}"',
                f'title="{escape(channel["title"])}"',
                f'xmlUrl="{escape(channel["feed_url"])}"',
            ]
            if channel.get("site_url"):
                attributes.append(f'htmlUrl="{escape(channel["site_url"])}"')
            if channel.get("category"):
                attributes.append(f'category="{escape(channel["category"])}"')
            outlines.append("    <outline " + " ".join(attributes) + " />")
        opml = "\n".join(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<opml version="2.0">',
                "  <head>",
                "    <title>rssmaster sources</title>",
                f"    <dateCreated>{utc_now()}</dateCreated>",
                "  </head>",
                "  <body>",
                *outlines,
                "  </body>",
                "</opml>",
            ]
        )
        return {"opml": opml}

    def import_opml(self, payload: dict[str, object]) -> dict[str, object]:
        raw_opml = str(payload["opml"]).strip()
        try:
            root = ElementTree.fromstring(raw_opml)
        except ElementTree.ParseError as error:
            raise ApiError(
                status_code=400,
                code="invalid_opml",
                message="OPML payload could not be parsed.",
                details={},
                retryable=False,
            ) from error

        category = normalize_optional_text(payload.get("default_category"))
        imported_channels: list[str] = []
        duplicate_count = 0
        for outline in root.findall(".//outline"):
            xml_url = normalize_optional_text(outline.attrib.get("xmlUrl"))
            if xml_url is None:
                continue
            try:
                feed_url = normalize_url(xml_url)
            except ApiError:
                continue
            existing = self.channel_repository.get_by_normalized_feed_url(feed_url)
            if existing is not None:
                duplicate_count += 1
                continue
            title = normalize_optional_text(outline.attrib.get("title")) or normalize_optional_text(outline.attrib.get("text")) or feed_url
            site_url = normalize_optional_text(outline.attrib.get("htmlUrl"))
            created = self.channel_repository.create_channel(
                title=title,
                site_url=site_url,
                feed_url=feed_url,
                normalized_feed_url=feed_url,
                description=None,
                language=None,
                category=category or normalize_optional_text(outline.attrib.get("category")),
            )
            imported_channels.append(str(created["title"]))
        return {
            "imported_count": len(imported_channels),
            "duplicate_count": duplicate_count,
            "channels": imported_channels,
        }

    def list_story_clusters(self, *, limit: int) -> dict[str, object]:
        self._refresh_story_clusters_and_rank(profile=self.get_profile(), target_count=max(limit, 6))
        rows = self.repository.list_story_cluster_rows(limit=limit)
        return {"items": build_story_cluster_response_items(rows, limit=limit)}

    def capture_url(self, payload: dict[str, object]) -> dict[str, object]:
        raw_url = normalize_optional_text(payload.get("url"))
        if raw_url is None:
            raise ApiError(
                status_code=400,
                code="capture_requires_url",
                message="Capture requires a URL.",
                details={},
                retryable=False,
            )
        normalized_url = normalize_url(raw_url)
        parsed = urlparse(normalized_url)
        if parsed.scheme not in {"http", "https"}:
            raise ApiError(
                status_code=400,
                code="capture_requires_http_url",
                message="Capture supports only http(s) URLs.",
                details={"url": normalized_url},
                retryable=False,
            )
        capture_note = normalize_optional_text(payload.get("note"))
        with httpx.Client(
            follow_redirects=True,
            headers={"User-Agent": "rssmaster/0.1.0 (+capture)"},
            timeout=self.settings.fetch_timeout_seconds,
        ) as client:
            response = client.get(normalized_url)
        document = prepare_document(
            html_source=response.text,
            fallback_text=payload.get("title"),
            base_url=normalized_url,
        )
        if document.content_text is None:
            raise ApiError(
                status_code=422,
                code="capture_failed",
                message="Could not derive readable article content from the provided URL.",
                details={"url": normalized_url},
                retryable=False,
            )
        title = normalize_optional_text(payload.get("title")) or derive_capture_title(response.text) or normalized_url
        capture_channel_id = self.repository.ensure_capture_channel()
        item_id = self.repository.insert_captured_item(
            channel_id=capture_channel_id,
            source_url=normalized_url,
            normalized_source_url=normalized_url,
            title=title,
            excerpt=document.excerpt,
            raw_html=response.text,
            cleaned_html=document.cleaned_html,
            content_text=document.content_text,
            note=capture_note,
        )
        if capture_note is not None:
            self.repository.ensure_item_note_annotation(item_id=item_id, note_text=capture_note)
        item = self.item_repository.get_by_id(item_id)
        if item is None:
            raise RuntimeError("Captured item could not be reloaded.")
        return {"item": serialize_item_card_from_item_model(item)}

    def export_workspace(self) -> dict[str, object]:
        snapshot = self.repository.list_export_rows()
        return {
            "exported_at": utc_now(),
            "profile": self.get_profile(),
            "sources_opml": self.export_opml()["opml"],
            "annotations": snapshot["annotations"],
            "tags": snapshot["tags"],
            "collections": snapshot["collections"],
            "saved_searches": snapshot["saved_searches"],
            "saved_items": [
                serialize_item_card(row)
                for row in snapshot["saved_items"]
            ],
            "continuity_items": [
                serialize_export_item(row)
                for row in snapshot["continuity_items"]
            ],
            "item_tags": snapshot["item_tags"],
            "collection_items": snapshot["collection_items"],
        }

    def import_continuity_bundle(self, payload: dict[str, object]) -> dict[str, object]:
        raw_sources_opml = normalize_optional_text(payload.get("sources_opml"))
        raw_continuity_items = payload.get("continuity_items")
        raw_annotations = payload.get("annotations")
        raw_tags = payload.get("tags")
        raw_collections = payload.get("collections")
        raw_saved_searches = payload.get("saved_searches")
        raw_item_tags = payload.get("item_tags")
        raw_collection_items = payload.get("collection_items")

        opml_summary = {
            "imported_count": 0,
            "duplicate_count": 0,
        }
        if raw_sources_opml is not None:
            imported = self.import_opml({"opml": raw_sources_opml})
            opml_summary = {
                "imported_count": int(imported["imported_count"]),
                "duplicate_count": int(imported["duplicate_count"]),
            }

        continuity_rows = raw_continuity_items if isinstance(raw_continuity_items, list) else []
        continuity_by_url: dict[str, dict[str, object]] = {}
        original_source_url_by_normalized_url: dict[str, str] = {}
        source_url_by_exported_item_id: dict[str, str] = {}
        unmatched_source_urls: list[str] = []

        for row in continuity_rows:
            if not isinstance(row, dict):
                continue
            source_url = normalize_optional_text(row.get("source_url"))
            exported_item_id = normalize_optional_text(row.get("item_id") or row.get("id"))
            if source_url is None:
                continue
            try:
                normalized_source_url = normalize_url(source_url)
            except ApiError:
                unmatched_source_urls.append(source_url)
                continue
            continuity_by_url[normalized_source_url] = {
                "source_url": source_url,
                "is_read": bool(row.get("is_read")),
                "is_favorite": bool(row.get("is_favorite")),
                "digest_candidate": bool(row.get("digest_candidate")),
                "is_archived": bool(row.get("is_archived")),
            }
            original_source_url_by_normalized_url[normalized_source_url] = source_url
            if exported_item_id is not None:
                source_url_by_exported_item_id[exported_item_id] = source_url

        matched_items: list[dict[str, object]] = []
        primary_item_id_by_source_url: dict[str, str] = {}
        restored_read_count = 0
        restored_saved_count = 0
        restored_digest_count = 0
        restored_archive_count = 0

        matched_rows = self.repository.list_items_by_normalized_source_urls(list(continuity_by_url.keys()))
        matched_by_url: dict[str, list[dict[str, object]]] = defaultdict(list)
        for row in matched_rows:
            matched_by_url[str(row["normalized_source_url"])].append(row)

        for normalized_source_url, snapshot in continuity_by_url.items():
            matches = matched_by_url.get(normalized_source_url, [])
            if not matches:
                unmatched_source_urls.append(original_source_url_by_normalized_url[normalized_source_url])
                continue

            for match in matches:
                self.item_repository.update_item_state(
                    str(match["id"]),
                    is_read=bool(snapshot["is_read"]),
                    update_is_read=True,
                    is_favorite=bool(snapshot["is_favorite"]),
                    update_is_favorite=True,
                    is_archived=bool(snapshot["is_archived"]),
                    update_is_archived=True,
                    digest_candidate=bool(snapshot["digest_candidate"]),
                    update_digest_candidate=True,
                )

            primary_match = matches[0]
            matched_items.append(
                {
                    "source_url": snapshot["source_url"],
                    "item_id": str(primary_match["id"]),
                    "title": str(primary_match["title"]),
                    "matched_by": "normalized_source_url",
                }
            )
            primary_item_id_by_source_url[str(snapshot["source_url"])] = str(primary_match["id"])
            restored_read_count += int(bool(snapshot["is_read"]))
            restored_saved_count += int(bool(snapshot["is_favorite"]))
            restored_digest_count += int(bool(snapshot["digest_candidate"]))
            restored_archive_count += int(bool(snapshot["is_archived"]))

        local_tag_id_by_exported_tag_id: dict[str, str] = {}
        restored_annotation_signatures: set[tuple[str, str, str, str, str]] = set()
        restored_tag_assignment_signatures: set[tuple[str, str]] = set()
        restored_collection_signatures: set[str] = set()
        restored_collection_item_signatures: set[tuple[str, str]] = set()
        restored_saved_search_signatures: set[tuple[str, str, str]] = set()

        for row in raw_tags if isinstance(raw_tags, list) else []:
            if not isinstance(row, dict):
                continue
            tag_name = normalize_optional_text(row.get("name"))
            if tag_name is None:
                continue
            local_tag = self.repository.create_tag(
                name=tag_name,
                color=normalize_optional_text(row.get("color")),
            )
            exported_tag_id = normalize_optional_text(row.get("id"))
            if exported_tag_id is not None:
                local_tag_id_by_exported_tag_id[exported_tag_id] = str(local_tag["id"])

        local_collection_id_by_exported_id: dict[str, str] = {}
        for row in raw_collections if isinstance(raw_collections, list) else []:
            if not isinstance(row, dict):
                continue
            collection_name = normalize_optional_text(row.get("name"))
            if collection_name is None:
                continue
            collection = self.repository.ensure_collection(
                name=collection_name,
                description=normalize_optional_text(row.get("description")),
            )
            restored_collection_signatures.add(str(collection["id"]))
            exported_collection_id = normalize_optional_text(row.get("id"))
            if exported_collection_id is not None:
                local_collection_id_by_exported_id[exported_collection_id] = str(collection["id"])

        for row in raw_saved_searches if isinstance(raw_saved_searches, list) else []:
            if not isinstance(row, dict):
                continue
            name = normalize_optional_text(row.get("name"))
            query = normalize_optional_text(row.get("query"))
            default_view = normalize_optional_text(row.get("default_view")) or "inbox"
            if default_view not in {"inbox", "saved", "digest", "archive"}:
                default_view = "inbox"
            if name is None or query is None:
                continue
            self.repository.ensure_saved_search(name=name, query=query, default_view=default_view)
            restored_saved_search_signatures.add((name.casefold(), query, default_view))

        for row in raw_annotations if isinstance(raw_annotations, list) else []:
            if not isinstance(row, dict):
                continue
            exported_item_id = normalize_optional_text(row.get("item_id"))
            if exported_item_id is None:
                continue
            source_url = source_url_by_exported_item_id.get(exported_item_id)
            if source_url is None:
                continue
            target_item_id = primary_item_id_by_source_url.get(source_url)
            if target_item_id is None:
                continue
            kind = normalize_optional_text(row.get("kind"))
            if kind not in {"note", "highlight"}:
                continue
            quote_text = normalize_optional_text(row.get("quote_text"))
            note_text = normalize_optional_text(row.get("note_text"))
            color = normalize_optional_text(row.get("color"))
            if kind == "note" and note_text is None:
                continue
            if kind == "highlight" and quote_text is None:
                continue
            signature = (
                target_item_id,
                kind,
                quote_text or "",
                note_text or "",
                color or "",
            )
            if signature in restored_annotation_signatures:
                continue
            self.repository.ensure_annotation_replay(
                item_id=target_item_id,
                kind=kind,
                quote_text=quote_text,
                note_text=note_text,
                color=color,
            )
            restored_annotation_signatures.add(signature)

        for row in raw_item_tags if isinstance(raw_item_tags, list) else []:
            if not isinstance(row, dict):
                continue
            exported_item_id = normalize_optional_text(row.get("item_id"))
            if exported_item_id is None:
                continue
            source_url = source_url_by_exported_item_id.get(exported_item_id)
            if source_url is None:
                continue
            target_item_id = primary_item_id_by_source_url.get(source_url)
            if target_item_id is None:
                continue
            exported_tag_id = normalize_optional_text(row.get("tag_id"))
            local_tag_id = local_tag_id_by_exported_tag_id.get(exported_tag_id) if exported_tag_id else None
            if local_tag_id is None:
                tag_name = normalize_optional_text(row.get("tag_name"))
                if tag_name is None:
                    continue
                local_tag_id = str(self.repository.create_tag(name=tag_name, color=None)["id"])
            signature = (target_item_id, local_tag_id)
            if signature in restored_tag_assignment_signatures:
                continue
            self.repository.add_item_tag(item_id=target_item_id, tag_id=local_tag_id)
            restored_tag_assignment_signatures.add(signature)

        for row in raw_collection_items if isinstance(raw_collection_items, list) else []:
            if not isinstance(row, dict):
                continue
            exported_collection_id = normalize_optional_text(row.get("collection_id"))
            exported_item_id = normalize_optional_text(row.get("item_id"))
            if exported_collection_id is None or exported_item_id is None:
                continue
            local_collection_id = local_collection_id_by_exported_id.get(exported_collection_id)
            source_url = source_url_by_exported_item_id.get(exported_item_id)
            if local_collection_id is None or source_url is None:
                continue
            target_item_id = primary_item_id_by_source_url.get(source_url)
            if target_item_id is None:
                continue
            signature = (local_collection_id, target_item_id)
            if signature in restored_collection_item_signatures:
                continue
            self.repository.add_collection_item(collection_id=local_collection_id, item_id=target_item_id)
            restored_collection_item_signatures.add(signature)

        deduped_unmatched_source_urls = list(dict.fromkeys(unmatched_source_urls))
        return {
            "imported_source_count": opml_summary["imported_count"],
            "duplicate_source_count": opml_summary["duplicate_count"],
            "matched_item_count": len(matched_items),
            "unmatched_item_count": len(deduped_unmatched_source_urls),
            "restored_read_count": restored_read_count,
            "restored_saved_count": restored_saved_count,
            "restored_digest_count": restored_digest_count,
            "restored_archive_count": restored_archive_count,
            "restored_annotation_count": len(restored_annotation_signatures),
            "restored_tag_assignment_count": len(restored_tag_assignment_signatures),
            "restored_collection_count": len(restored_collection_signatures),
            "restored_collection_item_count": len(restored_collection_item_signatures),
            "restored_saved_search_count": len(restored_saved_search_signatures),
            "matched_items": matched_items,
            "unmatched_source_urls": deduped_unmatched_source_urls,
        }

    def _refresh_story_clusters_and_rank(
        self,
        *,
        profile: dict[str, object],
        target_count: int | None = None,
    ) -> dict[str, object]:
        base_window_hours = max(1, int(profile["candidate_window_hours"]))
        recommendation_target = max(1, int(target_count or profile.get("daily_reading_goal") or 1))
        candidate_rows: list[dict[str, object]] = []
        clusters: list[dict[str, object]] = []
        states: list[dict[str, object]] = []

        window_plan: list[int] = []
        for candidate_window_hours in (base_window_hours, *FALLBACK_WINDOW_HOURS):
            normalized_window = max(base_window_hours, int(candidate_window_hours))
            if normalized_window not in window_plan:
                window_plan.append(normalized_window)

        for effective_window_hours in window_plan:
            candidate_rows = self.repository.list_candidate_rows(
                window_hours=effective_window_hours,
                limit=800,
            )
            clusters = build_story_clusters(candidate_rows)
            scoring_profile = {
                **profile,
                "candidate_window_hours": effective_window_hours,
            }
            states = build_ranking_states(candidate_rows, profile=scoring_profile, clusters=clusters)
            eligible_count = len([state for state in states if state["candidate_status"] == "eligible"])
            if eligible_count >= recommendation_target or effective_window_hours == window_plan[-1]:
                break

        self.repository.replace_story_clusters(clusters)
        generated_at = utc_now()
        for state in states:
            state["ranked_at"] = generated_at
        self.repository.upsert_ranking_state(states)
        return {"generated_at": generated_at}

    def _build_profile(self) -> dict[str, object]:
        profile = self.repository.ensure_profile()
        explicit_interests = self.repository.list_interests()
        learned_interests = derive_learned_interests(
            self.repository.list_preference_signal_rows(limit=SIGNAL_ROW_LIMIT),
            explicit_interests=explicit_interests,
        )
        profile["interests"] = explicit_interests
        profile["learned_interests"] = learned_interests
        profile["effective_interests"] = merge_profile_interests(explicit_interests, learned_interests)
        return profile

    @staticmethod
    def _filters(*, view: str | None, limit: int, digest_candidate: bool | None = None):
        from app.items.models import ItemListFilters
        from app.items.service import normalize_item_sort

        return ItemListFilters(
            channel_ids=(),
            categories=(),
            view=view,
            sort=normalize_item_sort("newest"),
            is_read=None,
            is_favorite=None,
            digest_candidate=digest_candidate,
            search=None,
            published_after=None,
            published_before=None,
            cursor=None,
            limit=limit,
        )


def build_story_clusters(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    groups: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        cluster_key = derive_story_cluster_key(row)
        groups[cluster_key].append(row)

    clusters: list[dict[str, object]] = []
    for cluster_key, items in groups.items():
        ordered = sorted(
            items,
            key=lambda row: (
                0 if row.get("is_favorite") else 1,
                0 if row.get("digest_candidate") else 1,
                0 if row.get("content_text") else 1,
                -(len(str(row.get("content_text") or ""))),
                -published_sort_value(row),
                str(row["id"]),
            ),
        )
        primary = ordered[0]
        source_count = len({str(item["channel_id"]) for item in ordered})
        clusters.append(
            {
                "id": f"stc_{uuid4().hex[:12]}",
                "cluster_key": cluster_key,
                "headline": str(primary["title"]),
                "primary_item_id": primary["id"],
                "item_count": len(ordered),
                "source_count": source_count,
                "category": primary.get("channel_category"),
                "item_ids": [str(item["id"]) for item in ordered[:6]],
            }
        )
    return sorted(clusters, key=lambda cluster: (-cluster["item_count"], cluster["headline"]))


def build_ranking_states(
    rows: list[dict[str, object]],
    *,
    profile: dict[str, object],
    clusters: list[dict[str, object]],
) -> list[dict[str, object]]:
    interest_rows = list(profile.get("effective_interests") or profile.get("interests") or [])
    interests = [
        {
            "label": str(interest["label"]),
            "match_key": str(interest.get("normalized_topic") or interest["label"]).casefold(),
            "kind": str(interest.get("kind") or "topic"),
            "weight": int(interest["weight"]),
        }
        for interest in interest_rows
    ]
    cluster_size_by_item: dict[str, int] = {}
    cluster_source_count_by_item: dict[str, int] = {}
    same_source_repeat_count_by_item: dict[str, int] = {}
    for cluster in clusters:
        source_count = max(1, int(cluster.get("source_count") or 1))
        same_source_repeat_count = max(0, int(cluster["item_count"]) - source_count)
        for item_id in cluster["item_ids"]:
            cluster_size_by_item[str(item_id)] = int(cluster["item_count"])
            cluster_source_count_by_item[str(item_id)] = source_count
            same_source_repeat_count_by_item[str(item_id)] = same_source_repeat_count

    now = datetime.now(UTC)
    scored_candidates: list[dict[str, object]] = []
    for row in rows:
        item_id = str(row["id"])
        source_key = str(row["channel_id"])
        tier = str(row.get("control_tier") or "default")
        source_cap = int(
            row.get("custom_source_cap")
            or (profile["priority_source_cap"] if tier == "priority" else profile["default_source_cap"])
        )
        paused_until = normalize_datetime(row.get("paused_until"))
        snoozed_until = normalize_datetime(row.get("snoozed_until"))
        cluster_size = cluster_size_by_item.get(item_id, 1)
        cluster_source_count = cluster_source_count_by_item.get(item_id, 1)
        same_source_repeat_count = same_source_repeat_count_by_item.get(item_id, max(0, cluster_size - 1))
        text_blob = " ".join(
            part
            for part in [
                str(row.get("title") or ""),
                str(row.get("excerpt") or ""),
                str(row.get("content_text") or ""),
                str(row.get("channel_title") or ""),
                str(row.get("channel_category") or ""),
            ]
            if part
        ).casefold()
        source_blob = " ".join(
            part
            for part in [
                str(row.get("channel_title") or ""),
                str(row.get("channel_category") or ""),
                str(row.get("group_name") or ""),
                str(row.get("channel_feed_url") or ""),
                str(row.get("channel_id") or ""),
            ]
            if part
        ).casefold()
        matched_interests: list[str] = []
        preference_score = 0.0
        for interest in interests:
            match_key = str(interest["match_key"])
            if not match_key:
                continue
            if interest["kind"] == "source":
                is_match = match_key in source_blob
                score_delta = int(interest["weight"]) * 10
            else:
                is_match = match_key in text_blob
                score_delta = int(interest["weight"]) * 8
            if not is_match:
                continue
            matched_interests.append(str(interest["label"]))
            preference_score += float(score_delta)
        age_hours = age_in_hours(row)
        freshness_score = max(0.0, round(28 - (age_hours * 28 / max(int(profile["candidate_window_hours"]), 1)), 2))
        source_quality_score = 8.0 if int(row.get("consecutive_failures") or 0) == 0 else float(-6 * min(int(row.get("consecutive_failures") or 0), 3))
        if tier == "priority":
            source_quality_score += 6
        elif tier == "muted":
            source_quality_score -= 18
        relevance_score = 10.0
        if row.get("content_text"):
            relevance_score += 6
        if row.get("digest_candidate"):
            relevance_score += 4
        if cluster_source_count > 1:
            relevance_score += min((cluster_source_count - 1) * MULTI_SOURCE_COVERAGE_BOOST, 8.0)
        if is_low_signal_headline(row.get("title")) and not matched_interests:
            relevance_score = max(0.0, relevance_score - LOW_SIGNAL_HEADLINE_PENALTY)
        engagement_score = 3.0 if row.get("is_favorite") else 0.0
        originality_score = max(0.0, 12.0 - (same_source_repeat_count * 3.5))
        duplicate_penalty = max(0.0, same_source_repeat_count * SAME_SOURCE_DUPLICATE_PENALTY)
        noise_penalty = 8.0 if int(row.get("channel_items_last_24h") or 0) > int(profile["emergency_source_cap"]) else 0.0

        candidate_status = "eligible"
        candidate_reason = None
        if paused_until and paused_until > now:
            candidate_status = "suppressed"
            candidate_reason = "source_paused"
        elif snoozed_until and snoozed_until > now:
            candidate_status = "suppressed"
            candidate_reason = "source_snoozed"
        elif tier == "muted":
            candidate_status = "suppressed"
            candidate_reason = "source_muted"
        elif row.get("is_read"):
            candidate_status = "excluded"
            candidate_reason = "already_read"

        base_score = round(
            relevance_score
            + preference_score
            + source_quality_score
            + freshness_score
            + originality_score
            + engagement_score
            - duplicate_penalty
            - noise_penalty,
            2,
        )
        scored_candidates.append(
            {
                "item_id": item_id,
                "candidate_status": candidate_status,
                "candidate_reason": candidate_reason,
                "source_key": source_key,
                "sort_timestamp": published_sort_value(row),
                "source_window_hours": int(profile["candidate_window_hours"]),
                "source_cap": source_cap,
                "base_score": base_score,
                "final_score": base_score,
                "low_signal_family": is_low_signal_headline(row.get("title")),
                "score_breakdown": {
                    "relevance_score": relevance_score,
                    "user_preference_score": preference_score,
                    "source_quality_score": source_quality_score,
                    "freshness_score": freshness_score,
                    "originality_score": originality_score,
                    "engagement_score": engagement_score,
                    "duplicate_penalty": duplicate_penalty,
                    "noise_penalty": noise_penalty,
                    "saturation_penalty": 0.0,
                    "diversity_penalty": 0.0,
                    "final_score": base_score,
                    "matched_interests": matched_interests,
                    "reason": candidate_reason or ("ranked_for_you" if matched_interests else "best_available_candidate"),
                },
            }
        )

    candidate_order = sorted(
        scored_candidates,
        key=lambda candidate: (
            float(candidate["base_score"]),
            float(candidate["sort_timestamp"]),
            str(candidate["item_id"]),
        ),
        reverse=True,
    )
    per_source_seen: Counter[str] = Counter()
    eligible_candidates: list[dict[str, object]] = []
    low_signal_family_seen = 0

    for candidate in candidate_order:
        if candidate["candidate_status"] != "eligible":
            continue

        source_key = str(candidate["source_key"])
        if per_source_seen[source_key] >= int(candidate["source_cap"]):
            candidate["candidate_status"] = "excluded"
            candidate["candidate_reason"] = "source_budget_exceeded"
            candidate["score_breakdown"]["reason"] = "source_budget_exceeded"
            continue

        saturation_penalty = max(0.0, per_source_seen[source_key] * 2.0)
        diversity_penalty = 0.0
        if bool(candidate.get("low_signal_family")):
            diversity_penalty += low_signal_family_seen * LOW_SIGNAL_FAMILY_SATURATION_PENALTY
        candidate["score_breakdown"]["saturation_penalty"] = saturation_penalty
        candidate["score_breakdown"]["diversity_penalty"] = diversity_penalty
        candidate["final_score"] = round(float(candidate["base_score"]) - saturation_penalty - diversity_penalty, 2)
        candidate["score_breakdown"]["final_score"] = candidate["final_score"]
        candidate["score_breakdown"]["reason"] = (
            "ranked_for_you"
            if candidate["score_breakdown"]["matched_interests"]
            else "curated_for_reading"
        )
        per_source_seen[source_key] += 1
        if bool(candidate.get("low_signal_family")):
            low_signal_family_seen += 1
        eligible_candidates.append(candidate)

    recommendation_cap = max(1, int(profile.get("daily_reading_goal") or 1))
    for index, candidate in enumerate(
        sorted(
            eligible_candidates,
            key=lambda entry: (
                float(entry["final_score"]),
                float(entry["sort_timestamp"]),
                str(entry["item_id"]),
            ),
            reverse=True,
        ),
        start=1,
    ):
        if index <= recommendation_cap:
            continue
        candidate["candidate_status"] = "excluded"
        candidate["candidate_reason"] = "daily_goal_cutoff"
        candidate["score_breakdown"]["reason"] = "below_daily_goal_cutoff"

    return [
        {
            "item_id": candidate["item_id"],
            "candidate_status": candidate["candidate_status"],
            "candidate_reason": candidate["candidate_reason"],
            "source_window_hours": candidate["source_window_hours"],
            "source_cap": candidate["source_cap"],
            "final_score": candidate["final_score"],
            "score_breakdown": candidate["score_breakdown"],
        }
        for candidate in candidate_order
    ]


def derive_story_cluster_key(row: dict[str, object]) -> str:
    keywords = extract_semantic_keywords(row, limit=SEMANTIC_CLUSTER_KEYWORD_LIMIT)
    tokens = sorted({normalize_cluster_token(keyword) for keyword in keywords if normalize_cluster_token(keyword)})
    if not tokens:
        base = str(row.get("title") or "")
        return f"title::{base.casefold()}"
    return "story::" + "|".join(tokens[:SEMANTIC_CLUSTER_KEYWORD_LIMIT])


def tokenize(value: str) -> list[str]:
    current: list[str] = []
    token = []
    for character in value.casefold():
        if character.isalnum():
            token.append(character)
            continue
        if token:
            current.append("".join(token))
            token = []
    if token:
        current.append("".join(token))
    return current


def derive_learned_interests(
    rows: list[dict[str, object]],
    *,
    explicit_interests: list[dict[str, object]],
) -> list[dict[str, object]]:
    explicit_keys = {
        (str(interest.get("kind") or "topic"), str(interest.get("normalized_topic") or interest["label"]).casefold())
        for interest in explicit_interests
    }
    topic_scores: Counter[str] = Counter()
    source_scores: Counter[str] = Counter()
    topic_labels: dict[str, str] = {}
    eligible_sources: set[str] = set()

    for row in rows:
        annotation_count = int(row.get("annotation_count") or 0)
        tag_names = [tag.strip() for tag in str(row.get("tag_names") or "").split("|") if tag.strip()]
        row_is_low_signal = is_low_signal_headline(row.get("title"))
        has_editorial_signal = annotation_count > 0 or bool(tag_names)
        signal_weight = 1
        if row.get("is_favorite"):
            signal_weight += 4
        if row.get("digest_candidate"):
            signal_weight += 2
        signal_weight += min(annotation_count, 3) * 2
        signal_weight += min(len(tag_names), 3)

        source_label = normalize_optional_text(row.get("channel_title"))
        source_match_key = normalize_interest_key(source_label)
        if source_label and source_match_key and (not row_is_low_signal or has_editorial_signal):
            eligible_sources.add(source_match_key)
            source_scores[source_label] += signal_weight

        for tag_name in tag_names:
            normalized_tag = normalize_interest_key(tag_name)
            if not normalized_tag or ("topic", normalized_tag) in explicit_keys:
                continue
            topic_scores[normalized_tag] += signal_weight + 2
            topic_labels.setdefault(normalized_tag, tag_name)

        if not row_is_low_signal:
            for index, keyword in enumerate(extract_semantic_keywords(row, limit=8)):
                normalized_keyword = normalize_interest_key(keyword)
                if not normalized_keyword or ("topic", normalized_keyword) in explicit_keys:
                    continue
                topic_scores[normalized_keyword] += max(1, signal_weight - index)
                topic_labels.setdefault(normalized_keyword, keyword)

    learned_interests: list[dict[str, object]] = []
    for label, score in topic_scores.most_common(LEARNED_TOPIC_LIMIT):
        if score < 3:
            continue
        learned_interests.append(
            {
                "id": f"learned_topic_{label}",
                "label": topic_labels.get(label, label),
                "normalized_topic": label,
                "kind": "topic",
                "weight": 2 if score >= 10 else 1,
            }
        )

    if len(eligible_sources) >= 2:
        for source_label, score in source_scores.most_common(LEARNED_SOURCE_LIMIT):
            normalized_source = normalize_interest_key(source_label)
            if not normalized_source or score < 4 or ("source", normalized_source) in explicit_keys:
                continue
            learned_interests.append(
                {
                    "id": f"learned_source_{normalized_source}",
                    "label": source_label,
                    "normalized_topic": normalized_source,
                    "kind": "source",
                    "weight": 2 if score >= 10 else 1,
                }
            )

    return learned_interests


def merge_profile_interests(
    explicit_interests: list[dict[str, object]],
    learned_interests: list[dict[str, object]],
) -> list[dict[str, object]]:
    merged: dict[tuple[str, str], dict[str, object]] = {}
    for interest in explicit_interests:
        key = (
            str(interest.get("kind") or "topic"),
            str(interest.get("normalized_topic") or interest["label"]).casefold(),
        )
        merged[key] = dict(interest)
    for interest in learned_interests:
        key = (
            str(interest.get("kind") or "topic"),
            str(interest.get("normalized_topic") or interest["label"]).casefold(),
        )
        merged.setdefault(key, dict(interest))
    return sorted(
        merged.values(),
        key=lambda interest: (-int(interest["weight"]), str(interest["label"]).casefold()),
    )


def extract_semantic_keywords(row: dict[str, object], *, limit: int) -> list[str]:
    weighted_tokens: Counter[str] = Counter()
    label_by_token: dict[str, str] = {}
    for raw_text, weight, normalizer in (
        (str(row.get("title") or ""), 6, normalize_interest_key),
        (str(row.get("excerpt") or ""), 3, normalize_interest_key),
        (str(row.get("channel_category") or ""), 2, normalize_interest_key),
        (str(row.get("content_text") or "")[:900], 1, normalize_interest_key),
    ):
        if not raw_text:
            continue
        for token in tokenize(raw_text):
            normalized = normalizer(token)
            if not normalized:
                continue
            weighted_tokens[normalized] += weight
            label_by_token.setdefault(normalized, token.casefold())
    ranked = sorted(
        weighted_tokens.items(),
        key=lambda entry: (-entry[1], -len(entry[0]), entry[0]),
    )
    return [label_by_token[token] for token, _score in ranked[: max(1, limit)]]


def normalize_interest_key(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip().casefold()
    if not text:
        return None
    if any(character.isdigit() for character in text):
        return None
    if text in TOPIC_STOPWORDS or text in LOW_SIGNAL_HEADLINE_MARKERS:
        return None
    if len(text) < 4:
        return None
    return text


def normalize_cluster_token(value: str) -> str | None:
    token = normalize_interest_key(value)
    if token is None:
        return None
    for suffix in (
        "owie",
        "ami",
        "ach",
        "ego",
        "emu",
        "owej",
        "owego",
        "ymi",
        "owy",
        "owa",
        "owe",
        "ych",
        "cia",
        "cji",
        "anie",
        "enia",
    ):
        if token.endswith(suffix) and len(token) - len(suffix) >= 4:
            return token[: -len(suffix)]
    return token


def build_story_cluster_response_items(rows: list[dict[str, object]], *, limit: int) -> list[dict[str, object]]:
    grouped: dict[str, dict[str, object]] = {}
    for row in rows:
        cluster_id = str(row["id"])
        cluster = grouped.setdefault(
            cluster_id,
            {
                "id": cluster_id,
                "headline": row["headline"],
                "item_count": int(row["item_count"] or 0),
                "category": row["category"],
                "primary": None,
                "alternates": [],
                "_seen_item_ids": set(),
            },
        )
        item = serialize_item_card(row, story_cluster_id=cluster_id, story_cluster_size=int(row["item_count"] or 1))
        item_id = str(item["id"])
        if item_id in cluster["_seen_item_ids"]:
            continue
        cluster["_seen_item_ids"].add(item_id)
        if int(row["rank_index"] or 0) == 0 and cluster["primary"] is None:
            cluster["primary"] = item
        else:
            cluster["alternates"].append(item)

    items: list[dict[str, object]] = []
    for cluster in grouped.values():
        primary = cluster["primary"]
        alternates = list(cluster["alternates"])
        if primary is None and alternates:
            primary = alternates.pop(0)
        if primary is None:
            continue
        cluster.pop("_seen_item_ids", None)
        items.append(
            {
                "id": cluster["id"],
                "headline": cluster["headline"],
                "item_count": cluster["item_count"],
                "category": cluster["category"],
                "primary": primary,
                "alternates": alternates,
            }
        )
        if len(items) >= max(1, limit):
            break
    return items


def serialize_item_card(row: dict[str, object], *, story_cluster_id: str | None = None, story_cluster_size: int = 1) -> dict[str, object]:
    return {
        "id": row["item_id"] if "item_id" in row else row["id"],
        "channel_id": row["channel_id"],
        "title": row["title"],
        "author": row.get("author"),
        "source_url": row["source_url"],
        "excerpt": row.get("excerpt"),
        "published_at": row.get("published_at"),
        "is_read": bool(row.get("is_read")),
        "is_favorite": bool(row.get("is_favorite")),
        "digest_candidate": bool(row.get("digest_candidate")),
        "channel_title": row["channel_title"],
        "channel_category": row.get("channel_category"),
        "channel_feed_url": row["channel_feed_url"],
        "story_cluster_id": story_cluster_id or row.get("story_cluster_id"),
        "story_cluster_size": story_cluster_size or int(row.get("story_cluster_size") or 1),
    }


def serialize_item_card_from_item_model(item: dict[str, object]) -> dict[str, object]:
    channel = item["channel"]
    return {
        "id": item["id"],
        "channel_id": item["channel_id"],
        "title": item["title"],
        "author": item.get("author"),
        "source_url": item["source_url"],
        "excerpt": item.get("excerpt"),
        "published_at": item.get("published_at"),
        "is_read": bool(item["is_read"]),
        "is_favorite": bool(item["is_favorite"]),
        "digest_candidate": bool(item["digest_candidate"]),
        "channel_title": channel["title"],
        "channel_category": channel.get("category"),
        "channel_feed_url": channel["feed_url"],
        "story_cluster_id": None,
        "story_cluster_size": 1,
    }


def serialize_export_item(row: dict[str, object]) -> dict[str, object]:
    return {
        **serialize_item_card(row),
        "is_archived": bool(row.get("archived_at")),
    }


def serialize_ranked_row(row: dict[str, object]) -> dict[str, object]:
    breakdown = parse_breakdown(row.get("score_breakdown_json"))
    return {
        "item": serialize_item_card(row),
        "candidate_status": row["candidate_status"],
        "candidate_reason": row.get("candidate_reason"),
        "source_cap": int(row["source_cap"]),
        "source_window_hours": int(row["source_window_hours"]),
        "breakdown": {
            "relevance_score": float(breakdown.get("relevance_score", 0)),
            "user_preference_score": float(breakdown.get("user_preference_score", 0)),
            "source_quality_score": float(breakdown.get("source_quality_score", 0)),
            "freshness_score": float(breakdown.get("freshness_score", 0)),
            "originality_score": float(breakdown.get("originality_score", 0)),
            "engagement_score": float(breakdown.get("engagement_score", 0)),
            "duplicate_penalty": float(breakdown.get("duplicate_penalty", 0)),
            "noise_penalty": float(breakdown.get("noise_penalty", 0)),
            "saturation_penalty": float(breakdown.get("saturation_penalty", 0)),
            "diversity_penalty": float(breakdown.get("diversity_penalty", 0)),
            "final_score": float(breakdown.get("final_score", row.get("final_score", 0))),
            "matched_interests": list(breakdown.get("matched_interests", [])),
            "reason": str(breakdown.get("reason", row.get("candidate_reason") or "ranked_for_you")),
        },
    }


def normalize_optional_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def normalize_control(channel_id: str, control: dict[str, object] | None) -> dict[str, object]:
    return {
        "channel_id": channel_id,
        "group_id": control.get("group_id") if control else None,
        "tier": control.get("tier", "default") if control else "default",
        "custom_source_cap": control.get("custom_source_cap") if control else None,
        "paused_until": control.get("paused_until") if control else None,
        "snoozed_until": control.get("snoozed_until") if control else None,
        "notes": control.get("notes") if control else None,
        "group_name": control.get("group_name") if control else None,
    }


def age_in_hours(row: dict[str, object]) -> float:
    timestamp = normalize_datetime(row.get("published_at")) or normalize_datetime(row.get("discovered_at")) or normalize_datetime(row.get("ingested_at"))
    if timestamp is None:
        return 0.0
    return max(0.0, (datetime.now(UTC) - timestamp).total_seconds() / 3600)


def normalize_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def published_sort_value(row: dict[str, object]) -> float:
    timestamp = normalize_datetime(row.get("published_at")) or normalize_datetime(row.get("discovered_at")) or normalize_datetime(row.get("ingested_at"))
    if timestamp is None:
        return 0.0
    return timestamp.timestamp()


def derive_capture_title(html: str) -> str | None:
    lowered = html.lower()
    start = lowered.find("<title>")
    end = lowered.find("</title>")
    if start < 0 or end < 0 or end <= start:
        return None
    value = html[start + 7 : end].strip()
    return value or None


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def is_low_signal_headline(value: object) -> bool:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return False
    lowered = normalized.casefold()
    if lowered.startswith(LOW_SIGNAL_HEADLINE_PREFIXES):
        return True
    return "kurs " in lowered and any(marker in lowered for marker in LOW_SIGNAL_HEADLINE_MARKERS)
