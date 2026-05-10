from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.channels.models import ChannelHealthModel, PreviewDiscoveryModel, SourcePreviewItemModel
from app.sync.models import SyncRunModel

SourceState = Literal["active", "inactive", "archived"]
SourceControlAction = Literal["pause", "resume", "mute", "unmute", "snooze", "unsnooze", "regroup"]
SourceInitialSyncMode = Literal["none", "enqueue"]
SourceDuplicatePolicy = Literal["return_existing", "reactivate", "error"]
SourceCreateStatus = Literal["created", "existing", "reactivated"]


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _normalize_path_segments(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None

    normalized: list[str] = []
    for segment in value:
        cleaned = segment.strip()
        if cleaned:
            normalized.append(cleaned)
    return normalized


class SourceFolderRefModel(BaseModel):
    id: str
    name: str
    path: list[str] = Field(default_factory=list)
    color: str | None = None


class SourceBundleRefModel(BaseModel):
    id: str
    name: str
    color: str | None = None


class SourceGroupMembershipModel(BaseModel):
    folder: SourceFolderRefModel | None = None
    bundles: list[SourceBundleRefModel] = Field(default_factory=list)


class SourceControlStateModel(BaseModel):
    is_paused: bool
    is_muted: bool
    is_snoozed: bool
    paused_at: str | None = None
    pause_reason: str | None = None
    muted_at: str | None = None
    muted_until: str | None = None
    mute_reason: str | None = None
    snoozed_at: str | None = None
    snoozed_until: str | None = None
    snooze_reason: str | None = None
    next_resume_at: str | None = None
    updated_at: str | None = None


class SourceRecentItemModel(BaseModel):
    id: str
    title: str
    source_url: str
    excerpt: str | None = None
    published_at: str | None = None
    is_read: bool


class SourceModel(BaseModel):
    id: str
    title: str
    site_url: str | None
    feed_url: str
    description: str | None
    language: str | None
    category: str | None
    state: SourceState
    unread_count: int
    created_at: str
    updated_at: str
    health: ChannelHealthModel
    controls: SourceControlStateModel
    groups: SourceGroupMembershipModel


class SourceReadModel(SourceModel):
    recent_items: list[SourceRecentItemModel] = Field(default_factory=list)


class SourceReadResponse(BaseModel):
    source: SourceReadModel


class SourcePreviewValidationModel(BaseModel):
    reachable: bool
    feed_kind: str | None = None
    item_count_sampled: int
    warnings: list[str] = Field(default_factory=list)


class SourcePreviewCandidateModel(BaseModel):
    candidate_id: str
    feed_url: str
    title: str
    site_url: str | None
    description: str | None
    language: str | None
    estimated_items_per_week: int | None = None
    sample_items: list[SourcePreviewItemModel] = Field(default_factory=list)
    validation: SourcePreviewValidationModel
    already_subscribed: bool = False
    existing_source_id: str | None = None
    existing_state: SourceState | None = None
    controls: SourceControlStateModel | None = None
    groups: SourceGroupMembershipModel | None = None

class PreviewSourceRequest(BaseModel):
    input_url: str = Field(min_length=1, max_length=2048)

    @field_validator("input_url")
    @classmethod
    def validate_input_url(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("input_url must not be empty.")
        return cleaned


class PreviewSourceResponse(BaseModel):
    status: Literal["ready", "already_subscribed", "multiple_candidates"]
    input_url: str
    discovery: PreviewDiscoveryModel
    feed: SourcePreviewCandidateModel | None = None
    candidates: list[SourcePreviewCandidateModel] = Field(default_factory=list)
    existing_source: SourceModel | None = None


class SourceFolderModel(BaseModel):
    id: str
    name: str
    path: list[str] = Field(default_factory=list)
    description: str | None = None
    color: str | None = None
    source_count: int
    created_at: str
    updated_at: str


class SourceBundleModel(BaseModel):
    id: str
    name: str
    description: str | None = None
    color: str | None = None
    source_count: int
    created_at: str
    updated_at: str


class SourceCollectionsResponse(BaseModel):
    folders: list[SourceFolderModel] = Field(default_factory=list)
    bundles: list[SourceBundleModel] = Field(default_factory=list)
    updated_at: str | None = None


class FeedHealthCenterSummaryModel(BaseModel):
    total_sources: int
    active_sources: int
    paused_sources: int
    muted_sources: int
    snoozed_sources: int
    healthy_sources: int
    warning_sources: int
    error_sources: int
    unknown_sources: int


class FeedHealthIssueModel(BaseModel):
    source_id: str
    title: str
    category: str | None = None
    state: SourceState
    unread_count: int
    health: ChannelHealthModel
    controls: SourceControlStateModel
    groups: SourceGroupMembershipModel


class FeedHealthRunModel(BaseModel):
    id: str
    status: str
    trigger_kind: str
    started_at: str | None = None
    completed_at: str | None = None
    total_count: int
    success_count: int
    failure_count: int
    error_message: str | None = None


class FeedHealthCenterResponse(BaseModel):
    checked_at: str
    summary: FeedHealthCenterSummaryModel
    issues: list[FeedHealthIssueModel] = Field(default_factory=list)
    recent_runs: list[FeedHealthRunModel] = Field(default_factory=list)


class SourceFolderTargetModel(BaseModel):
    id: str | None = None
    name: str | None = Field(default=None, max_length=160)
    path: list[str] | None = None
    description: str | None = Field(default=None, max_length=500)
    color: str | None = Field(default=None, max_length=32)

    @field_validator("id", "name", "description", "color")
    @classmethod
    def normalize_text_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("path")
    @classmethod
    def normalize_path(cls, value: list[str] | None) -> list[str] | None:
        normalized = _normalize_path_segments(value)
        return normalized or None

    @model_validator(mode="after")
    def validate_target(self) -> SourceFolderTargetModel:
        if self.id is None and self.name is None and self.path is None:
            raise ValueError("folder target must include an id, name, or path.")
        return self


class SourceBundleTargetModel(BaseModel):
    id: str | None = None
    name: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    color: str | None = Field(default=None, max_length=32)

    @field_validator("id", "name", "description", "color")
    @classmethod
    def normalize_text_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def validate_target(self) -> SourceBundleTargetModel:
        if self.id is None and self.name is None:
            raise ValueError("bundle target must include an id or name.")
        return self


class SourceActionRequest(BaseModel):
    action: SourceControlAction
    reason: str | None = Field(default=None, max_length=500)
    until_at: str | None = None
    category: str | None = Field(default=None, max_length=120)
    folder: SourceFolderTargetModel | None = None
    bundles: list[SourceBundleTargetModel] | None = None
    updated_by: str | None = Field(default=None, max_length=120)

    @field_validator("reason", "category", "updated_by", "until_at")
    @classmethod
    def normalize_optional_text_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class SourceActionResponse(BaseModel):
    action: SourceControlAction
    source: SourceReadModel


class SourceCreateRequest(BaseModel):
    input_url: str | None = Field(default=None, min_length=1, max_length=2048)
    feed_url: str | None = Field(default=None, min_length=1, max_length=2048)
    category: str | None = Field(default=None, max_length=120)
    folder: SourceFolderTargetModel | None = None
    bundles: list[SourceBundleTargetModel] | None = None
    initial_sync: SourceInitialSyncMode = "none"
    on_duplicate: SourceDuplicatePolicy = "return_existing"
    updated_by: str | None = Field(default=None, max_length=120)

    @field_validator("input_url", "feed_url", "category", "updated_by")
    @classmethod
    def normalize_optional_text_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def validate_source_target(self) -> "SourceCreateRequest":
        if self.input_url is None and self.feed_url is None:
            raise ValueError("source create requires input_url or feed_url.")
        return self


class SourceCreateResponse(BaseModel):
    status: SourceCreateStatus
    source: SourceReadModel
    discovery: PreviewDiscoveryModel
    initial_sync_run: SyncRunModel | None = None


class SourceSyncResponse(BaseModel):
    source: SourceReadModel
    run: SyncRunModel


class SourceRestoreResponse(BaseModel):
    source: SourceReadModel


class OpmlFolderPreviewModel(BaseModel):
    path: list[str] = Field(default_factory=list)
    feed_count: int


class OpmlFeedEntryModel(BaseModel):
    title: str
    feed_url: str
    site_url: str | None = None
    folder_path: list[str] = Field(default_factory=list)
    already_subscribed: bool = False
    existing_source_id: str | None = None


class OpmlImportSummaryModel(BaseModel):
    total_feeds: int
    new_feeds: int
    existing_feeds: int
    invalid_feeds: int
    duplicate_feeds: int
    folder_count: int


class PreviewOpmlImportRequest(BaseModel):
    opml_content: str = Field(min_length=1)

    @field_validator("opml_content")
    @classmethod
    def validate_opml_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("opml_content must not be empty.")
        return value


class ImportOpmlRequest(PreviewOpmlImportRequest):
    default_category: str | None = Field(default=None, max_length=120)
    updated_by: str | None = Field(default=None, max_length=120)

    @field_validator("default_category", "updated_by")
    @classmethod
    def normalize_optional_text_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class OpmlImportPreviewResponse(BaseModel):
    summary: OpmlImportSummaryModel
    folders: list[OpmlFolderPreviewModel] = Field(default_factory=list)
    feeds: list[OpmlFeedEntryModel] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class OpmlImportResponse(BaseModel):
    summary: OpmlImportSummaryModel
    created_sources: list[SourceModel] = Field(default_factory=list)
    existing_source_ids: list[str] = Field(default_factory=list)
    created_folder_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class OpmlExportResponse(BaseModel):
    generated_at: str
    source_count: int
    folder_count: int
    bundle_count: int
    opml_content: str
