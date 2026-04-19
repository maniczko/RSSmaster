from __future__ import annotations

from dataclasses import dataclass
from typing import Self

from pydantic import BaseModel, Field, field_validator, model_validator


@dataclass(frozen=True)
class RankingCandidateFilters:
    channel_ids: tuple[str, ...]
    categories: tuple[str, ...]
    include_read: bool
    favorites_only: bool
    digest_candidates_only: bool
    published_after: str | None
    published_before: str | None
    output_limit: int
    candidate_limit: int


@dataclass(frozen=True)
class RankingCandidateIntakeResult:
    items: list[dict[str, object]]
    intake_truncated: bool
    candidate_limit: int


class RankingScoreComponentModel(BaseModel):
    key: str
    value: float
    reason: str


class RankingScoreModel(BaseModel):
    total: float
    components: list[RankingScoreComponentModel] = Field(default_factory=list)
    matched_categories: list[str] = Field(default_factory=list)
    matched_channels: list[str] = Field(default_factory=list)
    matched_authors: list[str] = Field(default_factory=list)
    matched_keywords: list[str] = Field(default_factory=list)


class RankedItemModel(BaseModel):
    item_id: str
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
    extraction_status: str
    has_cleaned_content: bool
    age_hours: float | None
    score: RankingScoreModel


class RankingPipelineSummaryModel(BaseModel):
    requested_limit: int
    candidate_limit: int
    candidate_count: int
    profile_filtered_count: int
    scored_count: int
    returned_count: int
    intake_truncated: bool


class RankingProfileSummaryModel(BaseModel):
    source: str
    is_customized: bool
    updated_at: str | None
    updated_by: str | None
    category_count: int
    channel_count: int
    author_count: int
    keyword_count: int
    muted_category_count: int
    muted_channel_count: int
    recency_half_life_hours: int


class RankingPipelineRequest(BaseModel):
    channel_ids: list[str] | None = Field(default=None, max_length=100)
    categories: list[str] | None = Field(default=None, max_length=50)
    published_after: str | None = None
    published_before: str | None = None
    include_read: bool = False
    favorites_only: bool = False
    digest_candidates_only: bool = True
    limit: int = Field(default=25, ge=1, le=100)
    candidate_limit: int = Field(default=200, ge=1, le=500)

    @field_validator("channel_ids", "categories", mode="before")
    @classmethod
    def normalize_string_list(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, list):
            return value

        normalized: list[str] = []
        seen: set[str] = set()
        for entry in value:
            if not isinstance(entry, str):
                normalized.append(entry)
                continue
            cleaned = entry.strip()
            if not cleaned:
                continue
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(cleaned)
        return normalized or None

    @field_validator("published_after", "published_before", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def validate_limits(self) -> Self:
        if self.candidate_limit < self.limit:
            raise ValueError("candidate_limit must be greater than or equal to limit.")
        return self


class RankingPipelineResponse(BaseModel):
    ranking: RankingPipelineSummaryModel
    profile: RankingProfileSummaryModel
    items: list[RankedItemModel] = Field(default_factory=list)
