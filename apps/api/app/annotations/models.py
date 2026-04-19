from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AnnotationKind = Literal["highlight", "highlight_note", "document_note"]
AnnotationSortMode = Literal["newest", "oldest"]
AnnotationSearchField = Literal["quote", "body", "title", "context", "item"]


@dataclass(frozen=True)
class AnnotationCursor:
    sort_value: str
    annotation_key: str


@dataclass(frozen=True)
class AnnotationListFilters:
    item_id: str | None
    highlight_id: str | None
    kind: AnnotationKind | None
    sort: AnnotationSortMode
    search: str | None
    cursor: AnnotationCursor | None
    limit: int


@dataclass(frozen=True)
class AnnotationListResult:
    items: list[dict[str, object]]
    next_cursor: str | None
    has_more: bool
    limit: int


class AnnotationItemSummaryModel(BaseModel):
    id: str
    title: str
    source_url: str
    published_at: str | None
    channel_id: str
    channel_title: str
    channel_category: str | None = None


class HighlightAnchorModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    text_start: int | None = Field(default=None, ge=0)
    text_end: int | None = Field(default=None, ge=0)
    occurrence_index: int | None = Field(default=None, ge=0)
    prefix: str | None = Field(default=None, max_length=500)
    suffix: str | None = Field(default=None, max_length=500)
    selector: str | None = Field(default=None, max_length=1000)
    metadata: dict[str, object] = Field(default_factory=dict)

    @field_validator("prefix", "suffix", "selector", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_offsets(self) -> "HighlightAnchorModel":
        if self.text_start is None and self.text_end is None:
            return self
        if self.text_start is None or self.text_end is None:
            raise ValueError("text_start and text_end must be provided together.")
        if self.text_start > self.text_end:
            raise ValueError("text_start must be less than or equal to text_end.")
        return self


class AnnotationSearchMatchModel(BaseModel):
    primary_field: AnnotationSearchField
    fields: list[AnnotationSearchField]
    snippet: str | None


class HighlightReferenceModel(BaseModel):
    id: str
    quote_text: str
    color: str | None
    anchor: HighlightAnchorModel


class HighlightNoteModel(BaseModel):
    kind: Literal["highlight_note"] = "highlight_note"
    id: str
    highlight_id: str
    item_id: str
    body: str
    created_at: str
    updated_at: str
    item: AnnotationItemSummaryModel
    highlight: HighlightReferenceModel
    search_match: AnnotationSearchMatchModel | None = None


class HighlightModel(BaseModel):
    kind: Literal["highlight"] = "highlight"
    id: str
    item_id: str
    quote_text: str
    color: str | None
    anchor: HighlightAnchorModel
    note_count: int
    created_at: str
    updated_at: str
    item: AnnotationItemSummaryModel
    notes: list[HighlightNoteModel] = Field(default_factory=list)
    search_match: AnnotationSearchMatchModel | None = None


class DocumentNoteModel(BaseModel):
    kind: Literal["document_note"] = "document_note"
    id: str
    item_id: str
    title: str | None
    body: str
    created_at: str
    updated_at: str
    item: AnnotationItemSummaryModel
    search_match: AnnotationSearchMatchModel | None = None


class AnnotationTimelineEntryModel(BaseModel):
    id: str
    kind: AnnotationKind
    item_id: str
    title: str | None = None
    body: str | None = None
    quote_text: str | None = None
    color: str | None = None
    highlight_id: str | None = None
    created_at: str
    updated_at: str
    item: AnnotationItemSummaryModel
    highlight: HighlightReferenceModel | None = None
    search_match: AnnotationSearchMatchModel | None = None


class AnnotationListPageModel(BaseModel):
    next_cursor: str | None
    has_more: bool
    limit: int


class AnnotationListResponse(BaseModel):
    items: list[AnnotationTimelineEntryModel]
    page: AnnotationListPageModel


class HighlightListResponse(BaseModel):
    items: list[HighlightModel]
    page: AnnotationListPageModel


class HighlightNoteListResponse(BaseModel):
    items: list[HighlightNoteModel]
    page: AnnotationListPageModel


class DocumentNoteListResponse(BaseModel):
    items: list[DocumentNoteModel]
    page: AnnotationListPageModel


class HighlightResponse(BaseModel):
    highlight: HighlightModel


class HighlightNoteResponse(BaseModel):
    note: HighlightNoteModel


class DocumentNoteResponse(BaseModel):
    note: DocumentNoteModel


class AnnotationHubSummaryModel(BaseModel):
    total_annotations: int
    highlight_count: int
    highlight_note_count: int
    document_note_count: int
    latest_activity_at: str | None


class AnnotationHubModel(BaseModel):
    item: AnnotationItemSummaryModel
    summary: AnnotationHubSummaryModel
    highlights: list[HighlightModel]
    document_notes: list[DocumentNoteModel]
    recent_activity: list[AnnotationTimelineEntryModel]


class AnnotationHubResponse(BaseModel):
    hub: AnnotationHubModel


class CreateHighlightRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    item_id: str = Field(min_length=1)
    quote_text: str = Field(min_length=1, max_length=8000)
    color: str | None = Field(default=None, max_length=40)
    anchor: HighlightAnchorModel = Field(default_factory=HighlightAnchorModel)

    @field_validator("color", mode="before")
    @classmethod
    def normalize_color(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        cleaned = value.strip().lower()
        return cleaned or None


class CreateHighlightNoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    body: str = Field(min_length=1, max_length=20000)


class CreateDocumentNoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    item_id: str = Field(min_length=1)
    title: str | None = Field(default=None, max_length=200)
    body: str = Field(min_length=1, max_length=20000)

    @field_validator("title", mode="before")
    @classmethod
    def normalize_title(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or None
