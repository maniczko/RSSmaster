import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DigestCandidateSummary } from "@/app/components/digest-candidate-summary";

describe("DigestCandidateSummary", () => {
  it("renders persisted queue copy when preview is not loaded", () => {
    const markup = renderToStaticMarkup(
      <DigestCandidateSummary
        message="Nie ma jeszcze zapisanych kandydatów."
        onBackToReader={() => {}}
        onShowDigestQueue={() => {}}
        preview={null}
        queueCopy={{
          heading: "Nie ma jeszcze kandydatów digestu",
          body: "Oznacz artykuł przyciskiem Digest.",
        }}
        showActions
        status="empty"
      />,
    );

    expect(markup).toContain("Nie ma jeszcze kandydatów digestu");
    expect(markup).toContain("empty");
    expect(markup).toContain("Nie ma jeszcze zapisanych kandydatów.");
    expect(markup).toContain("Pokaż kolejkę digestu");
    expect(markup).toContain("Wróć do czytnika");
  });

  it("renders preview stats and category summary when preview exists", () => {
    const markup = renderToStaticMarkup(
      <DigestCandidateSummary
        message={null}
        onBackToReader={() => {}}
        onShowDigestQueue={() => {}}
        preview={{
          title: "rssmaster digest 2026-04-29",
          selection_mode: "digest_candidates",
          stats: {
            article_count: 3,
            word_count: 1200,
            estimated_read_minutes: 6,
            digest_candidate_count: 5,
            favorite_count: 2,
          },
          category_summary: [
            { category: "Finanse", article_count: 2 },
            { category: "Tech", article_count: 1 },
          ],
        }}
        queueCopy={{
          heading: "Trwała kolejka digestu jest gotowa",
          body: "Preview i build użyją zapisanych kandydatów.",
        }}
        showActions={false}
        status="ready"
      />,
    );

    expect(markup).toContain("rssmaster digest 2026-04-29");
    expect(markup).toContain("3 artykul(y), 1200 slow, 6 min");
    expect(markup).toContain("5 kandydatow digestu, 2 zapisanych");
    expect(markup).toContain("Finanse: 2 | Tech: 1");
    expect(markup).not.toContain("Pokaż kolejkę digestu");
  });
});
