from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

PreflightCheckStatus = Literal["passed", "failed", "warning", "skipped"]
SettingsPreflightStatus = Literal["ready", "needs_configuration", "connection_failed"]


class DeliverySecretStateModel(BaseModel):
    configured: bool
    redacted_value: str | None = None


class DeliverySettingsModel(BaseModel):
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password: DeliverySecretStateModel
    smtp_from: str | None
    kindle_email: str | None
    smtp_ready: bool
    updated_at: str | None
    updated_by: str | None
    issues: list[str] = Field(default_factory=list)


class DeliverySettingsResponse(BaseModel):
    settings: DeliverySettingsModel


class UpdateDeliverySettingsRequest(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    kindle_email: str | None = None
    updated_by: str | None = "user"

    @field_validator(
        "smtp_host",
        "smtp_username",
        "smtp_password",
        "smtp_from",
        "kindle_email",
        "updated_by",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or None

    @field_validator("smtp_port")
    @classmethod
    def validate_port(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value <= 0 or value > 65535:
            raise ValueError("SMTP port must be between 1 and 65535.")
        return value


class PreflightCheckModel(BaseModel):
    name: str
    status: PreflightCheckStatus
    message: str


class DeliverySettingsPreflightModel(BaseModel):
    status: SettingsPreflightStatus
    smtp_ready: bool
    can_send: bool
    checks: list[PreflightCheckModel] = Field(default_factory=list)


class DeliverySettingsPreflightRequest(BaseModel):
    check_connection: bool = False


class DeliverySettingsPreflightResponse(BaseModel):
    preflight: DeliverySettingsPreflightModel
