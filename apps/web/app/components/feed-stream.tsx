type FeedStreamItem = {
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

type FeedStreamProps = {
  items: FeedStreamItem[];
  channelTitles: Record<string, string>;
  activeItemId: string | null;
  busyItemId: string | null;
  formatTimestamp: (value: string | null, fallback: string) => string;
  onSelect: (itemId: string) => void;
  onOpen: (itemId: string) => void;
  onToggleRead: (itemId: string) => void;
  onToggleDigest: (itemId: string) => void;
  onToggleFavorite: (itemId: string) => void;
};

function getCardSurfaceLabel(item: FeedStreamItem) {
  if (item.has_cleaned_content) {
    return "Pelny artykul";
  }
  if (item.has_raw_content) {
    return "Tekst fallback";
  }
  return "Skrot";
}

function buildCardExcerpt(item: FeedStreamItem) {
  const excerpt = item.excerpt?.trim();
  if (!excerpt) {
    return "Brak skrotu. Otworz artykul w czytniku, aby zobaczyc oczyszczona tresc albo fallback tekstowy.";
  }
  const normalizedTitle = item.title.trim().toLowerCase();
  const withoutTitlePrefix = excerpt.toLowerCase().startsWith(normalizedTitle)
    ? excerpt.slice(item.title.trim().length).trimStart().replace(/^[-:,. ]+/, "")
    : excerpt;

  if (withoutTitlePrefix.length <= 320) {
    return withoutTitlePrefix;
  }
  return `${withoutTitlePrefix.slice(0, 317).trimEnd()}...`;
}

export function FeedStream({
  items,
  channelTitles,
  activeItemId,
  busyItemId,
  formatTimestamp,
  onSelect,
  onOpen,
  onToggleRead,
  onToggleDigest,
  onToggleFavorite,
}: FeedStreamProps) {
  return (
    <div className="feed-stream">
      {items.map((item) => {
        const sourceLabel = channelTitles[item.channel_id] ?? "Nieznane zrodlo";
        const isActive = item.id === activeItemId;
        const isBusy = item.id === busyItemId;

        return (
          <article className={`feed-card ${isActive ? "feed-card-active" : ""}`} key={item.id} onClick={() => onSelect(item.id)}>
            <div className="feed-card-meta">
              <span>{sourceLabel}</span>
              <span>{item.author ? `by ${item.author}` : "Autor nieznany"}</span>
              <span>{formatTimestamp(item.published_at, "Nieznany czas publikacji")}</span>
            </div>

            <button className="feed-card-title" onClick={() => onOpen(item.id)} type="button">
              {item.title}
            </button>

            <div className="feed-card-actions">
              <button className="feed-card-icon-button" disabled={isBusy} onClick={(event) => { event.stopPropagation(); onToggleFavorite(item.id); }} type="button">
                Zapisz
              </button>
              <button className="feed-card-icon-button" disabled={isBusy} onClick={(event) => { event.stopPropagation(); onToggleDigest(item.id); }} type="button">
                Digest
              </button>
              <button className="feed-card-icon-button" disabled={isBusy} onClick={(event) => { event.stopPropagation(); onToggleRead(item.id); }} type="button">
                {item.is_read ? "Przywroc" : "Przeczytaj"}
              </button>
              <span className="feed-card-surface">{getCardSurfaceLabel(item)}</span>
            </div>

            <div className="feed-card-media" aria-hidden="true">
              <span>{sourceLabel}</span>
              <strong>{item.title.slice(0, 44)}</strong>
            </div>

            <p className="feed-card-excerpt">{buildCardExcerpt(item)}</p>

            <div className="feed-card-footer">
              <button className="feed-card-primary" onClick={(event) => { event.stopPropagation(); onOpen(item.id); }} type="button">
                Czytaj artykul
              </button>
              <div className="feed-card-flags">
                {!item.is_read ? <span>Unread</span> : null}
                {item.is_favorite ? <span>Saved</span> : null}
                {item.digest_candidate ? <span>Digest</span> : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
