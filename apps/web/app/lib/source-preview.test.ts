import { describe, expect, it } from "vitest";

import {
  buildSourcePreviewMetrics,
  buildSourcePreviewRequestKey,
  buildSourcePreviewTopics,
  canAutoPreviewSourceInput,
  getSourcePreviewUiState,
  type SourcePreviewCandidateInput,
} from "@/app/lib/source-preview";

const sampleCandidate: SourcePreviewCandidateInput = {
  feed_url: "https://example.com/feed.xml",
  title: "Example Feed",
  site_url: "https://example.com",
  description: "Opis",
  language: "pl",
  estimated_items_per_week: 4,
  sample_items: [
    {
      title: "Polish market outlook",
      url: "https://example.com/story-1",
      published_at: "2026-04-20T08:00:00Z",
      image_url: null,
    },
  ],
  already_subscribed: false,
  existing_channel_id: null,
};

describe("source preview helpers", () => {
  it("maps website preview states", () => {
    expect(getSourcePreviewUiState({ previewBusy: false, preview: null, hasError: false })).toBe("idle");
    expect(getSourcePreviewUiState({ previewBusy: true, preview: null, hasError: false })).toBe("loading");
    expect(getSourcePreviewUiState({ previewBusy: false, preview: { status: "ready", feed: sampleCandidate }, hasError: false })).toBe(
      "single_match",
    );
    expect(
      getSourcePreviewUiState({ previewBusy: false, preview: { status: "already_subscribed", feed: sampleCandidate }, hasError: false }),
    ).toBe("already_followed");
    expect(
      getSourcePreviewUiState({ previewBusy: false, preview: { status: "multiple_candidates", feed: null }, hasError: false }),
    ).toBe("multiple_candidates");
    expect(getSourcePreviewUiState({ previewBusy: false, preview: null, hasError: true })).toBe("error");
  });

  it("normalizes auto-preview keys and clears them for invalid input", () => {
    expect(canAutoPreviewSourceInput("website", "example.com")).toBe(true);
    expect(canAutoPreviewSourceInput("website", "ab")).toBe(false);
    expect(buildSourcePreviewRequestKey("website", " Example.com ")).toBe("website:example.com");
    expect(buildSourcePreviewRequestKey("website", "")).toBeNull();
  });

  it("builds deterministic related topics from local data", () => {
    expect(
      buildSourcePreviewTopics({
        category: "biznes, startup",
        existingCategory: null,
        inputUrl: "https://example.com",
        feedUrl: sampleCandidate.feed_url,
        siteUrl: sampleCandidate.site_url,
        language: sampleCandidate.language,
        modeLabel: "Strona",
        sampleItems: sampleCandidate.sample_items,
        sourceGroupNames: ["Polska", "Research"],
      }),
    ).toEqual(["#biznes", "#startup", "#example-com", "#pl", "#strona", "#polska", "#research", "#polish"]);
  });

  it("builds honest local metrics without follower semantics", () => {
    expect(
      buildSourcePreviewMetrics({
        candidate: sampleCandidate,
        unreadCount: 12,
        discoveryLabel: "Autodetect w stronie",
        languageLabel: "Polski",
      }),
    ).toEqual(["~4 wpisy/tydz.", "12 nieprzeczytanych", "Polski", "Autodetect w stronie"]);
  });
});
