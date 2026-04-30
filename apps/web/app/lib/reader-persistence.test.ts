import { describe, expect, it } from "vitest";

import { defaultViewPreferences, readerPreferenceKeys } from "./view-preferences";
import { resolveStoredReaderBootState, type ReaderStorageLike } from "./reader-persistence";

function makeStorage(values: Record<string, string | null> = {}): ReaderStorageLike {
  return {
    getItem: (key: string) => values[key] ?? null,
  };
}

function makeLocation(pathname = "/read/inbox", search = "") {
  return { pathname, search };
}

describe("reader persistence boot state", () => {
  it("restores safe defaults when local storage is empty", () => {
    const bootState = resolveStoredReaderBootState({
      location: makeLocation(),
      storage: makeStorage(),
    });

    expect(bootState.preferredSection).toBe("read");
    expect(bootState.readerState).toEqual({
      activeItemId: null,
      itemSearch: "",
      itemSortMode: "newest",
      libraryView: "inbox",
      readingItemId: null,
      readSurfaceMode: "browse",
      showReadItems: false,
    });
    expect(bootState.displayState).toEqual({
      isCompactList: false,
      isFocusedMode: false,
      readerImageMode: "safe",
      readerTextMode: "standard",
      readerWidthMode: "comfortable",
    });
    expect(bootState.progressByItemId).toEqual({});
  });

  it("restores display modes, continuity, view preferences, and valid progress", () => {
    const bootState = resolveStoredReaderBootState({
      location: makeLocation("/read/saved"),
      storage: makeStorage({
        [readerPreferenceKeys.focused]: "true",
        [readerPreferenceKeys.width]: "wide",
        [readerPreferenceKeys.textMode]: "large",
        [readerPreferenceKeys.imageMode]: "immersive",
        [readerPreferenceKeys.continuity]: JSON.stringify({
          section: "read",
          libraryView: "saved",
          activeItemId: "itm_saved",
          readingItemId: "itm_saved",
          itemSearch: "money",
          showReadItems: false,
        }),
        [readerPreferenceKeys.viewPreferences]: JSON.stringify({
          saved: {
            sort: "oldest",
            density: "compact",
            showReadItems: true,
          },
        }),
        [readerPreferenceKeys.progress]: JSON.stringify({
          itm_saved: {
            progress: 42,
            scrollTop: 1200,
            updatedAt: "2026-04-30T06:00:00.000Z",
          },
          broken: {
            progress: "half",
            scrollTop: 0,
            updatedAt: "bad",
          },
        }),
      }),
    });

    expect(bootState.readerState).toEqual({
      activeItemId: "itm_saved",
      itemSearch: "money",
      itemSortMode: "oldest",
      libraryView: "saved",
      readingItemId: "itm_saved",
      readSurfaceMode: "browse",
      showReadItems: false,
    });
    expect(bootState.displayState).toEqual({
      isCompactList: true,
      isFocusedMode: true,
      readerImageMode: "immersive",
      readerTextMode: "large",
      readerWidthMode: "wide",
    });
    expect(bootState.progressByItemId).toEqual({
      itm_saved: {
        progress: 42,
        scrollTop: 1200,
        updatedAt: "2026-04-30T06:00:00.000Z",
      },
    });
  });

  it("lets the URL route override stored continuity and per-view controls", () => {
    const bootState = resolveStoredReaderBootState({
      location: makeLocation("/read/inbox", "?scope=all&sort=oldest&q=xkcd&item=itm_url&surface=article"),
      storage: makeStorage({
        [readerPreferenceKeys.continuity]: JSON.stringify({
          section: "read",
          libraryView: "saved",
          activeItemId: "itm_saved",
          readingItemId: "itm_saved",
          itemSearch: "money",
          showReadItems: false,
        }),
      }),
    });

    expect(bootState.readerState).toEqual({
      activeItemId: "itm_url",
      itemSearch: "xkcd",
      itemSortMode: "oldest",
      libraryView: "inbox",
      readingItemId: "itm_url",
      readSurfaceMode: "article",
      showReadItems: true,
    });
    expect(bootState.viewPreferences.inbox).toEqual({
      ...defaultViewPreferences.inbox,
      sort: "oldest",
      showReadItems: true,
    });
  });

  it("keeps legacy favorites-only and compact migrations isolated to boot restore", () => {
    const bootState = resolveStoredReaderBootState({
      location: makeLocation("/read/saved"),
      storage: makeStorage({
        [readerPreferenceKeys.compact]: "true",
        [readerPreferenceKeys.continuity]: JSON.stringify({
          favoritesOnly: true,
          showReadItems: true,
        }),
      }),
    });

    expect(bootState.readerState.libraryView).toBe("saved");
    expect(bootState.readerState.showReadItems).toBe(true);
    expect(bootState.displayState.isCompactList).toBe(true);
    expect(bootState.viewPreferences.inbox.density).toBe("compact");
  });

  it("ignores malformed storage values without making the app unbootable", () => {
    const bootState = resolveStoredReaderBootState({
      location: makeLocation("/read/archive"),
      storage: makeStorage({
        [readerPreferenceKeys.width]: "giant",
        [readerPreferenceKeys.textMode]: "tiny",
        [readerPreferenceKeys.imageMode]: "unsafe",
        [readerPreferenceKeys.continuity]: "{bad-json",
        [readerPreferenceKeys.viewPreferences]: "{bad-json",
        [readerPreferenceKeys.progress]: JSON.stringify(["not", "a", "map"]),
      }),
    });

    expect(bootState.readerState.libraryView).toBe("archive");
    expect(bootState.readerState.itemSortMode).toBe("oldest");
    expect(bootState.displayState).toMatchObject({
      readerImageMode: "safe",
      readerTextMode: "standard",
      readerWidthMode: "comfortable",
    });
    expect(bootState.progressByItemId).toEqual({});
  });
});
