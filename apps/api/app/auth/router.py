from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from app.config import Settings, get_settings

from .models import AuthSessionResponse, LoginRequest, RegisterAccountRequest
from .store import AccountsStore

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def get_accounts_store(settings: Settings = Depends(get_settings)) -> AccountsStore:
    return AccountsStore(
        settings.accounts_database_file,
        settings.database_file,
        settings.accounts_workspace_directory,
    )


def apply_session_cookie(response: Response, *, settings: Settings, token: str) -> None:
    max_age = settings.accounts_session_days * 24 * 60 * 60
    response.set_cookie(
        key=settings.accounts_cookie_name,
        value=token,
        httponly=True,
        max_age=max_age,
        samesite="lax",
        secure=False,
    )


@router.get("/session", response_model=AuthSessionResponse)
def get_session(
    request: Request,
    store: AccountsStore = Depends(get_accounts_store),
) -> AuthSessionResponse:
    account = getattr(request.state, "auth_account", None)
    return AuthSessionResponse.model_validate(store.build_session_payload(account))


@router.post("/register", response_model=AuthSessionResponse)
def register_account(
    payload: RegisterAccountRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
    store: AccountsStore = Depends(get_accounts_store),
) -> AuthSessionResponse:
    has_accounts = store.has_accounts()
    account = store.create_account(
        username=payload.username,
        password=payload.password,
        display_name=payload.display_name,
        claim_legacy_workspace=payload.claim_legacy_workspace if payload.claim_legacy_workspace is not None else not has_accounts,
    )
    session = store.create_session(account_id=str(account["id"]), session_days=settings.accounts_session_days)
    apply_session_cookie(response, settings=settings, token=str(session["token"]))
    return AuthSessionResponse.model_validate(store.build_session_payload(account))


@router.post("/login", response_model=AuthSessionResponse)
def login(
    payload: LoginRequest,
    response: Response,
    settings: Settings = Depends(get_settings),
    store: AccountsStore = Depends(get_accounts_store),
) -> AuthSessionResponse:
    account = store.authenticate(username=payload.username, password=payload.password)
    session = store.create_session(account_id=str(account["id"]), session_days=settings.accounts_session_days)
    apply_session_cookie(response, settings=settings, token=str(session["token"]))
    return AuthSessionResponse.model_validate(store.build_session_payload(account))


@router.post("/logout", response_model=AuthSessionResponse)
def logout(
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
    store: AccountsStore = Depends(get_accounts_store),
) -> AuthSessionResponse:
    session_token = request.cookies.get(settings.accounts_cookie_name)
    store.revoke_session(session_token)
    response.delete_cookie(settings.accounts_cookie_name)
    return AuthSessionResponse.model_validate(store.build_session_payload(None))
