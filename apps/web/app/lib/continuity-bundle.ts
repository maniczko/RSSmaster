import type { AppLibraryView, AppSection } from "@/app/lib/app-routes";
import type { ViewPreferenceSnapshot } from "@/app/lib/view-preferences";

export type ContinuityBundleKnownItem = {
  id: string;
  source_url: string;
};

export type ContinuityBundleProgressSnapshot = {
  progress: number;
  scrollTop: number;
  updatedAt: string;
};

export type ContinuityBundleReaderState = {
  section: AppSection;
  libraryView: AppLibraryView;
  showReadItems: boolean;
  itemSearch: string;
  activeItemSourceUrl: string | null;
  readingItemSourceUrl: string | null;
  widthMode: "narrow" | "comfortable" | "wide";
  textMode: "standard" | "large";
  imageMode: "safe" | "immersive";
  focusedMode: boolean;
  viewPreferences: Record<AppLibraryView, ViewPreferenceSnapshot>;
  progressBySourceUrl: Record<string, ContinuityBundleProgressSnapshot>;
};

export type ContinuityBundleLibraryItem = ContinuityBundleKnownItem & {
  title?: string;
  is_read?: boolean;
  is_favorite?: boolean;
  digest_candidate?: boolean;
  is_archived?: boolean;
};

export type ContinuityBundleWorkspaceExport = {
  exported_at: string;
  profile: unknown;
  sources_opml: string;
  annotations: unknown[];
  tags: unknown[];
  collections: unknown[];
  saved_searches: unknown[];
  saved_items: ContinuityBundleLibraryItem[];
  continuity_items: ContinuityBundleLibraryItem[];
  item_tags: unknown[];
  collection_items: unknown[];
};

export type ContinuityBundle = ContinuityBundleWorkspaceExport & {
  export_kind: "rssmaster_continuity_bundle";
  bundle_version: 1;
  reader_state: ContinuityBundleReaderState;
};

export type ContinuityBundleBuildInput = {
  workspaceExport: ContinuityBundleWorkspaceExport;
  knownItems: ContinuityBundleKnownItem[];
  activeItemId: string | null;
  readingItemId: string | null;
  section: AppSection;
  libraryView: AppLibraryView;
  showReadItems: boolean;
  itemSearch: string;
  widthMode: ContinuityBundleReaderState["widthMode"];
  textMode: ContinuityBundleReaderState["textMode"];
  imageMode: ContinuityBundleReaderState["imageMode"];
  focusedMode: boolean;
  viewPreferences: Record<AppLibraryView, ViewPreferenceSnapshot>;
  progressByItemId: Record<string, ContinuityBundleProgressSnapshot>;
};

export type ContinuityBundleRestoreState = {
  section: AppSection;
  libraryView: AppLibraryView;
  showReadItems: boolean;
  itemSearch: string;
  activeItemId: string | null;
  readingItemId: string | null;
  widthMode: ContinuityBundleReaderState["widthMode"];
  textMode: ContinuityBundleReaderState["textMode"];
  imageMode: ContinuityBundleReaderState["imageMode"];
  focusedMode: boolean;
  viewPreferences: Record<AppLibraryView, ViewPreferenceSnapshot>;
  progressByItemId: Record<string, ContinuityBundleProgressSnapshot>;
};

export function buildContinuityBundle(input: ContinuityBundleBuildInput): ContinuityBundle {
  const sourceUrlByItemId = buildSourceUrlByItemId([
    ...input.workspaceExport.continuity_items,
    ...input.workspaceExport.saved_items,
    ...input.knownItems,
  ]);
  const progressBySourceUrl: Record<string, ContinuityBundleProgressSnapshot> = {};

  for (const [itemId, snapshot] of Object.entries(input.progressByItemId)) {
    const sourceUrl = sourceUrlByItemId[itemId];
    if (!sourceUrl) {
      continue;
    }
    progressBySourceUrl[sourceUrl] = snapshot;
  }

  return {
    ...input.workspaceExport,
    export_kind: "rssmaster_continuity_bundle",
    bundle_version: 1,
    reader_state: {
      section: input.section,
      libraryView: input.libraryView,
      showReadItems: input.showReadItems,
      itemSearch: input.itemSearch,
      activeItemSourceUrl: input.activeItemId ? sourceUrlByItemId[input.activeItemId] ?? null : null,
      readingItemSourceUrl: input.readingItemId ? sourceUrlByItemId[input.readingItemId] ?? null : null,
      widthMode: input.widthMode,
      textMode: input.textMode,
      imageMode: input.imageMode,
      focusedMode: input.focusedMode,
      viewPreferences: input.viewPreferences,
      progressBySourceUrl,
    },
  };
}

export function parseContinuityBundle(raw: string): ContinuityBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Plik continuity bundle nie jest poprawnym JSON-em.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Plik continuity bundle ma nieoczekiwany ksztalt.");
  }

  const candidate = parsed as Partial<ContinuityBundle>;
  if (candidate.export_kind !== "rssmaster_continuity_bundle" || candidate.bundle_version !== 1) {
    throw new Error("Plik nie wyglada na continuity bundle RSSmastera.");
  }
  if (!candidate.reader_state || typeof candidate.reader_state !== "object") {
    throw new Error("Continuity bundle nie zawiera reader_state.");
  }
  if (!Array.isArray(candidate.continuity_items) || typeof candidate.sources_opml !== "string") {
    throw new Error("Continuity bundle nie zawiera eksportu workspace.");
  }

  return candidate as ContinuityBundle;
}

export function buildRestoreStateFromContinuityBundle(
  bundle: ContinuityBundle,
  matchedItemIdBySourceUrl: Record<string, string>,
): ContinuityBundleRestoreState {
  const progressByItemId: Record<string, ContinuityBundleProgressSnapshot> = {};
  for (const [sourceUrl, snapshot] of Object.entries(bundle.reader_state.progressBySourceUrl)) {
    const itemId = matchedItemIdBySourceUrl[sourceUrl];
    if (!itemId) {
      continue;
    }
    progressByItemId[itemId] = snapshot;
  }

  return {
    section: bundle.reader_state.section,
    libraryView: bundle.reader_state.libraryView,
    showReadItems: bundle.reader_state.showReadItems,
    itemSearch: bundle.reader_state.itemSearch,
    activeItemId: bundle.reader_state.activeItemSourceUrl ? matchedItemIdBySourceUrl[bundle.reader_state.activeItemSourceUrl] ?? null : null,
    readingItemId: bundle.reader_state.readingItemSourceUrl ? matchedItemIdBySourceUrl[bundle.reader_state.readingItemSourceUrl] ?? null : null,
    widthMode: bundle.reader_state.widthMode,
    textMode: bundle.reader_state.textMode,
    imageMode: bundle.reader_state.imageMode,
    focusedMode: bundle.reader_state.focusedMode,
    viewPreferences: bundle.reader_state.viewPreferences,
    progressByItemId,
  };
}

function buildSourceUrlByItemId(items: ContinuityBundleKnownItem[]): Record<string, string> {
  const sourceUrlByItemId: Record<string, string> = {};
  for (const item of items) {
    if (!item?.id || !item?.source_url) {
      continue;
    }
    sourceUrlByItemId[item.id] = item.source_url;
  }
  return sourceUrlByItemId;
}
