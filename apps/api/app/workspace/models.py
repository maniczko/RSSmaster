from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class WorkspaceItemCardModel(BaseModel):
    id: str
    channel_id: str
    title: str
    author: str | None
    source_url: str
    excerpt: str | None
    published_at: str | None
    is_read: bool
    is_favorite: bool
    digest_candidate: bool
    channel_title: str
    channel_category: str | None
    channel_feed_url: str
    story_cluster_id: str | None = None
    story_cluster_size: int = 1


class ProfileInterestModel(BaseModel):
    id: str
    label: str
    normalized_topic: str | None
    kind: Literal["topic", "source"]
    weight: Literal[-1, 0, 1, 2]


class ReaderProfileModel(BaseModel):
    id: str
    name: str
    candidate_window_hours: int
    default_source_cap: int
    priority_source_cap: int
    emergency_source_cap: int
    daily_reading_goal: int
    interests: list[ProfileInterestModel]
    learned_interests: list[ProfileInterestModel] = []
    effective_interests: list[ProfileInterestModel] = []


class ProfileInterestInput(BaseModel):
    label: str
    normalized_topic: str | None = None
    kind: Literal["topic", "source"] = "topic"
    weight: Literal[-1, 0, 1, 2] = 1


class UpdateReaderProfileRequest(BaseModel):
    name: str | None = None
    candidate_window_hours: int | None = Field(default=None, ge=1, le=336)
    default_source_cap: int | None = Field(default=None, ge=1, le=200)
    priority_source_cap: int | None = Field(default=None, ge=1, le=250)
    emergency_source_cap: int | None = Field(default=None, ge=1, le=500)
    daily_reading_goal: int | None = Field(default=None, ge=1, le=100)
    interests: list[ProfileInterestInput] | None = None


class ReaderProfileResponse(BaseModel):
    profile: ReaderProfileModel


class RankingBreakdownModel(BaseModel):
    relevance_score: float
    user_preference_score: float
    source_quality_score: float
    freshness_score: float
    originality_score: float
    engagement_score: float
    duplicate_penalty: float
    noise_penalty: float
    saturation_penalty: float
    diversity_penalty: float = 0
    final_score: float
    matched_interests: list[str]
    reason: str


class RankedItemModel(BaseModel):
    item: WorkspaceItemCardModel
    candidate_status: Literal["eligible", "excluded", "suppressed"]
    candidate_reason: str | None
    source_cap: int
    source_window_hours: int
    breakdown: RankingBreakdownModel


class RankingResponse(BaseModel):
    generated_at: str
    items: list[RankedItemModel]


class BriefingStatsModel(BaseModel):
    unread_count: int
    saved_count: int
    digest_count: int
    archived_count: int
    recommended_count: int


class BriefingModel(BaseModel):
    generated_at: str
    stats: BriefingStatsModel
    summary_lines: list[str]
    resume_item: WorkspaceItemCardModel | None
    recommended: list[RankedItemModel]
    source_warnings: list[str]


class BriefingResponse(BaseModel):
    briefing: BriefingModel


class AnnotationModel(BaseModel):
    id: str
    item_id: str
    kind: Literal["highlight", "note"]
    quote_text: str | None
    note_text: str | None
    color: str | None
    created_at: str
    updated_at: str


class CreateAnnotationRequest(BaseModel):
    item_id: str
    kind: Literal["highlight", "note"] = "highlight"
    quote_text: str | None = None
    note_text: str | None = None
    color: str | None = None


class UpdateAnnotationRequest(BaseModel):
    note_text: str | None = None
    color: str | None = None
    archived: bool | None = None


class AnnotationListResponse(BaseModel):
    items: list[AnnotationModel]


class AnnotationMutationResponse(BaseModel):
    annotation: AnnotationModel


class TagModel(BaseModel):
    id: str
    name: str
    color: str | None
    item_count: int = 0


class CreateTagRequest(BaseModel):
    name: str
    color: str | None = None


class SetItemTagsRequest(BaseModel):
    names: list[str]


class ItemTagResponse(BaseModel):
    item_id: str
    tags: list[TagModel]


class TagListResponse(BaseModel):
    items: list[TagModel]


class CollectionModel(BaseModel):
    id: str
    name: str
    description: str | None
    item_count: int


class CreateCollectionRequest(BaseModel):
    name: str
    description: str | None = None
    item_id: str | None = None


class CollectionMutationRequest(BaseModel):
    item_id: str


class CollectionListResponse(BaseModel):
    items: list[CollectionModel]


class CollectionMutationResponse(BaseModel):
    collection: CollectionModel


class SavedSearchModel(BaseModel):
    id: str
    name: str
    query: str
    default_view: Literal["inbox", "saved", "digest", "archive"]


class CreateSavedSearchRequest(BaseModel):
    name: str
    query: str
    default_view: Literal["inbox", "saved", "digest", "archive"] = "inbox"


class SavedSearchListResponse(BaseModel):
    items: list[SavedSearchModel]


class SourceGroupModel(BaseModel):
    id: str
    name: str
    description: str | None
    color: str | None
    channel_count: int


class CreateSourceGroupRequest(BaseModel):
    name: str
    description: str | None = None
    color: str | None = None


class ChannelControlModel(BaseModel):
    channel_id: str
    group_id: str | None
    tier: Literal["priority", "default", "muted"]
    custom_source_cap: int | None
    paused_until: str | None
    snoozed_until: str | None
    notes: str | None
    group_name: str | None = None


class UpdateChannelControlRequest(BaseModel):
    group_id: str | None = None
    tier: Literal["priority", "default", "muted"] | None = None
    custom_source_cap: int | None = Field(default=None, ge=1, le=500)
    paused_until: str | None = None
    snoozed_until: str | None = None
    notes: str | None = None


class SourceHealthEntryModel(BaseModel):
    channel_id: str
    title: str
    feed_url: str
    category: str | None
    state: str
    unread_count: int
    health_status: str
    health_summary: str
    group_name: str | None
    control: ChannelControlModel


class SourceGroupListResponse(BaseModel):
    items: list[SourceGroupModel]


class SourceGroupMutationResponse(BaseModel):
    group: SourceGroupModel


class ChannelControlResponse(BaseModel):
    control: ChannelControlModel


class SourceHealthResponse(BaseModel):
    items: list[SourceHealthEntryModel]


class OPMLImportRequest(BaseModel):
    opml: str
    default_category: str | None = None


class OPMLImportResponse(BaseModel):
    imported_count: int
    duplicate_count: int
    channels: list[str]


class OPMLExportResponse(BaseModel):
    opml: str


class StoryClusterModel(BaseModel):
    id: str
    headline: str
    item_count: int
    category: str | None
    primary: WorkspaceItemCardModel
    alternates: list[WorkspaceItemCardModel]


class StoryClusterListResponse(BaseModel):
    items: list[StoryClusterModel]


class CaptureRequest(BaseModel):
    url: str
    title: str | None = None
    note: str | None = None


class CaptureResponse(BaseModel):
    item: WorkspaceItemCardModel


class WorkspaceExportResponse(BaseModel):
    exported_at: str
    profile: ReaderProfileModel
    sources_opml: str
    annotations: list[AnnotationModel]
    tags: list[TagModel]
    collections: list[CollectionModel]
    saved_searches: list[SavedSearchModel]
    saved_items: list[WorkspaceItemCardModel]
