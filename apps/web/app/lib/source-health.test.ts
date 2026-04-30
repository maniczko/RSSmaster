import { describe, expect, it } from "vitest";

import { mapSourceHealthCard, type WorkspaceSourceHealthEntry } from "./source-health";

function entry(overrides: Partial<WorkspaceSourceHealthEntry> = {}): WorkspaceSourceHealthEntry {
  return {
    channel_id: "chn_1",
    title: "Money.pl",
    feed_url: "https://example.com/feed.xml",
    category: "Finanse",
    state: "active",
    unread_count: 12,
    health_status: "warning",
    health_summary: "Feed działa, ale ekstrakcja jest częściowa.",
    health_indicators: ["stale"],
    health_stale: true,
    health_noisy: false,
    readable_items_7d: 4,
    local_readable_items_7d: 2,
    excerpt_fallback_items_7d: 2,
    source_only_items_7d: 1,
    extraction_failed_items_7d: 1,
    reading_readiness: "degraded",
    reading_summary: "Część artykułów ma tylko skrót.",
    group_name: "Rynki",
    control: {
      channel_id: "chn_1",
      group_id: null,
      tier: "priority",
      custom_source_cap: null,
      paused_until: null,
      snoozed_until: null,
      notes: null,
      group_name: null,
    },
    ...overrides,
  };
}

describe("source health helpers", () => {
  it("maps backend health/readability fields into the card model", () => {
    const card = mapSourceHealthCard(entry());

    expect(card).toMatchObject({
      id: "chn_1",
      title: "Money.pl",
      category: "Finanse",
      state: "active",
      feedUrl: "https://example.com/feed.xml",
      unreadCount: 12,
      health: {
        status: "warning",
        summary: "Feed działa, ale ekstrakcja jest częściowa.",
        indicators: ["stale", "priority", "Rynki"],
        stale: true,
        readableItems7d: 4,
        localReadableItems7d: 2,
        excerptFallbackItems7d: 2,
        sourceOnlyItems7d: 1,
        extractionFailedItems7d: 1,
        readingReadiness: "degraded",
        readingSummary: "Część artykułów ma tylko skrót.",
      },
    });
  });

  it("normalizes unknown source state and missing reading readiness safely", () => {
    const card = mapSourceHealthCard(
      entry({
        group_name: null,
        reading_readiness: undefined,
        state: "paused",
      }),
    );

    expect(card.state).toBe("active");
    expect(card.health.readingReadiness).toBe("unknown");
    expect(card.health.indicators).toContain("bez grupy");
  });
});
