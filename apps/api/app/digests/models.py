from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

DigestHistoryStatus = Literal["pending", "building", "completed", "failed", "sent", "archived"]


class DigestArtifactModel(BaseModel):
    path: str | None
    sha256: str | None
    size_bytes: int | None = None


class DigestSelectionItemModel(BaseModel):
    item_id: str
    position: int
    channel_id: str
    channel_title: str
    category: str | None
    title: str
    author: str | None = None
    source_url: str
    excerpt: str | None = None
    published_at: str | None
    content_html: str | None = None
    word_count: int | None = None
    content_hash: str | None
    magazine_score: float | None = None
    ranking_reason: str | None = None


class DigestArticleModel(BaseModel):
    id: str
    channel_id: str
    channel_title: str
    category: str | None
    title: str
    author: str | None
    source_url: str
    excerpt: str | None
    published_at: str | None
    is_read: bool
    is_favorite: bool
    digest_candidate: bool
    content_html: str
    word_count: int
    magazine_score: float | None = None
    ranking_reason: str | None = None


class DigestCategorySummaryModel(BaseModel):
    category: str
    article_count: int


class DigestCategoryGroupModel(BaseModel):
    category: str
    article_count: int
    items: list[DigestArticleModel]


class DigestPreviewStatsModel(BaseModel):
    candidate_count: int | None = None
    deduplicated_count: int | None = None
    source_count: int | None = None
    article_count: int
    category_count: int
    unread_count: int
    favorite_count: int
    digest_candidate_count: int
    word_count: int
    estimated_read_minutes: int


class DigestPreviewModel(BaseModel):
    title: str
    period_start: str | None
    period_end: str | None
    selection_mode: Literal["digest_candidates", "explicit"]
    stats: DigestPreviewStatsModel
    category_summary: list[DigestCategorySummaryModel]
    groups: list[DigestCategoryGroupModel]
    selection_snapshot: list[DigestSelectionItemModel]


class DigestHistoryModel(BaseModel):
    id: str
    job_run_id: str | None
    status: DigestHistoryStatus
    title: str
    period_start: str | None
    period_end: str | None
    article_count: int
    selection_snapshot: list[DigestSelectionItemModel] = Field(default_factory=list)
    category_summary: list[DigestCategorySummaryModel] = Field(default_factory=list)
    artifact: DigestArtifactModel
    generated_at: str | None
    sent_at: str | None
    error_code: str | None
    error_message: str | None
    created_at: str
    updated_at: str


class DigestSelectionRequest(BaseModel):
    item_ids: list[str] | None = None
    category: str | None = Field(default=None, max_length=120)
    title: str | None = Field(default=None, max_length=160)
    period_start: str | None = None
    period_end: str | None = None
    limit: int = Field(default=25, ge=1, le=200)
    include_read: bool = False
    favorites_only: bool = False
    digest_candidates_only: bool = True

    @field_validator("item_ids")
    @classmethod
    def normalize_item_ids(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None

        deduped: list[str] = []
        seen: set[str] = set()
        for item_id in value:
            cleaned = item_id.strip()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            deduped.append(cleaned)

        return deduped or None

    @field_validator("category", "title", "period_start", "period_end")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class DigestPreviewRequest(DigestSelectionRequest):
    pass


class BuildDigestRequest(DigestSelectionRequest):
    pass


class DigestPreviewResponse(BaseModel):
    preview: DigestPreviewModel


class BuildDigestResponse(BaseModel):
    digest: DigestHistoryModel


class DigestHistoryPageModel(BaseModel):
    next_cursor: str | None
    has_more: bool
    limit: int


class DigestHistoryListResponse(BaseModel):
    items: list[DigestHistoryModel]
    page: DigestHistoryPageModel


class DigestHistoryResponse(BaseModel):
    digest: DigestHistoryModel
