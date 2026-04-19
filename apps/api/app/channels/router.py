from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings

from .models import (
    ChannelHealthResponse,
    ChannelListPageModel,
    ChannelListResponse,
    ChannelModel,
    ChannelMutationResponse,
    CreateChannelRequest,
    CreateChannelResponse,
    DiscoveryModel,
    PreviewChannelRequest,
    PreviewChannelResponse,
    UpdateChannelRequest,
)
from .repository import ChannelRepository
from .service import ChannelService

router = APIRouter(prefix="/api/v1/channels", tags=["channels"])


def build_service(settings: Settings) -> ChannelService:
    repository = ChannelRepository(settings.database_file)
    return ChannelService(settings, repository)


@router.get("", response_model=ChannelListResponse)
def list_channels(
    state: str | None = Query(default=None),
    category: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    settings: Settings = Depends(get_settings),
) -> ChannelListResponse:
    service = build_service(settings)
    items = service.repository.list_channels(state=state, category=category, limit=limit)
    return ChannelListResponse(
        items=[ChannelModel.model_validate(item) for item in items],
        page=ChannelListPageModel(next_cursor=None, has_more=False, limit=limit),
    )


@router.post("/preview", response_model=PreviewChannelResponse)
def preview_channel(
    payload: PreviewChannelRequest,
    settings: Settings = Depends(get_settings),
) -> PreviewChannelResponse:
    service = build_service(settings)
    return PreviewChannelResponse.model_validate(service.preview_channel(input_url=payload.input_url))


@router.post("", response_model=CreateChannelResponse, status_code=201)
def create_channel(
    payload: CreateChannelRequest,
    settings: Settings = Depends(get_settings),
) -> CreateChannelResponse:
    service = build_service(settings)
    channel, discovery = service.add_channel(input_url=payload.input_url, category=payload.category)
    return CreateChannelResponse(
        channel=ChannelModel.model_validate(channel),
        discovery=DiscoveryModel(
            mode=discovery.mode,
            resolved_feed_url=discovery.feed.feed_url,
            candidates=discovery.candidates,
        ),
    )


@router.get("/{channel_id}/health", response_model=ChannelHealthResponse)
def get_channel_health(
    channel_id: str,
    settings: Settings = Depends(get_settings),
) -> ChannelHealthResponse:
    service = build_service(settings)
    return ChannelHealthResponse.model_validate(service.get_channel_health(channel_id))


@router.patch("/{channel_id}", response_model=ChannelMutationResponse)
def update_channel(
    channel_id: str,
    payload: UpdateChannelRequest,
    settings: Settings = Depends(get_settings),
) -> ChannelMutationResponse:
    service = build_service(settings)
    channel = service.update_channel(
        channel_id,
        category=payload.category,
        update_category="category" in payload.model_fields_set,
        state=payload.state,
        update_state="state" in payload.model_fields_set,
    )
    return ChannelMutationResponse(channel=ChannelModel.model_validate(channel))


@router.delete("/{channel_id}", response_model=ChannelMutationResponse)
def archive_channel(
    channel_id: str,
    settings: Settings = Depends(get_settings),
) -> ChannelMutationResponse:
    service = build_service(settings)
    channel = service.archive_channel(channel_id)
    return ChannelMutationResponse(channel=ChannelModel.model_validate(channel))
