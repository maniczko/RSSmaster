from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ReaderFeedbackAction = Literal["more_like_this", "less_like_this", "hide_topic", "mute_source", "important"]
RankingMode = Literal["for_you", "latest", "all", "hidden"]


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
    visibility: Literal["shown", "hidden"] = "shown"
    visibility_reason: str | None = None
    matched_positive_signals: list[str] = Field(default_factory=list)
    matched_negative_signals: list[str] = Field(default_factory=list)
    quality_flags: list[str] = Field(default_factory=list)


class RankedItemModel(BaseModel):
    item: WorkspaceItemCardModel
    candidate_status: Literal["eligible", "excluded", "suppressed"]
    candidate_reason: str | None
    source_cap: int
    source_window_hours: int
    breakdown: RankingBreakdownModel
    visibility: Literal["shown", "hidden"] = "shown"
    visibility_reason: str | None = None
    quality_flags: list[str] = Field(default_factory=list)


class RankingResponse(BaseModel):
    generated_at: str
    items: list[RankedItemModel]


class ReaderFeedbackRequest(BaseModel):
    item_id: str
    action: ReaderFeedbackAction
    topic: str | None = None
    source_id: str | None = None
    reason: str | None = None


class ReaderFeedbackModel(BaseModel):
    id: str
    item_id: str | None
    source_id: str | None
    action: ReaderFeedbackAction
    topic: str | None
    reason: str | None
    created_at: str


class ReaderFeedbackResponse(BaseModel):
    feedback: ReaderFeedbackModel


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
    health_indicators: list[str] = Field(default_factory=list)
    health_stale: bool = False
    health_noisy: bool = False
    last_fetch_at: str | None = None
    last_successful_fetch_at: str | None = None
    last_error_at: str | None = None
    last_error_code: str | None = None
    last_error_message: str | None = None
    consecutive_failures: int = 0
    items_last_24h: int = 0
    items_last_7d: int = 0
    total_items: int = 0
    latest_item_at: str | None = None
    readable_items_7d: int = 0
    local_readable_items_7d: int = 0
    excerpt_fallback_items_7d: int = 0
    source_only_items_7d: int = 0
    extraction_failed_items_7d: int = 0
    reading_readiness: Literal["ready", "degraded", "blocked", "unknown"] = "unknown"
    reading_summary: str = "Brak danych o czytelności z ostatnich 7 dni."
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


class WorkspaceContinuityItemModel(WorkspaceItemCardModel):
    is_archived: bool = False


class WorkspaceItemTagAssignmentModel(BaseModel):
    item_id: str
    tag_id: str
    tag_name: str


class WorkspaceCollectionItemAssignmentModel(BaseModel):
    collection_id: str
    item_id: str


class WorkspaceExportResponse(BaseModel):
    exported_at: str
    profile: ReaderProfileModel
    sources_opml: str
    annotations: list[AnnotationModel]
    tags: list[TagModel]
    collections: list[CollectionModel]
    saved_searches: list[SavedSearchModel]
    saved_items: list[WorkspaceItemCardModel]
    continuity_items: list[WorkspaceContinuityItemModel] = []
    item_tags: list[WorkspaceItemTagAssignmentModel] = []
    collection_items: list[WorkspaceCollectionItemAssignmentModel] = []


class WorkspaceContinuityImportItemModel(BaseModel):
    item_id: str | None = None
    source_url: str
    is_read: bool = False
    is_favorite: bool = False
    digest_candidate: bool = False
    is_archived: bool = False


class WorkspaceContinuityImportRequest(BaseModel):
    sources_opml: str | None = None
    continuity_items: list[WorkspaceContinuityImportItemModel] = Field(default_factory=list)
    annotations: list[AnnotationModel] = Field(default_factory=list)
    tags: list[TagModel] = Field(default_factory=list)
    collections: list[CollectionModel] = Field(default_factory=list)
    saved_searches: list[SavedSearchModel] = Field(default_factory=list)
    item_tags: list[WorkspaceItemTagAssignmentModel] = Field(default_factory=list)
    collection_items: list[WorkspaceCollectionItemAssignmentModel] = Field(default_factory=list)


class WorkspaceContinuityImportMatchModel(BaseModel):
    source_url: str
    item_id: str
    title: str
    matched_by: Literal["normalized_source_url"] = "normalized_source_url"


class WorkspaceContinuityImportResponse(BaseModel):
    imported_source_count: int
    duplicate_source_count: int
    matched_item_count: int
    unmatched_item_count: int
    restored_read_count: int
    restored_saved_count: int
    restored_digest_count: int
    restored_archive_count: int
    restored_annotation_count: int = 0
    restored_tag_assignment_count: int = 0
    restored_collection_count: int = 0
    restored_collection_item_count: int = 0
    restored_saved_search_count: int = 0
    matched_items: list[WorkspaceContinuityImportMatchModel] = Field(default_factory=list)
    unmatched_source_urls: list[str] = Field(default_factory=list)
