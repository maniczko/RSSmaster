from __future__ import annotations

from pydantic import BaseModel, Field


class AuthAccountModel(BaseModel):
    id: str
    username: str
    display_name: str
    created_at: str
    last_login_at: str | None = None


class AuthSessionModel(BaseModel):
    account: AuthAccountModel


class AuthSessionResponse(BaseModel):
    has_accounts: bool
    auth_required: bool
    session: AuthSessionModel | None = None


class RegisterAccountRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    display_name: str | None = Field(default=None, max_length=80)
    claim_legacy_workspace: bool | None = None


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)
