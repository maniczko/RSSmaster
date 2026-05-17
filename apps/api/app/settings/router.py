from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings as AppSettings, get_settings

from .models import (
    AISettingsPreflightResponse,
    AISettingsResponse,
    DeliverySettingsPreflightRequest,
    DeliverySettingsPreflightResponse,
    DeliverySettingsResponse,
    MagazineSettingsPreflightResponse,
    MagazineSettingsResponse,
    UpdateAISettingsRequest,
    UpdateDeliverySettingsRequest,
    UpdateMagazineSettingsRequest,
)
from .repository import SettingsRepository
from .service import SettingsService

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


def get_settings_service(settings: AppSettings = Depends(get_settings)) -> SettingsService:
    repository = SettingsRepository(settings.database_file)
    return SettingsService(settings, repository)


@router.get("/ai", response_model=AISettingsResponse)
def get_ai_settings(service: SettingsService = Depends(get_settings_service)) -> AISettingsResponse:
    return AISettingsResponse(settings=service.get_ai_settings())


@router.patch("/ai", response_model=AISettingsResponse)
def update_ai_settings(
    payload: UpdateAISettingsRequest,
    service: SettingsService = Depends(get_settings_service),
) -> AISettingsResponse:
    return AISettingsResponse(settings=service.update_ai_settings(payload))


@router.post("/ai/preflight", response_model=AISettingsPreflightResponse)
def preflight_ai_settings(service: SettingsService = Depends(get_settings_service)) -> AISettingsPreflightResponse:
    return AISettingsPreflightResponse.model_validate(service.preflight_ai_settings())


@router.get("/magazine", response_model=MagazineSettingsResponse)
def get_magazine_settings(service: SettingsService = Depends(get_settings_service)) -> MagazineSettingsResponse:
    return MagazineSettingsResponse(settings=service.get_magazine_settings())


@router.patch("/magazine", response_model=MagazineSettingsResponse)
def update_magazine_settings(
    payload: UpdateMagazineSettingsRequest,
    service: SettingsService = Depends(get_settings_service),
) -> MagazineSettingsResponse:
    return MagazineSettingsResponse(settings=service.update_magazine_settings(payload))


@router.post("/magazine/preflight", response_model=MagazineSettingsPreflightResponse)
def preflight_magazine_settings(service: SettingsService = Depends(get_settings_service)) -> MagazineSettingsPreflightResponse:
    return MagazineSettingsPreflightResponse(preflight=service.preflight_magazine_settings())


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
