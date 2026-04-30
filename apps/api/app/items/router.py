from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings

from .models import (
    ItemDetailModel,
    ItemDetailResponse,
    ItemListPageModel,
    ItemListResponse,
    ItemModel,
    ItemMutationResponse,
    ReextractItemRequest,
    ReextractItemResponse,
    UpdateItemStateRequest,
)
from .repository import ItemRepository
from .service import ItemService

router = APIRouter(prefix="/api/v1/items", tags=["items"])


def get_item_service(settings: Settings = Depends(get_settings)) -> ItemService:
    repository = ItemRepository(settings.database_file)
    return ItemService(settings, repository)


@router.get("", response_model=ItemListResponse)
def list_items(
    *,
    channel_id: str | None = Query(default=None),
    category: str | None = Query(default=None),
    view: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    is_read: bool | None = Query(default=None),
    is_favorite: bool | None = Query(default=None),
    digest_candidate: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    published_after: str | None = Query(default=None),
    published_before: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    service: ItemService = Depends(get_item_service),
) -> ItemListResponse:
    result = service.list_items(
        channel_id=channel_id,
        category=category,
        view=view,
        sort=sort,
        is_read=is_read,
        is_favorite=is_favorite,
        digest_candidate=digest_candidate,
        search=search,
        published_after=published_after,
        published_before=published_before,
        cursor=cursor,
        limit=limit,
    )
    return ItemListResponse(
        items=[ItemModel.model_validate(item) for item in result.items],
        page=ItemListPageModel(
            next_cursor=result.next_cursor,
            has_more=result.has_more,
            limit=result.limit,
        ),
    )


@router.get("/{item_id}", response_model=ItemDetailResponse)
def get_item_detail(
    item_id: str,
    service: ItemService = Depends(get_item_service),
) -> ItemDetailResponse:
    item = service.get_item_detail(item_id)
    return ItemDetailResponse(item=ItemDetailModel.model_validate(item))


@router.patch("/{item_id}/state", response_model=ItemMutationResponse)
def update_item_state(
    item_id: str,
    payload: UpdateItemStateRequest,
    service: ItemService = Depends(get_item_service),
) -> ItemMutationResponse:
    item = service.update_item_state(
        item_id,
        is_read=payload.is_read,
        update_is_read="is_read" in payload.model_fields_set,
        is_favorite=payload.is_favorite,
        update_is_favorite="is_favorite" in payload.model_fields_set,
        is_archived=payload.is_archived,
        update_is_archived="is_archived" in payload.model_fields_set,
        digest_candidate=payload.digest_candidate,
        update_digest_candidate="digest_candidate" in payload.model_fields_set,
        library_action=payload.library_action,
    )
    return ItemMutationResponse(item=ItemModel.model_validate(item))


@router.post("/{item_id}/reextract", response_model=ReextractItemResponse)
def reextract_item(
    item_id: str,
    payload: ReextractItemRequest,
    service: ItemService = Depends(get_item_service),
) -> ReextractItemResponse:
    result = service.reextract_item(item_id, mode=payload.mode)
    return ReextractItemResponse.model_validate(result)
