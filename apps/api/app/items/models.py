from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel

LibraryView = Literal["inbox", "saved", "archive"]
LibraryState = Literal["inbox", "saved", "archived"]
LibraryAction = Literal["save", "unsave", "archive", "restore"]
ItemSortMode = Literal["newest", "oldest"]


@dataclass(frozen=True)
class ItemCursor:
    sort_value: str
    item_id: str


@dataclass(frozen=True)
class ItemListFilters:
    channel_ids: tuple[str, ...]
    categories: tuple[str, ...]
    view: LibraryView | None
    sort: ItemSortMode
    is_read: bool | None
    is_favorite: bool | None
    digest_candidate: bool | None
    search: str | None
    published_after: str | None
    published_before: str | None
    cursor: ItemCursor | None
    limit: int


@dataclass(frozen=True)
class ItemListResult:
    items: list[dict[str, object]]
    next_cursor: str | None
    has_more: bool
    limit: int


class ItemChannelModel(BaseModel):
    id: str
    title: str
    category: str | None
    feed_url: str
    site_url: str | None
    state: str


class ItemDigestVisibilityModel(BaseModel):
    is_candidate: bool
    status: Literal[
        "ready",
        "excluded",
        "pending_extraction",
        "blocked_by_extraction",
        "needs_content_review",
    ]
    reason: str


class ItemLibraryModel(BaseModel):
    state: LibraryState
    saved_at: str | None
    archived_at: str | None
    is_saved: bool
    is_archived: bool


class ItemSearchMatchModel(BaseModel):
    primary_field: Literal["title", "author", "source", "excerpt", "body", "category", "organization", "annotation"]
    fields: list[Literal["title", "author", "source", "excerpt", "body", "category", "organization", "annotation"]]
    snippet: str | None


class ItemModel(BaseModel):
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
    library: ItemLibraryModel
    search_match: ItemSearchMatchModel | None = None
    channel: ItemChannelModel
    digest: ItemDigestVisibilityModel


class ItemDetailModel(ItemModel):
    cleaned_html: str | None
    content_text: str | None


class ItemMutationResponse(BaseModel):
    item: ItemModel


class ItemListPageModel(BaseModel):
    next_cursor: str | None
    has_more: bool
    limit: int


class ItemListResponse(BaseModel):
    items: list[ItemModel]
    page: ItemListPageModel


class ItemDetailResponse(BaseModel):
    item: ItemDetailModel


class UpdateItemStateRequest(BaseModel):
    is_read: bool | None = None
    is_favorite: bool | None = None
    is_archived: bool | None = None
    digest_candidate: bool | None = None
    library_action: LibraryAction | None = None
