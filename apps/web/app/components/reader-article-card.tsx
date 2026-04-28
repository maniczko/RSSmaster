import type { Ref, UIEventHandler } from "react";

type ReaderArticleCardProps = {
  authorLabel: string;
  bodyParagraphs: string[];
  contentRef: Ref<HTMLDivElement>;
  detailLine: string;
  digestCandidate: boolean;
  hasReadableBody: boolean;
  highlightedCleanedHtml: string | null;
  highlightCount: number;
  isFavorite: boolean;
  isLoading: boolean;
  isRead: boolean;
  noteCount: number;
  onOpenSource: () => void;
  onSurfaceScroll: UIEventHandler<HTMLDivElement>;
  publishedLabel: string;
  qualityAllowsInApp: boolean;
  qualityBadge: string;
  qualityDescription: string;
  qualityHeading: string;
  readerSurfaceClasses: string;
  resumeProgress: number | null;
  sanitizedCleanedHtml: string | null;
  showCleanedHtml: boolean;
  sourceLabel: string;
  title: string;
};

export function ReaderArticleCard({
  authorLabel,
  bodyParagraphs,
  contentRef,
  detailLine,
  digestCandidate,
  hasReadableBody,
  highlightedCleanedHtml,
  highlightCount,
  isFavorite,
  isLoading,
  isRead,
  noteCount,
  onOpenSource,
  onSurfaceScroll,
  publishedLabel,
  qualityAllowsInApp,
  qualityBadge,
  qualityDescription,
  qualityHeading,
  readerSurfaceClasses,
  resumeProgress,
  sanitizedCleanedHtml,
  showCleanedHtml,
  sourceLabel,
  title,
}: ReaderArticleCardProps) {
  return (
    <article className="feed-reader-card">
      <header className="feed-reader-hero">
        <div className="feed-reader-meta">
          <span>{sourceLabel}</span>
          <span>{publishedLabel}</span>
          <span>{authorLabel}</span>
        </div>

        <h1>{title}</h1>

        <div className="feed-reader-flags">
          <span className="feed-reader-flag">{qualityBadge}</span>
          {!isRead ? <span className="feed-reader-flag">Nieprzeczytane</span> : null}
          {isFavorite ? <span className="feed-reader-flag">Zapisane</span> : null}
          {digestCandidate ? <span className="feed-reader-flag">W digescie</span> : null}
          {resumeProgress && resumeProgress > 2 ? <span className="feed-reader-flag">Wznow {resumeProgress}%</span> : null}
          {highlightCount > 0 ? <span className="feed-reader-flag">{highlightCount} podkreslen</span> : null}
          {noteCount > 0 ? <span className="feed-reader-flag">{noteCount} notatek</span> : null}
        </div>

        <p className="feed-reader-detail">{detailLine}</p>
      </header>

      {!hasReadableBody && !qualityAllowsInApp ? (
        <div className="reader-article-gate feed-reader-gate">
          <strong>{qualityHeading}</strong>
          <p>{qualityDescription}</p>
          <div className="reader-gate-actions">
            <button className="action-button" onClick={onOpenSource} type="button">
              Otworz zrodlo
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="reader-article-loading feed-reader-loading" ref={contentRef}>
          Przygotowywanie lokalnego widoku czytania...
        </div>
      ) : showCleanedHtml && sanitizedCleanedHtml ? (
        <div className={readerSurfaceClasses} onScroll={onSurfaceScroll} ref={contentRef}>
          <div
            className="reader-article-prose"
            dangerouslySetInnerHTML={{ __html: highlightedCleanedHtml ?? sanitizedCleanedHtml }}
          />
        </div>
      ) : bodyParagraphs.length > 0 ? (
        <div className={readerSurfaceClasses} onScroll={onSurfaceScroll} ref={contentRef}>
          <div className="reader-article-prose">
            {bodyParagraphs.map((paragraph, paragraphIndex) => (
              <p key={`${paragraph.slice(0, 64)}-${paragraphIndex}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      ) : (
        <div className="reader-article-loading reader-article-loading-empty feed-reader-loading" ref={contentRef}>
          Brak czytelnej tresci artykulu. Uzyj zrodla jako fallbacku.
        </div>
      )}
    </article>
  );
}
