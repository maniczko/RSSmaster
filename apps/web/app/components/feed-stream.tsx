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
  reader_status?: {
    mode?: "cleaned" | "text_fallback" | "excerpt" | "source_only";
    quality?: "ready" | "degraded" | "blocked" | "loading";
    label?: string | null;
    summary?: string | null;
    primary_action?: string | null;
    diagnostic_reason?: string | null;
  } | null;
};

type FeedStreamEmptyAction = {
  label: string;
  onClick: () => void;
  tone?: "default" | "accent";
  disabled?: boolean;
};

type FeedStreamProps = {
  items: FeedStreamItem[];
  isLoading?: boolean;
  channelTitles: Record<string, string>;
  channelSiteUrls: Record<string, string | null>;
  activeItemId: string | null;
  busyItemId: string | null;
  emptyActionLabel?: string | null;
  emptyActions?: FeedStreamEmptyAction[];
  emptyDescription?: string;
  emptyDiagnosticDescription?: string;
  emptyDiagnosticTitle?: string;
  emptyTitle?: string;
  formatTimestamp: (value: string | null, fallback: string) => string;
  onEmptyAction?: (() => void) | null;
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
  isLoading = false,
  channelTitles,
  channelSiteUrls,
  activeItemId,
  busyItemId,
  emptyActionLabel = null,
  emptyActions,
  emptyDescription = "Zmień filtr, wyszukiwanie albo odśwież kolejkę, aby zobaczyć nowe materiały do czytania.",
  emptyDiagnosticDescription = "Aktualny widok nie ma artykułów dla tych filtrów. Najszybciej pomoże zmiana wyszukiwania, pokazanie całej kolejki albo ręczny sync.",
  emptyDiagnosticTitle = "Dlaczego nic tu nie ma?",
  emptyTitle = "Brak artykułów w tym widoku",
  formatTimestamp,
  onEmptyAction = null,
  onSelect,
  onOpen,
  onToggleRead,
  onToggleDigest,
  onToggleFavorite,
}: FeedStreamProps) {
  if (isLoading && items.length === 0) {
    return (
      <div className="reader-state-card">
        <strong>Ladowanie kolejki czytnika</strong>
        <p>Pobieram artykuly z biezacymi filtrami.</p>
        <div className="reader-skeleton-list">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="reader-skeleton-row" key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    const resolvedEmptyActions =
      emptyActions ??
      (emptyActionLabel && onEmptyAction
        ? [
            {
              label: emptyActionLabel,
              onClick: onEmptyAction,
              tone: "accent" as const,
            },
          ]
        : []);

    return (
      <div className="feed-stream-empty" data-testid="reader-empty-state">
        <strong>{emptyTitle}</strong>
        <p>{emptyDescription}</p>
        <div className="feed-stream-empty-diagnostic">
          <span>{emptyDiagnosticTitle}</span>
          <p>{emptyDiagnosticDescription}</p>
        </div>
        {resolvedEmptyActions.length > 0 ? (
          <div className="feed-stream-empty-actions">
            {resolvedEmptyActions.map((action) => (
              <button
                className={`mini-button ${action.tone === "accent" ? "mini-button-accent" : ""}`}
                disabled={action.disabled}
                key={action.label}
                onClick={action.onClick}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
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
