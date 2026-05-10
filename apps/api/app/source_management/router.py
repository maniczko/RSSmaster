from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status

from app.config import Settings, get_settings
from app.db.initializer import database_path_override, resolve_database_path
from app.sync.repository import SyncRepository
from app.sync.service import SyncService

from .models import (
    FeedHealthCenterResponse,
    ImportOpmlRequest,
    OpmlExportResponse,
    OpmlImportPreviewResponse,
    OpmlImportResponse,
    PreviewOpmlImportRequest,
    PreviewSourceRequest,
    PreviewSourceResponse,
    SourceActionRequest,
    SourceActionResponse,
    SourceCollectionsResponse,
    SourceCreateRequest,
    SourceCreateResponse,
    SourceReadResponse,
    SourceRestoreResponse,
    SourceSyncResponse,
)
from .repository import SourceManagementRepository
from .service import SourceManagementService

router = APIRouter(prefix="/api/v1/source-management", tags=["source-management"])


def get_source_management_service(settings: Settings = Depends(get_settings)) -> SourceManagementService:
    repository = SourceManagementRepository(settings.database_file)
    return SourceManagementService(settings, repository)


def build_sync_service(settings: Settings, database_path: Path) -> SyncService:
    return SyncService(settings, SyncRepository(database_path))


def execute_source_sync_in_workspace(*, settings: Settings, database_path: Path, run_id: str) -> None:
    with database_path_override(database_path):
        build_sync_service(settings, database_path).execute_run(run_id)


@router.post("/sources/preview", response_model=PreviewSourceResponse)
def preview_source(
    payload: PreviewSourceRequest,
    service: SourceManagementService = Depends(get_source_management_service),
) -> PreviewSourceResponse:
    return PreviewSourceResponse.model_validate(service.preview_source(input_url=payload.input_url))


@router.post("/sources", response_model=SourceCreateResponse, status_code=status.HTTP_201_CREATED)
def create_source(
    payload: SourceCreateRequest,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
) -> SourceCreateResponse:
    workspace_database_path = resolve_database_path(settings.database_file)
    service = SourceManagementService(settings, SourceManagementRepository(workspace_database_path))
    response = service.create_source(payload)

    if payload.initial_sync == "enqueue":
        source = response["source"]
        if source["state"] == "active":
            sync_service = build_sync_service(settings, workspace_database_path)
            run = sync_service.create_manual_run(channel_ids=[str(source["id"])])
            background_tasks.add_task(
                execute_source_sync_in_workspace,
                settings=settings,
                database_path=workspace_database_path,
                run_id=str(run["id"]),
            )
            response["initial_sync_run"] = run

    return SourceCreateResponse.model_validate(response)


@router.get("/sources/{channel_id}", response_model=SourceReadResponse)
def get_source(
    channel_id: str,
    service: SourceManagementService = Depends(get_source_management_service),
) -> SourceReadResponse:
    return SourceReadResponse.model_validate(service.get_source(channel_id))


@router.get("/collections", response_model=SourceCollectionsResponse)
def list_collections(
    service: SourceManagementService = Depends(get_source_management_service),
) -> SourceCollectionsResponse:
    return SourceCollectionsResponse.model_validate(service.list_collections())


@router.get("/health-center", response_model=FeedHealthCenterResponse)
def get_health_center(
    issue_limit: int = Query(default=25, ge=1, le=200),
    service: SourceManagementService = Depends(get_source_management_service),
) -> FeedHealthCenterResponse:
    return FeedHealthCenterResponse.model_validate(service.get_feed_health_center(issue_limit=issue_limit))


@router.post("/sources/{channel_id}/actions", response_model=SourceActionResponse)
def apply_action(
    channel_id: str,
    payload: SourceActionRequest,
    service: SourceManagementService = Depends(get_source_management_service),
) -> SourceActionResponse:
    return SourceActionResponse.model_validate(service.apply_action(channel_id, payload))


@router.post("/sources/{channel_id}/restore", response_model=SourceRestoreResponse)
def restore_source(
    channel_id: str,
    service: SourceManagementService = Depends(get_source_management_service),
) -> SourceRestoreResponse:
    return SourceRestoreResponse.model_validate(service.restore_source(channel_id))


@router.post("/sources/{channel_id}/sync", response_model=SourceSyncResponse, status_code=status.HTTP_202_ACCEPTED)
def sync_source(
    channel_id: str,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
) -> SourceSyncResponse:
    workspace_database_path = resolve_database_path(settings.database_file)
    source_service = SourceManagementService(settings, SourceManagementRepository(workspace_database_path))
    source_response = source_service.get_source(channel_id)
    sync_service = build_sync_service(settings, workspace_database_path)
    run = sync_service.create_manual_run(channel_ids=[channel_id])
    background_tasks.add_task(
        execute_source_sync_in_workspace,
        settings=settings,
        database_path=workspace_database_path,
        run_id=str(run["id"]),
    )
    return SourceSyncResponse.model_validate({"source": source_response["source"], "run": run})


@router.post("/opml/import/preview", response_model=OpmlImportPreviewResponse)
def preview_opml_import(
    payload: PreviewOpmlImportRequest,
    service: SourceManagementService = Depends(get_source_management_service),
) -> OpmlImportPreviewResponse:
    return OpmlImportPreviewResponse.model_validate(service.preview_opml_import(opml_content=payload.opml_content))


@router.post("/opml/import", response_model=OpmlImportResponse, status_code=status.HTTP_201_CREATED)
def import_opml(
    payload: ImportOpmlRequest,
    service: SourceManagementService = Depends(get_source_management_service),
) -> OpmlImportResponse:
    return OpmlImportResponse.model_validate(service.import_opml(payload.model_dump()))


@router.get("/opml/export", response_model=OpmlExportResponse)
def export_opml(
    include_archived: bool = Query(default=False),
    service: SourceManagementService = Depends(get_source_management_service),
) -> OpmlExportResponse:
    return OpmlExportResponse.model_validate(service.export_opml(include_archived=include_archived))
