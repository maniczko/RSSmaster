import type { AppLibraryView } from "@/app/lib/app-routes";

export type ReaderRecallWindow = "all" | "today" | "week";
export type ReaderQueueSortMode = "newest" | "oldest";

export type ReaderQueueLibraryItem = {
  digest_candidate: boolean;
  library: {
    state: string;
  };
};

export type ReaderQueueItemBase = ReaderQueueLibraryItem & {
  id: string;
  published_at?: string | null;
  story_cluster_id?: string | null;
};

export type RankedReaderQueueEntry = {
  item: {
    id: string;
  };
};

export function matchesLibraryView(item: ReaderQueueLibraryItem, view: AppLibraryView) {
  if (view === "archive") {
    return item.library.state === "archived";
  }
  if (view === "digest") {
    return item.digest_candidate && item.library.state !== "archived";
  }
  if (view === "saved") {
    return item.library.state === "saved";
  }
  if (view === "continue") {
    return item.library.state === "inbox";
  }
  return item.library.state === "inbox";
}

export function getLibraryViewLabel(view: AppLibraryView) {
  if (view === "continue") {
    return "Kontynuuj";
  }
  if (view === "saved") {
    return "Zapisane";
  }
  if (view === "digest") {
    return "Kolejka digestu";
  }
  if (view === "archive") {
    return "Archiwum";
  }
  return "Skrzynka";
}

export function filterVisibleSelection<TItem extends { id: string }>(selectedItemIds: string[], queueItems: TItem[]) {
  const visibleIds = new Set(queueItems.map((item) => item.id));
  return selectedItemIds.filter((itemId) => visibleIds.has(itemId));
}

export function resolveActiveQueueItemId<TItem extends { id: string }>(
  activeItemId: string | null,
  queueItems: TItem[],
  preserveMissingActiveItemId = false,
) {
  if (queueItems.length === 0) {
    return preserveMissingActiveItemId ? activeItemId : null;
  }

  if (activeItemId && queueItems.some((item) => item.id === activeItemId)) {
    return activeItemId;
  }

  if (preserveMissingActiveItemId && activeItemId) {
    return activeItemId;
  }

  return queueItems[0].id;
}

export function getPublishedAfterForRecallWindow(recallWindow: ReaderRecallWindow, now = new Date()): string | null {
  if (recallWindow === "today") {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay.toISOString();
  }
  if (recallWindow === "week") {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return sevenDaysAgo.toISOString();
  }
  return null;
}

export function compareIsoTimestampsDesc(left: string | null | undefined, right: string | null | undefined) {
  const leftValue = left ? Date.parse(left) : 0;
  const rightValue = right ? Date.parse(right) : 0;
  return rightValue - leftValue;
}

export function orderQueueItemsWithRanking<TItem extends ReaderQueueItemBase>(
  pool: TItem[],
  rankedItems: RankedReaderQueueEntry[],
  options: {
    deferredSearch: string;
    libraryView: AppLibraryView;
    itemSortMode: ReaderQueueSortMode;
  },
) {
  if (options.libraryView !== "inbox" || options.itemSortMode !== "newest" || options.deferredSearch.trim()) {
    return pool;
  }

  const rankedIds = new Set(rankedItems.map((entry) => entry.item.id));
  const rankingIndex = new Map(rankedItems.map((entry, index) => [entry.item.id, index]));
  const rankedPool = pool.filter((item) => rankedIds.has(item.id));
  const orderingPool = rankedPool.length > 0 ? rankedPool : pool;

  return [...orderingPool].sort((left, right) => {
    const leftRank = rankingIndex.get(left.id);
    const rightRank = rankingIndex.get(right.id);
    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) {
        return 1;
      }
      if (rightRank === undefined) {
        return -1;
      }
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
    }
    return compareIsoTimestampsDesc(left.published_at, right.published_at);
  });
}

export function dedupeStoryQueue<TItem extends { story_cluster_id?: string | null }>(pool: TItem[], enabled: boolean) {
  if (!enabled) {
    return pool;
  }

  const seenClusters = new Set<string>();
  return pool.filter((item) => {
    if (!item.story_cluster_id) {
      return true;
    }
    if (seenClusters.has(item.story_cluster_id)) {
      return false;
    }
    seenClusters.add(item.story_cluster_id);
    return true;
  });
}
