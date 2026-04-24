import type { AppLibraryView, AppSection } from "@/app/lib/app-routes";
import type { ViewPreferenceSnapshot } from "@/app/lib/view-preferences";

export type ContinuityLibraryItemState = {
  id: string;
  is_favorite: boolean;
  is_archived: boolean;
  digest_candidate: boolean;
};

export function inferLibraryViewForItemState(
  item: Pick<ContinuityLibraryItemState, "is_favorite" | "is_archived" | "digest_candidate">,
): AppLibraryView {
  if (item.is_archived) {
    return "archive";
  }
  if (item.is_favorite) {
    return "saved";
  }
  if (item.digest_candidate) {
    return "digest";
  }
  return "inbox";
}

export function resolveContinuityExportReaderState(input: {
  currentSection: AppSection;
  libraryView: AppLibraryView;
  showReadItems: boolean;
  contextItemId: string | null;
  lastReadLibraryView?: AppLibraryView | null;
  lastReadShowReadItems?: boolean | null;
  items: ContinuityLibraryItemState[];
  viewPreferences: Record<AppLibraryView, ViewPreferenceSnapshot>;
}): {
  libraryView: AppLibraryView;
  showReadItems: boolean;
} {
  const {
    currentSection,
    libraryView,
    showReadItems,
    contextItemId,
    lastReadLibraryView = null,
    lastReadShowReadItems = null,
    items,
    viewPreferences,
  } = input;
  if (currentSection === "read" || !contextItemId) {
    return { libraryView, showReadItems };
  }

  if (lastReadLibraryView) {
    return {
      libraryView: lastReadLibraryView,
      showReadItems: lastReadShowReadItems ?? viewPreferences[lastReadLibraryView]?.showReadItems ?? showReadItems,
    };
  }

  const contextItem = items.find((item) => item.id === contextItemId);
  if (!contextItem) {
    return { libraryView, showReadItems };
  }

  const continuityLibraryView = inferLibraryViewForItemState(contextItem);
  return {
    libraryView: continuityLibraryView,
    showReadItems: viewPreferences[continuityLibraryView]?.showReadItems ?? showReadItems,
  };
}
