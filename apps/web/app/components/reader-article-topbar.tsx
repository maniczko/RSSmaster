import {
  ArchiveIcon,
  BookmarkIcon,
  DigestIcon,
  FeedIcon,
  KindleIcon,
  NoteIcon,
  ReaderIcon,
} from "@/app/components/ui-icons";

import { Button } from "@/app/components/ui/button";

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
  onReaderFeedback?: (action: "more_like_this" | "less_like_this" | "hide_topic" | "mute_source" | "important") => void;
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
  onReaderFeedback,
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
        <Button aria-label="Wróć do feedu" className="mini-button" onClick={onBackToFeed} title="Wróć do feedu" type="button" variant="outline">
          <span className="button-with-icon">
            <FeedIcon className="app-icon button-inline-icon" />
            <span className="reader-action-label">Wróć do feedu</span>
          </span>
        </Button>
        <Button asChild className="app-inline-link" variant="outline">
          <a aria-label="Otwórz źródło" href={sourceUrl} rel="noreferrer" target="_blank" title="Otwórz źródło">
            <span className="button-with-icon">
              <ReaderIcon className="app-icon button-inline-icon" />
              <span className="reader-action-label">Otwórz źródło</span>
            </span>
          </a>
        </Button>
      </div>

      <div className="feed-reader-topbar-actions">
        {canReextract ? (
          <Button className="mini-button mini-button-accent" disabled={busy || reextractBusy} onClick={onReextract} type="button" variant="outline">
            <span className="button-with-icon">
              <ReaderIcon className="app-icon button-inline-icon" />
              <span className="reader-action-label">Ponów ekstrakcję</span>
            </span>
          </Button>
        ) : null}
        {onReaderFeedback ? (
          <>
            <Button className="mini-button" disabled={busy} onClick={() => onReaderFeedback("less_like_this")} type="button" variant="outline">
              <span className="reader-action-label">Mniej takich</span>
            </Button>
            <Button className="mini-button" disabled={busy} onClick={() => onReaderFeedback("more_like_this")} type="button" variant="outline">
              <span className="reader-action-label">Więcej takich</span>
            </Button>
            <Button className="mini-button" disabled={busy} onClick={() => onReaderFeedback("important")} type="button" variant="outline">
              <span className="reader-action-label">To ważne</span>
            </Button>
            <Button className="mini-button" disabled={busy} onClick={() => onReaderFeedback("hide_topic")} type="button" variant="outline">
              <span className="reader-action-label">Ukryj temat</span>
            </Button>
            <Button className="mini-button" disabled={busy} onClick={() => onReaderFeedback("mute_source")} type="button" variant="outline">
              <span className="reader-action-label">Wycisz źródło</span>
            </Button>
          </>
        ) : null}
        <Button
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
          variant="outline"
        >
          <span className="button-with-icon">
            <KindleIcon className="app-icon button-inline-icon" />
            <span className="reader-action-label reader-action-label-priority">{kindleBusy ? "Wysyłanie..." : "Wyślij na Kindle"}</span>
          </span>
        </Button>
        <Button
          aria-label={showInspector ? "Ukryj notatki i tagi" : "Pokaż notatki i tagi"}
          className={`mini-button ${showInspector ? "mini-button-accent" : ""}`}
          onClick={onToggleInspector}
          title={showInspector ? "Ukryj notatki i tagi" : "Pokaż notatki i tagi"}
          type="button"
          variant="outline"
        >
          <span className="button-with-icon">
            <NoteIcon className="app-icon button-inline-icon" />
            <span className="reader-action-label">{showInspector ? "Ukryj notatki" : "Notatki i tagi"}</span>
          </span>
        </Button>
        <Button
          aria-label={isFavorite ? "Usuń z zapisanych" : "Zapisz artykuł"}
          className={`mini-button ${isFavorite ? "mini-button-accent" : ""}`}
          disabled={busy}
          onClick={onToggleFavorite}
          title={isFavorite ? "Usuń z zapisanych" : "Zapisz artykuł"}
          type="button"
          variant="outline"
        >
          <span className="button-with-icon">
            <BookmarkIcon className="app-icon button-inline-icon" />
            <span className="reader-action-label">{isFavorite ? "Zapisane" : "Zapisz"}</span>
          </span>
        </Button>
        <Button
          aria-label={digestCandidate ? "Usuń z digestu" : "Dodaj do digestu"}
          className={`mini-button ${digestCandidate ? "mini-button-accent" : ""}`}
          disabled={busy}
          onClick={onToggleDigest}
          title={digestCandidate ? "Usuń z digestu" : "Dodaj do digestu"}
          type="button"
          variant="outline"
        >
          <span className="button-with-icon">
            <DigestIcon className="app-icon button-inline-icon" />
            <span className="reader-action-label">{digestCandidate ? "W digeście" : "Dodaj do digestu"}</span>
          </span>
        </Button>
        <Button
          aria-label={isRead ? "Przywróć jako nieprzeczytane" : "Oznacz jako przeczytane"}
          className="mini-button"
          disabled={busy}
          onClick={onToggleRead}
          title={isRead ? "Przywróć jako nieprzeczytane" : "Oznacz jako przeczytane"}
          type="button"
          variant="outline"
        >
          <span className="button-with-icon">
            <ReaderIcon className="app-icon button-inline-icon" />
            <span className="reader-action-label">{isRead ? "Przywróć jako nieprzeczytane" : "Oznacz jako przeczytane"}</span>
          </span>
        </Button>
        <Button
          aria-label={isArchived ? "Przywróć z archiwum" : "Archiwizuj"}
          className="mini-button"
          disabled={busy}
          onClick={onToggleArchive}
          title={isArchived ? "Przywróć z archiwum" : "Archiwizuj"}
          type="button"
          variant="outline"
        >
          <span className="button-with-icon">
            <ArchiveIcon className="app-icon button-inline-icon" />
            <span className="reader-action-label">{isArchived ? "Przywróć z archiwum" : "Archiwizuj"}</span>
          </span>
        </Button>
      </div>
    </div>
  );
}
