import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReaderDecisionBar } from "@/app/components/reader-decision-bar";

function renderDecisionBar(overrides: Partial<Parameters<typeof ReaderDecisionBar>[0]> = {}) {
  return renderToStaticMarkup(
    <ReaderDecisionBar
      busy={false}
      canArchive
      canUndo
      nextItemTitle="Następny tekst"
      onAction={() => {}}
      onUndo={() => {}}
      undoBusy={false}
      {...overrides}
    />,
  );
}

describe("ReaderDecisionBar", () => {
  it("renders quick reader decisions on shared shadcn buttons", () => {
    const markup = renderDecisionBar();

    expect(markup).toContain('data-testid="reader-decision-bar"');
    expect(markup).toContain("Decyzja i kolejny artykuł bez wracania do listy");
    expect(markup).toContain("Dalej: Następny tekst");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-testid="reader-decision-read-next"');
    expect(markup).toContain('data-testid="reader-decision-archive-next"');
    expect(markup).toContain('data-testid="reader-decision-undo"');
  });

  it("keeps archive and undo controls disabled when unavailable", () => {
    const markup = renderDecisionBar({ canArchive: false, canUndo: false, undoBusy: true });

    expect(markup).toContain("Cofanie...");
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
  });
});
