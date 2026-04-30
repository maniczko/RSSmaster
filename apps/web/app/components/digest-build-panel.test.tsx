import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DigestBuildPanel } from "@/app/components/digest-build-panel";

describe("DigestBuildPanel", () => {
  it("renders digest actions, count, and summary copy", () => {
    const markup = renderToStaticMarkup(
      <DigestBuildPanel
        badgeLabel="Preview"
        buildDisabled={false}
        busy={false}
        countLabel="3 zapisanych"
        message={null}
        onBackToReader={() => {}}
        onBuild={() => {}}
        onPreview={() => {}}
        onShowDigestQueue={() => {}}
        preview={null}
        previewDisabled={false}
        queueCopy={{
          heading: "Trwała kolejka digestu jest gotowa",
          body: "Preview i build użyją zapisanych kandydatów.",
        }}
        showBadgeIcon
        showButtonIcons
        showSummaryActions={false}
        status="ready"
      />,
    );

    expect(markup).toContain("Preview");
    expect(markup).toContain("Podglad i budowa");
    expect(markup).toContain("3 zapisanych");
    expect(markup).toContain("Podejrzyj digest");
    expect(markup).toContain("Zbuduj EPUB");
    expect(markup).toContain("Trwała kolejka digestu jest gotowa");
  });

  it("disables actions and exposes recovery links when requested", () => {
    const markup = renderToStaticMarkup(
      <DigestBuildPanel
        badgeLabel="Digest"
        buildDisabled
        busy
        countLabel="0 zapisanych"
        message="Nie ma jeszcze kandydatów."
        onBackToReader={() => {}}
        onBuild={() => {}}
        onPreview={() => {}}
        onShowDigestQueue={() => {}}
        preview={null}
        previewDisabled
        queueCopy={{
          heading: "Nie ma jeszcze kandydatów digestu",
          body: "Oznacz artykuł przyciskiem Digest.",
        }}
        showSummaryActions
        status="empty"
      />,
    );

    expect(markup).toContain("Praca...");
    expect(markup).toContain("Nie ma jeszcze kandydatów.");
    expect(markup).toContain("Pokaż kolejkę digestu");
    expect(markup).toContain("Wróć do czytnika");
  });
});
