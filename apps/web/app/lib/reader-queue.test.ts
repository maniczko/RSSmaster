import { describe, expect, it } from "vitest";

import {
  dedupeStoryQueue,
  filterVisibleSelection,
  getLibraryViewLabel,
  getPublishedAfterForRecallWindow,
  matchesLibraryView,
  orderQueueItemsWithRanking,
  resolveActiveQueueItemId,
} from "./reader-queue";

const item = (id: string, overrides: Partial<{
  digest_candidate: boolean;
  library: { state: string };
  published_at: string | null;
  story_cluster_id: string | null;
}> = {}) => ({
  digest_candidate: overrides.digest_candidate ?? false,
  id,
  library: overrides.library ?? { state: "inbox" },
  published_at: overrides.published_at ?? null,
  story_cluster_id: overrides.story_cluster_id ?? null,
});

describe("reader queue helpers", () => {
  it("matches library views without leaking archived items into digest", () => {
    expect(matchesLibraryView(item("inbox"), "inbox")).toBe(true);
    expect(matchesLibraryView(item("saved", { library: { state: "saved" } }), "saved")).toBe(true);
    expect(matchesLibraryView(item("archived", { digest_candidate: true, library: { state: "archived" } }), "digest")).toBe(false);
    expect(matchesLibraryView(item("digest", { digest_candidate: true }), "digest")).toBe(true);
  });

  it("keeps Polish labels centralized for reader library views", () => {
    expect(getLibraryViewLabel("continue")).toBe("Kontynuuj");
    expect(getLibraryViewLabel("archive")).toBe("Archiwum");
  });

  it("filters bulk selection to visible queue items", () => {
    expect(filterVisibleSelection(["b", "missing", "a"], [item("a"), item("b")])).toEqual(["b", "a"]);
  });

  it("resolves active item with optional preservation for deep-linked article state", () => {
    expect(resolveActiveQueueItemId("missing", [item("first")])).toBe("first");
    expect(resolveActiveQueueItemId("missing", [item("first")], true)).toBe("missing");
    expect(resolveActiveQueueItemId("missing", [], false)).toBeNull();
    expect(resolveActiveQueueItemId("missing", [], true)).toBe("missing");
  });

  it("builds recall window cutoffs from an injected clock", () => {
    const now = new Date(2026, 3, 29, 18, 30, 0, 0);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    expect(getPublishedAfterForRecallWindow("all", now)).toBeNull();
    expect(getPublishedAfterForRecallWindow("today", now)).toBe(startOfDay.toISOString());
    expect(getPublishedAfterForRecallWindow("week", now)).toBe(sevenDaysAgo.toISOString());
  });

  it("uses ranking order only for newest inbox without active search", () => {
    const pool = [
      item("old", { published_at: "2026-04-01T00:00:00.000Z" }),
      item("ranked-2", { published_at: "2026-04-03T00:00:00.000Z" }),
      item("ranked-1", { published_at: "2026-04-02T00:00:00.000Z" }),
    ];

    expect(
      orderQueueItemsWithRanking(
        pool,
        [{ item: { id: "ranked-1" } }, { item: { id: "ranked-2" } }],
        { deferredSearch: "", itemSortMode: "newest", libraryView: "inbox" },
      ).map((entry) => entry.id),
    ).toEqual(["ranked-1", "ranked-2"]);

    expect(
      orderQueueItemsWithRanking(
        pool,
        [{ item: { id: "ranked-1" } }],
        { deferredSearch: "money", itemSortMode: "newest", libraryView: "inbox" },
      ),
    ).toBe(pool);
  });

  it("deduplicates story clusters while keeping unclustered items", () => {
    expect(
      dedupeStoryQueue([
        item("a", { story_cluster_id: "cluster" }),
        item("b", { story_cluster_id: "cluster" }),
        item("c"),
      ], true).map((entry) => entry.id),
    ).toEqual(["a", "c"]);
  });
});
