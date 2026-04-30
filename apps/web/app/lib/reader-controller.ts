import type { AppLibraryView } from "@/app/lib/app-routes";
import { filterVisibleSelection, resolveActiveQueueItemId } from "@/app/lib/reader-queue";

export type ReaderItemSortMode = "newest" | "oldest";
export type ReaderControllerRecallWindow = "all" | "today" | "week";
export type ReaderReadSurfaceMode = "browse" | "article";

export type ReaderFeedFilter =
  | { kind: "all" }
  | { kind: "category"; value: string }
  | { kind: "channel"; value: string };

export type ReaderStateUpdate<T> = T | ((current: T) => T);

export type ReaderControllerState = {
  activeItemId: string | null;
  feedFilter: ReaderFeedFilter;
  itemSearch: string;
  itemSortMode: ReaderItemSortMode;
  libraryView: AppLibraryView;
  readingItemId: string | null;
  readSurfaceMode: ReaderReadSurfaceMode;
  recallWindow: ReaderControllerRecallWindow;
  selectedItemIds: string[];
  showReadItems: boolean;
  storyQueueGrouped: boolean;
};

export type ReaderControllerBootState = Pick<
  ReaderControllerState,
  | "activeItemId"
  | "itemSearch"
  | "itemSortMode"
  | "libraryView"
  | "readingItemId"
  | "readSurfaceMode"
  | "showReadItems"
>;

export type ReaderControllerAction =
  | { type: "restore_boot_state"; state: ReaderControllerBootState }
  | { type: "set_active_item"; value: ReaderStateUpdate<string | null> }
  | { type: "set_feed_filter"; value: ReaderStateUpdate<ReaderFeedFilter> }
  | { type: "set_library_view"; value: ReaderStateUpdate<AppLibraryView> }
  | { type: "set_reading_item"; value: ReaderStateUpdate<string | null> }
  | { type: "set_recall_window"; value: ReaderStateUpdate<ReaderControllerRecallWindow> }
  | { type: "set_search"; value: ReaderStateUpdate<string> }
  | { type: "set_selection"; value: ReaderStateUpdate<string[]> }
  | { type: "set_show_read"; value: ReaderStateUpdate<boolean> }
  | { type: "set_sort"; value: ReaderStateUpdate<ReaderItemSortMode> }
  | { type: "set_story_grouping"; value: ReaderStateUpdate<boolean> }
  | { type: "set_surface"; value: ReaderStateUpdate<ReaderReadSurfaceMode> }
  | { type: "open_item"; itemId: string }
  | { type: "select_item"; itemId: string | null }
  | { type: "show_browse" }
  | { type: "sync_active_item_with_queue"; itemIds: string[]; preserveMissingActiveItemId?: boolean }
  | { type: "sync_requested_article_surface"; shouldOpenArticle: boolean }
  | { type: "sync_reading_item_with_selection"; selectedItemId: string | null }
  | {
      type: "navigate_library_view";
      activeItemId: string | null;
      itemSearch?: string;
      itemSortMode: ReaderItemSortMode;
      libraryView: AppLibraryView;
      readingItemId: string | null;
      readSurfaceMode: ReaderReadSurfaceMode;
      showReadItems: boolean;
    }
  | { type: "advance_after_decision"; keepReaderOpen: boolean; nextItemId: string }
  | { type: "toggle_selection"; itemId: string }
  | { type: "select_visible"; itemIds: string[] }
  | { type: "clear_selection" }
  | { type: "filter_selection_to_visible"; visibleItemIds: string[] };

export const readerControllerInitialState: ReaderControllerState = {
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
};

function applyStateUpdate<T>(current: T, value: ReaderStateUpdate<T>) {
  return typeof value === "function" ? (value as (current: T) => T)(current) : value;
}

function patchReaderState(state: ReaderControllerState, patch: Partial<ReaderControllerState>) {
  const changed = Object.entries(patch).some(([key, value]) => {
    const currentValue = state[key as keyof ReaderControllerState];
    return currentValue !== value;
  });

  return changed ? { ...state, ...patch } : state;
}

export function readerControllerReducer(
  state: ReaderControllerState,
  action: ReaderControllerAction,
): ReaderControllerState {
  switch (action.type) {
    case "restore_boot_state":
      return patchReaderState(state, action.state);
    case "set_active_item":
      return patchReaderState(state, {
        activeItemId: applyStateUpdate(state.activeItemId, action.value),
      });
    case "set_feed_filter":
      return patchReaderState(state, {
        feedFilter: applyStateUpdate(state.feedFilter, action.value),
      });
    case "set_library_view":
      return patchReaderState(state, {
        libraryView: applyStateUpdate(state.libraryView, action.value),
      });
    case "set_reading_item":
      return patchReaderState(state, {
        readingItemId: applyStateUpdate(state.readingItemId, action.value),
      });
    case "set_recall_window":
      return patchReaderState(state, {
        recallWindow: applyStateUpdate(state.recallWindow, action.value),
      });
    case "set_search":
      return patchReaderState(state, {
        itemSearch: applyStateUpdate(state.itemSearch, action.value),
      });
    case "set_selection":
      return patchReaderState(state, {
        selectedItemIds: applyStateUpdate(state.selectedItemIds, action.value),
      });
    case "set_show_read":
      return patchReaderState(state, {
        showReadItems: applyStateUpdate(state.showReadItems, action.value),
      });
    case "set_sort":
      return patchReaderState(state, {
        itemSortMode: applyStateUpdate(state.itemSortMode, action.value),
      });
    case "set_story_grouping":
      return patchReaderState(state, {
        storyQueueGrouped: applyStateUpdate(state.storyQueueGrouped, action.value),
      });
    case "set_surface":
      return patchReaderState(state, {
        readSurfaceMode: applyStateUpdate(state.readSurfaceMode, action.value),
      });
    case "open_item":
      return patchReaderState(state, {
        activeItemId: action.itemId,
        readingItemId: action.itemId,
        readSurfaceMode: "article",
      });
    case "select_item":
      return patchReaderState(state, {
        activeItemId: action.itemId,
      });
    case "show_browse":
      return patchReaderState(state, {
        readSurfaceMode: "browse",
      });
    case "sync_active_item_with_queue": {
      const nextActiveItemId = resolveActiveQueueItemId(
        state.activeItemId,
        action.itemIds.map((id) => ({ id })),
        action.preserveMissingActiveItemId ?? false,
      );
      return patchReaderState(state, {
        activeItemId: nextActiveItemId,
      });
    }
    case "sync_requested_article_surface":
      if (action.shouldOpenArticle && state.activeItemId) {
        return patchReaderState(state, {
          readSurfaceMode: "article",
          readingItemId: state.activeItemId,
        });
      }
      return patchReaderState(state, {
        readSurfaceMode: "browse",
      });
    case "sync_reading_item_with_selection":
      if (!action.selectedItemId) {
        if (state.readSurfaceMode === "article" && state.activeItemId) {
          return state;
        }
        return patchReaderState(state, {
          readingItemId: null,
        });
      }
      if (state.readingItemId === action.selectedItemId) {
        return state;
      }
      if (state.readSurfaceMode === "article" && state.activeItemId === action.selectedItemId) {
        return patchReaderState(state, {
          readingItemId: action.selectedItemId,
        });
      }
      return patchReaderState(state, {
        readingItemId: null,
      });
    case "navigate_library_view":
      return patchReaderState(state, {
        activeItemId: action.activeItemId,
        ...(action.itemSearch !== undefined ? { itemSearch: action.itemSearch } : {}),
        itemSortMode: action.itemSortMode,
        libraryView: action.libraryView,
        readingItemId: action.readingItemId,
        readSurfaceMode: action.readSurfaceMode,
        showReadItems: action.showReadItems,
      });
    case "advance_after_decision":
      return patchReaderState(state, {
        activeItemId: action.nextItemId,
        readingItemId: action.keepReaderOpen ? action.nextItemId : null,
      });
    case "toggle_selection":
      return patchReaderState(state, {
        selectedItemIds: state.selectedItemIds.includes(action.itemId)
          ? state.selectedItemIds.filter((candidate) => candidate !== action.itemId)
          : [...state.selectedItemIds, action.itemId],
      });
    case "select_visible":
      return patchReaderState(state, {
        selectedItemIds: action.itemIds,
      });
    case "clear_selection":
      return patchReaderState(state, {
        selectedItemIds: [],
      });
    case "filter_selection_to_visible":
      return patchReaderState(state, {
        selectedItemIds: filterVisibleSelection(
          state.selectedItemIds,
          action.visibleItemIds.map((id) => ({ id })),
        ),
      });
    default:
      return state;
  }
}
