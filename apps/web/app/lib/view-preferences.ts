import type { AppLibraryView } from "@/app/lib/app-routes";

export type ItemSortModePreference = "newest" | "oldest";
export type ViewDensityPreference = "comfortable" | "compact";

export type ViewPreferenceSnapshot = {
  sort: ItemSortModePreference;
  density: ViewDensityPreference;
  showReadItems: boolean;
};

export type ViewPreferenceMap = Record<AppLibraryView, ViewPreferenceSnapshot>;

export type ReaderViewControlSnapshot = {
  itemSortMode: ItemSortModePreference;
  isCompactList: boolean;
  showReadItems: boolean;
};

export const readerPreferenceKeys = {
  compact: "rssmaster.reader.compact-list",
  focused: "rssmaster.reader.focused-mode",
  width: "rssmaster.reader.width-mode",
  textMode: "rssmaster.reader.text-mode",
  imageMode: "rssmaster.reader.image-mode",
  continuity: "rssmaster.reader.continuity",
  progress: "rssmaster.reader.progress",
  viewPreferences: "rssmaster.reader.view-preferences",
} as const;

export const defaultViewPreferences: ViewPreferenceMap = {
  inbox: {
    sort: "newest",
    density: "comfortable",
    showReadItems: false,
  },
  continue: {
    sort: "newest",
    density: "comfortable",
    showReadItems: true,
  },
  saved: {
    sort: "newest",
    density: "compact",
    showReadItems: true,
  },
  digest: {
    sort: "newest",
    density: "compact",
    showReadItems: true,
  },
  archive: {
    sort: "oldest",
    density: "compact",
    showReadItems: true,
  },
};

export function normalizeViewPreference(
  value: unknown,
  fallback: ViewPreferenceSnapshot,
): ViewPreferenceSnapshot {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Partial<ViewPreferenceSnapshot>;
  return {
    sort: candidate.sort === "oldest" ? "oldest" : candidate.sort === "newest" ? "newest" : fallback.sort,
    density: candidate.density === "comfortable" || candidate.density === "compact" ? candidate.density : fallback.density,
    showReadItems: typeof candidate.showReadItems === "boolean" ? candidate.showReadItems : fallback.showReadItems,
  };
}

export function normalizeViewPreferences(
  value: unknown,
  { legacyCompact }: { legacyCompact: boolean },
): ViewPreferenceMap {
  const source =
    value && typeof value === "object"
      ? (value as Partial<Record<AppLibraryView, Partial<ViewPreferenceSnapshot>>>)
      : {};
  const defaults = {
    inbox: {
      ...defaultViewPreferences.inbox,
      density: legacyCompact ? "compact" : defaultViewPreferences.inbox.density,
    },
    continue: {
      ...defaultViewPreferences.continue,
      density: legacyCompact ? "compact" : defaultViewPreferences.continue.density,
    },
    saved: {
      ...defaultViewPreferences.saved,
      density: legacyCompact ? "compact" : defaultViewPreferences.saved.density,
    },
    digest: {
      ...defaultViewPreferences.digest,
      density: legacyCompact ? "compact" : defaultViewPreferences.digest.density,
    },
    archive: {
      ...defaultViewPreferences.archive,
      density: legacyCompact ? "compact" : defaultViewPreferences.archive.density,
    },
  } satisfies ViewPreferenceMap;

  return {
    inbox: normalizeViewPreference(source.inbox, defaults.inbox),
    continue: normalizeViewPreference(source.continue, defaults.continue),
    saved: normalizeViewPreference(source.saved, defaults.saved),
    digest: normalizeViewPreference(source.digest, defaults.digest),
    archive: normalizeViewPreference(source.archive, defaults.archive),
  };
}

export function patchViewPreferenceMap(
  current: ViewPreferenceMap,
  view: AppLibraryView,
  patch: Partial<ViewPreferenceSnapshot>,
): ViewPreferenceMap {
  return {
    ...current,
    [view]: {
      ...current[view],
      ...patch,
    },
  };
}

export function getReaderViewControlsFromPreference(
  preference: ViewPreferenceSnapshot,
): ReaderViewControlSnapshot {
  return {
    showReadItems: preference.showReadItems,
    itemSortMode: preference.sort,
    isCompactList: preference.density === "compact",
  };
}

export function shouldApplyReaderViewPreference(
  preference: ViewPreferenceSnapshot,
  current: ReaderViewControlSnapshot,
): boolean {
  const next = getReaderViewControlsFromPreference(preference);
  return (
    next.showReadItems !== current.showReadItems ||
    next.itemSortMode !== current.itemSortMode ||
    next.isCompactList !== current.isCompactList
  );
}
