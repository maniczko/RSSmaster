from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

DigestRecommendation = Literal["include", "maybe", "skip"]


class ArticleAIInsightModel(BaseModel):
    item_id: str
    generated_at: str
    model: str
    source: Literal["openai"] = "openai"
    summary: str
    key_points: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    reading_time_hint: str
    relevance_score: int = Field(ge=1, le=100)
    digest_recommendation: DigestRecommendation


class ArticleAIInsightResponse(BaseModel):
    insight: ArticleAIInsightModel
