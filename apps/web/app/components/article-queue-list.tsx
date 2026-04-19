type QueueItemSearchMatch = {
  fields: Array<"title" | "author" | "source" | "excerpt" | "body" | "category" | "organization" | "annotation">;
  snippet: string | null;
};

type QueueItem = {
  id: string;
  channel_id: string;
  title: string;
  published_at: string | null;
  author: string | null;
  excerpt: string | null;
  is_read: boolean;
  is_favorite: boolean;
  digest_candidate: boolean;
  has_cleaned_content: boolean;
  has_raw_content: boolean;
  extraction_status: "pending" | "running" | "completed" | "failed" | "skipped";
  search_match?: QueueItemSearchMatch | null;
};

function getRowContentState(item: QueueItem) {
  if (item.has_cleaned_content) {
    return { label: "Cleaned", tone: "success" };
  }
  if (item.extraction_status === "failed") {
    return { label: "Ekstrakcja blad", tone: "danger" };
  }
  if (item.has_raw_content) {
    return { label: "Raw", tone: "warning" };
  }
  return { label: "Skrot", tone: "muted" };
}

type ArticleQueueListProps = {
  items: QueueItem[];
  channelTitles: Record<string, string>;
  compact: boolean;
  activeItemId: string | null;
  busyItemId: string | null;
  selectedItemIds: string[];
  progressByItemId: Record<string, number | undefined>;
  formatTimestamp: (value: string | null, fallback: string) => string;
  getSearchFieldLabel: (field: QueueItemSearchMatch["fields"][number]) => string;
  onSelect: (itemId: string) => void;
  onToggleBulk: (itemId: string) => void;
  onToggleRead: (itemId: string) => void;
  onToggleDigest: (itemId: string) => void;
  onToggleFavorite: (itemId: string) => void;
  registerRow: (itemId: string, node: HTMLLIElement | null) => void;
};

export function ArticleQueueList({
  items,
  channelTitles,
  compact,
  activeItemId,
  busyItemId,
  selectedItemIds,
  progressByItemId,
  formatTimestamp,
  getSearchFieldLabel,
  onSelect,
  onToggleBulk,
  onToggleRead,
  onToggleDigest,
  onToggleFavorite,
  registerRow,
}: ArticleQueueListProps) {
  return (
    <ul className="reader-item-list">
      {items.map((item, index) => {
        const isActive = item.id === activeItemId;
        const isBusy = item.id === busyItemId;
        const isSelectedForBulk = selectedItemIds.includes(item.id);
        const shouldShowActions = isActive || !compact;
        const contentState = getRowContentState(item);
        const progressPercent = progressByItemId[item.id];

        return (
          <li
            aria-selected={isActive}
            className={`reader-item-row ${isActive ? "reader-item-row-active" : ""} ${compact ? "reader-item-row-compact" : ""} ${isSelectedForBulk ? "reader-item-row-selected" : ""}`}
            key={item.id}
            onClick={() => onSelect(item.id)}
            ref={(node) => registerRow(item.id, node)}
          >
            <div
              className="reader-item-select"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <input
                aria-label={`Zaznacz ${item.title}`}
                checked={isSelectedForBulk}
                onChange={() => onToggleBulk(item.id)}
                type="checkbox"
              />
            </div>

            <div className="reader-item-order">
              <span>{String(index + 1).padStart(2, "0")}</span>
              {isActive ? <strong>Na zywo</strong> : null}
            </div>

            <div className="reader-item-main">
              <div className="reader-item-heading">
                <strong>{item.title}</strong>
                <div className="reader-item-flags">
                  {!item.is_read ? <span className="reader-flag reader-flag-new">Nieprzeczytane</span> : null}
                  {item.is_favorite ? <span className="reader-flag reader-flag-favorite">Zapisane</span> : null}
                  {item.digest_candidate ? <span className="reader-flag">Digest</span> : null}
                  <span className={`reader-flag reader-flag-${contentState.tone}`}>{contentState.label}</span>
                  {progressPercent && progressPercent > 2 ? (
                    <span className="reader-flag reader-flag-progress">{progressPercent}%</span>
                  ) : null}
                </div>
              </div>

              <div className="reader-item-meta">
                <span>{channelTitles[item.channel_id] ?? "Nieznane zrodlo"}</span>
                <span>{formatTimestamp(item.published_at, "Nieznany czas publikacji")}</span>
                <span>{item.author ? item.author : "Autor nieznany"}</span>
              </div>

              {item.search_match ? (
                <div className="reader-search-cues">
                  {item.search_match.fields.map((field) => (
                    <span className="reader-flag reader-flag-search" key={`${item.id}-${field}`}>
                      {getSearchFieldLabel(field)}
                    </span>
                  ))}
                </div>
              ) : null}

              {!compact ? (
                <p>
                  {item.search_match?.snippet
                    ? item.search_match.snippet
                    : item.excerpt
                      ? item.excerpt
                      : "Brak skrotu. Otworz adres zrodla, aby zobaczyc oryginalny tekst artykulu."}
                </p>
              ) : null}
            </div>

            {shouldShowActions ? (
              <div className="reader-item-actions">
                <button
                  className="mini-button"
                  disabled={isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleRead(item.id);
                  }}
                  type="button"
                >
                  {item.is_read ? "Nieprzeczytane" : "Przeczytane"}
                </button>
                <button
                  className="mini-button"
                  disabled={isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleDigest(item.id);
                  }}
                  type="button"
                >
                  {item.digest_candidate ? "Usun z digestu" : "Digest"}
                </button>
                <button
                  className="mini-button mini-button-accent"
                  disabled={isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite(item.id);
                  }}
                  type="button"
                >
                  {item.is_favorite ? "Cofnij zapis" : "Zapisz"}
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
