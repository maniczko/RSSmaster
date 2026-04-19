from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from html import unescape
import re

from app.errors import ApiError

from .models import (
    RankedStorySource,
    StoryCandidateFilters,
    StoryCandidateRecord,
    StoryClusterResult,
    StoryClusterSort,
)
from .repository import StoryRepository

MAX_STORY_CANDIDATES = 300
MAX_STORY_CLUSTERS = 120
PAIRWISE_CLUSTER_WINDOW_HOURS = 168
PREFIX_CLUSTER_WINDOW_HOURS = 72
TOKEN_RE = re.compile(r"[\w]+", re.UNICODE)
TITLE_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "been",
    "before",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "its",
    "latest",
    "live",
    "new",
    "of",
    "on",
    "or",
    "over",
    "that",
    "the",
    "their",
    "this",
    "to",
    "under",
    "update",
    "updates",
    "with",
}


@dataclass(slots=True, frozen=True)
class PreparedStoryCandidate:
    record: StoryCandidateRecord
    normalized_title: str
    title_tokens: tuple[str, ...]
    title_token_set: frozenset[str]
    leading_tokens: tuple[str, ...]
    published_at: datetime | None
    sort_at: datetime | None


class StoryService:
    def __init__(self, repository: StoryRepository) -> None:
        self.repository = repository

    def list_story_cards(
        self,
        *,
        channel_id: str | None = None,
        category: str | None = None,
        include_archived: bool = False,
        include_read: bool = True,
        favorites_only: bool = False,
        digest_candidates_only: bool = False,
        search: str | None = None,
        published_after: str | None = None,
        published_before: str | None = None,
        candidate_limit: int = 180,
        cluster_limit: int = 50,
        sort: str | None = None,
    ) -> list[dict[str, object]]:
        filters = StoryCandidateFilters(
            channel_ids=split_filter_values(channel_id),
            categories=split_filter_values(category),
            include_archived=include_archived,
            include_read=include_read,
            favorites_only=favorites_only,
            digest_candidates_only=digest_candidates_only,
            search=normalize_optional_text(search),
            published_after=normalize_datetime_filter("published_after", published_after),
            published_before=normalize_datetime_filter("published_before", published_before),
            candidate_limit=normalize_limit(
                field_name="candidate_limit",
                value=candidate_limit,
                default_value=180,
                maximum=MAX_STORY_CANDIDATES,
            ),
            cluster_limit=normalize_limit(
                field_name="cluster_limit",
                value=cluster_limit,
                default_value=50,
                maximum=MAX_STORY_CLUSTERS,
            ),
            sort=normalize_story_sort(sort),
        )
        validate_time_window(filters.published_after, filters.published_before)
        candidates = self.repository.list_candidates(filters)
        story_clusters = build_story_clusters(candidates)
        ordered_clusters = sort_story_clusters(story_clusters, sort=filters.sort)
        return [story_cluster_to_payload(cluster) for cluster in ordered_clusters[: filters.cluster_limit]]


def build_story_clusters(candidates: list[StoryCandidateRecord]) -> list[StoryClusterResult]:
    if not candidates:
        return []

    prepared = [prepare_story_candidate(candidate) for candidate in candidates]
    cluster_indexes = resolve_story_groups(prepared)
    clusters: list[StoryClusterResult] = []

    for indexes in cluster_indexes:
        members = [prepared[index] for index in indexes]
        ranked_sources = rank_story_sources(members)
        primary_source = ranked_sources[0]
        alternate_sources = tuple(ranked_sources[1:])
        story_key = build_story_key(members)
        earliest_source_at = resolve_cluster_boundary(members, take_latest=False)
        latest_source_at = resolve_cluster_boundary(members, take_latest=True)
        categories = tuple(
            category
            for category in dict.fromkeys(
                member.record.category
                for member in members
                if member.record.category
            )
        )
        source_domains = tuple(
            source_domain
            for source_domain in dict.fromkeys(
                member.record.source_domain
                for member in members
                if member.record.source_domain
            )
        )
        unique_channel_count = len({member.record.channel_id for member in members})
        cluster_score = primary_source.score
        cluster_score += min(len(members) - 1, 5) * 6
        cluster_score += min(unique_channel_count - 1, 4) * 4
        if any(not member.record.is_read for member in members):
            cluster_score += 3
        if any(member.record.is_favorite for member in members):
            cluster_score += 6

        clusters.append(
            StoryClusterResult(
                cluster_id=story_key,
                story_key=story_key,
                title=primary_source.record.title,
                excerpt=resolve_story_excerpt(ranked_sources),
                primary_published_at=primary_source.record.published_at,
                earliest_source_at=earliest_source_at,
                latest_source_at=latest_source_at,
                source_count=len(members),
                unique_channel_count=unique_channel_count,
                item_ids=tuple(source.record.id for source in ranked_sources),
                categories=categories,
                source_domains=source_domains,
                has_unread_sources=any(not member.record.is_read for member in members),
                has_favorite_source=any(member.record.is_favorite for member in members),
                has_digest_candidate_source=any(member.record.digest_candidate for member in members),
                cluster_score=cluster_score,
                primary_source=primary_source,
                alternate_sources=alternate_sources,
            )
        )

    return clusters


def prepare_story_candidate(candidate: StoryCandidateRecord) -> PreparedStoryCandidate:
    title_tokens = tokenize_title(candidate.title)
    normalized_title = " ".join(title_tokens)
    return PreparedStoryCandidate(
        record=candidate,
        normalized_title=normalized_title,
        title_tokens=title_tokens,
        title_token_set=frozenset(title_tokens),
        leading_tokens=title_tokens[:2],
        published_at=parse_datetime(candidate.published_at),
        sort_at=parse_datetime(candidate.published_at or candidate.discovered_at or candidate.created_at),
    )


def resolve_story_groups(candidates: list[PreparedStoryCandidate]) -> list[list[int]]:
    parent = list(range(len(candidates)))
    token_frequencies = build_token_frequencies(candidates)
    total_candidates = len(candidates)

    def find(index: int) -> int:
        current = index
        while parent[current] != current:
            parent[current] = parent[parent[current]]
            current = parent[current]
        return current

    def union(left_index: int, right_index: int) -> None:
        left_root = find(left_index)
        right_root = find(right_index)
        if left_root != right_root:
            parent[right_root] = left_root

    for left_index, left in enumerate(candidates):
        for right_index in range(left_index + 1, len(candidates)):
            right = candidates[right_index]
            if should_group_candidates(
                left,
                right,
                token_frequencies=token_frequencies,
                total_candidates=total_candidates,
            ):
                union(left_index, right_index)

    grouped: dict[int, list[int]] = {}
    for index in range(len(candidates)):
        grouped.setdefault(find(index), []).append(index)

    return sorted(
        grouped.values(),
        key=lambda indexes: group_sort_key([candidates[index] for index in indexes]),
    )


def should_group_candidates(
    left: PreparedStoryCandidate,
    right: PreparedStoryCandidate,
    *,
    token_frequencies: dict[str, int],
    total_candidates: int,
) -> bool:
    left_record = left.record
    right_record = right.record

    if left_record.normalized_source_url == right_record.normalized_source_url:
        return True

    if left_record.content_hash and left_record.content_hash == right_record.content_hash:
        return within_time_window(left, right, hours=PAIRWISE_CLUSTER_WINDOW_HOURS)

    if not left.title_token_set or not right.title_token_set:
        return False

    if left.normalized_title and left.normalized_title == right.normalized_title:
        return within_time_window(left, right, hours=PAIRWISE_CLUSTER_WINDOW_HOURS)

    shared_tokens = left.title_token_set & right.title_token_set
    if len(shared_tokens) < 2:
        return False

    distinctive_shared_tokens = {
        token
        for token in shared_tokens
        if is_distinctive_token(
            token,
            token_frequencies=token_frequencies,
            total_candidates=total_candidates,
        )
    }

    overlap_ratio = len(shared_tokens) / min(len(left.title_token_set), len(right.title_token_set))
    jaccard_ratio = len(shared_tokens) / len(left.title_token_set | right.title_token_set)
    same_prefix = bool(left.leading_tokens) and left.leading_tokens == right.leading_tokens

    if overlap_ratio >= 0.85 and jaccard_ratio >= 0.70 and distinctive_shared_tokens:
        return within_time_window(left, right, hours=PAIRWISE_CLUSTER_WINDOW_HOURS)

    if same_prefix and overlap_ratio >= 0.67 and jaccard_ratio >= 0.50 and distinctive_shared_tokens:
        return within_time_window(left, right, hours=PREFIX_CLUSTER_WINDOW_HOURS)

    shorter_title, longer_title = sorted(
        [left.normalized_title, right.normalized_title],
        key=len,
    )
    if shorter_title and len(shorter_title.split()) >= 3 and longer_title.startswith(shorter_title):
        return within_time_window(left, right, hours=PREFIX_CLUSTER_WINDOW_HOURS)

    long_shared_tokens = sum(1 for token in distinctive_shared_tokens if len(token) >= 5)
    return long_shared_tokens >= 3 and overlap_ratio >= 0.75 and within_time_window(
        left,
        right,
        hours=PREFIX_CLUSTER_WINDOW_HOURS,
    )


def rank_story_sources(candidates: list[PreparedStoryCandidate]) -> list[RankedStorySource]:
    latest_sort_at = max((candidate.sort_at for candidate in candidates if candidate.sort_at is not None), default=None)
    ranked: list[RankedStorySource] = []

    for candidate in candidates:
        score = 0
        reasons: list[str] = []
        record = candidate.record

        if record.has_cleaned_content:
            score += 42
            reasons.append("cleaned_content")
        elif record.has_raw_content:
            score += 18
            reasons.append("raw_content")

        match record.extraction_status:
            case "completed":
                score += 18
                reasons.append("extraction_completed")
            case "running":
                score += 6
                reasons.append("extraction_running")
            case "pending":
                score += 3
                reasons.append("extraction_pending")
            case "failed":
                score -= 14
                reasons.append("extraction_failed")
            case "skipped":
                score -= 4
                reasons.append("extraction_skipped")

        if record.excerpt:
            score += 6
            reasons.append("excerpt_available")
        if record.author:
            score += 3
            reasons.append("author_available")

        title_length = len(record.title.strip())
        if 30 <= title_length <= 140:
            score += 6
            reasons.append("headline_balanced")
        elif title_length >= 12:
            score += 2
            reasons.append("headline_usable")
        else:
            score -= 4
            reasons.append("headline_short")

        if record.is_favorite:
            score += 10
            reasons.append("favorite_source")
        if record.digest_candidate:
            score += 4
            reasons.append("digest_candidate")
        if record.is_archived:
            score -= 8
            reasons.append("archived")
        else:
            score += 3
            reasons.append("active_item")
        if not record.is_read:
            score += 2
            reasons.append("unread")
        if record.source_url.startswith("https://"):
            score += 2
            reasons.append("https_source")

        recency_bonus = resolve_recency_bonus(candidate.sort_at, latest_sort_at)
        if recency_bonus:
            score += recency_bonus
            reasons.append("recent_source")

        ranked.append(
            RankedStorySource(
                record=record,
                rank=0,
                score=score,
                reasons=tuple(reasons),
            )
        )

    ranked.sort(
        key=lambda source: (
            -source.score,
            not source.record.has_cleaned_content,
            descending_datetime_sort_key(
                source.record.published_at or source.record.discovered_at or source.record.created_at
            ),
            source.record.id,
        ),
        reverse=False,
    )

    return [
        RankedStorySource(
            record=source.record,
            rank=index,
            score=source.score,
            reasons=source.reasons,
        )
        for index, source in enumerate(ranked, start=1)
    ]


def sort_story_clusters(clusters: list[StoryClusterResult], *, sort: StoryClusterSort) -> list[StoryClusterResult]:
    if sort == "oldest":
        return sorted(
            clusters,
            key=lambda cluster: (
                ascending_datetime_sort_key(cluster.earliest_source_at),
                -cluster.cluster_score,
                cluster.cluster_id,
            ),
        )

    if sort == "largest":
        return sorted(
            clusters,
            key=lambda cluster: (
                -cluster.source_count,
                -cluster.unique_channel_count,
                -cluster.cluster_score,
                descending_datetime_sort_key(cluster.latest_source_at),
                cluster.cluster_id,
            ),
        )

    return sorted(
        clusters,
        key=lambda cluster: (
            descending_datetime_sort_key(cluster.latest_source_at),
            -cluster.cluster_score,
            cluster.cluster_id,
        ),
    )


def story_cluster_to_payload(cluster: StoryClusterResult) -> dict[str, object]:
    return {
        "id": cluster.cluster_id,
        "story_key": cluster.story_key,
        "title": cluster.title,
        "excerpt": cluster.excerpt,
        "primary_published_at": cluster.primary_published_at,
        "earliest_source_at": cluster.earliest_source_at,
        "latest_source_at": cluster.latest_source_at,
        "source_count": cluster.source_count,
        "unique_channel_count": cluster.unique_channel_count,
        "item_ids": list(cluster.item_ids),
        "categories": list(cluster.categories),
        "source_domains": list(cluster.source_domains),
        "has_unread_sources": cluster.has_unread_sources,
        "has_favorite_source": cluster.has_favorite_source,
        "has_digest_candidate_source": cluster.has_digest_candidate_source,
        "cluster_score": cluster.cluster_score,
        "primary_source": story_source_to_payload(cluster.primary_source),
        "alternate_sources": [story_source_to_payload(source) for source in cluster.alternate_sources],
    }


def story_source_to_payload(source: RankedStorySource) -> dict[str, object]:
    record = source.record
    return {
        "item_id": record.id,
        "channel_id": record.channel_id,
        "channel_title": record.channel_title,
        "category": record.category,
        "title": record.title,
        "author": record.author,
        "source_url": record.source_url,
        "source_domain": record.source_domain,
        "excerpt": record.excerpt,
        "published_at": record.published_at,
        "is_read": record.is_read,
        "is_favorite": record.is_favorite,
        "is_archived": record.is_archived,
        "digest_candidate": record.digest_candidate,
        "extraction_status": record.extraction_status,
        "has_cleaned_content": record.has_cleaned_content,
        "has_raw_content": record.has_raw_content,
        "rank": source.rank,
        "rank_score": source.score,
        "rank_reasons": list(source.reasons),
    }


def build_story_key(candidates: list[PreparedStoryCandidate]) -> str:
    token_counts: dict[str, int] = {}
    for candidate in candidates:
        for token in candidate.title_token_set:
            token_counts[token] = token_counts.get(token, 0) + 1

    threshold = 1 if len(candidates) == 1 else max(2, (len(candidates) + 1) // 2)
    consensus_tokens = [
        token
        for token, count in sorted(token_counts.items(), key=lambda item: (-item[1], item[0]))
        if count >= threshold
    ]
    if not consensus_tokens:
        consensus_tokens = list(candidates[0].title_tokens)[:6]
    if not consensus_tokens:
        consensus_tokens = ["story"]

    day_bucket = next(
        (
            boundary[:10]
            for boundary in [
                resolve_cluster_boundary(candidates, take_latest=False),
                resolve_cluster_boundary(candidates, take_latest=True),
            ]
            if boundary
        ),
        "undated",
    )
    seed = "|".join([day_bucket, " ".join(consensus_tokens[:8])])
    return sha256(seed.encode("utf-8")).hexdigest()


def resolve_story_excerpt(sources: list[RankedStorySource]) -> str | None:
    for source in sources:
        if source.record.excerpt:
            return source.record.excerpt
    return None


def resolve_cluster_boundary(candidates: list[PreparedStoryCandidate], *, take_latest: bool) -> str | None:
    timestamps = [
        candidate.record.published_at or candidate.record.discovered_at or candidate.record.created_at
        for candidate in candidates
        if candidate.record.published_at or candidate.record.discovered_at or candidate.record.created_at
    ]
    if not timestamps:
        return None
    return max(timestamps) if take_latest else min(timestamps)


def within_time_window(left: PreparedStoryCandidate, right: PreparedStoryCandidate, *, hours: int) -> bool:
    if left.sort_at is None or right.sort_at is None:
        return True
    delta = abs((left.sort_at - right.sort_at).total_seconds()) / 3600
    return delta <= hours


def resolve_recency_bonus(candidate_time: datetime | None, latest_time: datetime | None) -> int:
    if candidate_time is None or latest_time is None:
        return 0
    delta_hours = abs((latest_time - candidate_time).total_seconds()) / 3600
    if delta_hours <= 6:
        return 4
    if delta_hours <= 24:
        return 3
    if delta_hours <= 72:
        return 1
    return 0


def build_token_frequencies(candidates: list[PreparedStoryCandidate]) -> dict[str, int]:
    frequencies: dict[str, int] = {}
    for candidate in candidates:
        for token in candidate.title_token_set:
            frequencies[token] = frequencies.get(token, 0) + 1
    return frequencies


def is_distinctive_token(token: str, *, token_frequencies: dict[str, int], total_candidates: int) -> bool:
    if token.isdigit() or len(token) <= 2:
        return False

    frequency = token_frequencies.get(token, 0)
    short_token_threshold = max(1, total_candidates // 10)
    long_token_threshold = max(2, total_candidates // 6)
    if len(token) <= 4:
        return frequency <= short_token_threshold
    return frequency <= long_token_threshold


def group_sort_key(candidates: list[PreparedStoryCandidate]) -> tuple[tuple[int, float], int]:
    latest_source_at = resolve_cluster_boundary(candidates, take_latest=True)
    return (descending_datetime_sort_key(latest_source_at), -len(candidates))


def normalize_story_sort(value: str | None) -> StoryClusterSort:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return "newest"

    match normalized.casefold():
        case "newest" | "recent":
            return "newest"
        case "oldest":
            return "oldest"
        case "largest" | "sources_desc":
            return "largest"
        case _:
            raise ApiError(
                status_code=400,
                code="invalid_story_sort",
                message="sort must be one of newest, oldest, or largest.",
                details={"field": "sort", "value": normalized},
                retryable=False,
            )


def normalize_limit(*, field_name: str, value: int | None, default_value: int, maximum: int) -> int:
    if value is None:
        return default_value
    if 1 <= value <= maximum:
        return value
    raise ApiError(
        status_code=400,
        code="invalid_story_limit",
        message=f"{field_name} must be between 1 and {maximum}.",
        details={"field": field_name, "value": value},
        retryable=False,
    )


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def split_filter_values(value: str | None) -> tuple[str, ...]:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return ()

    values: list[str] = []
    seen: set[str] = set()
    for part in normalized.split(","):
        cleaned = part.strip()
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        values.append(cleaned)
    return tuple(values)


def normalize_datetime_filter(field_name: str, value: str | None) -> str | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None

    parsed = parse_datetime(normalized)
    if parsed is None:
        raise ApiError(
            status_code=400,
            code="invalid_story_time_filter",
            message=f"{field_name} must be a valid ISO 8601 timestamp.",
            details={"field": field_name, "value": normalized},
            retryable=False,
        )
    return parsed.isoformat().replace("+00:00", "Z")


def validate_time_window(published_after: str | None, published_before: str | None) -> None:
    if published_after is None or published_before is None:
        return

    after_dt = datetime.fromisoformat(published_after.replace("Z", "+00:00"))
    before_dt = datetime.fromisoformat(published_before.replace("Z", "+00:00"))
    if after_dt <= before_dt:
        return

    raise ApiError(
        status_code=400,
        code="invalid_story_time_window",
        message="published_after must be earlier than or equal to published_before.",
        details={"published_after": published_after, "published_before": published_before},
        retryable=False,
    )


def tokenize_title(title: str) -> tuple[str, ...]:
    normalized = unescape(title).casefold().replace("&", " and ")
    significant_tokens = normalize_title_tokens(normalized, drop_stopwords=True)
    if len(significant_tokens) >= 2:
        return significant_tokens
    relaxed_tokens = normalize_title_tokens(normalized, drop_stopwords=False)
    return relaxed_tokens or significant_tokens


def normalize_title_tokens(title: str, *, drop_stopwords: bool) -> tuple[str, ...]:
    tokens: list[str] = []
    seen: set[str] = set()

    for raw_token in TOKEN_RE.findall(title):
        simplified = simplify_title_token(raw_token)
        if not simplified:
            continue
        if drop_stopwords and simplified in TITLE_STOPWORDS:
            continue
        if simplified in seen:
            continue
        seen.add(simplified)
        tokens.append(simplified)

    return tuple(tokens)


def simplify_title_token(token: str) -> str:
    cleaned = token.strip("_")
    if not cleaned:
        return ""
    if cleaned.endswith("'s"):
        cleaned = cleaned[:-2]
    if len(cleaned) > 4 and cleaned.endswith("ies"):
        cleaned = cleaned[:-3] + "y"
    elif len(cleaned) > 4 and cleaned.endswith("s") and not cleaned.endswith("ss"):
        cleaned = cleaned[:-1]
    return cleaned


def parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def ascending_datetime_sort_key(value: str | None) -> tuple[int, float]:
    parsed = parse_datetime(value)
    if parsed is None:
        return (1, 0.0)
    return (0, parsed.timestamp())


def descending_datetime_sort_key(value: str | None) -> tuple[int, float]:
    parsed = parse_datetime(value)
    if parsed is None:
        return (1, 0.0)
    return (0, -parsed.timestamp())
