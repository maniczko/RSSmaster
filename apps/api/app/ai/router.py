from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.items.repository import ItemRepository
from app.settings.repository import SettingsRepository
from app.settings.service import SettingsService

from .models import ArticleAIInsightResponse
from .service import AIArticleInsightService

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


def get_ai_article_insight_service(settings: Settings = Depends(get_settings)) -> AIArticleInsightService:
    return AIArticleInsightService(
        settings=settings,
        item_repository=ItemRepository(settings.database_file),
        settings_service=SettingsService(settings, SettingsRepository(settings.database_file)),
    )


@router.post("/items/{item_id}/insight", response_model=ArticleAIInsightResponse)
def generate_article_insight(
    item_id: str,
    service: AIArticleInsightService = Depends(get_ai_article_insight_service),
) -> ArticleAIInsightResponse:
    return ArticleAIInsightResponse.model_validate(service.generate_item_insight(item_id))
