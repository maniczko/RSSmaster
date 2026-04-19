from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

DeliveryTargetKind = Literal["kindle", "smtp"]
DeliveryDispatchMode = Literal["dry_run", "send"]
DeliveryRunStatus = Literal["pending", "running", "partial_success", "failed", "canceled", "completed"]
DeliveryLogStatus = Literal["pending", "sent", "failed", "skipped"]


class DeliveryCheckModel(BaseModel):
    name: str
    status: Literal["passed", "failed", "warning", "skipped"]
    message: str


class DeliveryArtifactModel(BaseModel):
    digest_id: str
    title: str
    status: str
    artifact_path: str | None
    artifact_exists: bool
    artifact_bytes: int
    artifact_sha256: str | None
    generated_at: str | None


class DeliveryPreflightModel(BaseModel):
    status: Literal["ready", "needs_configuration", "missing_artifact", "connection_failed"]
    can_send: bool
    mode: DeliveryDispatchMode
    target_kind: DeliveryTargetKind
    recipient: str | None
    artifact: DeliveryArtifactModel
    checks: list[DeliveryCheckModel] = Field(default_factory=list)


class DeliveryPreflightRequest(BaseModel):
    digest_id: str
    target_kind: DeliveryTargetKind = "kindle"
    recipient: str | None = None
    check_connection: bool = False

    @field_validator("digest_id", "recipient", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or None


class SendDigestRequest(DeliveryPreflightRequest):
    mode: DeliveryDispatchMode = "dry_run"
    trigger_kind: Literal["manual", "scheduled", "system"] = "manual"
    subject: str | None = None
    body_text: str | None = None

    @field_validator("subject", "body_text", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or None


class DeliveryRunModel(BaseModel):
    id: str
    job_type: Literal["delivery"]
    trigger_kind: Literal["manual", "scheduled", "system"]
    status: DeliveryRunStatus
    scope: dict[str, Any]
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None
    total_count: int
    success_count: int
    failure_count: int
    retry_count: int
    error_code: str | None
    error_message: str | None


class DeliveryLogModel(BaseModel):
    id: str
    job_run_id: str | None
    digest_id: str | None
    digest_title: str | None
    target_kind: Literal["kindle", "smtp", "download"]
    recipient: str | None
    status: DeliveryLogStatus
    provider_message_id: str | None
    attempt_count: int
    sent_at: str | None
    error_code: str | None
    error_message: str | None
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str


class DeliveryDispatchResponse(BaseModel):
    run: DeliveryRunModel
    log: DeliveryLogModel
    preflight: DeliveryPreflightModel


class DeliveryPreflightResponse(BaseModel):
    preflight: DeliveryPreflightModel


class DeliveryLogListPageModel(BaseModel):
    next_cursor: str | None
    has_more: bool
    limit: int


class DeliveryLogListResponse(BaseModel):
    items: list[DeliveryLogModel]
    page: DeliveryLogListPageModel
