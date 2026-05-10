import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReaderBrowseView } from "@/app/components/reader-browse-view";

describe("ReaderBrowseView", () => {
  it("passes source-aware empty-state diagnostics into the feed stream", () => {
    const markup = renderToStaticMarkup(
      <ReaderBrowseView
        activeFeedScopeLabel="Wszystkie feedy"
        activeItemId={null}
        busyItemId={null}
        channelSiteUrls={{}}
        channelTitles={{}}
        emptyDescription="Money.pl jest dodane do źródeł, ale nie ma jeszcze pobranych artykułów."
        emptyDiagnosticDescription="Ten filtr pasuje do zapisanego źródła, ale RSSmaster nie ma jeszcze historii pobrania."
        emptyDiagnosticTitle="Dlaczego nie widzę feedu?"
        emptyTitle="Źródło „Money.pl” czeka na pierwszy sync"
        emptyActions={[
          {
            label: "Pokaż artykuły do czytania",
            onClick: () => {},
            tone: "accent",
          },
        ]}
        formatTimestamp={() => ""}
        isFocusedMode={false}
        itemSearch="money.pl"
        itemSortMode="newest"
        items={[]}
        message={null}
        messageTone="default"
        readerQueueMode="for_you"
        onItemSearchChange={() => {}}
        onOpenItem={() => {}}
        onReaderQueueModeChange={() => {}}
        onRefresh={() => {}}
        onSelectItem={() => {}}
        onShowReadItemsChange={() => {}}
        onSortModeChange={() => {}}
        onToggleDigest={() => {}}
        onToggleFavorite={() => {}}
        onToggleRead={() => {}}
        showMessage={false}
        showReadItems
        visibleUnreadCount={0}
      />,
    );

    expect(markup).toContain("Źródło „Money.pl” czeka na pierwszy sync");
    expect(markup).toContain("Dlaczego nie widzę feedu?");
    expect(markup).toContain("RSSmaster nie ma jeszcze historii pobrania");
    expect(markup).toContain("Pokaż artykuły do czytania");
    expect(markup).toContain("value=\"money.pl\"");
  });
});
