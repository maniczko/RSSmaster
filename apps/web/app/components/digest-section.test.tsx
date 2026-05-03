import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DigestSection } from "@/app/components/digest-section";

function renderDigestSection(overrides: Partial<Parameters<typeof DigestSection>[0]> = {}) {
  return renderToStaticMarkup(
    <DigestSection
      buildDisabled={false}
      busy={false}
      copy={{
        eyebrow: "Digest",
        title: "Digest testowy",
        description: "Zbuduj wydanie i sprawdź delivery.",
      }}
      countLabel="2 zapisanych"
      deliveryBusy={false}
      deliveryLogs={[]}
      deliveryPreflight={null}
      deliverySettings={{ smtp_ready: false }}
      feedbackCard={null}
      formatDeliveryStatus={(status) => `status:${status}`}
      formatTimestamp={(value, fallback) => value ?? fallback}
      hasLatestDigest={false}
      history={[]}
      message={null}
      onBackToReader={() => {}}
      onBuild={() => {}}
      onDeliveryPreflight={() => {}}
      onPreview={() => {}}
      onSendDigestDryRun={() => {}}
      onSendDigestLive={() => {}}
      onShowDigestQueue={() => {}}
      preview={null}
      previewDisabled={false}
      queueCopy={{
        heading: "Kolejka digestu",
        body: "Użyj zapisanych kandydatów.",
      }}
      showSummaryActions={false}
      status="ready"
      {...overrides}
    />,
  );
}

describe("DigestSection", () => {
  it("renders the digest build, history, delivery, and log surfaces", () => {
    const markup = renderDigestSection();

    expect(markup).toContain("Digest testowy");
    expect(markup).toContain("2 zapisanych");
    expect(markup).toContain("Zbudowane wydania");
    expect(markup).toContain("Preflight i wysylka");
    expect(markup).toContain("Najpierw zbuduj digest");
    expect(markup).toContain("Brak logow delivery");
  });

  it("shows delivery preflight and log details when available", () => {
    const markup = renderDigestSection({
      deliveryLogs: [
        {
          digest_title: "Poranny digest",
          error_message: null,
          id: "log_1",
          recipient: "kindle@example.com",
          sent_at: "2026-05-02T10:00:00Z",
          status: "sent",
          target_kind: "kindle",
        },
      ],
      deliveryPreflight: {
        artifact: {
          artifact_bytes: 12345,
          artifact_exists: true,
          title: "Poranny digest",
        },
        checks: [{ name: "artifact", status: "passed" }],
        recipient: "kindle@example.com",
        status: "ready",
      },
      deliverySettings: { smtp_ready: true },
      hasLatestDigest: true,
      history: [
        {
          artifact: { path: "output/digests/digest.epub" },
          article_count: 2,
          error_message: null,
          generated_at: "2026-05-02T09:00:00Z",
          id: "dig_1",
          status: "completed",
          title: "Poranny digest",
        },
      ],
    });

    expect(markup).toContain("gotowe");
    expect(markup).toContain("status:ready");
    expect(markup).toContain("Rozmiar artefaktu: 12345");
    expect(markup).toContain("artifact:passed");
    expect(markup).toContain("status:sent");
    expect(markup).toContain("kindle@example.com");
  });
});
