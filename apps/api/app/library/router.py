from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings

from .models import (
    CollectionListResponse,
    CollectionModel,
    CollectionResponse,
    CreateCollectionRequest,
    CreateSavedSearchRequest,
    CreateTagRequest,
    LibraryItemListResponse,
    LibraryItemModel,
    RecallSurfaceListResponse,
    RecallSurfaceModel,
    RecallSurfaceResponse,
    ReplaceCollectionItemsRequest,
    ReplaceTagItemsRequest,
    SavedSearchListResponse,
    SavedSearchModel,
    SavedSearchResponse,
    TagListResponse,
    TagModel,
    TagResponse,
    UpdateCollectionRequest,
    UpdateSavedSearchRequest,
    UpdateTagRequest,
)
from .repository import LibraryRepository
from .service import LibraryService

router = APIRouter(prefix="/api/v1/library", tags=["library"])


def get_library_service(settings: Settings = Depends(get_settings)) -> LibraryService:
    repository = LibraryRepository(settings.database_file)
    return LibraryService(settings, repository)


@router.get("/tags", response_model=TagListResponse)
def list_tags(
    *,
    include_archived: bool = Query(default=False),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    service: LibraryService = Depends(get_library_service),
) -> TagListResponse:
    result = service.list_tags(include_archived=include_archived, cursor=cursor, limit=limit)
    return TagListResponse(
        items=[TagModel.model_validate(item) for item in result["items"]],
        page=result["page"],
    )


@router.post("/tags", response_model=TagResponse, status_code=201)
def create_tag(
    payload: CreateTagRequest,
    service: LibraryService = Depends(get_library_service),
) -> TagResponse:
    return TagResponse(tag=TagModel.model_validate(service.create_tag(payload)))


@router.get("/tags/{tag_id}", response_model=TagResponse)
def get_tag(
    tag_id: str,
    service: LibraryService = Depends(get_library_service),
) -> TagResponse:
    return TagResponse(tag=TagModel.model_validate(service.get_tag(tag_id)))


@router.patch("/tags/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: str,
    payload: UpdateTagRequest,
    service: LibraryService = Depends(get_library_service),
) -> TagResponse:
    return TagResponse(tag=TagModel.model_validate(service.update_tag(tag_id, payload)))


@router.delete("/tags/{tag_id}", response_model=TagResponse)
def archive_tag(
    tag_id: str,
    service: LibraryService = Depends(get_library_service),
) -> TagResponse:
    return TagResponse(tag=TagModel.model_validate(service.archive_tag(tag_id)))


@router.put("/tags/{tag_id}/items", response_model=TagResponse)
def replace_tag_items(
    tag_id: str,
    payload: ReplaceTagItemsRequest,
    service: LibraryService = Depends(get_library_service),
) -> TagResponse:
    return TagResponse(tag=TagModel.model_validate(service.replace_tag_items(tag_id, payload)))


@router.get("/tags/{tag_id}/items", response_model=LibraryItemListResponse)
def list_tag_items(
    tag_id: str,
    *,
    include_archived_items: bool = Query(default=False),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    service: LibraryService = Depends(get_library_service),
) -> LibraryItemListResponse:
    result = service.list_tag_items(
        tag_id,
        include_archived_items=include_archived_items,
        cursor=cursor,
        limit=limit,
    )
    return LibraryItemListResponse(
        items=[LibraryItemModel.model_validate(item) for item in result["items"]],
        page=result["page"],
    )


@router.get("/collections", response_model=CollectionListResponse)
def list_collections(
    *,
    include_archived: bool = Query(default=False),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    service: LibraryService = Depends(get_library_service),
) -> CollectionListResponse:
    result = service.list_collections(include_archived=include_archived, cursor=cursor, limit=limit)
    return CollectionListResponse(
        items=[CollectionModel.model_validate(item) for item in result["items"]],
        page=result["page"],
    )


@router.post("/collections", response_model=CollectionResponse, status_code=201)
def create_collection(
    payload: CreateCollectionRequest,
    service: LibraryService = Depends(get_library_service),
) -> CollectionResponse:
    return CollectionResponse(collection=CollectionModel.model_validate(service.create_collection(payload)))


@router.get("/collections/{collection_id}", response_model=CollectionResponse)
def get_collection(
    collection_id: str,
    service: LibraryService = Depends(get_library_service),
) -> CollectionResponse:
    return CollectionResponse(collection=CollectionModel.model_validate(service.get_collection(collection_id)))


@router.patch("/collections/{collection_id}", response_model=CollectionResponse)
def update_collection(
    collection_id: str,
    payload: UpdateCollectionRequest,
    service: LibraryService = Depends(get_library_service),
) -> CollectionResponse:
    return CollectionResponse(collection=CollectionModel.model_validate(service.update_collection(collection_id, payload)))


@router.delete("/collections/{collection_id}", response_model=CollectionResponse)
def archive_collection(
    collection_id: str,
    service: LibraryService = Depends(get_library_service),
) -> CollectionResponse:
    return CollectionResponse(collection=CollectionModel.model_validate(service.archive_collection(collection_id)))


@router.put("/collections/{collection_id}/items", response_model=CollectionResponse)
def replace_collection_items(
    collection_id: str,
    payload: ReplaceCollectionItemsRequest,
    service: LibraryService = Depends(get_library_service),
) -> CollectionResponse:
    return CollectionResponse(collection=CollectionModel.model_validate(service.replace_collection_items(collection_id, payload)))


@router.get("/collections/{collection_id}/items", response_model=LibraryItemListResponse)
def list_collection_items(
    collection_id: str,
    *,
    include_archived_items: bool = Query(default=False),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    service: LibraryService = Depends(get_library_service),
) -> LibraryItemListResponse:
    result = service.list_collection_items(
        collection_id,
        include_archived_items=include_archived_items,
        cursor=cursor,
        limit=limit,
    )
    return LibraryItemListResponse(
        items=[LibraryItemModel.model_validate(item) for item in result["items"]],
        page=result["page"],
    )


@router.get("/saved-searches", response_model=SavedSearchListResponse)
def list_saved_searches(
    *,
    include_archived: bool = Query(default=False),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    service: LibraryService = Depends(get_library_service),
) -> SavedSearchListResponse:
    result = service.list_saved_searches(include_archived=include_archived, cursor=cursor, limit=limit)
    return SavedSearchListResponse(
        items=[SavedSearchModel.model_validate(item) for item in result["items"]],
        page=result["page"],
    )


@router.post("/saved-searches", response_model=SavedSearchResponse, status_code=201)
def create_saved_search(
    payload: CreateSavedSearchRequest,
    service: LibraryService = Depends(get_library_service),
) -> SavedSearchResponse:
    return SavedSearchResponse(saved_search=SavedSearchModel.model_validate(service.create_saved_search(payload)))


@router.get("/saved-searches/{saved_search_id}", response_model=SavedSearchResponse)
def get_saved_search(
    saved_search_id: str,
    service: LibraryService = Depends(get_library_service),
) -> SavedSearchResponse:
    return SavedSearchResponse(saved_search=SavedSearchModel.model_validate(service.get_saved_search(saved_search_id)))


@router.patch("/saved-searches/{saved_search_id}", response_model=SavedSearchResponse)
def update_saved_search(
    saved_search_id: str,
    payload: UpdateSavedSearchRequest,
    service: LibraryService = Depends(get_library_service),
) -> SavedSearchResponse:
    return SavedSearchResponse(saved_search=SavedSearchModel.model_validate(service.update_saved_search(saved_search_id, payload)))


@router.delete("/saved-searches/{saved_search_id}", response_model=SavedSearchResponse)
def archive_saved_search(
    saved_search_id: str,
    service: LibraryService = Depends(get_library_service),
) -> SavedSearchResponse:
    return SavedSearchResponse(saved_search=SavedSearchModel.model_validate(service.archive_saved_search(saved_search_id)))


@router.get("/saved-searches/{saved_search_id}/items", response_model=LibraryItemListResponse)
def execute_saved_search(
    saved_search_id: str,
    *,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    service: LibraryService = Depends(get_library_service),
) -> LibraryItemListResponse:
    result = service.execute_saved_search(saved_search_id, cursor=cursor, limit=limit)
    return LibraryItemListResponse(
        items=[LibraryItemModel.model_validate(item) for item in result["items"]],
        page=result["page"],
    )


@router.get("/surfaces", response_model=RecallSurfaceListResponse)
def list_recall_surfaces(service: LibraryService = Depends(get_library_service)) -> RecallSurfaceListResponse:
    result = service.list_recall_surfaces()
    return RecallSurfaceListResponse(items=[RecallSurfaceModel.model_validate(item) for item in result["items"]])


@router.get("/surfaces/{surface_id}", response_model=RecallSurfaceResponse)
def get_recall_surface(
    surface_id: str,
    *,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    service: LibraryService = Depends(get_library_service),
) -> RecallSurfaceResponse:
    result = service.get_recall_surface(surface_id=surface_id, cursor=cursor, limit=limit)
    return RecallSurfaceResponse(
        surface=RecallSurfaceModel.model_validate(result["surface"]),
        items=[LibraryItemModel.model_validate(item) for item in result["items"]],
        page=result["page"],
    )
