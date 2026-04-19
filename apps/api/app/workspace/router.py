from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings

from .models import (
    AnnotationListResponse,
    AnnotationMutationResponse,
    BriefingResponse,
    CaptureRequest,
    CaptureResponse,
    ChannelControlModel,
    ChannelControlResponse,
    CollectionListResponse,
    CollectionMutationRequest,
    CollectionMutationResponse,
    CreateAnnotationRequest,
    CreateCollectionRequest,
    CreateSavedSearchRequest,
    CreateSourceGroupRequest,
    CreateTagRequest,
    ItemTagResponse,
    OPMLExportResponse,
    OPMLImportRequest,
    OPMLImportResponse,
    RankingResponse,
    ReaderProfileResponse,
    SavedSearchListResponse,
    SetItemTagsRequest,
    SourceGroupListResponse,
    SourceGroupMutationResponse,
    SourceHealthResponse,
    StoryClusterListResponse,
    TagListResponse,
    UpdateAnnotationRequest,
    UpdateChannelControlRequest,
    UpdateReaderProfileRequest,
    WorkspaceExportResponse,
)
from .repository import WorkspaceRepository
from .service import WorkspaceService

router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])


def get_workspace_service(settings: Settings = Depends(get_settings)) -> WorkspaceService:
    repository = WorkspaceRepository(settings.database_file)
    return WorkspaceService(settings, repository)


@router.get("/profile", response_model=ReaderProfileResponse)
def get_profile(service: WorkspaceService = Depends(get_workspace_service)) -> ReaderProfileResponse:
    return ReaderProfileResponse(profile=service.get_profile())


@router.patch("/profile", response_model=ReaderProfileResponse)
def update_profile(
    payload: UpdateReaderProfileRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> ReaderProfileResponse:
    return ReaderProfileResponse(profile=service.update_profile(payload.model_dump(exclude_none=True)))


@router.get("/ranking", response_model=RankingResponse)
def get_ranking(
    *,
    limit: int = Query(default=12, ge=1, le=50),
    service: WorkspaceService = Depends(get_workspace_service),
) -> RankingResponse:
    return RankingResponse.model_validate(service.get_ranking(limit=limit))


@router.get("/briefing", response_model=BriefingResponse)
def get_briefing(service: WorkspaceService = Depends(get_workspace_service)) -> BriefingResponse:
    return BriefingResponse(briefing=service.get_briefing())


@router.get("/annotations", response_model=AnnotationListResponse)
def list_annotations(
    *,
    item_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=200),
    service: WorkspaceService = Depends(get_workspace_service),
) -> AnnotationListResponse:
    return AnnotationListResponse.model_validate(service.list_annotations(item_id=item_id, search=search, limit=limit))


@router.post("/annotations", response_model=AnnotationMutationResponse)
def create_annotation(
    payload: CreateAnnotationRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> AnnotationMutationResponse:
    return AnnotationMutationResponse.model_validate(service.create_annotation(payload.model_dump()))


@router.patch("/annotations/{annotation_id}", response_model=AnnotationMutationResponse)
def update_annotation(
    annotation_id: str,
    payload: UpdateAnnotationRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> AnnotationMutationResponse:
    return AnnotationMutationResponse.model_validate(service.update_annotation(annotation_id, payload.model_dump(exclude_unset=True)))


@router.get("/tags", response_model=TagListResponse)
def list_tags(service: WorkspaceService = Depends(get_workspace_service)) -> TagListResponse:
    return TagListResponse.model_validate(service.list_tags())


@router.post("/tags", response_model=TagListResponse)
def create_tag(
    payload: CreateTagRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> TagListResponse:
    mutation = service.create_tag(payload.model_dump())
    return TagListResponse(items=[mutation["tag"], *service.list_tags()["items"]])


@router.get("/items/{item_id}/tags", response_model=ItemTagResponse)
def get_item_tags(
    item_id: str,
    service: WorkspaceService = Depends(get_workspace_service),
) -> ItemTagResponse:
    return ItemTagResponse.model_validate(service.get_item_tags(item_id))


@router.put("/items/{item_id}/tags", response_model=ItemTagResponse)
def set_item_tags(
    item_id: str,
    payload: SetItemTagsRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> ItemTagResponse:
    return ItemTagResponse.model_validate(service.set_item_tags(item_id, payload.names))


@router.get("/collections", response_model=CollectionListResponse)
def list_collections(service: WorkspaceService = Depends(get_workspace_service)) -> CollectionListResponse:
    return CollectionListResponse.model_validate(service.list_collections())


@router.post("/collections", response_model=CollectionMutationResponse)
def create_collection(
    payload: CreateCollectionRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> CollectionMutationResponse:
    return CollectionMutationResponse.model_validate(service.create_collection(payload.model_dump(exclude_none=True)))


@router.post("/collections/{collection_id}/items", response_model=CollectionMutationResponse)
def add_collection_item(
    collection_id: str,
    payload: CollectionMutationRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> CollectionMutationResponse:
    return CollectionMutationResponse.model_validate(service.add_collection_item(collection_id, item_id=payload.item_id))


@router.get("/saved-searches", response_model=SavedSearchListResponse)
def list_saved_searches(service: WorkspaceService = Depends(get_workspace_service)) -> SavedSearchListResponse:
    return SavedSearchListResponse.model_validate(service.list_saved_searches())


@router.post("/saved-searches", response_model=SavedSearchListResponse)
def create_saved_search(
    payload: CreateSavedSearchRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> SavedSearchListResponse:
    return SavedSearchListResponse.model_validate(service.create_saved_search(payload.model_dump()))


@router.get("/source-groups", response_model=SourceGroupListResponse)
def list_source_groups(service: WorkspaceService = Depends(get_workspace_service)) -> SourceGroupListResponse:
    return SourceGroupListResponse.model_validate(service.list_source_groups())


@router.post("/source-groups", response_model=SourceGroupMutationResponse)
def create_source_group(
    payload: CreateSourceGroupRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> SourceGroupMutationResponse:
    return SourceGroupMutationResponse.model_validate(service.create_source_group(payload.model_dump()))


@router.patch("/source-controls/{channel_id}", response_model=ChannelControlResponse)
def update_source_control(
    channel_id: str,
    payload: UpdateChannelControlRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> ChannelControlResponse:
    return ChannelControlResponse(control=ChannelControlModel.model_validate(service.update_channel_control(channel_id, payload.model_dump(exclude_unset=True))["control"]))


@router.get("/source-health", response_model=SourceHealthResponse)
def list_source_health(service: WorkspaceService = Depends(get_workspace_service)) -> SourceHealthResponse:
    return SourceHealthResponse.model_validate(service.list_source_health())


@router.get("/opml/export", response_model=OPMLExportResponse)
def export_opml(service: WorkspaceService = Depends(get_workspace_service)) -> OPMLExportResponse:
    return OPMLExportResponse.model_validate(service.export_opml())


@router.post("/opml/import", response_model=OPMLImportResponse)
def import_opml(
    payload: OPMLImportRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> OPMLImportResponse:
    return OPMLImportResponse.model_validate(service.import_opml(payload.model_dump()))


@router.get("/stories", response_model=StoryClusterListResponse)
def list_stories(
    *,
    limit: int = Query(default=8, ge=1, le=30),
    service: WorkspaceService = Depends(get_workspace_service),
) -> StoryClusterListResponse:
    return StoryClusterListResponse.model_validate(service.list_story_clusters(limit=limit))


@router.post("/capture", response_model=CaptureResponse)
def capture_url(
    payload: CaptureRequest,
    service: WorkspaceService = Depends(get_workspace_service),
) -> CaptureResponse:
    return CaptureResponse.model_validate(service.capture_url(payload.model_dump(exclude_none=True)))


@router.get("/export", response_model=WorkspaceExportResponse)
def export_workspace(service: WorkspaceService = Depends(get_workspace_service)) -> WorkspaceExportResponse:
    return WorkspaceExportResponse.model_validate(service.export_workspace())
