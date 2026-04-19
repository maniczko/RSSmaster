from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.config import Settings as AppSettings, get_settings
from app.settings.repository import SettingsRepository
from app.settings.service import SettingsService

from .models import (
    DeliveryDispatchResponse,
    DeliveryLogListPageModel,
    DeliveryLogListResponse,
    DeliveryPreflightRequest,
    DeliveryPreflightResponse,
    SendDigestRequest,
)
from .repository import DeliveryRepository
from .service import DeliveryService

router = APIRouter(prefix="/api/v1/delivery", tags=["delivery"])


def get_delivery_service(settings: AppSettings = Depends(get_settings)) -> DeliveryService:
    delivery_repository = DeliveryRepository(settings.database_file)
    settings_repository = SettingsRepository(settings.database_file)
    settings_service = SettingsService(settings, settings_repository)
    return DeliveryService(settings, delivery_repository, settings_service)


@router.get("/logs", response_model=DeliveryLogListResponse)
def list_delivery_logs(
    *,
    digest_id: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    service: DeliveryService = Depends(get_delivery_service),
) -> DeliveryLogListResponse:
    logs = service.list_logs(limit=limit, digest_id=digest_id)
    return DeliveryLogListResponse(
        items=logs,
        page=DeliveryLogListPageModel(next_cursor=None, has_more=False, limit=limit),
    )


@router.post("/preflight", response_model=DeliveryPreflightResponse)
def preflight_delivery(
    payload: DeliveryPreflightRequest,
    service: DeliveryService = Depends(get_delivery_service),
) -> DeliveryPreflightResponse:
    return DeliveryPreflightResponse(
        preflight=service.preflight_delivery(
            digest_id=payload.digest_id,
            target_kind=payload.target_kind,
            recipient=payload.recipient,
            mode="dry_run",
            check_connection=payload.check_connection,
        )
    )


@router.post("/send", response_model=DeliveryDispatchResponse)
def send_digest(
    payload: SendDigestRequest,
    service: DeliveryService = Depends(get_delivery_service),
) -> DeliveryDispatchResponse:
    result = service.dispatch_digest(payload)
    return DeliveryDispatchResponse(**result)
