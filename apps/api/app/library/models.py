from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, field_validator

LibraryView = Literal["inbox", "saved", "archive"]
LibrarySortMode = Literal["newest", "oldest", "recently_saved"]
LibraryEntityState = Literal["active", "archived"]
RecallSurfaceId = Literal["today", "this_week", "recently_saved"]


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def normalize_identifier_list(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None

    normalized: list[str] = []
    seen: set[str] = set()
    for entry in value:
        cleaned = entry.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        normalized.append(cleaned)

    return normalized or None


@dataclass(frozen=True)
class OffsetCursor:
    offset: int


@dataclass(frozen=True)
class LibraryQueryDefinition:
    search: str | None
    channel_ids: tuple[str, ...]
    categories: tuple[str, ...]
    tag_ids: tuple[str, ...]
    collection_ids: tuple[str, ...]
    view: LibraryView | None
    sort: LibrarySortMode
    is_read: bool | None
    is_favorite: bool | None
    digest_candidate: bool | None
    published_after: str | None
    published_before: str | None
    include_archived_items: bool


class LibraryPageModel(BaseModel):
    next_cursor: str | None
    has_more: bool
    limit: int


class LibraryChannelModel(BaseModel):
    id: str
    title: str
    category: str | None
    feed_url: str
    site_url: str | None
    state: str


class LibraryItemStateModel(BaseModel):
    state: Literal["inbox", "saved", "archived"]
    saved_at: str | None
    archived_at: str | None
    is_saved: bool
    is_archived: bool


class LibraryItemTagModel(BaseModel):
    id: str
    name: str
    color: str | None


class LibraryItemCollectionModel(BaseModel):
    id: str
    name: str
    position: int | None = None


class LibraryItemModel(BaseModel):
    id: str
    channel_id: str
    title: str
    author: str | None
    source_url: str
    excerpt: str | None
    published_at: str | None
    is_read: bool
    is_favorite: bool
    is_archived: bool
    digest_candidate: bool
    extraction_status: str
    has_cleaned_content: bool
    has_raw_content: bool
    library: LibraryItemStateModel
    channel: LibraryChannelModel
    tags: list[LibraryItemTagModel] = Field(default_factory=list)
    collections: list[LibraryItemCollectionModel] = Field(default_factory=list)


class LibraryItemListResponse(BaseModel):
    items: list[LibraryItemModel]
    page: LibraryPageModel


class TagModel(BaseModel):
    id: str
    name: str
    color: str | None
    description: str | None
    state: LibraryEntityState
    item_count: int
    unread_count: int
    last_assigned_at: str | None
    created_at: str
    updated_at: str
    archived_at: str | None


class CollectionModel(BaseModel):
    id: str
    name: str
    description: str | None
    state: LibraryEntityState
    item_count: int
    unread_count: int
    last_added_at: str | None
    created_at: str
    updated_at: str
    archived_at: str | None


class SavedSearchQueryModel(BaseModel):
    search: str | None = Field(default=None, max_length=200)
    channel_ids: list[str] | None = None
    categories: list[str] | None = None
    tag_ids: list[str] | None = None
    collection_ids: list[str] | None = None
    view: LibraryView | None = None
    sort: LibrarySortMode = "newest"
    is_read: bool | None = None
    is_favorite: bool | None = None
    digest_candidate: bool | None = None
    published_after: str | None = None
    published_before: str | None = None
    include_archived_items: bool = False

    @field_validator("search", "published_after", "published_before")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("channel_ids", "categories", "tag_ids", "collection_ids")
    @classmethod
    def normalize_lists(cls, value: list[str] | None) -> list[str] | None:
        return normalize_identifier_list(value)


class SavedSearchModel(BaseModel):
    id: str
    name: str
    description: str | None
    state: LibraryEntityState
    query: SavedSearchQueryModel
    match_count: int
    created_at: str
    updated_at: str
    last_used_at: str | None
    archived_at: str | None


class RecallSurfaceModel(BaseModel):
    id: RecallSurfaceId
    title: str
    description: str
    sort: LibrarySortMode
    item_count: int
    unread_count: int
    start_at: str | None
    end_at: str | None


class RecallSurfaceListResponse(BaseModel):
    items: list[RecallSurfaceModel]


class RecallSurfaceResponse(BaseModel):
    surface: RecallSurfaceModel
    items: list[LibraryItemModel]
    page: LibraryPageModel


class TagListResponse(BaseModel):
    items: list[TagModel]
    page: LibraryPageModel


class TagResponse(BaseModel):
    tag: TagModel


class CollectionListResponse(BaseModel):
    items: list[CollectionModel]
    page: LibraryPageModel


class CollectionResponse(BaseModel):
    collection: CollectionModel


class SavedSearchListResponse(BaseModel):
    items: list[SavedSearchModel]
    page: LibraryPageModel


class SavedSearchResponse(BaseModel):
    saved_search: SavedSearchModel


class CreateTagRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=16)
    description: str | None = Field(default=None, max_length=240)

    @field_validator("name", "color", "description")
    @classmethod
    def normalize_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class UpdateTagRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=16)
    description: str | None = Field(default=None, max_length=240)
    state: LibraryEntityState | None = None

    @field_validator("name", "color", "description")
    @classmethod
    def normalize_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class ReplaceTagItemsRequest(BaseModel):
    item_ids: list[str] = Field(default_factory=list)

    @field_validator("item_ids")
    @classmethod
    def normalize_item_ids(cls, value: list[str]) -> list[str]:
        return normalize_identifier_list(value) or []


class CreateCollectionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)

    @field_validator("name", "description")
    @classmethod
    def normalize_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class UpdateCollectionRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)
    state: LibraryEntityState | None = None

    @field_validator("name", "description")
    @classmethod
    def normalize_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class ReplaceCollectionItemsRequest(BaseModel):
    item_ids: list[str] = Field(default_factory=list)

    @field_validator("item_ids")
    @classmethod
    def normalize_item_ids(cls, value: list[str]) -> list[str]:
        return normalize_identifier_list(value) or []


class CreateSavedSearchRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)
    query: SavedSearchQueryModel = Field(default_factory=SavedSearchQueryModel)

    @field_validator("name", "description")
    @classmethod
    def normalize_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class UpdateSavedSearchRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)
    state: LibraryEntityState | None = None
    query: SavedSearchQueryModel | None = None

    @field_validator("name", "description")
    @classmethod
    def normalize_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)
