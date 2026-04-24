import { describe, expect, it } from "vitest";

import {
  buildContinuityBundle,
  buildRestoreStateFromContinuityBundle,
  parseContinuityBundle,
  type ContinuityBundleWorkspaceExport,
} from "./continuity-bundle";

function makeWorkspaceExport(): ContinuityBundleWorkspaceExport {
  return {
    exported_at: "2026-04-22T10:00:00Z",
    profile: { id: "profile_local" },
    sources_opml: "<?xml version=\"1.0\" encoding=\"UTF-8\"?><opml version=\"2.0\"></opml>",
    annotations: [],
    tags: [],
    collections: [],
    saved_searches: [],
    saved_items: [],
    continuity_items: [
      {
        id: "itm_alpha",
        source_url: "https://example.com/alpha",
        is_read: true,
        is_favorite: true,
        digest_candidate: false,
        is_archived: false,
      },
    ],
    item_tags: [],
    collection_items: [],
  };
}

describe("continuity bundle helpers", () => {
  it("builds a bundle that maps item-based progress to source URLs", () => {
    const bundle = buildContinuityBundle({
      workspaceExport: makeWorkspaceExport(),
      knownItems: [
        { id: "itm_alpha", source_url: "https://example.com/alpha" },
        { id: "itm_beta", source_url: "https://example.com/beta" },
      ],
      activeItemId: "itm_alpha",
      readingItemId: "itm_beta",
      section: "read",
      libraryView: "saved",
      showReadItems: true,
      itemSearch: "alpha",
      widthMode: "comfortable",
      textMode: "large",
      imageMode: "immersive",
      focusedMode: true,
      viewPreferences: {
        inbox: { sort: "newest", density: "comfortable", showReadItems: false },
        continue: { sort: "newest", density: "compact", showReadItems: true },
        saved: { sort: "oldest", density: "comfortable", showReadItems: true },
        digest: { sort: "newest", density: "comfortable", showReadItems: true },
        archive: { sort: "newest", density: "compact", showReadItems: true },
      },
      progressByItemId: {
        itm_alpha: { progress: 44, scrollTop: 120, updatedAt: "2026-04-22T10:00:00Z" },
      },
    });

    expect(bundle.reader_state.activeItemSourceUrl).toBe("https://example.com/alpha");
    expect(bundle.reader_state.readingItemSourceUrl).toBe("https://example.com/beta");
    expect(bundle.reader_state.progressBySourceUrl).toEqual({
      "https://example.com/alpha": {
        progress: 44,
        scrollTop: 120,
        updatedAt: "2026-04-22T10:00:00Z",
      },
    });
  });

  it("restores local reader state from matched source URLs", () => {
    const bundle = buildContinuityBundle({
      workspaceExport: makeWorkspaceExport(),
      knownItems: [{ id: "itm_alpha", source_url: "https://example.com/alpha" }],
      activeItemId: "itm_alpha",
      readingItemId: "itm_alpha",
      section: "read",
      libraryView: "saved",
      showReadItems: true,
      itemSearch: "alpha",
      widthMode: "wide",
      textMode: "large",
      imageMode: "safe",
      focusedMode: false,
      viewPreferences: {
        inbox: { sort: "newest", density: "comfortable", showReadItems: false },
        continue: { sort: "newest", density: "compact", showReadItems: true },
        saved: { sort: "oldest", density: "comfortable", showReadItems: true },
        digest: { sort: "newest", density: "comfortable", showReadItems: true },
        archive: { sort: "newest", density: "compact", showReadItems: true },
      },
      progressByItemId: {
        itm_alpha: { progress: 88, scrollTop: 320, updatedAt: "2026-04-22T10:05:00Z" },
      },
    });

    const restoreState = buildRestoreStateFromContinuityBundle(bundle, {
      "https://example.com/alpha": "itm_remote_alpha",
    });

    expect(restoreState.activeItemId).toBe("itm_remote_alpha");
    expect(restoreState.readingItemId).toBe("itm_remote_alpha");
    expect(restoreState.progressByItemId).toEqual({
      itm_remote_alpha: {
        progress: 88,
        scrollTop: 320,
        updatedAt: "2026-04-22T10:05:00Z",
      },
    });
  });

  it("rejects non-bundle JSON", () => {
    expect(() => parseContinuityBundle(JSON.stringify({ exported_at: "2026-04-22T10:00:00Z" }))).toThrow(
      "Plik nie wyglada na continuity bundle RSSmastera.",
    );
  });
});
