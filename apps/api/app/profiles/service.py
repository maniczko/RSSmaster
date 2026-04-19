from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .models import UpdateInterestProfileRequest, WeightedInterestSignalModel
from .repository import InterestProfileRepository

PROFILE_SCHEMA_VERSION = 1
DEFAULT_RECENCY_HALF_LIFE_HOURS = 36
MAX_CATEGORY_SIGNALS = 50
MAX_CHANNEL_SIGNALS = 100
MAX_AUTHOR_SIGNALS = 100
MAX_KEYWORD_SIGNALS = 100
MAX_MUTED_CATEGORIES = 50
MAX_MUTED_CHANNELS = 100


@dataclass(slots=True, frozen=True)
class WeightedSignal:
    value: str
    normalized: str
    weight: float


@dataclass(slots=True, frozen=True)
class ResolvedInterestProfile:
    source: Literal["default", "stored"]
    schema_version: int
    categories: tuple[WeightedSignal, ...]
    channels: tuple[WeightedSignal, ...]
    authors: tuple[WeightedSignal, ...]
    keywords: tuple[WeightedSignal, ...]
    muted_categories: tuple[str, ...]
    muted_channels: tuple[str, ...]
    recency_half_life_hours: int
    updated_at: str | None
    updated_by: str | None

    @property
    def is_customized(self) -> bool:
        return bool(
            self.categories
            or self.channels
            or self.authors
            or self.keywords
            or self.muted_categories
            or self.muted_channels
            or self.recency_half_life_hours != DEFAULT_RECENCY_HALF_LIFE_HOURS
        )

    @property
    def muted_category_lookup(self) -> frozenset[str]:
        return frozenset(value.casefold() for value in self.muted_categories)

    @property
    def muted_channel_lookup(self) -> frozenset[str]:
        return frozenset(value.casefold() for value in self.muted_channels)

    def to_storage_value(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "categories": serialize_weighted_signals(self.categories),
            "channels": serialize_weighted_signals(self.channels),
            "authors": serialize_weighted_signals(self.authors),
            "keywords": serialize_weighted_signals(self.keywords),
            "muted_categories": list(self.muted_categories),
            "muted_channels": list(self.muted_channels),
            "recency_half_life_hours": self.recency_half_life_hours,
        }

    def to_response_payload(self) -> dict[str, object]:
        return {
            "profile": self.to_storage_value(),
            "meta": {
                "source": self.source,
                "is_customized": self.is_customized,
                "updated_at": self.updated_at,
                "updated_by": self.updated_by,
            },
        }


class InterestProfileService:
    def __init__(self, repository: InterestProfileRepository) -> None:
        self.repository = repository

    def get_interest_profile(self) -> dict[str, object]:
        return self.get_resolved_interest_profile().to_response_payload()

    def get_resolved_interest_profile(self) -> ResolvedInterestProfile:
        record = self.repository.get_profile()
        if record is None:
            return build_resolved_interest_profile(
                {},
                source="default",
                updated_at=None,
                updated_by=None,
            )

        return build_resolved_interest_profile(
            record.get("value"),
            source="stored",
            updated_at=normalize_text(record.get("updated_at")),
            updated_by=normalize_text(record.get("updated_by")),
        )

    def update_interest_profile(self, payload: UpdateInterestProfileRequest) -> dict[str, object]:
        current = self.get_resolved_interest_profile()
        next_value = current.to_storage_value()

        for field_name in ("categories", "channels", "authors", "keywords"):
            if field_name not in payload.model_fields_set:
                continue
            value = getattr(payload, field_name)
            next_value[field_name] = [] if value is None else [entry.model_dump() for entry in value]

        for field_name in ("muted_categories", "muted_channels"):
            if field_name not in payload.model_fields_set:
                continue
            value = getattr(payload, field_name)
            next_value[field_name] = [] if value is None else list(value)

        if "recency_half_life_hours" in payload.model_fields_set:
            next_value["recency_half_life_hours"] = (
                DEFAULT_RECENCY_HALF_LIFE_HOURS
                if payload.recency_half_life_hours is None
                else payload.recency_half_life_hours
            )

        resolved = build_resolved_interest_profile(
            next_value,
            source="stored",
            updated_at=current.updated_at,
            updated_by=payload.updated_by,
        )
        if not resolved.is_customized:
            self.repository.delete_profile()
            return self.get_interest_profile()

        stored = self.repository.upsert_profile(
            value=resolved.to_storage_value(),
            updated_by=payload.updated_by,
        )
        stored_profile = build_resolved_interest_profile(
            stored.get("value"),
            source="stored",
            updated_at=normalize_text(stored.get("updated_at")),
            updated_by=normalize_text(stored.get("updated_by")),
        )
        return stored_profile.to_response_payload()


def build_resolved_interest_profile(
    raw_value: object,
    *,
    source: Literal["default", "stored"],
    updated_at: str | None,
    updated_by: str | None,
) -> ResolvedInterestProfile:
    value = raw_value if isinstance(raw_value, dict) else {}
    return ResolvedInterestProfile(
        source=source,
        schema_version=normalize_schema_version(value.get("schema_version")),
        categories=normalize_weighted_signals(value.get("categories"), limit=MAX_CATEGORY_SIGNALS),
        channels=normalize_weighted_signals(value.get("channels"), limit=MAX_CHANNEL_SIGNALS),
        authors=normalize_weighted_signals(value.get("authors"), limit=MAX_AUTHOR_SIGNALS),
        keywords=normalize_weighted_signals(value.get("keywords"), limit=MAX_KEYWORD_SIGNALS),
        muted_categories=normalize_string_values(value.get("muted_categories"), limit=MAX_MUTED_CATEGORIES),
        muted_channels=normalize_string_values(value.get("muted_channels"), limit=MAX_MUTED_CHANNELS),
        recency_half_life_hours=normalize_recency_half_life_hours(value.get("recency_half_life_hours")),
        updated_at=updated_at,
        updated_by=updated_by,
    )


def serialize_weighted_signals(signals: tuple[WeightedSignal, ...]) -> list[dict[str, object]]:
    return [
        {
            "value": signal.value,
            "weight": round(signal.weight, 4),
        }
        for signal in signals
    ]


def normalize_weighted_signals(value: object, *, limit: int) -> tuple[WeightedSignal, ...]:
    if not isinstance(value, list):
        return ()

    ordered_keys: list[str] = []
    deduped: dict[str, WeightedSignal] = {}

    for entry in value:
        signal = coerce_weighted_signal(entry)
        if signal is None:
            continue

        existing = deduped.get(signal.normalized)
        if existing is None:
            deduped[signal.normalized] = signal
            ordered_keys.append(signal.normalized)
            continue

        if signal.weight > existing.weight:
            deduped[signal.normalized] = WeightedSignal(
                value=existing.value,
                normalized=existing.normalized,
                weight=signal.weight,
            )

    return tuple(deduped[key] for key in ordered_keys[:limit])


def coerce_weighted_signal(value: object) -> WeightedSignal | None:
    raw_entry: object
    raw_weight: object

    if isinstance(value, WeightedInterestSignalModel):
        raw_entry = value.value
        raw_weight = value.weight
    elif isinstance(value, dict):
        raw_entry = value.get("value")
        raw_weight = value.get("weight", 1.0)
    elif isinstance(value, str):
        raw_entry = value
        raw_weight = 1.0
    else:
        return None

    normalized = normalize_text(raw_entry)
    if normalized is None:
        return None

    return WeightedSignal(
        value=normalized,
        normalized=normalized.casefold(),
        weight=normalize_weight(raw_weight),
    )


def normalize_string_values(value: object, *, limit: int) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()

    normalized_values: list[str] = []
    seen: set[str] = set()

    for entry in value:
        normalized = normalize_text(entry)
        if normalized is None:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized_values.append(normalized)
        if len(normalized_values) >= limit:
            break

    return tuple(normalized_values)


def normalize_schema_version(value: object) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return PROFILE_SCHEMA_VERSION
    return parsed if parsed >= 1 else PROFILE_SCHEMA_VERSION


def normalize_recency_half_life_hours(value: object) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return DEFAULT_RECENCY_HALF_LIFE_HOURS

    if parsed < 1 or parsed > 336:
        return DEFAULT_RECENCY_HALF_LIFE_HOURS
    return parsed


def normalize_weight(value: object) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 1.0

    if parsed <= 0:
        return 0.1
    if parsed > 5:
        return 5.0
    return parsed


def normalize_text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    cleaned = value.strip()
    return cleaned or None
