from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class ChannelHealthModel(BaseModel):
    status: Literal["healthy", "warning", "error", "unknown"]
    summary: str
    indicators: list[str] = Field(default_factory=list)
    stale: bool
    noisy: bool
    last_fetch_at: str | None
    last_successful_fetch_at: str | None
    last_error_at: str | None
    last_error_code: str | None
    last_error_message: str | None
    consecutive_failures: int
    items_last_24h: int
    items_last_7d: int
    total_items: int
    latest_item_at: str | None


class ChannelModel(BaseModel):
    id: str
    title: str
    site_url: str | None
    feed_url: str
    category: str | None
    state: Literal["active", "inactive", "archived"]
    last_fetch_at: str | None
    last_error: str | None
    unread_count: int
    created_at: str
    updated_at: str
    health: ChannelHealthModel | None = None


class DiscoveryModel(BaseModel):
    mode: Literal["direct", "head_metadata", "heuristic"]
    resolved_feed_url: str
    candidates: list[str] = Field(default_factory=list)


class PreviewDiscoveryModel(BaseModel):
    mode: Literal["direct", "head_metadata", "heuristic"]
    resolved_feed_url: str | None = None
    candidates: list[str] = Field(default_factory=list)


class SourcePreviewCandidateModel(BaseModel):
    feed_url: str
    title: str
    site_url: str | None
    description: str | None
    language: str | None
    already_subscribed: bool = False
    existing_channel_id: str | None = None


class PreviewChannelRequest(BaseModel):
    input_url: str = Field(min_length=1, max_length=2048)

    @field_validator("input_url")
    @classmethod
    def validate_input_url(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("input_url must not be empty.")
        return cleaned


class PreviewChannelResponse(BaseModel):
    status: Literal["ready", "already_subscribed", "multiple_candidates"]
    input_url: str
    discovery: PreviewDiscoveryModel
    feed: SourcePreviewCandidateModel | None = None
    candidates: list[SourcePreviewCandidateModel] = Field(default_factory=list)
    existing_channel: ChannelModel | None = None


class CreateChannelRequest(BaseModel):
    input_url: str = Field(min_length=1, max_length=2048)
    category: str | None = Field(default=None, max_length=120)

    @field_validator("input_url")
    @classmethod
    def validate_input_url(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("input_url must not be empty.")
        return cleaned

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class CreateChannelResponse(BaseModel):
    channel: ChannelModel
    discovery: DiscoveryModel


class UpdateChannelRequest(BaseModel):
    category: str | None = Field(default=None, max_length=120)
    state: Literal["active", "inactive"] | None = None

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ChannelMutationResponse(BaseModel):
    channel: ChannelModel


class ChannelHealthResponse(BaseModel):
    channel_id: str
    health: ChannelHealthModel


class ChannelListPageModel(BaseModel):
    next_cursor: str | None
    has_more: bool
    limit: int


class ChannelListResponse(BaseModel):
    items: list[ChannelModel]
    page: ChannelListPageModel
