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

const htmlEntityReplacements: Record<string, string> = {
  "&amp;": "&",
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": "\"",
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
};

function normalizeArticleHeading(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|apos|quot|nbsp|lt|gt);|&#39;/g, (match) => htmlEntityReplacements[match] ?? match)
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pl");
}

function removeDuplicateLeadingTitle(html: string, title: string) {
  const headingMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i);
  if (!headingMatch || headingMatch.index === undefined) {
    return html;
  }

  const firstParagraphIndex = html.search(/<p\b/i);
  if (firstParagraphIndex >= 0 && headingMatch.index > firstParagraphIndex) {
    return html;
  }

  const headingText = normalizeArticleHeading(headingMatch[1] ?? "");
  const titleText = normalizeArticleHeading(title);

  return headingText && headingText === titleText
    ? `${html.slice(0, headingMatch.index)}${html.slice(headingMatch.index + headingMatch[0].length)}`
    : html;
}

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
  const readerArticleSurfaceClasses = `${readerSurfaceClasses} reader-article-width`;
  const cleanedHtml = highlightedCleanedHtml ?? sanitizedCleanedHtml;
  const displayCleanedHtml = cleanedHtml ? removeDuplicateLeadingTitle(cleanedHtml, title) : null;

  return (
    <article className="feed-reader-card premium-reader-surface" data-testid="premium-reader-surface">
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
          {digestCandidate ? <span className="feed-reader-flag">W digeście</span> : null}
          {resumeProgress && resumeProgress > 2 ? <span className="feed-reader-flag">Wznow {resumeProgress}%</span> : null}
          {highlightCount > 0 ? <span className="feed-reader-flag">{highlightCount} podkreśleń</span> : null}
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
              Otwórz źródło
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="reader-article-loading feed-reader-loading" ref={contentRef}>
          Przygotowywanie lokalnego widoku czytania...
        </div>
      ) : showCleanedHtml && displayCleanedHtml ? (
        <div className={readerArticleSurfaceClasses} data-testid="reader-article-width" onScroll={onSurfaceScroll} ref={contentRef}>
          <div
            className="reader-article-prose"
            dangerouslySetInnerHTML={{ __html: displayCleanedHtml }}
          />
        </div>
      ) : bodyParagraphs.length > 0 ? (
        <div className={readerArticleSurfaceClasses} data-testid="reader-article-width" onScroll={onSurfaceScroll} ref={contentRef}>
          <div className="reader-article-prose">
            {bodyParagraphs.map((paragraph, paragraphIndex) => (
              <p key={`${paragraph.slice(0, 64)}-${paragraphIndex}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      ) : (
        <div className="reader-article-loading reader-article-loading-empty feed-reader-loading" ref={contentRef}>
          Brak czytelnej treści artykułu. Użyj źródła jako fallbacku.
        </div>
      )}
    </article>
  );
}
