from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from app.config import Settings, get_settings

from .models import (
    BuildDigestRequest,
    BuildDigestResponse,
    DigestHistoryListResponse,
    DigestHistoryResponse,
    DigestPreviewRequest,
    DigestPreviewResponse,
)
from .repository import DigestRepository
from .service import DigestService

router = APIRouter(prefix="/api/v1/digests", tags=["digests"])


def get_digest_service(settings: Settings = Depends(get_settings)) -> DigestService:
    repository = DigestRepository(settings.database_file)
    artifact_root = settings.database_file.parent / "digests"
    return DigestService(
        repository,
        artifact_root=artifact_root,
        digest_max_items=settings.digest_max_items,
    )


@router.get("/history", response_model=DigestHistoryListResponse)
def list_digest_history(
    *,
    limit: int = Query(default=10, ge=1, le=50),
    service: DigestService = Depends(get_digest_service),
) -> DigestHistoryListResponse:
    items = service.list_history(limit=limit)
    return DigestHistoryListResponse(
        items=items,
        page={
            "next_cursor": None,
            "has_more": False,
            "limit": limit,
        },
    )


@router.get("/{digest_id}", response_model=DigestHistoryResponse)
def get_digest_history(digest_id: str, service: DigestService = Depends(get_digest_service)) -> DigestHistoryResponse:
    return DigestHistoryResponse(digest=service.get_history(digest_id))


@router.post("/preview", response_model=DigestPreviewResponse)
def preview_digest(
    request: DigestPreviewRequest,
    service: DigestService = Depends(get_digest_service),
) -> DigestPreviewResponse:
    preview = service.preview_digest(
        item_ids=request.item_ids,
        category=request.category,
        title=request.title,
        period_start=request.period_start,
        period_end=request.period_end,
        limit=request.limit,
        include_read=request.include_read,
        favorites_only=request.favorites_only,
        digest_candidates_only=request.digest_candidates_only,
    )
    return DigestPreviewResponse(preview=preview)


@router.post("/build", response_model=BuildDigestResponse, status_code=status.HTTP_201_CREATED)
def build_digest(
    request: BuildDigestRequest,
    service: DigestService = Depends(get_digest_service),
) -> BuildDigestResponse:
    digest = service.build_digest(
        item_ids=request.item_ids,
        category=request.category,
        title=request.title,
        period_start=request.period_start,
        period_end=request.period_end,
        limit=request.limit,
        include_read=request.include_read,
        favorites_only=request.favorites_only,
        digest_candidates_only=request.digest_candidates_only,
    )
    return BuildDigestResponse(digest=digest)
