import {
  ArchiveIcon,
  BookmarkIcon,
  DigestIcon,
  FeedIcon,
  KindleIcon,
  NoteIcon,
  ReaderIcon,
} from "@/app/components/ui-icons";

type ReaderArticleTopbarProps = {
  busy: boolean;
  digestCandidate: boolean;
  canReextract?: boolean;
  isArchived: boolean;
  isFavorite: boolean;
  isRead: boolean;
  kindleBusy?: boolean;
  kindleReady?: boolean;
  reextractBusy?: boolean;
  showInspector: boolean;
  sourceUrl: string;
  onBackToFeed: () => void;
  onReextract?: () => void;
  onSendToKindle: () => void;
  onToggleArchive: () => void;
  onToggleDigest: () => void;
  onToggleFavorite: () => void;
  onToggleInspector: () => void;
  onToggleRead: () => void;
};

export function ReaderArticleTopbar({
  busy,
  canReextract = false,
  digestCandidate,
  isArchived,
  isFavorite,
  isRead,
  kindleBusy = false,
  kindleReady = false,
  onBackToFeed,
  onReextract,
  onSendToKindle,
  onToggleArchive,
  onToggleDigest,
  onToggleFavorite,
  onToggleInspector,
  onToggleRead,
  reextractBusy = false,
  showInspector,
  sourceUrl,
}: ReaderArticleTopbarProps) {
  return (
    <div className="feed-reader-topbar">
      <div className="feed-reader-topbar-leading">
        <button className="mini-button" onClick={onBackToFeed} type="button">
          <span className="button-with-icon">
            <FeedIcon className="app-icon button-inline-icon" />
            Wroc do feedu
          </span>
        </button>
        <a className="app-inline-link" href={sourceUrl} rel="noreferrer" target="_blank">
          Otworz zrodlo
        </a>
      </div>

      <div className="feed-reader-topbar-actions">
        {canReextract ? (
          <button className="mini-button mini-button-accent" disabled={busy || reextractBusy} onClick={onReextract} type="button">
            <span className="button-with-icon">
              <ReaderIcon className="app-icon button-inline-icon" />
              Ponów ekstrakcję
            </span>
          </button>
        ) : null}
        <button
          aria-label={kindleReady ? "Wyślij artykuł na Kindle" : "Skonfiguruj i wyślij artykuł na Kindle"}
          className={`mini-button mini-button-kindle ${kindleReady ? "mini-button-kindle-ready" : ""}`}
          data-testid="reader-send-kindle"
          disabled={busy || kindleBusy}
          onClick={onSendToKindle}
          title={
            kindleReady
              ? "Zbuduj jednopunktowy EPUB i wyślij go na Kindle"
              : "Najpierw uzupełnij SMTP, Kindle email i approved sender w Amazon"
          }
          type="button"
        >
          <span className="button-with-icon">
            <KindleIcon className="app-icon button-inline-icon" />
            {kindleBusy ? "Wysyłanie..." : "Wyślij na Kindle"}
          </span>
        </button>
        <button
          className={`mini-button ${showInspector ? "mini-button-accent" : ""}`}
          onClick={onToggleInspector}
          type="button"
        >
          <span className="button-with-icon">
            <NoteIcon className="app-icon button-inline-icon" />
            {showInspector ? "Ukryj notatki" : "Notatki i tagi"}
          </span>
        </button>
        <button
          className={`mini-button ${isFavorite ? "mini-button-accent" : ""}`}
          disabled={busy}
          onClick={onToggleFavorite}
          type="button"
        >
          <span className="button-with-icon">
            <BookmarkIcon className="app-icon button-inline-icon" />
            {isFavorite ? "Zapisane" : "Zapisz"}
          </span>
        </button>
        <button
          className={`mini-button ${digestCandidate ? "mini-button-accent" : ""}`}
          disabled={busy}
          onClick={onToggleDigest}
          type="button"
        >
          <span className="button-with-icon">
            <DigestIcon className="app-icon button-inline-icon" />
            {digestCandidate ? "W digescie" : "Dodaj do digestu"}
          </span>
        </button>
        <button className="mini-button" disabled={busy} onClick={onToggleRead} type="button">
          <span className="button-with-icon">
            <ReaderIcon className="app-icon button-inline-icon" />
            {isRead ? "Przywroc jako nieprzeczytane" : "Oznacz jako przeczytane"}
          </span>
        </button>
        <button className="mini-button" disabled={busy} onClick={onToggleArchive} type="button">
          <span className="button-with-icon">
            <ArchiveIcon className="app-icon button-inline-icon" />
            {isArchived ? "Przywroc z archiwum" : "Archiwizuj"}
          </span>
        </button>
      </div>
    </div>
  );
}
