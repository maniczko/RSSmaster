from __future__ import annotations

from datetime import UTC, datetime
import logging
from pathlib import Path
from time import perf_counter

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .ai.router import router as ai_router
from .auth.router import get_accounts_store, router as auth_router
from .channels.router import router as channels_router
from .config import get_settings
from .db.initializer import ensure_database, pop_database_path_override, push_database_path_override
from .delivery.router import router as delivery_router
from .digests.router import router as digests_router
from .errors import ApiError, api_error_handler, build_error_payload, request_validation_error_handler, unexpected_error_handler
from .items.router import router as items_router
from .library.router import router as library_router
from .observability import bind_correlation_context, clear_correlation_context, configure_structured_logger, initialize_sentry, log_event, new_correlation_id
from .annotations.router import router as annotations_router
from .profiles.router import router as profiles_router
from .ranking.router import router as ranking_router
from .settings.router import router as settings_router
from .source_management.router import router as source_management_router
from .sync.router import router as sync_router
from .workspace.router import router as workspace_router

settings = get_settings()
sentry_enabled = initialize_sentry(settings)
app_logger = configure_structured_logger("rssmaster", level=logging.INFO)
startup_state: dict[str, object] = {
    "checked_at": datetime.now(UTC).isoformat(),
    "database_ready": False,
    "request_correlation": True,
    "sentry_enabled": sentry_enabled,
    "started_at": None,
}

app = FastAPI(
    title=f"{settings.app_name} api",
    summary="Local-first backend runtime for rssmaster",
    version="0.1.0",
)

allowed_origins = sorted(
    {
        settings.web_url,
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    }
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(RequestValidationError, request_validation_error_handler)
app.add_exception_handler(Exception, unexpected_error_handler)
app.include_router(ai_router)
app.include_router(auth_router)
app.include_router(channels_router)
app.include_router(digests_router)
app.include_router(delivery_router)
app.include_router(items_router)
app.include_router(library_router)
app.include_router(annotations_router)
app.include_router(profiles_router)
app.include_router(ranking_router)
app.include_router(settings_router)
app.include_router(source_management_router)
app.include_router(sync_router)
app.include_router(workspace_router)
accounts_store = get_accounts_store(settings)


@app.middleware("http")
async def attach_request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or new_correlation_id(prefix="req")
    started_at = perf_counter()
    database_override_token = None

    with bind_correlation_context(
        request_id=request_id,
        correlation_id=request_id,
        operation=f"{request.method} {request.url.path}",
        component="api",
        metadata={
            "method": request.method,
            "path": request.url.path,
        },
    ):
        request.state.request_id = request_id
        log_event(app_logger, logging.INFO, "request_started", event="request_started")

        request_path = request.url.path
        is_cors_preflight = request.method == "OPTIONS"
        auth_required = (
            request_path.startswith("/api/v1")
            and not request_path.startswith("/api/v1/auth")
            and not is_cors_preflight
        )
        auth_optional = request_path.startswith("/api/v1/auth") and not is_cors_preflight
        resolved_account = None

        if auth_required or auth_optional:
            session_token = request.cookies.get(settings.accounts_cookie_name)
            resolved_account = accounts_store.resolve_session(session_token)
            if resolved_account is not None:
                request.state.auth_account = resolved_account
                database_override_token = push_database_path_override(Path(str(resolved_account["workspace_database_path"])))

        if auth_required and accounts_store.has_accounts() and resolved_account is None:
            clear_correlation_context()
            return JSONResponse(
                status_code=401,
                content=build_error_payload(
                    code="auth_required",
                    message="Zaloguj się, aby otworzyć swoją bibliotekę RSSmaster.",
                    details={"auth_required": True},
                    retryable=False,
                    request=request,
                ),
            )

        try:
            response = await call_next(request)
            duration_ms = max(0, int((perf_counter() - started_at) * 1000))
            response.headers["x-request-id"] = request_id
            log_event(
                app_logger,
                logging.INFO,
                "request_completed",
                event="request_completed",
                duration_ms=duration_ms,
                status_code=response.status_code,
            )
            return response
        finally:
            if database_override_token is not None:
                pop_database_path_override(database_override_token)
            clear_correlation_context()


@app.on_event("startup")
async def on_startup() -> None:
    schema_state = ensure_database(settings.database_file)
    accounts_store._ensure_store()
    startup_state["checked_at"] = datetime.now(UTC).isoformat()
    startup_state["accounts_database_path"] = str(settings.accounts_database_file)
    startup_state["accounts_ready"] = True
    startup_state["database_path"] = str(settings.database_file)
    startup_state["database_ready"] = True
    startup_state["schema"] = schema_state
    startup_state["started_at"] = datetime.now(UTC).isoformat()
    startup_state["sentry_enabled"] = sentry_enabled
    startup_state["ai_ready"] = settings.ai_ready
    startup_state["smtp_ready"] = settings.smtp_ready


@app.get("/")
def root() -> dict[str, object]:
    return {
        "docs": "/docs",
        "service": "api",
        "status": "ok",
    }


@app.get("/health")
def health() -> dict[str, object]:
    schema = startup_state.get("schema") if isinstance(startup_state.get("schema"), dict) else {}
    return {
        "checked_at": datetime.now(UTC).isoformat(),
        "database_ready": startup_state.get("database_ready") is True,
        "environment": settings.environment,
        "migration_status": schema.get("migration_status") if isinstance(schema, dict) else None,
        "schema_version": schema.get("schema_version") if isinstance(schema, dict) else None,
        "service": "api",
        "status": "ok",
    }


@app.get("/diagnostics/startup")
def startup_diagnostics() -> dict[str, object]:
    return {
        "checked_at": datetime.now(UTC).isoformat(),
        "config": settings.public_dict(),
        "routes": [
            "/",
            "/health",
            "/diagnostics/startup",
            "/api/v1/channels",
            "/api/v1/channels/preview",
            "/api/v1/channels/{channel_id}/health",
            "/api/v1/ai/items/{item_id}/insight",
            "/api/v1/auth/session",
            "/api/v1/auth/register",
            "/api/v1/auth/login",
            "/api/v1/auth/logout",
            "/api/v1/digests/preview",
            "/api/v1/digests/build",
            "/api/v1/digests/history",
            "/api/v1/delivery/preflight",
            "/api/v1/delivery/send",
            "/api/v1/delivery/logs",
            "/api/v1/items",
            "/api/v1/items/{id}",
            "/api/v1/library/tags",
            "/api/v1/library/collections",
            "/api/v1/library/saved-searches",
            "/api/v1/library/surfaces",
            "/api/v1/annotations",
            "/api/v1/annotations/hub",
            "/api/v1/profiles/interests",
            "/api/v1/ranking/pipeline/preview",
            "/api/v1/settings/ai",
            "/api/v1/settings/delivery",
            "/api/v1/settings/magazine",
            "/api/v1/source-management/collections",
            "/api/v1/source-management/health-center",
            "/api/v1/source-management/opml/export",
            "/api/v1/sync/runs",
            "/api/v1/workspace/profile",
            "/api/v1/workspace/briefing",
            "/api/v1/workspace/ranking",
            "/api/v1/workspace/source-health",
            "/api/v1/workspace/stories",
            "/api/v1/workspace/capture",
            "/api/v1/workspace/export",
            "/docs",
            "/openapi.json",
        ],
        "service": "api",
        "startup": startup_state,
        "status": "ok",
    }
