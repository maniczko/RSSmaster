from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

InterestProfileSource = Literal["default", "stored"]


class WeightedInterestSignalModel(BaseModel):
    value: str = Field(min_length=1, max_length=160)
    weight: float = Field(default=1.0, gt=0.0, le=5.0)

    @field_validator("value", mode="before")
    @classmethod
    def normalize_value(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return value.strip()


class InterestProfileModel(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    categories: list[WeightedInterestSignalModel] = Field(default_factory=list, max_length=50)
    channels: list[WeightedInterestSignalModel] = Field(default_factory=list, max_length=100)
    authors: list[WeightedInterestSignalModel] = Field(default_factory=list, max_length=100)
    keywords: list[WeightedInterestSignalModel] = Field(default_factory=list, max_length=100)
    muted_categories: list[str] = Field(default_factory=list, max_length=50)
    muted_channels: list[str] = Field(default_factory=list, max_length=100)
    recency_half_life_hours: int = Field(default=36, ge=1, le=336)


class InterestProfileMetadataModel(BaseModel):
    source: InterestProfileSource
    is_customized: bool
    updated_at: str | None
    updated_by: str | None


class InterestProfileResponse(BaseModel):
    profile: InterestProfileModel
    meta: InterestProfileMetadataModel


class UpdateInterestProfileRequest(BaseModel):
    categories: list[WeightedInterestSignalModel] | None = Field(default=None, max_length=50)
    channels: list[WeightedInterestSignalModel] | None = Field(default=None, max_length=100)
    authors: list[WeightedInterestSignalModel] | None = Field(default=None, max_length=100)
    keywords: list[WeightedInterestSignalModel] | None = Field(default=None, max_length=100)
    muted_categories: list[str] | None = Field(default=None, max_length=50)
    muted_channels: list[str] | None = Field(default=None, max_length=100)
    recency_half_life_hours: int | None = Field(default=None, ge=1, le=336)
    updated_by: str | None = "user"

    @field_validator("muted_categories", "muted_channels", mode="before")
    @classmethod
    def normalize_string_lists(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, list):
            return value
        normalized: list[str] = []
        for entry in value:
            if not isinstance(entry, str):
                normalized.append(entry)
                continue
            normalized.append(entry.strip())
        return normalized

    @field_validator("updated_by", mode="before")
    @classmethod
    def normalize_updated_by(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or "user"
