import { describe, expect, it } from "vitest";

import {
  classifySourcePreviewFailure,
  classifySourcePreviewRequest,
  buildSourcePreviewMetrics,
  getSourcePreviewAnnouncement,
  getSourcePreviewFailureDescription,
  buildSourcePreviewRequestKey,
  buildSourcePreviewTopics,
  canAutoPreviewSourceInput,
  isExpectedSourcePreviewFailureStatus,
  getSourcePreviewFailureLabel,
  getSourcePreviewUiState,
  getSourcePreviewStatusLabel,
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
    expect(classifySourcePreviewRequest("website", " Example.com ")).toEqual({
      mode: "website",
      kind: "homepage",
      normalizedValue: "Example.com",
      autoPreviewable: true,
      requestKey: "website:example.com",
    });
    expect(classifySourcePreviewRequest("web_feed", " https://example.com/feed.xml ")).toEqual({
      mode: "web_feed",
      kind: "feed",
      normalizedValue: "https://example.com/feed.xml",
      autoPreviewable: true,
      requestKey: "web_feed:https://example.com/feed.xml",
    });
    expect(classifySourcePreviewRequest("website", "ab")).toEqual({
      mode: "website",
      kind: "invalid",
      normalizedValue: "ab",
      autoPreviewable: false,
      requestKey: null,
    });
    expect(buildSourcePreviewRequestKey("website", " Example.com ")).toBe("website:example.com");
    expect(buildSourcePreviewRequestKey("website", "")).toBeNull();
  });

  it("classifies expected preview failures separately from true errors", () => {
    expect(isExpectedSourcePreviewFailureStatus(422)).toBe(true);
    expect(isExpectedSourcePreviewFailureStatus(503)).toBe(true);
    expect(isExpectedSourcePreviewFailureStatus(500)).toBe(false);
    expect(
      classifySourcePreviewFailure({
        httpStatus: 422,
        errorCode: "source_discovery_failed",
        previewFailureKind: "discovery",
      }),
    ).toEqual({
      failureKind: "discovery",
      httpStatus: 422,
      errorCode: "source_discovery_failed",
      isExpectedPreviewFailure: true,
    });
    expect(getSourcePreviewFailureLabel(classifySourcePreviewFailure({ previewFailureKind: "transport", httpStatus: 503 }))).toBe(
      "Feed jest chwilowo niedostepny",
    );
    expect(
      getSourcePreviewFailureDescription(classifySourcePreviewFailure({ previewFailureKind: "transport", httpStatus: 503 })),
    ).toBe("Nie udalo sie polaczyc z podanym zrodlem. Sprobuj ponownie za chwile albo sprawdz adres.");
    expect(
      getSourcePreviewFailureDescription(classifySourcePreviewFailure({ previewFailureKind: "discovery", httpStatus: 422 })),
    ).toBe("Nie udalo sie wykryc poprawnego feedu dla podanego adresu.");
    expect(classifySourcePreviewFailure({ httpStatus: 500, errorCode: "unexpected" })).toEqual({
      failureKind: null,
      httpStatus: 500,
      errorCode: "unexpected",
      isExpectedPreviewFailure: false,
    });
    expect(getSourcePreviewFailureLabel(classifySourcePreviewFailure({ httpStatus: 500, errorCode: "unexpected" }))).toBe(
      "Nieoczekiwany blad preview",
    );
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

  it("maps preview statuses to stable copy labels", () => {
    expect(getSourcePreviewStatusLabel("ready")).toBe("Gotowy podgląd");
    expect(getSourcePreviewStatusLabel("already_subscribed")).toBe("Już dodane");
    expect(getSourcePreviewStatusLabel("multiple_candidates")).toBe("Wiele kandydatów");
  });

  it("builds calm live announcements for screen readers", () => {
    expect(getSourcePreviewAnnouncement({ uiState: "idle" })).toBe(
      "Wklej adres strony albo feedu, aby zobaczyć preview.",
    );
    expect(getSourcePreviewAnnouncement({ uiState: "loading" })).toBe(
      "Trwa sprawdzanie adresu i wykrywanie feedu.",
    );
    expect(getSourcePreviewAnnouncement({ uiState: "single_match" })).toBe(
      "Wynik gotowy. Wykryto jeden feed do obserwowania.",
    );
    expect(getSourcePreviewAnnouncement({ uiState: "multiple_candidates", resultCount: 2 })).toBe(
      "Wynik gotowy. Znaleziono 2 kandydatów.",
    );
    expect(
      getSourcePreviewAnnouncement({
        uiState: "error",
        feedbackTitle: "Feed jest chwilowo niedostepny",
        feedbackLines: ["Sprawdz adres albo sprobuj ponownie za chwile."],
      }),
    ).toBe("Feed jest chwilowo niedostepny. Sprawdz adres albo sprobuj ponownie za chwile.");
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
