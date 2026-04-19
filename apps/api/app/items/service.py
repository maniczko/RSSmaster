from __future__ import annotations

import base64
import json
from datetime import datetime, timezone

from app.errors import ApiError

from .models import ItemCursor, ItemListFilters, ItemListResult, ItemSortMode, LibraryAction, LibraryView
from .repository import ItemRepository


class ItemService:
    def __init__(self, repository: ItemRepository) -> None:
        self.repository = repository

    def list_items(
        self,
        *,
        channel_id: str | None,
        category: str | None,
        view: str | None,
        sort: str | None,
        is_read: bool | None,
        is_favorite: bool | None,
        digest_candidate: bool | None,
        search: str | None,
        published_after: str | None,
        published_before: str | None,
        cursor: str | None,
        limit: int,
    ) -> ItemListResult:
        filters = ItemListFilters(
            channel_ids=split_filter_values(channel_id),
            categories=split_filter_values(category),
            view=normalize_library_view(view),
            sort=normalize_item_sort(sort),
            is_read=is_read,
            is_favorite=is_favorite,
            digest_candidate=digest_candidate,
            search=normalize_optional_text(search),
            published_after=normalize_datetime_filter("published_after", published_after),
            published_before=normalize_datetime_filter("published_before", published_before),
            cursor=decode_item_cursor(cursor),
            limit=limit,
        )
        validate_time_window(filters.published_after, filters.published_before)
        result = self.repository.list_items(filters)
        return ItemListResult(
            items=result.items,
            next_cursor=encode_item_cursor(result.next_cursor) if result.next_cursor is not None else None,
            has_more=result.has_more,
            limit=result.limit,
        )

    def update_item_state(
        self,
        item_id: str,
        *,
        is_read: bool | None,
        update_is_read: bool,
        is_favorite: bool | None,
        update_is_favorite: bool,
        is_archived: bool | None,
        update_is_archived: bool,
        digest_candidate: bool | None,
        update_digest_candidate: bool,
        library_action: LibraryAction | None,
    ) -> dict[str, object]:
        if self.repository.get_by_id(item_id) is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": item_id},
                retryable=False,
            )

        (
            resolved_is_favorite,
            resolved_update_is_favorite,
            resolved_is_archived,
            resolved_update_is_archived,
        ) = resolve_library_mutation(
            item_id=item_id,
            is_favorite=is_favorite,
            update_is_favorite=update_is_favorite,
            is_archived=is_archived,
            update_is_archived=update_is_archived,
            library_action=library_action,
        )

        if not update_is_read and not resolved_update_is_favorite and not resolved_update_is_archived and not update_digest_candidate:
            raise ApiError(
                status_code=400,
                code="no_item_state_updates",
                message="At least one item state field must be updated.",
                details={"item_id": item_id},
                retryable=False,
            )

        return self.repository.update_item_state(
            item_id,
            is_read=is_read,
            update_is_read=update_is_read,
            is_favorite=resolved_is_favorite,
            update_is_favorite=resolved_update_is_favorite,
            is_archived=resolved_is_archived,
            update_is_archived=resolved_update_is_archived,
            digest_candidate=digest_candidate,
            update_digest_candidate=update_digest_candidate,
        )

    def get_item_detail(self, item_id: str) -> dict[str, object]:
        item = self.repository.get_detail_by_id(item_id)
        if item is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": item_id},
                retryable=False,
            )
        return item


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def split_filter_values(value: str | None) -> tuple[str, ...]:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return ()

    values: list[str] = []
    seen: set[str] = set()
    for part in normalized.split(","):
        cleaned = part.strip()
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        values.append(cleaned)

    return tuple(values)


def normalize_library_view(value: str | None) -> LibraryView | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None

    match normalized.casefold():
        case "inbox":
            return "inbox"
        case "saved":
            return "saved"
        case "archive" | "archived":
            return "archive"
        case _:
            raise ApiError(
                status_code=400,
                code="invalid_item_view",
                message="view must be one of inbox, saved, or archive.",
                details={"field": "view", "value": normalized},
                retryable=False,
            )


def normalize_item_sort(value: str | None) -> ItemSortMode:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return "newest"

    match normalized.casefold():
        case "newest" | "published_desc":
            return "newest"
        case "oldest" | "published_asc":
            return "oldest"
        case _:
            raise ApiError(
                status_code=400,
                code="invalid_item_sort",
                message="sort must be one of newest or oldest.",
                details={"field": "sort", "value": normalized},
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
            code="invalid_item_time_filter",
            message=f"{field_name} must be a valid ISO 8601 timestamp.",
            details={"field": field_name, "value": normalized},
            retryable=False,
        ) from error

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)

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
        code="invalid_item_time_window",
        message="published_after must be earlier than or equal to published_before.",
        details={"published_after": published_after, "published_before": published_before},
        retryable=False,
    )


def decode_item_cursor(value: str | None) -> ItemCursor | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None

    try:
        padded = normalized + "=" * (-len(normalized) % 4)
        payload = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        parsed = json.loads(payload)
    except (UnicodeDecodeError, ValueError, json.JSONDecodeError) as error:
        raise ApiError(
            status_code=400,
            code="invalid_item_cursor",
            message="cursor must be a valid opaque pagination token.",
            details={"cursor": normalized},
            retryable=False,
        ) from error

    sort_value = parsed.get("sort_value")
    item_id = parsed.get("item_id")
    if not isinstance(sort_value, str) or not sort_value.strip() or not isinstance(item_id, str) or not item_id.strip():
        raise ApiError(
            status_code=400,
            code="invalid_item_cursor",
            message="cursor must contain sort_value and item_id.",
            details={"cursor": normalized},
            retryable=False,
        )

    return ItemCursor(sort_value=sort_value, item_id=item_id)


def encode_item_cursor(cursor: ItemCursor) -> str:
    payload = json.dumps(
        {
            "sort_value": cursor.sort_value,
            "item_id": cursor.item_id,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def resolve_library_mutation(
    *,
    item_id: str,
    is_favorite: bool | None,
    update_is_favorite: bool,
    is_archived: bool | None,
    update_is_archived: bool,
    library_action: LibraryAction | None,
) -> tuple[bool | None, bool, bool | None, bool]:
    resolved_is_favorite = is_favorite
    resolved_update_is_favorite = update_is_favorite
    resolved_is_archived = is_archived
    resolved_update_is_archived = update_is_archived

    if library_action is None:
        return (
            resolved_is_favorite,
            resolved_update_is_favorite,
            resolved_is_archived,
            resolved_update_is_archived,
        )

    if library_action in {"save", "unsave"}:
        target_is_favorite = library_action == "save"
        if resolved_update_is_favorite and resolved_is_favorite != target_is_favorite:
            raise ApiError(
                status_code=400,
                code="conflicting_library_update",
                message="library_action conflicts with the requested save state.",
                details={"item_id": item_id, "library_action": library_action},
                retryable=False,
            )
        resolved_is_favorite = target_is_favorite
        resolved_update_is_favorite = True

    if library_action in {"archive", "restore"}:
        target_is_archived = library_action == "archive"
        if resolved_update_is_archived and resolved_is_archived != target_is_archived:
            raise ApiError(
                status_code=400,
                code="conflicting_library_update",
                message="library_action conflicts with the requested archive state.",
                details={"item_id": item_id, "library_action": library_action},
                retryable=False,
            )
        resolved_is_archived = target_is_archived
        resolved_update_is_archived = True

    return (
        resolved_is_favorite,
        resolved_update_is_favorite,
        resolved_is_archived,
        resolved_update_is_archived,
    )
