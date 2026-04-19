from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings as AppSettings, get_settings

from .models import InterestProfileResponse, UpdateInterestProfileRequest
from .repository import InterestProfileRepository
from .service import InterestProfileService

router = APIRouter(prefix="/api/v1/profiles", tags=["profiles"])


def get_interest_profile_service(settings: AppSettings = Depends(get_settings)) -> InterestProfileService:
    repository = InterestProfileRepository(settings.database_file)
    return InterestProfileService(repository)


@router.get("/interests", response_model=InterestProfileResponse)
def get_interest_profile(
    service: InterestProfileService = Depends(get_interest_profile_service),
) -> InterestProfileResponse:
    return InterestProfileResponse.model_validate(service.get_interest_profile())


@router.patch("/interests", response_model=InterestProfileResponse)
def update_interest_profile(
    payload: UpdateInterestProfileRequest,
    service: InterestProfileService = Depends(get_interest_profile_service),
) -> InterestProfileResponse:
    return InterestProfileResponse.model_validate(service.update_interest_profile(payload))
