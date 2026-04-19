from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from app.config import Settings, get_settings

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
    SourceReadResponse,
)
from .repository import SourceManagementRepository
from .service import SourceManagementService

router = APIRouter(prefix="/api/v1/source-management", tags=["source-management"])


def get_source_management_service(settings: Settings = Depends(get_settings)) -> SourceManagementService:
    repository = SourceManagementRepository(settings.database_file)
    return SourceManagementService(settings, repository)


@router.post("/sources/preview", response_model=PreviewSourceResponse)
def preview_source(
    payload: PreviewSourceRequest,
    service: SourceManagementService = Depends(get_source_management_service),
) -> PreviewSourceResponse:
    return PreviewSourceResponse.model_validate(service.preview_source(input_url=payload.input_url))


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
