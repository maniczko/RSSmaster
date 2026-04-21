import { describe, expect, it } from "vitest";

import {
  buildFeedCardExcerpt,
  buildFeedCardMetaLine,
  getFeedCardSurfaceLabel,
  type FeedStreamCopyItem,
} from "./feed-stream-copy";

function createItem(overrides: Partial<FeedStreamCopyItem> = {}): FeedStreamCopyItem {
  return {
    title: "Kurs franka nadal spada",
    excerpt: null,
    has_cleaned_content: false,
    has_raw_content: false,
    ...overrides,
  };
}

describe("feed stream copy helpers", () => {
  it("maps content availability into human labels", () => {
    expect(getFeedCardSurfaceLabel(createItem({ has_cleaned_content: true }))).toBe("Pelny tekst");
    expect(getFeedCardSurfaceLabel(createItem({ has_raw_content: true }))).toBe("Tekst zastepczy");
    expect(getFeedCardSurfaceLabel(createItem())).toBe("Skrot");
  });

  it("builds compact metadata lines", () => {
    expect(buildFeedCardMetaLine("Jan Kowalski", "2h")).toBe("Jan Kowalski | 2h");
    expect(buildFeedCardMetaLine(null, "2h")).toBe("2h");
  });

  it("removes title prefix and boilerplate from excerpts", () => {
    const excerpt = buildFeedCardExcerpt(
      createItem({
        excerpt:
          "Kurs franka nadal spada. Źródło zdjęć: Money.pl. Kurs franka schodzi poniżej 4,10 zł. Czytaj także: euro i dolar.",
      }),
    );

    expect(excerpt).toBe("Kurs franka schodzi poniżej 4,10 zł.");
  });

  it("returns a readable fallback when excerpt is empty after cleaning", () => {
    const excerpt = buildFeedCardExcerpt(
      createItem({
        excerpt: "Źródło artykułu: Money.pl. Czytaj także: euro i dolar.",
      }),
    );

    expect(excerpt).toBe("Otworz artykul, aby zobaczyc oczyszczony widok czytania.");
  });

  it("truncates overly long excerpts", () => {
    const longText = "A".repeat(320);
    const excerpt = buildFeedCardExcerpt(createItem({ excerpt: longText }));

    expect(excerpt).toHaveLength(260);
    expect(excerpt.endsWith("...")).toBe(true);
  });
});
