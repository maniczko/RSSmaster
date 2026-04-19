export type ItemSortModePreference = "newest" | "oldest";
export type ViewDensityPreference = "comfortable" | "compact";

export type ViewPreferenceSnapshot = {
  sort: ItemSortModePreference;
  density: ViewDensityPreference;
  showReadItems: boolean;
};

export type ReaderViewControlSnapshot = {
  itemSortMode: ItemSortModePreference;
  isCompactList: boolean;
  showReadItems: boolean;
};

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
