from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status

from app.config import Settings, get_settings
from app.db.initializer import database_path_override, resolve_database_path

from .models import CreateSyncRunRequest, SyncRunListResponse, SyncRunResponse
from .repository import SyncRepository
from .service import SyncService

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])


def build_sync_service(settings: Settings, database_path: Path) -> SyncService:
    repository = SyncRepository(database_path)
    return SyncService(settings, repository)


def get_sync_service(settings: Settings = Depends(get_settings)) -> SyncService:
    return build_sync_service(settings, resolve_database_path(settings.database_file))


def execute_sync_run_in_workspace(*, settings: Settings, database_path: Path, run_id: str) -> None:
    with database_path_override(database_path):
        service = build_sync_service(settings, database_path)
        service.execute_run(run_id)


@router.get("/runs", response_model=SyncRunListResponse)
def list_sync_runs(
    *,
    limit: int = Query(default=10, ge=1, le=50),
    service: SyncService = Depends(get_sync_service),
) -> SyncRunListResponse:
    runs = service.list_runs(limit=limit)
    return SyncRunListResponse(
        items=runs,
        page={
            "next_cursor": None,
            "has_more": False,
            "limit": limit,
        },
    )


@router.post("/runs", response_model=SyncRunResponse, status_code=status.HTTP_202_ACCEPTED)
def create_sync_run(
    request: CreateSyncRunRequest,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
) -> SyncRunResponse:
    workspace_database_path = resolve_database_path(settings.database_file)
    service = build_sync_service(settings, workspace_database_path)
    run = service.create_run(
        channel_ids=request.channel_ids,
        mode=request.mode,
        trigger_kind=request.resolved_trigger_kind,
    )
    background_tasks.add_task(
        execute_sync_run_in_workspace,
        settings=settings,
        database_path=workspace_database_path,
        run_id=str(run["id"]),
    )
    return SyncRunResponse(run=run)


@router.get("/runs/{run_id}", response_model=SyncRunResponse)
def get_sync_run(run_id: str, service: SyncService = Depends(get_sync_service)) -> SyncRunResponse:
    return SyncRunResponse(run=service.get_run(run_id))
