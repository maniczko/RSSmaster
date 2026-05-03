import { describe, expect, it } from "vitest";

import {
  applyItemPatch,
  buildUndoPatch,
  countWords,
  describeItemMutation,
  formatTimestamp,
  getHealthStatusLabel,
  getSourceHostLabel,
  getSyncRunStatusLabel,
  isAuthSessionPayload,
  isDigestSelectionEmptyPayload,
  mapSavedSearchToChip,
  splitReaderParagraphs,
} from "./channel-lab-presenters";
import type { Item, WorkspaceSavedSearch } from "./channel-lab-types";

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "itm_1",
    channel_id: "chn_1",
    title: "Test article",
    author: null,
    source_url: "https://example.com/article",
    excerpt: "Lead paragraph",
    published_at: "2026-01-01T12:00:00Z",
    is_read: false,
    is_favorite: false,
    is_archived: false,
    digest_candidate: false,
    extraction_status: "completed",
    has_cleaned_content: true,
    has_raw_content: true,
    library: {
      state: "inbox",
      saved_at: null,
      archived_at: null,
      is_saved: false,
      is_archived: false,
    },
    channel: {
      id: "chn_1",
      title: "Example",
      category: null,
      feed_url: "https://example.com/feed.xml",
      site_url: "https://example.com",
      state: "active",
    },
    digest: {
      is_candidate: false,
      status: "ready",
      reason: "Ready",
    },
    ...overrides,
  };
}

describe("channel-lab presenters", () => {
  it("splits readable paragraphs and counts words defensively", () => {
    expect(splitReaderParagraphs(" One\n\nTwo\n\n\nThree ")).toEqual(["One", "Two", "Three"]);
    expect(splitReaderParagraphs(null)).toEqual([]);
    expect(countWords("  jeden   dwa\ntrzy ")).toBe(3);
    expect(countWords(undefined)).toBe(0);
  });

  it("formats stable product labels", () => {
    expect(getHealthStatusLabel("healthy")).toBe("Zdrowe");
    expect(getHealthStatusLabel("error")).toBe("Blad");
    expect(getSyncRunStatusLabel("partial_success")).toBe("Czesciowy sukces");
    expect(getSyncRunStatusLabel("custom_status")).toBe("custom_status");
  });

  it("derives readable source host labels", () => {
    expect(getSourceHostLabel("https://www.example.com/path")).toBe("example.com");
    expect(getSourceHostLabel(null)).toBeNull();
  });

  it("keeps item state patches consistent with library state", () => {
    const saved = applyItemPatch(item(), { library_action: "save", digest_candidate: true });

    expect(saved.is_favorite).toBe(true);
    expect(saved.is_archived).toBe(false);
    expect(saved.digest_candidate).toBe(true);
    expect(saved.library.state).toBe("saved");
    expect(saved.library.is_saved).toBe(true);

    expect(buildUndoPatch(item(), saved)).toEqual({
      is_favorite: false,
      digest_candidate: false,
    });
    expect(describeItemMutation({ library_action: "save" })).toBe("Zapisano artykul");
  });

  it("maps saved searches to active chips", () => {
    const search: WorkspaceSavedSearch = {
      id: "saved_1",
      name: "Money",
      query: "money.pl",
      default_view: "saved",
    };

    expect(mapSavedSearchToChip(search, "money.pl", "saved")).toMatchObject({
      id: "saved_1",
      isActive: true,
      isPinned: true,
      kind: "custom",
    });
  });

  it("recognizes auth session and digest empty envelopes", () => {
    expect(isAuthSessionPayload({ has_accounts: true, auth_required: true, session: null })).toBe(true);
    expect(
      isDigestSelectionEmptyPayload({
        error: {
          code: "digest_selection_empty",
          message: "Empty",
        },
      }),
    ).toBe(true);
  });

  it("falls back when timestamps are empty or invalid", () => {
    expect(formatTimestamp(null, "fallback")).toBe("fallback");
    expect(formatTimestamp("not-a-date", "fallback")).toBe("not-a-date");
  });
});
