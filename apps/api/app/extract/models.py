from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ExtractionStatus = Literal["pending", "running", "completed", "failed", "skipped"]


@dataclass(slots=True, frozen=True)
class ExtractionCandidate:
    id: str
    channel_id: str
    dedupe_key: str
    source_url: str
    title: str
    excerpt: str | None
    raw_html: str | None


@dataclass(slots=True, frozen=True)
class ExtractionResult:
    raw_html: str | None
    cleaned_html: str | None
    content_text: str | None
    excerpt: str | None
    raw_fetched_at: str | None
    cleaned_at: str | None
    extraction_status: ExtractionStatus
    extraction_error: str | None


@dataclass(slots=True, frozen=True)
class ExtractionBatchSummary:
    processed: int
    completed: int
    failed: int
