import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReaderArticleTopbar } from "@/app/components/reader-article-topbar";

function renderTopbar(overrides: Partial<Parameters<typeof ReaderArticleTopbar>[0]> = {}) {
  return renderToStaticMarkup(
    <ReaderArticleTopbar
      busy={false}
      digestCandidate={false}
      isArchived={false}
      isFavorite={false}
      isRead={false}
      kindleBusy={false}
      kindleReady
      onBackToFeed={() => {}}
      onSendToKindle={() => {}}
      onToggleArchive={() => {}}
      onToggleDigest={() => {}}
      onToggleFavorite={() => {}}
      onToggleInspector={() => {}}
      onToggleRead={() => {}}
      showInspector={false}
      sourceUrl="https://example.com/article"
      {...overrides}
    />,
  );
}

describe("ReaderArticleTopbar", () => {
  it("renders a visible one-click Kindle action in the article toolbar", () => {
    const markup = renderTopbar();

    expect(markup).toContain("data-testid=\"reader-send-kindle\"");
    expect(markup).toContain("Wyślij na Kindle");
    expect(markup).toContain("Zbuduj jednopunktowy EPUB");
  });

  it("keeps the Kindle action discoverable while delivery is not configured", () => {
    const markup = renderTopbar({ kindleReady: false });

    expect(markup).toContain("Skonfiguruj i wyślij artykuł na Kindle");
    expect(markup).toContain("approved sender");
    expect(markup).not.toContain("disabled=\"\"");
  });

  it("shows an in-progress label while the article is being sent", () => {
    const markup = renderTopbar({ kindleBusy: true });

    expect(markup).toContain("Wysyłanie...");
    expect(markup).toContain("disabled=\"\"");
  });
});
