import { describe, expect, it } from "vitest";

import {
  DIGEST_CANDIDATE_PREVIEW_LIMIT,
  buildPersistedDigestSelectionPayload,
  getDigestQueueCopy,
  getDigestStatusLabel,
} from "./digest-selection";

describe("digest selection helpers", () => {
  it("builds a persisted candidate payload independent of visible reader filters", () => {
    const payload = buildPersistedDigestSelectionPayload({
      now: new Date("2026-04-28T10:00:00Z"),
    });

    expect(payload).toEqual({
      title: "rssmaster digest 2026-04-28",
      digest_candidates_only: true,
      include_read: true,
      favorites_only: false,
      limit: DIGEST_CANDIDATE_PREVIEW_LIMIT,
    });
    expect(payload).not.toHaveProperty("item_ids");
  });

  it("clamps the digest candidate limit to the API contract range", () => {
    expect(buildPersistedDigestSelectionPayload({ limit: 0 }).limit).toBe(1);
    expect(buildPersistedDigestSelectionPayload({ limit: 500 }).limit).toBe(200);
  });

  it("explains when reader filters hide persisted candidates", () => {
    const copy = getDigestQueueCopy({
      hasActiveReaderFilter: true,
      persistedCount: 4,
      status: "ready",
      visibleCandidateCount: 1,
    });

    expect(copy.heading).toBe("Filtr czytnika ukrywa część kandydatów");
    expect(copy.body).toContain("1 z 4 kandydatów");
    expect(copy.body).toContain("trwałej kolejki digestu");
  });

  it("explains the real empty state separately from a hidden filtered list", () => {
    const copy = getDigestQueueCopy({
      hasActiveReaderFilter: false,
      persistedCount: null,
      status: "empty",
      visibleCandidateCount: 0,
    });

    expect(copy.heading).toBe("Nie ma jeszcze kandydatów digestu");
    expect(copy.body).toContain("Oznacz artykuł przyciskiem Digest");
  });

  it("maps digest lifecycle statuses into user-facing labels", () => {
    expect(getDigestStatusLabel("completed")).toBe("Gotowy");
    expect(getDigestStatusLabel("blocked_by_extraction")).toBe("Zablokowany przez ekstrakcje");
    expect(getDigestStatusLabel("custom")).toBe("custom");
  });
});
