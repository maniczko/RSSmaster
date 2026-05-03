import { describe, expect, it } from "vitest";

import {
  ARTICLE_KINDLE_DIGEST_TITLE_LIMIT,
  buildArticleKindleDigestPayload,
  buildArticleKindleDigestTitle,
} from "@/app/lib/article-kindle-delivery";

describe("article Kindle delivery", () => {
  it("builds an explicit single-article digest payload for Kindle delivery", () => {
    expect(buildArticleKindleDigestPayload({ id: "itm_123", title: "Long read" })).toEqual({
      item_ids: ["itm_123"],
      title: "Kindle - Long read",
      limit: 1,
      include_read: true,
      favorites_only: false,
      digest_candidates_only: false,
    });
  });

  it("keeps generated digest titles inside the API title limit", () => {
    const title = buildArticleKindleDigestTitle("A".repeat(260));

    expect(title).toHaveLength(ARTICLE_KINDLE_DIGEST_TITLE_LIMIT);
    expect(title.startsWith("Kindle - ")).toBe(true);
    expect(title.endsWith("...")).toBe(true);
  });

  it("uses a stable fallback when the article title is empty", () => {
    expect(buildArticleKindleDigestTitle("   ")).toBe("Kindle - Artykuł");
  });
});
