import { describe, expect, it } from "vitest";

import { inferLibraryViewForItemState, resolveContinuityExportReaderState } from "./reader-continuity";

const viewPreferences = {
  inbox: { sort: "newest", density: "comfortable", showReadItems: false },
  continue: { sort: "newest", density: "compact", showReadItems: true },
  saved: { sort: "oldest", density: "comfortable", showReadItems: true },
  digest: { sort: "newest", density: "comfortable", showReadItems: true },
  archive: { sort: "newest", density: "compact", showReadItems: true },
} as const;

describe("reader continuity helpers", () => {
  it("infers saved view for favorite items", () => {
    expect(
      inferLibraryViewForItemState({
        is_favorite: true,
        is_archived: false,
        digest_candidate: false,
      }),
    ).toBe("saved");
  });

  it("keeps the current reader view when export already runs from read", () => {
    expect(
      resolveContinuityExportReaderState({
        currentSection: "read",
        libraryView: "saved",
        showReadItems: true,
        contextItemId: "itm_saved",
        items: [
          {
            id: "itm_saved",
            is_favorite: true,
            is_archived: false,
            digest_candidate: false,
          },
        ],
        viewPreferences,
      }),
    ).toEqual({
      libraryView: "saved",
      showReadItems: true,
    });
  });

  it("restores saved view when export happens from sources with an active saved article", () => {
    expect(
      resolveContinuityExportReaderState({
        currentSection: "sources",
        libraryView: "inbox",
        showReadItems: false,
        contextItemId: "itm_saved",
        lastReadLibraryView: "saved",
        lastReadShowReadItems: true,
        items: [
          {
            id: "itm_saved",
            is_favorite: true,
            is_archived: false,
            digest_candidate: false,
          },
        ],
        viewPreferences,
      }),
    ).toEqual({
      libraryView: "saved",
      showReadItems: true,
    });
  });

  it("falls back to item-state inference when last read context is unavailable", () => {
    expect(
      resolveContinuityExportReaderState({
        currentSection: "sources",
        libraryView: "inbox",
        showReadItems: false,
        contextItemId: "itm_saved",
        items: [
          {
            id: "itm_saved",
            is_favorite: true,
            is_archived: false,
            digest_candidate: false,
          },
        ],
        viewPreferences,
      }),
    ).toEqual({
      libraryView: "saved",
      showReadItems: true,
    });
  });
});
