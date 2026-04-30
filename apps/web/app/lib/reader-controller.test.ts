import { describe, expect, it } from "vitest";

import {
  readerControllerInitialState,
  readerControllerReducer,
  type ReaderControllerAction,
  type ReaderControllerState,
} from "./reader-controller";

function reduce(action: ReaderControllerAction, state: ReaderControllerState = readerControllerInitialState) {
  return readerControllerReducer(state, action);
}

describe("reader controller reducer", () => {
  it("keeps the reader workflow defaults centralized", () => {
    expect(readerControllerInitialState).toMatchObject({
      activeItemId: null,
      feedFilter: { kind: "all" },
      itemSearch: "",
      itemSortMode: "newest",
      libraryView: "inbox",
      readingItemId: null,
      readSurfaceMode: "browse",
      recallWindow: "all",
      selectedItemIds: [],
      showReadItems: false,
      storyQueueGrouped: true,
    });
  });

  it("restores boot state from route and continuity without touching unrelated controls", () => {
    const state = reduce({
      type: "restore_boot_state",
      state: {
        activeItemId: "itm_1",
        itemSearch: "money",
        itemSortMode: "oldest",
        libraryView: "saved",
        readingItemId: "itm_1",
        readSurfaceMode: "article",
        showReadItems: true,
      },
    });

    expect(state).toMatchObject({
      activeItemId: "itm_1",
      itemSearch: "money",
      itemSortMode: "oldest",
      libraryView: "saved",
      readingItemId: "itm_1",
      readSurfaceMode: "article",
      showReadItems: true,
    });
    expect(state.feedFilter).toEqual({ kind: "all" });
  });

  it("opens an item in article mode and returns to browse without clearing the reader id", () => {
    const openState = reduce({ type: "open_item", itemId: "itm_2" });
    expect(openState).toMatchObject({
      activeItemId: "itm_2",
      readingItemId: "itm_2",
      readSurfaceMode: "article",
    });

    expect(reduce({ type: "show_browse" }, openState)).toMatchObject({
      activeItemId: "itm_2",
      readingItemId: "itm_2",
      readSurfaceMode: "browse",
    });
  });

  it("updates search, sort, read filter, library view, recall window, and story grouping", () => {
    const searched = reduce({ type: "set_search", value: "rss" });
    const sorted = reduce({ type: "set_sort", value: "oldest" }, searched);
    const visible = reduce({ type: "set_show_read", value: true }, sorted);
    const saved = reduce({ type: "set_library_view", value: "saved" }, visible);
    const recalled = reduce({ type: "set_recall_window", value: "week" }, saved);
    const grouped = reduce({ type: "set_story_grouping", value: false }, recalled);

    expect(grouped).toMatchObject({
      itemSearch: "rss",
      itemSortMode: "oldest",
      libraryView: "saved",
      recallWindow: "week",
      showReadItems: true,
      storyQueueGrouped: false,
    });
  });

  it("syncs active item with the visible queue and can preserve deep-linked items", () => {
    const state = reduce({ type: "set_active_item", value: "missing" });

    expect(
      reduce({ type: "sync_active_item_with_queue", itemIds: ["first", "second"] }, state).activeItemId,
    ).toBe("first");
    expect(
      reduce(
        {
          type: "sync_active_item_with_queue",
          itemIds: ["first"],
          preserveMissingActiveItemId: true,
        },
        state,
      ).activeItemId,
    ).toBe("missing");
  });

  it("keeps article surface in sync with requested route state", () => {
    const selected = reduce({ type: "set_active_item", value: "itm_3" });
    const article = reduce({ type: "sync_requested_article_surface", shouldOpenArticle: true }, selected);
    expect(article).toMatchObject({
      activeItemId: "itm_3",
      readingItemId: "itm_3",
      readSurfaceMode: "article",
    });

    expect(reduce({ type: "sync_requested_article_surface", shouldOpenArticle: false }, article)).toMatchObject({
      readingItemId: "itm_3",
      readSurfaceMode: "browse",
    });
  });

  it("clears reading item only when browse mode has no selected article to preserve", () => {
    const article = reduce({ type: "open_item", itemId: "itm_4" });
    expect(reduce({ type: "sync_reading_item_with_selection", selectedItemId: null }, article).readingItemId).toBe("itm_4");

    const browse = reduce({ type: "show_browse" }, article);
    expect(reduce({ type: "sync_reading_item_with_selection", selectedItemId: null }, browse).readingItemId).toBeNull();
  });

  it("navigates library view with optional search override", () => {
    const searched = reduce({ type: "set_search", value: "keep me" });
    const preserved = reduce(
      {
        type: "navigate_library_view",
        activeItemId: "itm_5",
        itemSortMode: "oldest",
        libraryView: "archive",
        readingItemId: null,
        readSurfaceMode: "browse",
        showReadItems: true,
      },
      searched,
    );
    expect(preserved.itemSearch).toBe("keep me");

    const cleared = reduce(
      {
        type: "navigate_library_view",
        activeItemId: null,
        itemSearch: "",
        itemSortMode: "newest",
        libraryView: "inbox",
        readingItemId: null,
        readSurfaceMode: "browse",
        showReadItems: false,
      },
      preserved,
    );
    expect(cleared).toMatchObject({
      itemSearch: "",
      itemSortMode: "newest",
      libraryView: "inbox",
      showReadItems: false,
    });
  });

  it("advances after triage while respecting whether the reader should stay open", () => {
    const article = reduce({ type: "open_item", itemId: "current" });

    expect(reduce({ type: "advance_after_decision", keepReaderOpen: true, nextItemId: "next" }, article)).toMatchObject({
      activeItemId: "next",
      readingItemId: "next",
    });
    expect(reduce({ type: "advance_after_decision", keepReaderOpen: false, nextItemId: "next" }, article)).toMatchObject({
      activeItemId: "next",
      readingItemId: null,
    });
  });

  it("owns bulk selection toggles and filters selection to visible item ids", () => {
    const selected = reduce({ type: "select_visible", itemIds: ["a", "b", "missing"] });
    const toggledOff = reduce({ type: "toggle_selection", itemId: "b" }, selected);
    expect(toggledOff.selectedItemIds).toEqual(["a", "missing"]);

    const toggledOn = reduce({ type: "toggle_selection", itemId: "c" }, toggledOff);
    expect(toggledOn.selectedItemIds).toEqual(["a", "missing", "c"]);

    const filtered = reduce({ type: "filter_selection_to_visible", visibleItemIds: ["a", "c"] }, toggledOn);
    expect(filtered.selectedItemIds).toEqual(["a", "c"]);
    expect(reduce({ type: "clear_selection" }, filtered).selectedItemIds).toEqual([]);
  });
});
