import { FeedStream } from "@/app/components/feed-stream";

type ReaderBrowseSortMode = "newest" | "oldest";

type ReaderBrowseItem = {
  id: string;
  channel_id: string;
  title: string;
  author: string | null;
  excerpt: string | null;
  published_at: string | null;
  is_read: boolean;
  is_favorite: boolean;
  digest_candidate: boolean;
  has_cleaned_content: boolean;
  has_raw_content: boolean;
};

type ReaderBrowseViewProps = {
  activeFeedScopeLabel: string;
  activeItemId: string | null;
  busyItemId: string | null;
  channelSiteUrls: Record<string, string | null>;
  channelTitles: Record<string, string>;
  emptyActionLabel?: string | null;
  emptyDescription?: string;
  emptyTitle?: string;
  formatTimestamp: (value: string | null, fallback: string) => string;
  isFocusedMode: boolean;
  isLoading?: boolean;
  itemSearch: string;
  itemSortMode: ReaderBrowseSortMode;
  items: ReaderBrowseItem[];
  message: string | null;
  messageTone: "default" | "error";
  showMessage: boolean;
  showReadItems: boolean;
  visibleUnreadCount: number;
  onEmptyAction?: (() => void) | null;
  onItemSearchChange: (value: string) => void;
  onOpenItem: (itemId: string) => void;
  onRefresh: () => void;
  onSelectItem: (itemId: string) => void;
  onShowReadItemsChange: (showReadItems: boolean) => void;
  onSortModeChange: (sortMode: ReaderBrowseSortMode) => void;
  onToggleDigest: (itemId: string) => void;
  onToggleFavorite: (itemId: string) => void;
  onToggleRead: (itemId: string) => void;
};

export function ReaderBrowseView({
  activeFeedScopeLabel,
  activeItemId,
  busyItemId,
  channelSiteUrls,
  channelTitles,
  emptyActionLabel = null,
  emptyDescription,
  emptyTitle,
  formatTimestamp,
  isFocusedMode,
  isLoading = false,
  itemSearch,
  itemSortMode,
  items,
  message,
  messageTone,
  onItemSearchChange,
  onOpenItem,
  onRefresh,
  onSelectItem,
  onShowReadItemsChange,
  onSortModeChange,
  onToggleDigest,
  onEmptyAction = null,
  onToggleFavorite,
  onToggleRead,
  showMessage,
  showReadItems,
  visibleUnreadCount,
}: ReaderBrowseViewProps) {
  return (
    <section className={`reader-pane reader-pane-flat reader-pane-browse ${isFocusedMode ? "reader-pane-focused" : ""}`}>
      <header className="reader-pane-header reader-pane-header-flat feed-browse-header feed-browse-header-compact">
        <div className="feed-browse-title-wrap">
          <h2>{activeFeedScopeLabel}</h2>
        </div>
      </header>

      <div className="feed-browse-toolbar feed-browse-toolbar-stream">
        <div className="feed-browse-toolbar-left">
          <div className="segmented-control" aria-label="Filtr przeczytania">
            <button className={!showReadItems ? "segment-active" : ""} onClick={() => onShowReadItemsChange(false)} type="button">
              Nieprzeczytane ({visibleUnreadCount})
            </button>
            <button className={showReadItems ? "segment-active" : ""} onClick={() => onShowReadItemsChange(true)} type="button">
              Wszystkie ({items.length})
            </button>
          </div>
        </div>

        <div className="feed-browse-toolbar-actions">
          <label className="feed-browse-search">
            <span>Szukaj w artykulach</span>
            <input
              onChange={(event) => onItemSearchChange(event.target.value)}
              placeholder="Szukaj w artykulach"
              value={itemSearch}
            />
          </label>
          <div className="segmented-control" aria-label="Kolejnosc sortowania">
            <button className={itemSortMode === "newest" ? "segment-active" : ""} onClick={() => onSortModeChange("newest")} type="button">
              Najnowsze
            </button>
            <button className={itemSortMode === "oldest" ? "segment-active" : ""} onClick={() => onSortModeChange("oldest")} type="button">
              Najstarsze
            </button>
          </div>
          <button className="mini-button" onClick={onRefresh} type="button">
            Odswiez
          </button>
        </div>
      </div>

      {showMessage && message ? (
        <div className={`reader-inline-note ${messageTone === "error" ? "reader-inline-note-error" : ""}`}>
          {message}
        </div>
      ) : null}

      <FeedStream
        activeItemId={activeItemId}
        busyItemId={busyItemId}
        channelSiteUrls={channelSiteUrls}
        channelTitles={channelTitles}
        emptyActionLabel={emptyActionLabel}
        emptyDescription={emptyDescription}
        emptyTitle={emptyTitle}
        formatTimestamp={formatTimestamp}
        isLoading={isLoading}
        items={items}
        onEmptyAction={onEmptyAction}
        onOpen={onOpenItem}
        onSelect={onSelectItem}
        onToggleDigest={onToggleDigest}
        onToggleFavorite={onToggleFavorite}
        onToggleRead={onToggleRead}
      />
    </section>
  );
}
