from __future__ import annotations

import base64
import json
import re
import sqlite3
from dataclasses import replace
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.config import Settings
from app.errors import ApiError

from .models import (
    CreateCollectionRequest,
    CreateSavedSearchRequest,
    CreateTagRequest,
    LibraryEntityState,
    LibraryPageModel,
    LibraryQueryDefinition,
    OffsetCursor,
    RecallSurfaceId,
    ReplaceCollectionItemsRequest,
    ReplaceTagItemsRequest,
    SavedSearchQueryModel,
    UpdateCollectionRequest,
    UpdateSavedSearchRequest,
    UpdateTagRequest,
    normalize_optional_text,
)
from .repository import LibraryRepository, OffsetListResult

HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
TOKEN_COLOR_RE = re.compile(r"^[a-z0-9_-]{1,16}$")


class LibraryService:
    def __init__(self, settings: Settings, repository: LibraryRepository) -> None:
        self.settings = settings
        self.repository = repository
        self.timezone = ZoneInfo(settings.timezone)

    def list_tags(self, *, include_archived: bool, cursor: str | None, limit: int) -> dict[str, Any]:
        result = self.repository.list_tags(
            include_archived=include_archived,
            limit=limit,
            offset=decode_offset_cursor(cursor).offset if cursor else 0,
        )
        return build_paged_payload(result)

    def get_tag(self, tag_id: str) -> dict[str, Any]:
        tag = self.repository.get_tag(tag_id)
        if tag is None:
            raise not_found_error("tag_not_found", "Tag was not found.", tag_id=tag_id)
        return tag

    def create_tag(self, payload: CreateTagRequest) -> dict[str, Any]:
        validate_color_value(payload.color)
        normalized_name = normalize_entity_name(payload.name)
        try:
            return self.repository.create_tag(
                name=payload.name,
                normalized_name=normalized_name,
                color=payload.color,
                description=payload.description,
            )
        except sqlite3.IntegrityError as error:
            raise duplicate_name_error("tag", payload.name) from error

    def update_tag(self, tag_id: str, payload: UpdateTagRequest) -> dict[str, Any]:
        existing = self.get_tag(tag_id)
        if existing["state"] == "archived" and payload.state != "active":
            raise ApiError(
                status_code=409,
                code="tag_archived",
                message="Archived tags must be restored before they can be changed.",
                details={"tag_id": tag_id},
                retryable=False,
            )

        if not payload.model_fields_set:
            raise no_updates_error("tag", tag_id)

        if "color" in payload.model_fields_set:
            validate_color_value(payload.color)

        try:
            return self.repository.update_tag(
                tag_id,
                name=payload.name,
                normalized_name=normalize_entity_name(payload.name) if "name" in payload.model_fields_set else None,
                update_name="name" in payload.model_fields_set,
                color=payload.color,
                update_color="color" in payload.model_fields_set,
                description=payload.description,
                update_description="description" in payload.model_fields_set,
                state=payload.state,
                update_state="state" in payload.model_fields_set,
            )
        except sqlite3.IntegrityError as error:
            raise duplicate_name_error("tag", payload.name or existing["name"]) from error
        except RuntimeError as error:
            raise not_found_error("tag_not_found", "Tag was not found.", tag_id=tag_id) from error

    def archive_tag(self, tag_id: str) -> dict[str, Any]:
        try:
            return self.repository.archive_tag(tag_id)
        except RuntimeError as error:
            raise not_found_error("tag_not_found", "Tag was not found.", tag_id=tag_id) from error

    def replace_tag_items(self, tag_id: str, payload: ReplaceTagItemsRequest) -> dict[str, Any]:
        tag = self.get_tag(tag_id)
        if tag["state"] == "archived":
            raise ApiError(
                status_code=409,
                code="tag_archived",
                message="Archived tags cannot be assigned to items.",
                details={"tag_id": tag_id},
                retryable=False,
            )

        validate_existing_ids(
            requested_ids=payload.item_ids,
            existing_ids=self.repository.get_existing_item_ids(payload.item_ids),
            resource_name="item",
            field_name="item_ids",
        )
        try:
            return self.repository.replace_tag_items(tag_id, payload.item_ids)
        except RuntimeError as error:
            raise not_found_error("tag_not_found", "Tag was not found.", tag_id=tag_id) from error

    def list_tag_items(
        self,
        tag_id: str,
        *,
        include_archived_items: bool,
        cursor: str | None,
        limit: int,
    ) -> dict[str, Any]:
        self.get_tag(tag_id)
        result = self.repository.list_tag_items(
            tag_id,
            include_archived_items=include_archived_items,
            limit=limit,
            offset=decode_offset_cursor(cursor).offset if cursor else 0,
        )
        return build_paged_payload(result)

    def list_collections(self, *, include_archived: bool, cursor: str | None, limit: int) -> dict[str, Any]:
        result = self.repository.list_collections(
            include_archived=include_archived,
            limit=limit,
            offset=decode_offset_cursor(cursor).offset if cursor else 0,
        )
        return build_paged_payload(result)

    def get_collection(self, collection_id: str) -> dict[str, Any]:
        collection = self.repository.get_collection(collection_id)
        if collection is None:
            raise not_found_error("collection_not_found", "Collection was not found.", collection_id=collection_id)
        return collection

    def create_collection(self, payload: CreateCollectionRequest) -> dict[str, Any]:
        normalized_name = normalize_entity_name(payload.name)
        try:
            return self.repository.create_collection(
                name=payload.name,
                normalized_name=normalized_name,
                description=payload.description,
            )
        except sqlite3.IntegrityError as error:
            raise duplicate_name_error("collection", payload.name) from error

    def update_collection(self, collection_id: str, payload: UpdateCollectionRequest) -> dict[str, Any]:
        existing = self.get_collection(collection_id)
        if existing["state"] == "archived" and payload.state != "active":
            raise ApiError(
                status_code=409,
                code="collection_archived",
                message="Archived collections must be restored before they can be changed.",
                details={"collection_id": collection_id},
                retryable=False,
            )

        if not payload.model_fields_set:
            raise no_updates_error("collection", collection_id)

        try:
            return self.repository.update_collection(
                collection_id,
                name=payload.name,
                normalized_name=normalize_entity_name(payload.name) if "name" in payload.model_fields_set else None,
                update_name="name" in payload.model_fields_set,
                description=payload.description,
                update_description="description" in payload.model_fields_set,
                state=payload.state,
                update_state="state" in payload.model_fields_set,
            )
        except sqlite3.IntegrityError as error:
            raise duplicate_name_error("collection", payload.name or existing["name"]) from error
        except RuntimeError as error:
            raise not_found_error("collection_not_found", "Collection was not found.", collection_id=collection_id) from error

    def archive_collection(self, collection_id: str) -> dict[str, Any]:
        try:
            return self.repository.archive_collection(collection_id)
        except RuntimeError as error:
            raise not_found_error("collection_not_found", "Collection was not found.", collection_id=collection_id) from error

    def replace_collection_items(self, collection_id: str, payload: ReplaceCollectionItemsRequest) -> dict[str, Any]:
        collection = self.get_collection(collection_id)
        if collection["state"] == "archived":
            raise ApiError(
                status_code=409,
                code="collection_archived",
                message="Archived collections cannot be assigned to items.",
                details={"collection_id": collection_id},
                retryable=False,
            )

        validate_existing_ids(
            requested_ids=payload.item_ids,
            existing_ids=self.repository.get_existing_item_ids(payload.item_ids),
            resource_name="item",
            field_name="item_ids",
        )
        try:
            return self.repository.replace_collection_items(collection_id, payload.item_ids)
        except RuntimeError as error:
            raise not_found_error("collection_not_found", "Collection was not found.", collection_id=collection_id) from error

    def list_collection_items(
        self,
        collection_id: str,
        *,
        include_archived_items: bool,
        cursor: str | None,
        limit: int,
    ) -> dict[str, Any]:
        self.get_collection(collection_id)
        result = self.repository.list_collection_items(
            collection_id,
            include_archived_items=include_archived_items,
            limit=limit,
            offset=decode_offset_cursor(cursor).offset if cursor else 0,
        )
        return build_paged_payload(result)

    def list_saved_searches(self, *, include_archived: bool, cursor: str | None, limit: int) -> dict[str, Any]:
        result = self.repository.list_saved_searches(
            include_archived=include_archived,
            limit=limit,
            offset=decode_offset_cursor(cursor).offset if cursor else 0,
        )
        items = [self._hydrate_saved_search(saved_search) for saved_search in result.items]
        return build_paged_payload(
            OffsetListResult(
                items=items,
                next_offset=result.next_offset,
                has_more=result.has_more,
                limit=result.limit,
            )
        )

    def get_saved_search(self, saved_search_id: str) -> dict[str, Any]:
        saved_search = self.repository.get_saved_search(saved_search_id)
        if saved_search is None:
            raise not_found_error(
                "saved_search_not_found",
                "Saved search was not found.",
                saved_search_id=saved_search_id,
            )
        return self._hydrate_saved_search(saved_search)

    def create_saved_search(self, payload: CreateSavedSearchRequest) -> dict[str, Any]:
        query = self.normalize_saved_search_query(payload.query, validate_references=True)
        try:
            saved_search = self.repository.create_saved_search(
                name=payload.name,
                normalized_name=normalize_entity_name(payload.name),
                description=payload.description,
                query_payload=serialize_query_definition(query),
            )
        except sqlite3.IntegrityError as error:
            raise duplicate_name_error("saved search", payload.name) from error

        return self._hydrate_saved_search(saved_search, query=query)

    def update_saved_search(self, saved_search_id: str, payload: UpdateSavedSearchRequest) -> dict[str, Any]:
        existing = self.repository.get_saved_search(saved_search_id)
        if existing is None:
            raise not_found_error(
                "saved_search_not_found",
                "Saved search was not found.",
                saved_search_id=saved_search_id,
            )
        if not payload.model_fields_set:
            raise no_updates_error("saved search", saved_search_id)

        query = self.normalize_saved_search_query(payload.query, validate_references=True) if payload.query else None
        try:
            saved_search = self.repository.update_saved_search(
                saved_search_id,
                name=payload.name,
                normalized_name=normalize_entity_name(payload.name) if "name" in payload.model_fields_set else None,
                update_name="name" in payload.model_fields_set,
                description=payload.description,
                update_description="description" in payload.model_fields_set,
                query_payload=serialize_query_definition(query) if query is not None else None,
                update_query="query" in payload.model_fields_set,
                state=payload.state,
                update_state="state" in payload.model_fields_set,
            )
        except sqlite3.IntegrityError as error:
            raise duplicate_name_error("saved search", payload.name or existing["name"]) from error

        return self._hydrate_saved_search(saved_search, query=query)

    def archive_saved_search(self, saved_search_id: str) -> dict[str, Any]:
        try:
            saved_search = self.repository.archive_saved_search(saved_search_id)
        except RuntimeError as error:
            raise not_found_error(
                "saved_search_not_found",
                "Saved search was not found.",
                saved_search_id=saved_search_id,
            ) from error
        return self._hydrate_saved_search(saved_search)

    def execute_saved_search(self, saved_search_id: str, *, cursor: str | None, limit: int) -> dict[str, Any]:
        raw_saved_search = self.repository.get_saved_search(saved_search_id)
        if raw_saved_search is None:
            raise not_found_error(
                "saved_search_not_found",
                "Saved search was not found.",
                saved_search_id=saved_search_id,
            )

        query = self.normalize_saved_search_query(raw_saved_search["query"], validate_references=False)
        result = self.repository.list_items_for_query(
            query,
            limit=limit,
            offset=decode_offset_cursor(cursor).offset if cursor else 0,
        )
        self.repository.touch_saved_search(saved_search_id)
        return build_paged_payload(result)

    def list_recall_surfaces(self) -> dict[str, Any]:
        items = [self._build_surface_summary(surface_id) for surface_id in ("today", "this_week", "recently_saved")]
        return {"items": items}

    def get_recall_surface(self, surface_id: RecallSurfaceId | str, *, cursor: str | None, limit: int) -> dict[str, Any]:
        resolved_surface_id = normalize_surface_id(surface_id)
        surface = self._build_surface_summary(resolved_surface_id)
        query = build_surface_query(resolved_surface_id, now=datetime.now(self.timezone), timezone=self.timezone)
        result = self.repository.list_items_for_query(
            query,
            limit=limit,
            offset=decode_offset_cursor(cursor).offset if cursor else 0,
        )
        return {
            "surface": surface,
            "items": result.items,
            "page": build_page_model(result),
        }

    def normalize_saved_search_query(
        self,
        value: SavedSearchQueryModel | dict[str, Any] | None,
        *,
        validate_references: bool,
    ) -> LibraryQueryDefinition:
        query_model = value if isinstance(value, SavedSearchQueryModel) else SavedSearchQueryModel.model_validate(value or {})
        query = LibraryQueryDefinition(
            search=normalize_optional_text(query_model.search),
            channel_ids=tuple(query_model.channel_ids or ()),
            categories=tuple(query_model.categories or ()),
            tag_ids=tuple(query_model.tag_ids or ()),
            collection_ids=tuple(query_model.collection_ids or ()),
            view=query_model.view,
            sort=query_model.sort,
            is_read=query_model.is_read,
            is_favorite=query_model.is_favorite,
            digest_candidate=query_model.digest_candidate,
            published_after=normalize_datetime_filter("published_after", query_model.published_after),
            published_before=normalize_datetime_filter("published_before", query_model.published_before),
            include_archived_items=query_model.include_archived_items,
        )
        validate_time_window(query.published_after, query.published_before)

        if validate_references:
            validate_existing_ids(
                requested_ids=list(query.channel_ids),
                existing_ids=self.repository.get_existing_channel_ids(list(query.channel_ids)),
                resource_name="channel",
                field_name="channel_ids",
            )
            validate_existing_ids(
                requested_ids=list(query.tag_ids),
                existing_ids=self.repository.get_existing_tag_ids(list(query.tag_ids)),
                resource_name="tag",
                field_name="tag_ids",
            )
            validate_existing_ids(
                requested_ids=list(query.collection_ids),
                existing_ids=self.repository.get_existing_collection_ids(list(query.collection_ids)),
                resource_name="collection",
                field_name="collection_ids",
            )

        return query

    def _hydrate_saved_search(
        self,
        saved_search: dict[str, Any],
        *,
        query: LibraryQueryDefinition | None = None,
    ) -> dict[str, Any]:
        resolved_query = query or self.normalize_saved_search_query(saved_search.get("query"), validate_references=False)
        return {
            **saved_search,
            "query": serialize_query_definition(resolved_query),
            "match_count": self.repository.count_items(resolved_query),
        }

    def _build_surface_summary(self, surface_id: RecallSurfaceId) -> dict[str, Any]:
        now = datetime.now(self.timezone)
        query = build_surface_query(surface_id, now=now, timezone=self.timezone)
        metadata = surface_metadata(surface_id, now=now, timezone=self.timezone)
        unread_query = query if query.is_read is False else replace(query, is_read=False)

        return {
            "id": surface_id,
            "title": metadata["title"],
            "description": metadata["description"],
            "sort": metadata["sort"],
            "item_count": self.repository.count_items(query),
            "unread_count": 0 if query.is_read is True else self.repository.count_items(unread_query),
            "start_at": metadata["start_at"],
            "end_at": metadata["end_at"],
        }


def build_paged_payload(result: OffsetListResult) -> dict[str, Any]:
    return {
        "items": result.items,
        "page": build_page_model(result),
    }


def build_page_model(result: OffsetListResult) -> LibraryPageModel:
    return LibraryPageModel(
        next_cursor=encode_offset_cursor(OffsetCursor(offset=result.next_offset)) if result.next_offset is not None else None,
        has_more=result.has_more,
        limit=result.limit,
    )


def decode_offset_cursor(value: str | None) -> OffsetCursor:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return OffsetCursor(offset=0)

    try:
        padded = normalized + "=" * (-len(normalized) % 4)
        payload = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        parsed = json.loads(payload)
    except (UnicodeDecodeError, ValueError, json.JSONDecodeError) as error:
        raise ApiError(
            status_code=400,
            code="invalid_library_cursor",
            message="cursor must be a valid opaque pagination token.",
            details={"cursor": normalized},
            retryable=False,
        ) from error

    offset = parsed.get("offset")
    if not isinstance(offset, int) or offset < 0:
        raise ApiError(
            status_code=400,
            code="invalid_library_cursor",
            message="cursor must contain a non-negative offset.",
            details={"cursor": normalized},
            retryable=False,
        )

    return OffsetCursor(offset=offset)


def encode_offset_cursor(cursor: OffsetCursor) -> str:
    payload = json.dumps({"offset": cursor.offset}, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def serialize_query_definition(query: LibraryQueryDefinition) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "sort": query.sort,
        "include_archived_items": query.include_archived_items,
    }
    if query.search is not None:
        payload["search"] = query.search
    if query.channel_ids:
        payload["channel_ids"] = list(query.channel_ids)
    if query.categories:
        payload["categories"] = list(query.categories)
    if query.tag_ids:
        payload["tag_ids"] = list(query.tag_ids)
    if query.collection_ids:
        payload["collection_ids"] = list(query.collection_ids)
    if query.view is not None:
        payload["view"] = query.view
    if query.is_read is not None:
        payload["is_read"] = query.is_read
    if query.is_favorite is not None:
        payload["is_favorite"] = query.is_favorite
    if query.digest_candidate is not None:
        payload["digest_candidate"] = query.digest_candidate
    if query.published_after is not None:
        payload["published_after"] = query.published_after
    if query.published_before is not None:
        payload["published_before"] = query.published_before
    return payload


def normalize_entity_name(value: str | None) -> str:
    normalized = normalize_optional_text(value)
    if normalized is None:
        raise ApiError(
            status_code=400,
            code="invalid_library_name",
            message="name must not be empty.",
            details={},
            retryable=False,
        )
    return " ".join(normalized.casefold().split())


def validate_color_value(value: str | None) -> None:
    if value is None:
        return
    if HEX_COLOR_RE.fullmatch(value) or TOKEN_COLOR_RE.fullmatch(value.casefold()):
        return
    raise ApiError(
        status_code=400,
        code="invalid_tag_color",
        message="color must be a hex value like #0f172a or a simple token.",
        details={"color": value},
        retryable=False,
    )


def validate_existing_ids(
    *,
    requested_ids: list[str],
    existing_ids: set[str],
    resource_name: str,
    field_name: str,
) -> None:
    if not requested_ids:
        return
    missing_ids = sorted({item_id for item_id in requested_ids if item_id not in existing_ids})
    if not missing_ids:
        return
    raise ApiError(
        status_code=404,
        code=f"{resource_name}_not_found",
        message=f"One or more {resource_name} ids were not found.",
        details={field_name: missing_ids},
        retryable=False,
    )


def normalize_datetime_filter(field_name: str, value: str | None) -> str | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None

    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as error:
        raise ApiError(
            status_code=400,
            code="invalid_library_time_filter",
            message=f"{field_name} must be a valid ISO 8601 timestamp.",
            details={"field": field_name, "value": normalized},
            retryable=False,
        ) from error

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    else:
        parsed = parsed.astimezone(UTC)

    return parsed.isoformat().replace("+00:00", "Z")


def validate_time_window(published_after: str | None, published_before: str | None) -> None:
    if published_after is None or published_before is None:
        return
    after_dt = datetime.fromisoformat(published_after.replace("Z", "+00:00"))
    before_dt = datetime.fromisoformat(published_before.replace("Z", "+00:00"))
    if after_dt <= before_dt:
        return
    raise ApiError(
        status_code=400,
        code="invalid_library_time_window",
        message="published_after must be earlier than or equal to published_before.",
        details={"published_after": published_after, "published_before": published_before},
        retryable=False,
    )


def normalize_surface_id(value: RecallSurfaceId | str) -> RecallSurfaceId:
    match str(value).strip().casefold():
        case "today":
            return "today"
        case "this_week" | "this-week":
            return "this_week"
        case "recently_saved" | "recently-saved":
            return "recently_saved"
        case _:
            raise ApiError(
                status_code=400,
                code="invalid_recall_surface",
                message="surface_id must be one of today, this_week, or recently_saved.",
                details={"surface_id": value},
                retryable=False,
            )


def build_surface_query(surface_id: RecallSurfaceId, *, now: datetime, timezone: ZoneInfo) -> LibraryQueryDefinition:
    metadata = surface_metadata(surface_id, now=now, timezone=timezone)
    if surface_id == "recently_saved":
        return LibraryQueryDefinition(
            search=None,
            channel_ids=(),
            categories=(),
            tag_ids=(),
            collection_ids=(),
            view="saved",
            sort="recently_saved",
            is_read=None,
            is_favorite=None,
            digest_candidate=None,
            published_after=None,
            published_before=None,
            include_archived_items=False,
        )

    return LibraryQueryDefinition(
        search=None,
        channel_ids=(),
        categories=(),
        tag_ids=(),
        collection_ids=(),
        view=None,
        sort="newest",
        is_read=None,
        is_favorite=None,
        digest_candidate=None,
        published_after=metadata["start_at"],
        published_before=metadata["end_at"],
        include_archived_items=False,
    )


def surface_metadata(surface_id: RecallSurfaceId, *, now: datetime, timezone: ZoneInfo) -> dict[str, Any]:
    if surface_id == "today":
        start_local = datetime.combine(now.date(), time.min, tzinfo=timezone)
        end_local = datetime.combine(now.date(), time.max, tzinfo=timezone)
        return {
            "title": "Today",
            "description": "Fresh reading from the current local day.",
            "sort": "newest",
            "start_at": start_local.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "end_at": end_local.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        }

    if surface_id == "this_week":
        start_of_week = now.date() - timedelta(days=now.weekday())
        start_local = datetime.combine(start_of_week, time.min, tzinfo=timezone)
        end_local = datetime.combine(start_of_week + timedelta(days=6), time.max, tzinfo=timezone)
        return {
            "title": "This Week",
            "description": "Everything surfaced during the current local week.",
            "sort": "newest",
            "start_at": start_local.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "end_at": end_local.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        }

    return {
        "title": "Recently Saved",
        "description": "Saved items ordered by the moment they were favorited.",
        "sort": "recently_saved",
        "start_at": None,
        "end_at": None,
    }


def duplicate_name_error(resource_name: str, name: str) -> ApiError:
    return ApiError(
        status_code=409,
        code="library_name_conflict",
        message=f"A {resource_name} with this name already exists.",
        details={"name": name},
        retryable=False,
    )


def no_updates_error(resource_name: str, resource_id: str) -> ApiError:
    return ApiError(
        status_code=400,
        code="no_library_updates",
        message=f"At least one {resource_name} field must be updated.",
        details={"id": resource_id},
        retryable=False,
    )


def not_found_error(code: str, message: str, **details: object) -> ApiError:
    return ApiError(
        status_code=404,
        code=code,
        message=message,
        details=dict(details),
        retryable=False,
    )
