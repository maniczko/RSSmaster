from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings as AppSettings, get_settings
from app.profiles.repository import InterestProfileRepository
from app.profiles.service import InterestProfileService

from .models import RankingPipelineRequest, RankingPipelineResponse
from .repository import RankingRepository
from .service import RankingService

router = APIRouter(prefix="/api/v1/ranking", tags=["ranking"])


def get_ranking_service(settings: AppSettings = Depends(get_settings)) -> RankingService:
    ranking_repository = RankingRepository(settings.database_file)
    profile_repository = InterestProfileRepository(settings.database_file)
    profile_service = InterestProfileService(profile_repository)
    return RankingService(ranking_repository, profile_service)


@router.post("/pipeline/preview", response_model=RankingPipelineResponse)
def preview_ranking_pipeline(
    payload: RankingPipelineRequest,
    service: RankingService = Depends(get_ranking_service),
) -> RankingPipelineResponse:
    return RankingPipelineResponse.model_validate(
        service.preview_pipeline(
            channel_ids=payload.channel_ids,
            categories=payload.categories,
            published_after=payload.published_after,
            published_before=payload.published_before,
            include_read=payload.include_read,
            favorites_only=payload.favorites_only,
            digest_candidates_only=payload.digest_candidates_only,
            limit=payload.limit,
            candidate_limit=payload.candidate_limit,
        )
    )
