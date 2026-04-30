import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeedStream } from "@/app/components/feed-stream";

describe("FeedStream", () => {
  it("renders a loading state instead of an empty state while the queue is still loading", () => {
    const markup = renderToStaticMarkup(
      <FeedStream
        activeItemId={null}
        busyItemId={null}
        channelSiteUrls={{}}
        channelTitles={{}}
        formatTimestamp={() => ""}
        isLoading
        items={[]}
        onOpen={() => {}}
        onSelect={() => {}}
        onToggleDigest={() => {}}
        onToggleFavorite={() => {}}
        onToggleRead={() => {}}
      />,
    );

    expect(markup).toContain("Ladowanie kolejki czytnika");
    expect(markup).not.toContain("Brak artykułów w tym widoku");
  });

  it("can explain a scoped empty state and offer a recovery action", () => {
    const markup = renderToStaticMarkup(
      <FeedStream
        activeItemId={null}
        busyItemId={null}
        channelSiteUrls={{}}
        channelTitles={{}}
        emptyActionLabel="Przejdz do skrzynki feedow"
        emptyDescription="Szukasz tylko w widoku Zapisane."
        emptyTitle="Brak artykulow w widoku: Zapisane"
        formatTimestamp={() => ""}
        items={[]}
        onEmptyAction={() => {}}
        onOpen={() => {}}
        onSelect={() => {}}
        onToggleDigest={() => {}}
        onToggleFavorite={() => {}}
        onToggleRead={() => {}}
      />,
    );

    expect(markup).toContain("Brak artykulow w widoku: Zapisane");
    expect(markup).toContain("Szukasz tylko w widoku Zapisane.");
    expect(markup).toContain("Przejdz do skrzynki feedow");
    expect(markup).toContain("Dlaczego nic tu nie ma?");
  });

  it("renders multiple recovery actions for a diagnostic empty state", () => {
    const markup = renderToStaticMarkup(
      <FeedStream
        activeItemId={null}
        busyItemId={null}
        channelSiteUrls={{}}
        channelTitles={{}}
        emptyActions={[
          { label: "Wyczyść wyszukiwanie", onClick: () => {}, tone: "accent" },
          { label: "Uruchom sync", onClick: () => {} },
        ]}
        formatTimestamp={() => ""}
        items={[]}
        onOpen={() => {}}
        onSelect={() => {}}
        onToggleDigest={() => {}}
        onToggleFavorite={() => {}}
        onToggleRead={() => {}}
      />,
    );

    expect(markup).toContain("Wyczyść wyszukiwanie");
    expect(markup).toContain("Uruchom sync");
  });

  it("renders route-specific diagnostic copy when provided", () => {
    const markup = renderToStaticMarkup(
      <FeedStream
        activeItemId={null}
        busyItemId={null}
        channelSiteUrls={{}}
        channelTitles={{}}
        emptyDescription="Money.pl jest dodane do źródeł, ale nie ma jeszcze pobranych artykułów."
        emptyDiagnosticDescription="Ten filtr pasuje do zapisanego źródła, ale RSSmaster nie ma jeszcze historii pobrania."
        emptyDiagnosticTitle="Co dokładnie blokuje czytanie?"
        emptyTitle="Źródło „Money.pl” czeka na pierwszy sync"
        formatTimestamp={() => ""}
        items={[]}
        onOpen={() => {}}
        onSelect={() => {}}
        onToggleDigest={() => {}}
        onToggleFavorite={() => {}}
        onToggleRead={() => {}}
      />,
    );

    expect(markup).toContain("Źródło „Money.pl” czeka na pierwszy sync");
    expect(markup).toContain("Co dokładnie blokuje czytanie?");
    expect(markup).toContain("nie ma jeszcze historii pobrania");
  });
});
