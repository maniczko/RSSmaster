from __future__ import annotations

import base64
import json

from app.errors import ApiError

from .models import (
    AnnotationCursor,
    AnnotationKind,
    AnnotationListFilters,
    AnnotationListResult,
    AnnotationSortMode,
    CreateDocumentNoteRequest,
    CreateHighlightNoteRequest,
    CreateHighlightRequest,
)
from .repository import AnnotationRepository


class AnnotationService:
    def __init__(self, repository: AnnotationRepository) -> None:
        self.repository = repository

    def create_highlight(self, payload: CreateHighlightRequest) -> dict[str, object]:
        item = self.repository.get_item_summary(payload.item_id)
        if item is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": payload.item_id},
                retryable=False,
            )

        anchor = payload.anchor.model_dump(exclude_none=True)
        duplicate_id = self.repository.find_duplicate_highlight(
            item_id=payload.item_id,
            quote_text=payload.quote_text,
            anchor=anchor,
        )
        if duplicate_id is not None:
            raise ApiError(
                status_code=409,
                code="highlight_already_exists",
                message="An equivalent highlight already exists for this item.",
                details={"item_id": payload.item_id, "highlight_id": duplicate_id},
                retryable=False,
            )

        return self.repository.create_highlight(
            item_id=payload.item_id,
            quote_text=payload.quote_text,
            color=payload.color,
            anchor=anchor,
        )

    def get_highlight(self, highlight_id: str) -> dict[str, object]:
        highlight = self.repository.get_highlight(normalize_required_id("highlight_id", highlight_id))
        if highlight is None:
            raise ApiError(
                status_code=404,
                code="highlight_not_found",
                message="Highlight was not found.",
                details={"highlight_id": highlight_id},
                retryable=False,
            )
        return highlight

    def list_highlights(
        self,
        *,
        item_id: str | None,
        search: str | None,
        sort: str | None,
        cursor: str | None,
        limit: int,
    ) -> AnnotationListResult:
        filters = build_filters(
            item_id=item_id,
            highlight_id=None,
            kind=None,
            search=search,
            sort=sort,
            cursor=cursor,
            limit=limit,
        )
        result = self.repository.list_highlights(filters)
        return serialize_list_result(result)

    def create_highlight_note(self, highlight_id: str, payload: CreateHighlightNoteRequest) -> dict[str, object]:
        resolved_highlight_id = normalize_required_id("highlight_id", highlight_id)
        highlight = self.repository.get_highlight(resolved_highlight_id)
        if highlight is None:
            raise ApiError(
                status_code=404,
                code="highlight_not_found",
                message="Highlight was not found.",
                details={"highlight_id": highlight_id},
                retryable=False,
            )

        return self.repository.create_highlight_note(
            highlight_id=resolved_highlight_id,
            item_id=str(highlight["item_id"]),
            body=payload.body,
        )

    def get_highlight_note(self, note_id: str) -> dict[str, object]:
        resolved_note_id = normalize_required_id("note_id", note_id)
        note = self.repository.get_highlight_note(resolved_note_id)
        if note is None:
            raise ApiError(
                status_code=404,
                code="highlight_note_not_found",
                message="Highlight note was not found.",
                details={"note_id": note_id},
                retryable=False,
            )
        return note

    def list_highlight_notes(
        self,
        *,
        item_id: str | None,
        highlight_id: str | None,
        search: str | None,
        sort: str | None,
        cursor: str | None,
        limit: int,
    ) -> AnnotationListResult:
        normalized_highlight_id = normalize_optional_text(highlight_id)
        if normalized_highlight_id is not None and self.repository.get_highlight(normalized_highlight_id) is None:
            raise ApiError(
                status_code=404,
                code="highlight_not_found",
                message="Highlight was not found.",
                details={"highlight_id": normalized_highlight_id},
                retryable=False,
            )

        filters = build_filters(
            item_id=item_id,
            highlight_id=normalized_highlight_id,
            kind="highlight_note",
            search=search,
            sort=sort,
            cursor=cursor,
            limit=limit,
        )
        result = self.repository.list_highlight_notes(filters)
        return serialize_list_result(result)

    def create_document_note(self, payload: CreateDocumentNoteRequest) -> dict[str, object]:
        item = self.repository.get_item_summary(payload.item_id)
        if item is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": payload.item_id},
                retryable=False,
            )

        return self.repository.create_document_note(
            item_id=payload.item_id,
            title=payload.title,
            body=payload.body,
        )

    def get_document_note(self, note_id: str) -> dict[str, object]:
        resolved_note_id = normalize_required_id("note_id", note_id)
        note = self.repository.get_document_note(resolved_note_id)
        if note is None:
            raise ApiError(
                status_code=404,
                code="document_note_not_found",
                message="Document note was not found.",
                details={"note_id": note_id},
                retryable=False,
            )
        return note

    def list_document_notes(
        self,
        *,
        item_id: str | None,
        search: str | None,
        sort: str | None,
        cursor: str | None,
        limit: int,
    ) -> AnnotationListResult:
        filters = build_filters(
            item_id=item_id,
            highlight_id=None,
            kind="document_note",
            search=search,
            sort=sort,
            cursor=cursor,
            limit=limit,
        )
        result = self.repository.list_document_notes(filters)
        return serialize_list_result(result)

    def list_annotations(
        self,
        *,
        item_id: str | None,
        kind: str | None,
        search: str | None,
        sort: str | None,
        cursor: str | None,
        limit: int,
    ) -> AnnotationListResult:
        filters = build_filters(
            item_id=item_id,
            highlight_id=None,
            kind=kind,
            search=search,
            sort=sort,
            cursor=cursor,
            limit=limit,
        )
        result = self.repository.list_annotations(filters)
        return serialize_list_result(result)

    def get_annotation_hub(self, item_id: str) -> dict[str, object]:
        resolved_item_id = normalize_required_id("item_id", item_id)
        hub = self.repository.get_annotation_hub(resolved_item_id)
        if hub is None:
            raise ApiError(
                status_code=404,
                code="item_not_found",
                message="Item was not found.",
                details={"item_id": resolved_item_id},
                retryable=False,
            )
        return hub


def serialize_list_result(result) -> AnnotationListResult:
    return AnnotationListResult(
        items=result.items,
        next_cursor=encode_annotation_cursor(result.next_cursor) if result.next_cursor is not None else None,
        has_more=result.has_more,
        limit=result.limit,
    )


def build_filters(
    *,
    item_id: str | None,
    highlight_id: str | None,
    kind: str | None,
    search: str | None,
    sort: str | None,
    cursor: str | None,
    limit: int,
) -> AnnotationListFilters:
    return AnnotationListFilters(
        item_id=normalize_optional_text(item_id),
        highlight_id=normalize_optional_text(highlight_id),
        kind=normalize_annotation_kind(kind),
        sort=normalize_annotation_sort(sort),
        search=normalize_optional_text(search),
        cursor=decode_annotation_cursor(cursor),
        limit=limit,
    )


def normalize_required_id(field_name: str, value: str) -> str:
    cleaned = normalize_optional_text(value)
    if cleaned is not None:
        return cleaned

    raise ApiError(
        status_code=400,
        code="invalid_annotation_identifier",
        message=f"{field_name} must be a non-empty identifier.",
        details={"field": field_name, "value": value},
        retryable=False,
    )


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def normalize_annotation_kind(value: str | None) -> AnnotationKind | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None

    match normalized.casefold():
        case "highlight" | "highlights":
            return "highlight"
        case "highlight_note" | "highlight-note" | "highlight_notes" | "highlight-notes":
            return "highlight_note"
        case "document_note" | "document-note" | "document_notes" | "document-notes":
            return "document_note"
        case _:
            raise ApiError(
                status_code=400,
                code="invalid_annotation_kind",
                message="kind must be one of highlight, highlight_note, or document_note.",
                details={"field": "kind", "value": normalized},
                retryable=False,
            )


def normalize_annotation_sort(value: str | None) -> AnnotationSortMode:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return "newest"

    match normalized.casefold():
        case "newest" | "created_desc":
            return "newest"
        case "oldest" | "created_asc":
            return "oldest"
        case _:
            raise ApiError(
                status_code=400,
                code="invalid_annotation_sort",
                message="sort must be one of newest or oldest.",
                details={"field": "sort", "value": normalized},
                retryable=False,
            )


def decode_annotation_cursor(value: str | None) -> AnnotationCursor | None:
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
            code="invalid_annotation_cursor",
            message="cursor must be a valid opaque pagination token.",
            details={"cursor": normalized},
            retryable=False,
        ) from error

    sort_value = parsed.get("sort_value")
    annotation_key = parsed.get("annotation_key")
    if not isinstance(sort_value, str) or not sort_value.strip() or not isinstance(annotation_key, str) or not annotation_key.strip():
        raise ApiError(
            status_code=400,
            code="invalid_annotation_cursor",
            message="cursor must contain sort_value and annotation_key.",
            details={"cursor": normalized},
            retryable=False,
        )

    return AnnotationCursor(sort_value=sort_value, annotation_key=annotation_key)


def encode_annotation_cursor(cursor: AnnotationCursor) -> str:
    payload = json.dumps(
        {
            "sort_value": cursor.sort_value,
            "annotation_key": cursor.annotation_key,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
