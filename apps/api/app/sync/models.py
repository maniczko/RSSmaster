from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

SyncRunMode = Literal["manual", "scheduled"]
SyncRunTriggerKind = Literal["manual", "scheduled", "system"]


class SyncRunErrorModel(BaseModel):
    channel_id: str
    channel_title: str
    code: str
    message: str


class SyncRunModel(BaseModel):
    id: str
    job_type: Literal["sync"]
    trigger_kind: SyncRunTriggerKind
    status: Literal["pending", "running", "partial_success", "failed", "canceled", "completed"]
    scope: dict[str, Any]
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None
    channels_total: int
    channels_succeeded: int
    channels_failed: int
    items_seen: int
    items_created: int
    items_skipped: int
    retry_count: int
    error_code: str | None
    error_message: str | None
    errors: list[SyncRunErrorModel] = Field(default_factory=list)


class CreateSyncRunRequest(BaseModel):
    channel_ids: list[str] | None = None
    mode: SyncRunMode = "manual"
    trigger_kind: SyncRunTriggerKind | None = None

    @field_validator("channel_ids")
    @classmethod
    def normalize_channel_ids(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None

        deduped: list[str] = []
        seen: set[str] = set()
        for channel_id in value:
            cleaned = channel_id.strip()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            deduped.append(cleaned)

        return deduped or None

    @model_validator(mode="after")
    def validate_trigger_kind(self) -> "CreateSyncRunRequest":
        resolved_trigger_kind = self.resolved_trigger_kind
        allowed_trigger_kinds = {
            "manual": {"manual"},
            "scheduled": {"scheduled", "system"},
        }
        if resolved_trigger_kind not in allowed_trigger_kinds[self.mode]:
            raise ValueError(
                f"mode '{self.mode}' does not support trigger_kind '{resolved_trigger_kind}'."
            )
        return self

    @property
    def resolved_trigger_kind(self) -> SyncRunTriggerKind:
        if self.trigger_kind is not None:
            return self.trigger_kind
        return "scheduled" if self.mode == "scheduled" else "manual"


class SyncRunResponse(BaseModel):
    run: SyncRunModel


class SyncRunListPageModel(BaseModel):
    next_cursor: str | None
    has_more: bool
    limit: int


class SyncRunListResponse(BaseModel):
    items: list[SyncRunModel]
    page: SyncRunListPageModel
