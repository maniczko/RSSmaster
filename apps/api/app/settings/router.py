from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings as AppSettings, get_settings

from .models import (
    DeliverySettingsPreflightRequest,
    DeliverySettingsPreflightResponse,
    DeliverySettingsResponse,
    UpdateDeliverySettingsRequest,
)
from .repository import SettingsRepository
from .service import SettingsService

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


def get_settings_service(settings: AppSettings = Depends(get_settings)) -> SettingsService:
    repository = SettingsRepository(settings.database_file)
    return SettingsService(settings, repository)


@router.get("/delivery", response_model=DeliverySettingsResponse)
def get_delivery_settings(service: SettingsService = Depends(get_settings_service)) -> DeliverySettingsResponse:
    return DeliverySettingsResponse(settings=service.get_delivery_settings())


@router.patch("/delivery", response_model=DeliverySettingsResponse)
def update_delivery_settings(
    payload: UpdateDeliverySettingsRequest,
    service: SettingsService = Depends(get_settings_service),
) -> DeliverySettingsResponse:
    return DeliverySettingsResponse(settings=service.update_delivery_settings(payload))


@router.post("/delivery/preflight", response_model=DeliverySettingsPreflightResponse)
def preflight_delivery_settings(
    payload: DeliverySettingsPreflightRequest,
    service: SettingsService = Depends(get_settings_service),
) -> DeliverySettingsPreflightResponse:
    return DeliverySettingsPreflightResponse(
        preflight=service.preflight_delivery_settings(check_connection=payload.check_connection)
    )
