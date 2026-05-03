import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SourceAddModeNav } from "@/app/components/source-add-mode-nav";
import type { SourceAddModeDefinition } from "@/app/lib/source-add-modes";

const primaryModes: SourceAddModeDefinition[] = [
  {
    description: "Wykryj RSS ze strony głównej.",
    enabled: true,
    id: "website",
    label: "Strona",
  },
  {
    description: "Wklej bezpośredni adres feedu.",
    enabled: true,
    id: "web_feed",
    label: "RSS / Atom",
  },
];

describe("SourceAddModeNav", () => {
  it("renders primary source modes and secondary capture actions", () => {
    const markup = renderToStaticMarkup(
      <SourceAddModeNav
        activeModeId="website"
        importMode={{
          description: "Przenieś feedy z OPML.",
          enabled: true,
          id: "import_feeds",
          label: "Import OPML",
        }}
        onCapture={() => {}}
        onModeSelect={() => {}}
        primaryModes={primaryModes}
        primaryModesLabelId="primary-modes"
        secondaryActionsLabelId="secondary-actions"
        upcomingModes={[
          {
            description: "Monitorowanie zmian poza klasycznym RSS.",
            enabled: false,
            id: "track_changes",
            label: "Śledzenie zmian",
          },
        ]}
      />,
    );

    expect(markup).toContain("Dodaj źródło");
    expect(markup).toContain("data-testid=\"source-mode-website\"");
    expect(markup).toContain("aria-pressed=\"true\"");
    expect(markup).toContain("RSS / Atom");
    expect(markup).toContain("Import OPML");
    expect(markup).toContain("Przechwyć link");
    expect(markup).toContain("Więcej wkrótce (1)");
  });

  it("can render without import mode or upcoming modes", () => {
    const markup = renderToStaticMarkup(
      <SourceAddModeNav
        activeModeId="web_feed"
        importMode={null}
        onCapture={() => {}}
        onModeSelect={() => {}}
        primaryModes={primaryModes}
        primaryModesLabelId="primary-modes"
        secondaryActionsLabelId="secondary-actions"
        upcomingModes={[]}
      />,
    );

    expect(markup).toContain("data-testid=\"source-mode-web_feed\"");
    expect(markup).not.toContain("Import OPML");
    expect(markup).not.toContain("Więcej wkrótce");
  });
});
