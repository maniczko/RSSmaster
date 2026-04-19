from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status

from app.config import Settings, get_settings

from .models import CreateSyncRunRequest, SyncRunListResponse, SyncRunResponse
from .repository import SyncRepository
from .service import SyncService

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])


def get_sync_service(settings: Settings = Depends(get_settings)) -> SyncService:
    repository = SyncRepository(settings.database_file)
    return SyncService(settings, repository)


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
    service: SyncService = Depends(get_sync_service),
) -> SyncRunResponse:
    run = service.create_run(
        channel_ids=request.channel_ids,
        mode=request.mode,
        trigger_kind=request.resolved_trigger_kind,
    )
    background_tasks.add_task(service.execute_run, run["id"])
    return SyncRunResponse(run=run)


@router.get("/runs/{run_id}", response_model=SyncRunResponse)
def get_sync_run(run_id: str, service: SyncService = Depends(get_sync_service)) -> SyncRunResponse:
    return SyncRunResponse(run=service.get_run(run_id))
