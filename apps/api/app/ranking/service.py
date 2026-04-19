from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from math import exp, log

from app.errors import ApiError
from app.profiles.service import InterestProfileService, ResolvedInterestProfile, WeightedSignal

from .models import RankingCandidateFilters
from .repository import RankingRepository

BASE_SCORE = 1.0
FRESHNESS_WEIGHT = 1.75
DIGEST_CANDIDATE_BOOST = 0.8
FAVORITE_BOOST = 1.2
UNREAD_BOOST = 0.35
CONTENT_READY_BOOST = 0.45
CATEGORY_MATCH_WEIGHT = 0.9
CHANNEL_MATCH_WEIGHT = 1.1
AUTHOR_MATCH_WEIGHT = 0.8
KEYWORD_MATCH_WEIGHT = 0.55
PENDING_EXTRACTION_PENALTY = -0.2
FAILED_EXTRACTION_PENALTY = -0.75


@dataclass(slots=True, frozen=True)
class CandidateScore:
    total: float
    age_hours: float | None
    sort_timestamp: datetime | None
    components: list[dict[str, object]]
    matched_categories: list[str]
    matched_channels: list[str]
    matched_authors: list[str]
    matched_keywords: list[str]


class RankingService:
    def __init__(
        self,
        repository: RankingRepository,
        profile_service: InterestProfileService,
    ) -> None:
        self.repository = repository
        self.profile_service = profile_service

    def preview_pipeline(
        self,
        *,
        channel_ids: list[str] | None,
        categories: list[str] | None,
        published_after: str | None,
        published_before: str | None,
        include_read: bool,
        favorites_only: bool,
        digest_candidates_only: bool,
        limit: int,
        candidate_limit: int,
    ) -> dict[str, object]:
        normalized_published_after = normalize_datetime_filter("published_after", published_after)
        normalized_published_before = normalize_datetime_filter("published_before", published_before)
        validate_time_window(normalized_published_after, normalized_published_before)

        filters = RankingCandidateFilters(
            channel_ids=tuple(channel_ids or ()),
            categories=tuple(categories or ()),
            include_read=include_read,
            favorites_only=favorites_only,
            digest_candidates_only=digest_candidates_only,
            published_after=normalized_published_after,
            published_before=normalized_published_before,
            output_limit=limit,
            candidate_limit=max(candidate_limit, limit),
        )
        profile = self.profile_service.get_resolved_interest_profile()
        intake = self.repository.list_candidates(filters)

        filtered_count = 0
        scored: list[tuple[tuple[float, int, int, float, str], dict[str, object]]] = []

        for row in intake.items:
            if is_profile_muted(row, profile):
                filtered_count += 1
                continue

            score = score_candidate(row, profile)
            payload = build_ranked_item_payload(row, score)
            sort_timestamp = score.sort_timestamp.timestamp() if score.sort_timestamp is not None else 0.0
            scored.append(
                (
                    (
                        score.total,
                        int(bool(row["is_favorite"])),
                        int(bool(row["digest_candidate"])),
                        sort_timestamp,
                        str(row["id"]),
                    ),
                    payload,
                )
            )

        scored.sort(key=lambda entry: entry[0], reverse=True)
        items = [payload for _, payload in scored[: filters.output_limit]]

        return {
            "ranking": {
                "requested_limit": filters.output_limit,
                "candidate_limit": filters.candidate_limit,
                "candidate_count": len(intake.items),
                "profile_filtered_count": filtered_count,
                "scored_count": len(scored),
                "returned_count": len(items),
                "intake_truncated": intake.intake_truncated,
            },
            "profile": build_profile_summary(profile),
            "items": items,
        }


def build_ranked_item_payload(row: dict[str, object], score: CandidateScore) -> dict[str, object]:
    return {
        "item_id": row["id"],
        "channel_id": row["channel_id"],
        "channel_title": row["channel_title"],
        "category": row["category"],
        "title": row["title"],
        "author": row["author"],
        "source_url": row["source_url"],
        "excerpt": row["excerpt"],
        "published_at": row["published_at"],
        "is_read": bool(row["is_read"]),
        "is_favorite": bool(row["is_favorite"]),
        "digest_candidate": bool(row["digest_candidate"]),
        "extraction_status": row["extraction_status"],
        "has_cleaned_content": bool(row["has_cleaned_content"]),
        "age_hours": round(score.age_hours, 3) if score.age_hours is not None else None,
        "score": {
            "total": round(score.total, 4),
            "components": [
                {
                    "key": component["key"],
                    "value": round(float(component["value"]), 4),
                    "reason": component["reason"],
                }
                for component in score.components
            ],
            "matched_categories": score.matched_categories,
            "matched_channels": score.matched_channels,
            "matched_authors": score.matched_authors,
            "matched_keywords": score.matched_keywords,
        },
    }


def score_candidate(row: dict[str, object], profile: ResolvedInterestProfile) -> CandidateScore:
    components: list[dict[str, object]] = [
        {
            "key": "base",
            "value": BASE_SCORE,
            "reason": "Baseline candidate eligibility.",
        }
    ]

    if bool(row["digest_candidate"]):
        components.append(
            {
                "key": "digest_candidate",
                "value": DIGEST_CANDIDATE_BOOST,
                "reason": "Explicit digest candidate flag boosts ranking priority.",
            }
        )
    if bool(row["is_favorite"]):
        components.append(
            {
                "key": "favorite",
                "value": FAVORITE_BOOST,
                "reason": "Favorited items represent strong user intent.",
            }
        )
    if not bool(row["is_read"]):
        components.append(
            {
                "key": "unread",
                "value": UNREAD_BOOST,
                "reason": "Unread items remain candidates for digest inclusion.",
            }
        )

    sort_timestamp = resolve_candidate_timestamp(row)
    age_hours = calculate_age_hours(sort_timestamp)
    freshness_score = compute_freshness_score(
        age_hours=age_hours,
        half_life_hours=profile.recency_half_life_hours,
    )
    components.append(
        {
            "key": "freshness",
            "value": freshness_score,
            "reason": "Recency-decay score keeps newer articles competitive without ignoring older matches.",
        }
    )

    if bool(row["has_cleaned_content"]):
        components.append(
            {
                "key": "content_ready",
                "value": CONTENT_READY_BOOST,
                "reason": "Readable content is already available for downstream digest generation.",
            }
        )
    else:
        extraction_status = normalize_optional_text(row.get("extraction_status")) or "pending"
        if extraction_status in {"pending", "running"}:
            components.append(
                {
                    "key": "extraction_penalty",
                    "value": PENDING_EXTRACTION_PENALTY,
                    "reason": "Readable content is not ready yet, so ranking is slightly reduced.",
                }
            )
        elif extraction_status == "failed":
            components.append(
                {
                    "key": "extraction_penalty",
                    "value": FAILED_EXTRACTION_PENALTY,
                    "reason": "Failed extraction makes the item less suitable for digest packaging right now.",
                }
            )

    matched_category_signals = match_exact_signals(row.get("category"), profile.categories)
    category_boost = sum(signal.weight * CATEGORY_MATCH_WEIGHT for signal in matched_category_signals)
    if category_boost > 0:
        components.append(
            {
                "key": "category_interest",
                "value": category_boost,
                "reason": "Category matches the stored interest profile.",
            }
        )

    matched_channel_signals = match_exact_signals(row.get("channel_id"), profile.channels)
    channel_boost = sum(signal.weight * CHANNEL_MATCH_WEIGHT for signal in matched_channel_signals)
    if channel_boost > 0:
        components.append(
            {
                "key": "channel_interest",
                "value": channel_boost,
                "reason": "Channel matches the stored interest profile.",
            }
        )

    matched_author_signals = match_author_signals(row.get("author"), profile.authors)
    author_boost = sum(signal.weight * AUTHOR_MATCH_WEIGHT for signal in matched_author_signals)
    if author_boost > 0:
        components.append(
            {
                "key": "author_interest",
                "value": author_boost,
                "reason": "Author matches the stored interest profile.",
            }
        )

    matched_keyword_signals = match_keyword_signals(row, profile.keywords)
    keyword_boost = sum(signal.weight * KEYWORD_MATCH_WEIGHT for signal in matched_keyword_signals)
    if keyword_boost > 0:
        components.append(
            {
                "key": "keyword_interest",
                "value": keyword_boost,
                "reason": "Title, excerpt, or body text matched profile keywords.",
            }
        )

    total = sum(float(component["value"]) for component in components)
    return CandidateScore(
        total=total,
        age_hours=age_hours,
        sort_timestamp=sort_timestamp,
        components=components,
        matched_categories=[signal.value for signal in matched_category_signals],
        matched_channels=[signal.value for signal in matched_channel_signals],
        matched_authors=[signal.value for signal in matched_author_signals],
        matched_keywords=[signal.value for signal in matched_keyword_signals],
    )


def build_profile_summary(profile: ResolvedInterestProfile) -> dict[str, object]:
    return {
        "source": profile.source,
        "is_customized": profile.is_customized,
        "updated_at": profile.updated_at,
        "updated_by": profile.updated_by,
        "category_count": len(profile.categories),
        "channel_count": len(profile.channels),
        "author_count": len(profile.authors),
        "keyword_count": len(profile.keywords),
        "muted_category_count": len(profile.muted_categories),
        "muted_channel_count": len(profile.muted_channels),
        "recency_half_life_hours": profile.recency_half_life_hours,
    }


def is_profile_muted(row: dict[str, object], profile: ResolvedInterestProfile) -> bool:
    channel_id = normalize_optional_text(row.get("channel_id"))
    category = normalize_optional_text(row.get("category"))
    return bool(
        (channel_id is not None and channel_id.casefold() in profile.muted_channel_lookup)
        or (category is not None and category.casefold() in profile.muted_category_lookup)
    )


def match_exact_signals(value: object, signals: tuple[WeightedSignal, ...]) -> list[WeightedSignal]:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return []
    key = normalized.casefold()
    return [signal for signal in signals if signal.normalized == key]


def match_author_signals(value: object, signals: tuple[WeightedSignal, ...]) -> list[WeightedSignal]:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return []
    haystack = normalized.casefold()
    return [
        signal
        for signal in signals
        if signal.normalized in haystack or haystack in signal.normalized
    ]


def match_keyword_signals(
    row: dict[str, object],
    signals: tuple[WeightedSignal, ...],
) -> list[WeightedSignal]:
    if not signals:
        return []

    haystack = " ".join(
        part
        for part in (
            normalize_optional_text(row.get("title")),
            normalize_optional_text(row.get("author")),
            normalize_optional_text(row.get("channel_title")),
            normalize_optional_text(row.get("category")),
            normalize_optional_text(row.get("excerpt")),
            normalize_optional_text(row.get("content_text")),
        )
        if part
    ).casefold()
    if not haystack:
        return []

    matched: list[WeightedSignal] = []
    for signal in signals:
        if signal.normalized in haystack:
            matched.append(signal)
    return matched


def compute_freshness_score(*, age_hours: float | None, half_life_hours: int) -> float:
    if age_hours is None:
        return round(FRESHNESS_WEIGHT * 0.2, 4)
    if age_hours <= 0:
        return round(FRESHNESS_WEIGHT, 4)
    decay = exp(-log(2) * age_hours / half_life_hours)
    return round(FRESHNESS_WEIGHT * decay, 4)


def resolve_candidate_timestamp(row: dict[str, object]) -> datetime | None:
    for field_name in ("published_at", "discovered_at", "ingested_at"):
        value = row.get(field_name)
        parsed = parse_optional_datetime(value)
        if parsed is not None:
            return parsed
    return None


def calculate_age_hours(value: datetime | None) -> float | None:
    if value is None:
        return None
    delta = datetime.now(UTC) - value
    return max(0.0, delta.total_seconds() / 3600)


def parse_optional_datetime(value: object) -> datetime | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None
    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def normalize_datetime_filter(field_name: str, value: str | None) -> str | None:
    normalized = normalize_optional_text(value)
    if normalized is None:
        return None

    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as error:
        raise ApiError(
            status_code=400,
            code="invalid_ranking_time_filter",
            message=f"{field_name} must be a valid ISO 8601 timestamp.",
            details={"field": field_name, "value": normalized},
            retryable=False,
        ) from error

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    else:
        parsed = parsed.astimezone(UTC)

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
        code="invalid_ranking_time_window",
        message="published_after must be earlier than or equal to published_before.",
        details={"published_after": published_after, "published_before": published_before},
        retryable=False,
    )


def normalize_optional_text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    cleaned = value.strip()
    return cleaned or None
