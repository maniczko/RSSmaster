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
    expect(markup).not.toContain("Brak artykulow w tym widoku");
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
  });
});
