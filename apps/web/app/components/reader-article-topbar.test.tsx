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
      onGenerateAIInsight={() => {}}
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
    expect(markup).toContain("data-slot=\"button\"");
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

  it("renders a visible AI insight action in the article toolbar", () => {
    const markup = renderTopbar({ aiReady: true });

    expect(markup).toContain("data-testid=\"reader-generate-ai-insight\"");
    expect(markup).toContain("Insight AI");
    expect(markup).toContain("Wygeneruj krótkie podsumowanie");
  });

  it("keeps the AI action discoverable while AI is not configured", () => {
    const markup = renderTopbar({ aiReady: false });

    expect(markup).toContain("Skonfiguruj AI i wygeneruj insight artykułu");
    expect(markup).toContain("Najpierw włącz AI");
    expect(markup).not.toContain("disabled=\"\"");
  });

  it("shows an in-progress label while the AI insight is being generated", () => {
    const markup = renderTopbar({ aiBusy: true });

    expect(markup).toContain("AI pracuje...");
    expect(markup).toContain("disabled=\"\"");
  });

  it("renders the full reader feedback set when ranking feedback is available", () => {
    const markup = renderTopbar({ onReaderFeedback: () => {} });

    expect(markup).toContain("Mniej takich");
    expect(markup).toContain("Więcej takich");
    expect(markup).toContain("To ważne");
    expect(markup).toContain("Ukryj temat");
    expect(markup).toContain("Wycisz źródło");
  });
});
