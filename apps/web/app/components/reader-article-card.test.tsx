import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReaderArticleCard } from "@/app/components/reader-article-card";

function renderArticleCard(overrides: Partial<Parameters<typeof ReaderArticleCard>[0]> = {}) {
  return renderToStaticMarkup(
    <ReaderArticleCard
      authorLabel="Autor nieznany"
      bodyParagraphs={[]}
      contentRef={null}
      detailLine="Czysty widok gotowy do czytania"
      digestCandidate={false}
      hasReadableBody
      highlightedCleanedHtml={null}
      highlightCount={0}
      isFavorite={false}
      isLoading={false}
      isRead={false}
      noteCount={0}
      onOpenSource={() => {}}
      onSurfaceScroll={() => {}}
      publishedLabel="4 maja 2026"
      qualityAllowsInApp
      qualityBadge="Pełny tekst"
      qualityDescription="Artykuł jest gotowy do czytania."
      qualityHeading="Gotowe"
      readerSurfaceClasses="feed-reader-surface"
      resumeProgress={null}
      sanitizedCleanedHtml="<p>Treść artykułu.</p>"
      showCleanedHtml
      sourceLabel="Captured Reads"
      title="Reader interaction newer article"
      {...overrides}
    />,
  );
}

describe("ReaderArticleCard", () => {
  it("removes a duplicate leading h1 from cleaned article HTML", () => {
    const markup = renderArticleCard({
      sanitizedCleanedHtml: "<h1>Reader interaction newer article</h1><p>Treść artykułu.</p>",
    });

    expect(markup.match(/Reader interaction newer article/g)).toHaveLength(1);
    expect(markup).toContain("Treść artykułu.");
  });

  it("removes a duplicate h1 when extractor leaves metadata before the body heading", () => {
    const markup = renderArticleCard({
      sanitizedCleanedHtml: "<div>Kategorie artykułu: Biznes</div><h1>Reader interaction newer article</h1><p>Treść artykułu.</p>",
    });

    expect(markup.match(/Reader interaction newer article/g)).toHaveLength(1);
    expect(markup).toContain("Kategorie artykułu: Biznes");
    expect(markup).toContain("Treść artykułu.");
  });

  it("keeps a non-duplicate leading h1 inside the article body", () => {
    const markup = renderArticleCard({
      sanitizedCleanedHtml: "<h1>Śródtytuł redakcyjny</h1><p>Treść artykułu.</p>",
    });

    expect(markup).toContain("Reader interaction newer article");
    expect(markup).toContain("Śródtytuł redakcyjny");
  });
});
