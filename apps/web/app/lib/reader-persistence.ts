import {
  isAppLibraryView,
  isAppSection,
  resolveReadRouteBootState,
  type AppLibraryView,
  type AppSection,
} from "@/app/lib/app-routes";
import type { ReaderControllerBootState } from "@/app/lib/reader-controller";
import {
  isReaderDisplayImageMode,
  isReaderDisplayTextMode,
  isReaderDisplayWidthMode,
  readerDisplayInitialState,
  type ReaderDisplayState,
} from "@/app/lib/reader-display-controller";
import {
  normalizeViewPreferences,
  patchViewPreferenceMap,
  readerPreferenceKeys,
  type ViewPreferenceMap,
} from "@/app/lib/view-preferences";

export type ReaderProgressSnapshot = {
  progress: number;
  scrollTop: number;
  updatedAt: string;
};

export type ReaderContinuitySnapshot = {
  section: AppSection;
  activeItemId: string | null;
  readingItemId: string | null;
  showReadItems: boolean;
  libraryView: AppLibraryView;
  itemSearch: string;
};

export type PendingReaderContinuityRouteRestore = {
  href: string;
  section: AppSection;
  continuity: ReaderContinuitySnapshot;
};

export type ReaderStorageLike = Pick<Storage, "getItem">;
export type ReaderLocationLike = Pick<Location, "pathname" | "search">;

export type StoredReaderBootState = {
  displayState: ReaderDisplayState;
  preferredSection: AppSection;
  progressByItemId: Record<string, ReaderProgressSnapshot>;
  readerState: ReaderControllerBootState;
  viewPreferences: ViewPreferenceMap;
};

function getStoredValue(storage: ReaderStorageLike, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function parseStoredJson(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function parseReaderProgressByItemId(value: string | null): Record<string, ReaderProgressSnapshot> {
  const parsed = parseStoredJson(value);
  if (!isRecord(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, ReaderProgressSnapshot] => {
      const [, snapshot] = entry;
      return (
        isRecord(snapshot) &&
        typeof snapshot.progress === "number" &&
        typeof snapshot.scrollTop === "number" &&
        typeof snapshot.updatedAt === "string"
      );
    }),
  );
}

export function resolveStoredReaderBootState({
  location,
  storage,
}: {
  location: ReaderLocationLike;
  storage: ReaderStorageLike;
}): StoredReaderBootState {
  const storedWidthMode = getStoredValue(storage, readerPreferenceKeys.width);
  const storedTextMode = getStoredValue(storage, readerPreferenceKeys.textMode);
  const storedImageMode = getStoredValue(storage, readerPreferenceKeys.imageMode);
  const storedContinuity = getStoredValue(storage, readerPreferenceKeys.continuity);
  const storedProgress = getStoredValue(storage, readerPreferenceKeys.progress);
  const legacyCompact = getStoredValue(storage, readerPreferenceKeys.compact) === "true";

  let nextViewPreferences = normalizeViewPreferences(
    parseStoredJson(getStoredValue(storage, readerPreferenceKeys.viewPreferences)),
    { legacyCompact },
  );
  let nextSection: AppSection = "read";
  let nextLibraryView: AppLibraryView = "inbox";
  let nextActiveItemId: string | null = null;
  let nextReadingItemId: string | null = null;
  let nextItemSearch = "";
  let nextReadSurfaceMode: ReaderControllerBootState["readSurfaceMode"] = "browse";
  const nextDisplayState: ReaderDisplayState = {
    ...readerDisplayInitialState,
    isFocusedMode: getStoredValue(storage, readerPreferenceKeys.focused) === "true",
    readerImageMode: isReaderDisplayImageMode(storedImageMode)
      ? storedImageMode
      : readerDisplayInitialState.readerImageMode,
    readerTextMode: isReaderDisplayTextMode(storedTextMode)
      ? storedTextMode
      : readerDisplayInitialState.readerTextMode,
    readerWidthMode: isReaderDisplayWidthMode(storedWidthMode)
      ? storedWidthMode
      : readerDisplayInitialState.readerWidthMode,
  };

  const continuity = parseStoredJson(storedContinuity);
  if (isRecord(continuity)) {
    const legacyFavoritesOnly = continuity.favoritesOnly;
    const continuityActiveItemId = coerceString(continuity.activeItemId);
    const continuityReadingItemId = coerceString(continuity.readingItemId);
    const continuityItemSearch = coerceString(continuity.itemSearch);
    const continuitySection = coerceString(continuity.section);
    const continuityLibraryView = coerceString(continuity.libraryView);

    if (continuityActiveItemId) {
      nextActiveItemId = continuityActiveItemId;
    }
    if (continuityReadingItemId) {
      nextReadingItemId = continuityReadingItemId;
    }
    if (typeof continuityItemSearch === "string") {
      nextItemSearch = continuityItemSearch;
    }
    if (isAppSection(continuitySection)) {
      nextSection = continuitySection;
    }
    if (isAppLibraryView(continuityLibraryView)) {
      nextLibraryView = continuityLibraryView;
    } else if (typeof legacyFavoritesOnly === "boolean" && legacyFavoritesOnly) {
      nextLibraryView = "saved";
    }
    if (typeof continuity.showReadItems === "boolean") {
      nextViewPreferences = patchViewPreferenceMap(nextViewPreferences, nextLibraryView, {
        showReadItems: continuity.showReadItems,
      });
    }
  }

  const routeBootState = resolveReadRouteBootState({
    activeItemId: nextActiveItemId,
    itemSearch: nextItemSearch,
    libraryView: nextLibraryView,
    pathname: location.pathname,
    readingItemId: nextReadingItemId,
    readSurface: nextReadSurfaceMode,
    search: location.search,
    section: nextSection,
  });
  nextSection = routeBootState.section;
  nextLibraryView = routeBootState.libraryView;
  nextActiveItemId = routeBootState.activeItemId;
  nextReadingItemId = routeBootState.readingItemId;
  nextReadSurfaceMode = routeBootState.readSurface;
  nextItemSearch = routeBootState.itemSearch;

  if (routeBootState.scope) {
    nextViewPreferences = patchViewPreferenceMap(nextViewPreferences, nextLibraryView, {
      showReadItems: routeBootState.scope === "all",
    });
  }
  if (routeBootState.sort) {
    nextViewPreferences = patchViewPreferenceMap(nextViewPreferences, nextLibraryView, {
      sort: routeBootState.sort,
    });
  }

  return {
    displayState: {
      ...nextDisplayState,
      isCompactList: nextViewPreferences[nextLibraryView].density === "compact",
    },
    preferredSection: nextSection,
    progressByItemId: parseReaderProgressByItemId(storedProgress),
    readerState: {
      activeItemId: nextActiveItemId,
      itemSearch: nextItemSearch,
      itemSortMode: nextViewPreferences[nextLibraryView].sort,
      libraryView: nextLibraryView,
      readingItemId: nextReadingItemId,
      readSurfaceMode: nextReadSurfaceMode,
      showReadItems: nextViewPreferences[nextLibraryView].showReadItems,
    },
    viewPreferences: nextViewPreferences,
  };
}
