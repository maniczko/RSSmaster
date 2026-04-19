from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

StoryClusterSort = Literal["newest", "oldest", "largest"]


@dataclass(slots=True, frozen=True)
class StoryCandidateFilters:
    channel_ids: tuple[str, ...]
    categories: tuple[str, ...]
    include_archived: bool
    include_read: bool
    favorites_only: bool
    digest_candidates_only: bool
    search: str | None
    published_after: str | None
    published_before: str | None
    candidate_limit: int
    cluster_limit: int
    sort: StoryClusterSort


@dataclass(slots=True, frozen=True)
class StoryCandidateRecord:
    id: str
    channel_id: str
    channel_title: str
    category: str | None
    source_url: str
    normalized_source_url: str
    source_domain: str | None
    title: str
    author: str | None
    excerpt: str | None
    published_at: str | None
    discovered_at: str
    created_at: str
    is_read: bool
    is_favorite: bool
    is_archived: bool
    digest_candidate: bool
    extraction_status: str
    has_cleaned_content: bool
    has_raw_content: bool
    content_hash: str | None


@dataclass(slots=True, frozen=True)
class RankedStorySource:
    record: StoryCandidateRecord
    rank: int
    score: int
    reasons: tuple[str, ...]


@dataclass(slots=True, frozen=True)
class StoryClusterResult:
    cluster_id: str
    story_key: str
    title: str
    excerpt: str | None
    primary_published_at: str | None
    earliest_source_at: str | None
    latest_source_at: str | None
    source_count: int
    unique_channel_count: int
    item_ids: tuple[str, ...]
    categories: tuple[str, ...]
    source_domains: tuple[str, ...]
    has_unread_sources: bool
    has_favorite_source: bool
    has_digest_candidate_source: bool
    cluster_score: int
    primary_source: RankedStorySource
    alternate_sources: tuple[RankedStorySource, ...]


class StorySourceModel(BaseModel):
    item_id: str
    channel_id: str
    channel_title: str
    category: str | None
    title: str
    author: str | None
    source_url: str
    source_domain: str | None
    excerpt: str | None
    published_at: str | None
    is_read: bool
    is_favorite: bool
    is_archived: bool
    digest_candidate: bool
    extraction_status: str
    has_cleaned_content: bool
    has_raw_content: bool
    rank: int
    rank_score: int
    rank_reasons: list[str] = Field(default_factory=list)


class StoryCardModel(BaseModel):
    id: str
    story_key: str
    title: str
    excerpt: str | None
    primary_published_at: str | None
    earliest_source_at: str | None
    latest_source_at: str | None
    source_count: int
    unique_channel_count: int
    item_ids: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    source_domains: list[str] = Field(default_factory=list)
    has_unread_sources: bool
    has_favorite_source: bool
    has_digest_candidate_source: bool
    cluster_score: int
    primary_source: StorySourceModel
    alternate_sources: list[StorySourceModel] = Field(default_factory=list)


class StoryListResponse(BaseModel):
    items: list[StoryCardModel]

