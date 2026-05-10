import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DigestHistoryList } from "@/app/components/digest-history-list";

describe("DigestHistoryList", () => {
  it("renders digest history rows with status and artifact details", () => {
    const markup = renderToStaticMarkup(
      <DigestHistoryList
        formatTimestamp={() => "dzisiaj"}
        items={[
          {
            id: "dig_1",
            status: "completed",
            title: "Poranny digest",
            article_count: 7,
            generated_at: "2026-04-29T04:00:00Z",
            error_message: null,
            artifact: {
              path: "output/digest.epub",
              size_bytes: 1500,
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Poranny digest");
    expect(markup).toContain("Gotowy");
    expect(markup).toContain("7 artykul(y)");
    expect(markup).toContain("dzisiaj");
    expect(markup).toContain("Artefakt");
    expect(markup).toContain("digest.epub");
    expect(markup).toContain("2 KB");
    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain('title="output/digest.epub"');
  });

  it("can render an explicit empty state or nothing", () => {
    expect(
      renderToStaticMarkup(
        <DigestHistoryList emptyMessage="Jeszcze nie zbudowano zadnego wydania." formatTimestamp={() => ""} items={[]} />,
      ),
    ).toContain("Jeszcze nie zbudowano zadnego wydania.");

    expect(renderToStaticMarkup(<DigestHistoryList formatTimestamp={() => ""} items={[]} />)).toBe("");
  });
});
