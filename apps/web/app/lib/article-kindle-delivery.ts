export const ARTICLE_KINDLE_DIGEST_TITLE_LIMIT = 160;
export const ARTICLE_KINDLE_DIGEST_TITLE_PREFIX = "Kindle - ";

export type ArticleKindleItem = {
  id: string;
  title: string;
};

export type ArticleKindleDigestPayload = {
  item_ids: string[];
  title: string;
  limit: 1;
  include_read: true;
  favorites_only: false;
  digest_candidates_only: false;
};

export function buildArticleKindleDigestPayload(item: ArticleKindleItem): ArticleKindleDigestPayload {
  return {
    item_ids: [item.id],
    title: buildArticleKindleDigestTitle(item.title),
    limit: 1,
    include_read: true,
    favorites_only: false,
    digest_candidates_only: false,
  };
}

export function buildArticleKindleDigestTitle(title: string): string {
  const cleanedTitle = title.trim() || "Artykuł";
  const fullTitle = `${ARTICLE_KINDLE_DIGEST_TITLE_PREFIX}${cleanedTitle}`;
  if (fullTitle.length <= ARTICLE_KINDLE_DIGEST_TITLE_LIMIT) {
    return fullTitle;
  }

  const suffix = "...";
  const availableTitleLength = Math.max(
    1,
    ARTICLE_KINDLE_DIGEST_TITLE_LIMIT - ARTICLE_KINDLE_DIGEST_TITLE_PREFIX.length - suffix.length,
  );
  return `${ARTICLE_KINDLE_DIGEST_TITLE_PREFIX}${cleanedTitle.slice(0, availableTitleLength).trimEnd()}${suffix}`;
}
