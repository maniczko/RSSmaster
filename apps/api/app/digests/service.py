from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
import re
from typing import Literal

from app.errors import ApiError

from .epub import build_epub_bytes, html_fragment_from_markup, html_fragment_from_text
from .repository import DigestRepository
from .storage import EditionStorage

DEFAULT_CATEGORY = "Uncategorized"


@dataclass(slots=True, frozen=True)
class DigestSelection:
    title: str
    selection_mode: Literal["digest_candidates", "explicit"]
    period_start: str | None
    period_end: str | None
    stats: dict[str, object]
    category_summary: list[dict[str, object]]
    groups: list[dict[str, object]]
    selection_snapshot: list[dict[str, object]]
    article_count: int


class DigestService:
    def __init__(
        self,
        repository: DigestRepository,
        *,
        artifact_root: Path,
        digest_max_items: int,
    ) -> None:
        self.repository = repository
        self.artifact_root = artifact_root
        self.digest_max_items = digest_max_items

    def list_history(self, *, limit: int) -> list[dict[str, object]]:
        return self.repository.list_digest_history(limit=limit)

    def get_history(self, digest_id: str) -> dict[str, object]:
        digest = self.repository.get_digest_history(digest_id)
        if digest is None:
            raise ApiError(
                status_code=404,
                code="digest_not_found",
                message="Digest history entry was not found.",
                details={"digest_id": digest_id},
                retryable=False,
            )
        return digest

    def preview_digest(
        self,
        *,
        item_ids: list[str] | None,
        category: str | None,
        title: str | None,
        period_start: str | None,
        period_end: str | None,
        limit: int,
        include_read: bool,
        favorites_only: bool,
        digest_candidates_only: bool,
    ) -> dict[str, object]:
        selection = self._build_selection(
            item_ids=item_ids,
            category=category,
            title=title,
            period_start=period_start,
            period_end=period_end,
            limit=limit,
            include_read=include_read,
            favorites_only=favorites_only,
            digest_candidates_only=digest_candidates_only,
        )
        return selection_to_payload(selection)

    def build_digest(
        self,
        *,
        item_ids: list[str] | None,
        category: str | None,
        title: str | None,
        period_start: str | None,
        period_end: str | None,
        limit: int,
        include_read: bool,
        favorites_only: bool,
        digest_candidates_only: bool,
    ) -> dict[str, object]:
        selection = self._build_selection(
            item_ids=item_ids,
            category=category,
            title=title,
            period_start=period_start,
            period_end=period_end,
            limit=limit,
            include_read=include_read,
            favorites_only=favorites_only,
            digest_candidates_only=digest_candidates_only,
        )
        scope = {
            "selection_mode": selection.selection_mode,
            "item_ids": [item["item_id"] for item in selection.selection_snapshot],
            "category": category,
            "include_read": include_read,
            "favorites_only": favorites_only,
            "digest_candidates_only": digest_candidates_only,
            "limit": min(limit, self.digest_max_items),
        }

        run_id = self.repository.create_job_run(
            scope=scope,
            trigger_kind="manual",
            article_count=selection.article_count,
        )
        started_at = utc_now()
        self.repository.mark_job_run_building(run_id, started_at=started_at, article_count=selection.article_count)
        digest = self.repository.create_digest_history(
            job_run_id=run_id,
            title=selection.title,
            period_start=selection.period_start,
            period_end=selection.period_end,
            article_count=selection.article_count,
            selection_snapshot=selection.selection_snapshot,
            category_summary=selection.category_summary,
        )

        try:
            epub_bytes = build_epub_bytes(
                digest_id=str(digest["id"]),
                title=selection.title,
                author_label="rssmaster",
                generated_at=started_at,
                groups=selection.groups,
                period_start=selection.period_start,
                period_end=selection.period_end,
            )
            artifact_path, artifact_sha256 = self._persist_artifact(
                digest_id=str(digest["id"]),
                title=selection.title,
                epub_bytes=epub_bytes,
            )
            completed_at = utc_now()
            duration_ms = elapsed_ms(started_at, completed_at)
            self.repository.complete_job_run(
                run_id,
                status="completed",
                completed_at=completed_at,
                duration_ms=duration_ms,
                article_count=selection.article_count,
                artifact_path=artifact_path,
                artifact_sha256=artifact_sha256,
                error_code=None,
                error_message=None,
            )
            return self.repository.complete_digest_history(
                str(digest["id"]),
                artifact_path=artifact_path,
                artifact_sha256=artifact_sha256,
                generated_at=completed_at,
            )
        except ApiError:
            raise
        except Exception as error:  # pragma: no cover - defensive safety net
            completed_at = utc_now()
            duration_ms = elapsed_ms(started_at, completed_at)
            self.repository.complete_job_run(
                run_id,
                status="failed",
                completed_at=completed_at,
                duration_ms=duration_ms,
                article_count=selection.article_count,
                artifact_path=None,
                artifact_sha256=None,
                error_code="digest_build_failed",
                error_message="Digest build failed unexpectedly.",
            )
            self.repository.fail_digest_history(
                str(digest["id"]),
                error_code="digest_build_failed",
                error_message="Digest build failed unexpectedly.",
            )
            raise ApiError(
                status_code=500,
                code="digest_build_failed",
                message="Digest build failed unexpectedly.",
                details={"reason": str(error)},
                retryable=False,
            ) from error

    def _build_selection(
        self,
        *,
        item_ids: list[str] | None,
        category: str | None,
        title: str | None,
        period_start: str | None,
        period_end: str | None,
        limit: int,
        include_read: bool,
        favorites_only: bool,
        digest_candidates_only: bool,
    ) -> DigestSelection:
        normalized_period_start = normalize_datetime(period_start)
        normalized_period_end = normalize_datetime(period_end)
        if normalized_period_start and normalized_period_end and normalized_period_start > normalized_period_end:
            raise ApiError(
                status_code=400,
                code="digest_invalid_period",
                message="period_start must be earlier than or equal to period_end.",
                details={"period_start": normalized_period_start, "period_end": normalized_period_end},
                retryable=False,
            )

        effective_limit = min(limit, self.digest_max_items)
        explicit_mode = bool(item_ids)
        candidate_limit = effective_limit if explicit_mode else min(max(effective_limit * 4, effective_limit), 200)
        rows = self.repository.list_candidate_items(
            item_ids=item_ids,
            category=None if explicit_mode else category,
            include_read=True if explicit_mode else include_read,
            favorites_only=False if explicit_mode else favorites_only,
            digest_candidates_only=False if explicit_mode else digest_candidates_only,
            period_start=None if explicit_mode else normalized_period_start,
            period_end=None if explicit_mode else normalized_period_end,
            limit=candidate_limit,
        )
        if explicit_mode and len(rows) != len(item_ids or []):
            found_ids = {str(row["id"]) for row in rows}
            missing_ids = [item_id for item_id in item_ids or [] if item_id not in found_ids]
            raise ApiError(
                status_code=400,
                code="digest_items_missing",
                message="One or more explicitly selected items could not be loaded for the digest.",
                details={"missing_item_ids": missing_ids},
                retryable=False,
            )
        if not rows:
            raise ApiError(
                status_code=400,
                code="digest_selection_empty",
                message="No items matched the digest selection criteria.",
                details={
                    "category": category,
                    "favorites_only": favorites_only,
                    "include_read": include_read,
                    "item_ids": item_ids or [],
                },
                retryable=False,
            )

        candidate_articles = [build_article_payload(index=index, row=row) for index, row in enumerate(rows, start=1)]
        deduplicated_count = (
            None
            if explicit_mode
            else max(0, len(candidate_articles) - len({magazine_dedupe_key(article) for article in candidate_articles}))
        )
        articles = (
            candidate_articles
            if explicit_mode
            else select_magazine_articles(candidate_articles, limit=effective_limit)
        )
        inferred_period_start = normalized_period_start or infer_period_boundary(articles, take_max=False)
        inferred_period_end = normalized_period_end or infer_period_boundary(articles, take_max=True)
        resolved_title = resolve_title(
            title=title,
            period_start=inferred_period_start,
            period_end=inferred_period_end,
            article_count=len(articles),
        )
        category_summary = summarize_categories(articles)
        groups = build_groups(articles)
        selection_snapshot = build_selection_snapshot(articles)
        stats = build_stats(
            articles=articles,
            category_summary=category_summary,
            candidate_count=len(candidate_articles),
            deduplicated_count=deduplicated_count,
        )

        return DigestSelection(
            title=resolved_title,
            selection_mode="explicit" if item_ids else "digest_candidates",
            period_start=inferred_period_start,
            period_end=inferred_period_end,
            stats=stats,
            category_summary=category_summary,
            groups=groups,
            selection_snapshot=selection_snapshot,
            article_count=len(articles),
        )

    def _persist_artifact(self, *, digest_id: str, title: str, epub_bytes: bytes) -> tuple[str, str]:
        artifact = EditionStorage(self.artifact_root).save_epub(
            edition_id=digest_id,
            title=title,
            epub_bytes=epub_bytes,
        )
        return artifact.path, artifact.sha256


def build_article_payload(*, index: int, row: dict[str, object]) -> dict[str, object]:
    content_html = resolve_content_html(row)
    word_count = count_words(content_html)
    return {
        "id": row["id"],
        "channel_id": row["channel_id"],
        "channel_title": row["channel_title"],
        "category": normalize_category(row.get("category")),
        "title": row["title"],
        "author": row["author"],
        "source_url": row["source_url"],
        "excerpt": row["excerpt"],
        "published_at": row["published_at"],
        "is_read": bool(row["is_read"]),
        "is_favorite": bool(row["is_favorite"]),
        "digest_candidate": bool(row["digest_candidate"]),
        "content_html": content_html,
        "word_count": word_count,
        "magazine_score": None,
        "ranking_reason": None,
        "_position": index,
        "_content_hash": row.get("content_hash"),
    }


def select_magazine_articles(articles: list[dict[str, object]], *, limit: int) -> list[dict[str, object]]:
    newest_published_at = newest_article_timestamp(articles)
    scored = [
        score_magazine_article(article, newest_published_at=newest_published_at)
        for article in articles
    ]
    scored.sort(
        key=lambda article: (
            -float(article["magazine_score"] or 0),
            -timestamp_sort_key(article.get("published_at")),
            str(article["channel_title"]).lower(),
            str(article["title"]).lower(),
            str(article["id"]),
        )
    )

    selected: list[dict[str, object]] = []
    deferred: list[dict[str, object]] = []
    seen_keys: set[str] = set()
    source_counts: dict[str, int] = {}
    max_per_source = max(1, min(3, (limit + 1) // 2))

    for article in scored:
        dedupe_key = magazine_dedupe_key(article)
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)

        source_key = str(article["channel_id"])
        if source_counts.get(source_key, 0) < max_per_source:
            selected.append(article)
            source_counts[source_key] = source_counts.get(source_key, 0) + 1
        else:
            deferred.append(article)

        if len(selected) >= limit:
            break

    for article in deferred:
        if len(selected) >= limit:
            break
        selected.append(article)

    return renumber_articles(selected[:limit])


def score_magazine_article(
    article: dict[str, object],
    *,
    newest_published_at: datetime | None,
) -> dict[str, object]:
    scored = dict(article)
    score = 50.0
    reasons: list[str] = []

    if not bool(article["is_read"]):
        score += 14
        reasons.append("nieprzeczytane")
    else:
        score -= 8

    if bool(article["is_favorite"]):
        score += 22
        reasons.append("zapisane")

    if bool(article["digest_candidate"]):
        score += 12
        reasons.append("kandydat")

    word_count = int(article["word_count"])
    if word_count >= 600:
        score += 14
        reasons.append("pełna treść")
    elif word_count >= 180:
        score += 8
        reasons.append("czytelna treść")
    elif word_count < 60:
        score -= 18
        reasons.append("krótki fallback")

    title = str(article["title"]).strip()
    if 18 <= len(title) <= 140:
        score += 6
    elif len(title) < 18:
        score -= 6
    elif len(title) > 180:
        score -= 8

    if article.get("excerpt"):
        score += 3
    if article.get("author"):
        score += 2

    published_at = parse_optional_datetime(article.get("published_at"))
    if published_at and newest_published_at:
        age_days = max(0, (newest_published_at - published_at).days)
        if age_days <= 1:
            score += 12
            reasons.append("świeże")
        elif age_days <= 7:
            score += 8
            reasons.append("aktualne")
        elif age_days <= 30:
            score += 4
        else:
            score -= 10

    scored["magazine_score"] = round(score, 2)
    scored["ranking_reason"] = ", ".join(reasons[:3]) or "stabilny ranking"
    return scored


def renumber_articles(articles: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        {
            **article,
            "_position": index,
        }
        for index, article in enumerate(articles, start=1)
    ]


def newest_article_timestamp(articles: list[dict[str, object]]) -> datetime | None:
    timestamps = [
        timestamp
        for article in articles
        if (timestamp := parse_optional_datetime(article.get("published_at"))) is not None
    ]
    if not timestamps:
        return None
    return max(timestamps)


def parse_optional_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def timestamp_sort_key(value: object) -> float:
    parsed = parse_optional_datetime(value)
    return parsed.timestamp() if parsed is not None else 0.0


def magazine_dedupe_key(article: dict[str, object]) -> str:
    content_hash = article.get("_content_hash")
    if isinstance(content_hash, str) and content_hash.strip():
        return f"hash:{content_hash.strip()}"

    source_url = article.get("source_url")
    if isinstance(source_url, str) and source_url.strip():
        return f"url:{source_url.strip().lower()}"

    return f"title:{str(article['title']).strip().lower()}"


def resolve_content_html(row: dict[str, object]) -> str:
    cleaned_html = row.get("cleaned_html")
    if isinstance(cleaned_html, str) and cleaned_html.strip():
        return html_fragment_from_markup(cleaned_html)

    content_text = row.get("content_text")
    if isinstance(content_text, str) and content_text.strip():
        return html_fragment_from_text(content_text)

    raw_html = row.get("raw_html")
    if isinstance(raw_html, str) and raw_html.strip():
        return html_fragment_from_markup(raw_html)

    excerpt = row.get("excerpt")
    if isinstance(excerpt, str) and excerpt.strip():
        return html_fragment_from_text(excerpt)

    title = str(row["title"])
    return html_fragment_from_text(f"{title}\n\nReadable content was not captured yet, so rssmaster preserved the article metadata only.")


def build_selection_snapshot(articles: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        {
            "item_id": article["id"],
            "position": int(article["_position"]),
            "channel_id": article["channel_id"],
            "channel_title": article["channel_title"],
            "category": article["category"],
            "title": article["title"],
            "author": article["author"],
            "source_url": article["source_url"],
            "excerpt": article["excerpt"],
            "published_at": article["published_at"],
            "content_html": article["content_html"],
            "word_count": article["word_count"],
            "content_hash": article["_content_hash"],
            "magazine_score": article["magazine_score"],
            "ranking_reason": article["ranking_reason"],
        }
        for article in articles
    ]


def summarize_categories(articles: list[dict[str, object]]) -> list[dict[str, object]]:
    counts: dict[str, int] = {}
    for article in articles:
        category = str(article["category"])
        counts[category] = counts.get(category, 0) + 1
    return [
        {"category": category, "article_count": counts[category]}
        for category in sorted(counts)
    ]


def build_groups(articles: list[dict[str, object]]) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = {}
    for article in articles:
        category = str(article["category"])
        grouped.setdefault(category, []).append(strip_private_fields(article))
    return [
        {
            "category": category,
            "article_count": len(grouped[category]),
            "items": grouped[category],
        }
        for category in sorted(grouped)
    ]


def build_stats(
    *,
    articles: list[dict[str, object]],
    category_summary: list[dict[str, object]],
    candidate_count: int | None = None,
    deduplicated_count: int | None = None,
) -> dict[str, object]:
    word_count = sum(int(article["word_count"]) for article in articles)
    return {
        "candidate_count": candidate_count,
        "deduplicated_count": deduplicated_count,
        "source_count": len({str(article["channel_id"]) for article in articles}),
        "article_count": len(articles),
        "category_count": len(category_summary),
        "unread_count": sum(0 if article["is_read"] else 1 for article in articles),
        "favorite_count": sum(1 for article in articles if article["is_favorite"]),
        "digest_candidate_count": sum(1 for article in articles if article["digest_candidate"]),
        "word_count": word_count,
        "estimated_read_minutes": max(1, round(word_count / 220)) if word_count else 1,
    }


def selection_to_payload(selection: DigestSelection) -> dict[str, object]:
    return {
        "title": selection.title,
        "period_start": selection.period_start,
        "period_end": selection.period_end,
        "selection_mode": selection.selection_mode,
        "stats": selection.stats,
        "category_summary": selection.category_summary,
        "groups": selection.groups,
        "selection_snapshot": selection.selection_snapshot,
    }


def normalize_category(value: object) -> str:
    if not isinstance(value, str):
        return DEFAULT_CATEGORY
    cleaned = value.strip()
    return cleaned or DEFAULT_CATEGORY


def strip_private_fields(article: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in article.items() if not key.startswith("_")}


def infer_period_boundary(articles: list[dict[str, object]], *, take_max: bool) -> str | None:
    timestamps = [
        published_at
        for article in articles
        if isinstance((published_at := article.get("published_at")), str) and published_at
    ]
    if not timestamps:
        return None
    return max(timestamps) if take_max else min(timestamps)


def resolve_title(*, title: str | None, period_start: str | None, period_end: str | None, article_count: int) -> str:
    if title:
        return title
    if period_start and period_end:
        start_label = period_start[:10]
        end_label = period_end[:10]
        if start_label == end_label:
            return f"rssmaster digest {start_label}"
        return f"rssmaster digest {start_label} to {end_label}"
    return f"rssmaster digest ({article_count} articles)"


def count_words(content_html: str) -> int:
    text = re.sub(r"<[^>]+>", " ", content_html)
    tokens = [token for token in re.split(r"\s+", text) if token]
    return len(tokens)


def normalize_datetime(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        raise ApiError(
            status_code=400,
            code="digest_invalid_datetime",
            message="Digest period filters must use ISO-8601 timestamps.",
            details={"value": cleaned},
            retryable=False,
        ) from None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def elapsed_ms(started_at: str, completed_at: str) -> int:
    start = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
    end = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
    return max(0, int((end - start).total_seconds() * 1000))
