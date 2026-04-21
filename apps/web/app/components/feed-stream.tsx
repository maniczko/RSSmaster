import {
  buildFeedCardExcerpt,
  buildFeedCardMetaLine,
  getFeedCardSurfaceLabel,
} from "@/app/lib/feed-stream-copy";
import { buildFeedIconUrl, getFeedGlyph } from "@/app/lib/feed-icon";

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
  channelSiteUrls: Record<string, string | null>;
  activeItemId: string | null;
  busyItemId: string | null;
  formatTimestamp: (value: string | null, fallback: string) => string;
  onSelect: (itemId: string) => void;
  onOpen: (itemId: string) => void;
  onToggleRead: (itemId: string) => void;
  onToggleDigest: (itemId: string) => void;
  onToggleFavorite: (itemId: string) => void;
};

function FeedSourceMark({
  label,
  siteUrl,
}: {
  label: string;
  siteUrl?: string | null;
}) {
  const iconUrl = buildFeedIconUrl(siteUrl);

  return (
    <span aria-hidden="true" className="feed-card-source-mark">
      {iconUrl ? (
        <img
          alt=""
          className="feed-card-source-mark-image"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          src={iconUrl}
        />
      ) : null}
      <span className="feed-card-source-mark-fallback">{getFeedGlyph(label)}</span>
    </span>
  );
}

export function FeedStream({
  items,
  channelTitles,
  channelSiteUrls,
  activeItemId,
  busyItemId,
  formatTimestamp,
  onSelect,
  onOpen,
  onToggleRead,
  onToggleDigest,
  onToggleFavorite,
}: FeedStreamProps) {
  if (items.length === 0) {
    return (
      <div className="feed-stream-empty">
        <strong>Brak artykulow w tym widoku</strong>
        <p>Zmien filtr, wyszukiwanie albo odswiez kolejke, aby zobaczyc nowe materialy do czytania.</p>
      </div>
    );
  }

  return (
    <div className="feed-stream">
      {items.map((item) => {
        const sourceLabel = channelTitles[item.channel_id] ?? "Nieznane zrodlo";
        const sourceMeta = channelSiteUrls[item.channel_id] ?? null;
        const isActive = item.id === activeItemId;
        const isBusy = item.id === busyItemId;
        const timestampLabel = formatTimestamp(item.published_at, "Nieznany czas publikacji");
        const metaLine = buildFeedCardMetaLine(item.author, timestampLabel);

        return (
          <article className={`feed-card ${isActive ? "feed-card-active" : ""}`} key={item.id} onClick={() => onSelect(item.id)}>
            <div className="feed-card-kicker">
              <div className="feed-card-source">
                <FeedSourceMark label={sourceLabel} siteUrl={sourceMeta} />
                <div className="feed-card-source-copy">
                  <strong>{sourceLabel}</strong>
                  <span>{metaLine}</span>
                </div>
              </div>
              <span className="feed-card-surface">{getFeedCardSurfaceLabel(item)}</span>
            </div>

            <button className="feed-card-title" onClick={() => onOpen(item.id)} type="button">
              {item.title}
            </button>

            <p className="feed-card-excerpt">{buildFeedCardExcerpt(item)}</p>

            <div className="feed-card-footer">
              <div className="feed-card-flags">
                {!item.is_read ? <span>Nowe</span> : null}
                {item.is_favorite ? <span>Zapisane</span> : null}
                {item.digest_candidate ? <span>Digest</span> : null}
              </div>
              <div className="feed-card-actions">
                <button className="feed-card-secondary" disabled={isBusy} onClick={(event) => { event.stopPropagation(); onToggleFavorite(item.id); }} type="button">
                  {item.is_favorite ? "Cofnij zapis" : "Zapisz"}
                </button>
                <button className="feed-card-secondary" disabled={isBusy} onClick={(event) => { event.stopPropagation(); onToggleDigest(item.id); }} type="button">
                  {item.digest_candidate ? "Poza digestem" : "Do digestu"}
                </button>
                <button className="feed-card-secondary" disabled={isBusy} onClick={(event) => { event.stopPropagation(); onToggleRead(item.id); }} type="button">
                  {item.is_read ? "Przywroc" : "Przeczytane"}
                </button>
                <button className="feed-card-primary" onClick={(event) => { event.stopPropagation(); onOpen(item.id); }} type="button">
                  Czytaj
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
