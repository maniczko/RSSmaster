import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MagazineSection } from "@/app/components/magazine-section";

function renderMagazineSection(overrides: Partial<Parameters<typeof MagazineSection>[0]> = {}) {
  return renderToStaticMarkup(
    <MagazineSection
      activeIssueId={null}
      buildDisabled={false}
      busy={false}
      copy={{
        eyebrow: "Magazyny",
        title: "Magazyny",
        description: "Archiwum numerów Kindle z najciekawszymi artykułami z Twoich źródeł.",
      }}
      countLabel="3 zapisane"
      deliveryBusy={false}
      deliveryPreflight={null}
      deliverySettings={{ smtp_ready: false }}
      feedbackCard={null}
      formatDeliveryStatus={(status) => `status:${status}`}
      formatTimestamp={(value, fallback) => value ?? fallback}
      history={[]}
      magazineSettings={{
        article_limit: 25,
        day_of_week: 1,
        frequency: "disabled",
        issues: ["Magazyn jest wyłączony. Wybierz tryb ręczny, dzienny albo tygodniowy."],
        kindle_delivery_enabled: false,
        output_format: "epub",
        ready: false,
        source_scope: "digest_candidates",
        time_of_day: "07:00",
        timezone: "Europe/Warsaw",
        updated_at: null,
        updated_by: null,
      }}
      magazineSettingsBusy={false}
      magazineSettingsDraft={{
        article_limit: "25",
        day_of_week: "1",
        frequency: "disabled",
        kindle_delivery_enabled: false,
        output_format: "epub",
        source_scope: "digest_candidates",
        time_of_day: "07:00",
        timezone: "Europe/Warsaw",
      }}
      magazineSettingsMessage={null}
      magazineSettingsPreflight={null}
      message={null}
      onBackToReader={() => {}}
      onBuild={() => {}}
      onDeliveryPreflight={() => {}}
      onMagazineSettingsDraftChange={() => {}}
      onMagazineSettingsPreflight={() => {}}
      onMagazineSettingsSave={() => {}}
      onPreview={() => {}}
      onSelectIssue={() => {}}
      onSendDigestDryRun={() => {}}
      onSendDigestLive={() => {}}
      onShowDigestQueue={() => {}}
      preview={null}
      previewDisabled={false}
      status="idle"
      {...overrides}
    />,
  );
}

const issueHistory = [
  {
    artifact: { path: "output/digests/may.epub", sha256: "may", size_bytes: 4096 },
    article_count: 3,
    category_summary: [
      { article_count: 2, category: "Technologia" },
      { article_count: 1, category: "Biznes" },
    ],
    created_at: "2026-05-03T07:55:00Z",
    error_message: null,
    generated_at: "2026-05-03T08:00:00Z",
    id: "dig_may",
    period_end: null,
    period_start: null,
    selection_snapshot: [
      {
        author: "Anna Tester",
        category: "Technologia",
        channel_id: "ch_1",
        channel_title: "RSSmaster Weekly",
        content_html: "<p>Pelna tresc pierwszego artykulu w magazynie przed wysylka.</p>",
        content_hash: "hash_1",
        excerpt: "Krotki opis pierwszego artykulu.",
        item_id: "itm_1",
        position: 1,
        published_at: "2026-05-02T08:00:00Z",
        source_url: "https://example.com/article-1",
        word_count: 260,
        title: "Pierwszy artykuł w wydaniu",
      },
      {
        category: "Technologia",
        channel_id: "ch_1",
        channel_title: "RSSmaster Weekly",
        content_html: "<p>Pelna tresc drugiego artykulu z tego samego zrodla.</p>",
        content_hash: "hash_2",
        excerpt: "Krotki opis drugiego artykulu.",
        item_id: "itm_2",
        position: 2,
        published_at: "2026-05-02T09:00:00Z",
        source_url: "https://example.com/article-2",
        word_count: 140,
        title: "Drugi artykuł z tego samego źródła",
      },
      {
        category: "Biznes",
        channel_id: "ch_2",
        channel_title: "Market Notes",
        content_hash: "hash_3",
        excerpt: "Opis artykulu biznesowego.",
        item_id: "itm_3",
        position: 3,
        published_at: "2026-05-02T10:00:00Z",
        source_url: "https://example.com/article-3",
        title: "Artykuł biznesowy",
      },
    ],
    sent_at: null,
    status: "completed",
    title: "Majowy magazyn",
    updated_at: "2026-05-03T08:00:00Z",
  },
  {
    artifact: { path: "output/digests/april.epub", sha256: "april", size_bytes: 2048 },
    article_count: 1,
    category_summary: [{ article_count: 1, category: "Nauka" }],
    created_at: "2026-04-03T07:55:00Z",
    error_message: null,
    generated_at: "2026-04-03T08:00:00Z",
    id: "dig_april",
    period_end: null,
    period_start: null,
    selection_snapshot: [
      {
        category: "Nauka",
        channel_id: "ch_3",
        channel_title: "Science Daily",
        content_html: "<p>Pelna tresc artykulu naukowego.</p>",
        content_hash: "hash_4",
        item_id: "itm_4",
        position: 1,
        published_at: "2026-04-02T08:00:00Z",
        source_url: "https://example.com/article-4",
        word_count: 220,
        title: "Artykuł naukowy",
      },
    ],
    sent_at: null,
    status: "completed",
    title: "Kwietniowy magazyn",
    updated_at: "2026-04-03T08:00:00Z",
  },
] satisfies Parameters<typeof MagazineSection>[0]["history"];

describe("MagazineSection", () => {
  it("opens as an archive of concrete magazine issues", () => {
    const markup = renderMagazineSection({ history: issueHistory });

    expect(markup).toContain("Biblioteka wydań");
    expect(markup).toContain("Otwarte wydanie");
    expect(markup).toContain("Wydanie 2/2026");
    expect(markup).toContain("Wydanie 1/2026");
    expect(markup).toContain("Majowy magazyn");
    expect(markup).toContain("Najnowsze");
    expect(markup).not.toContain("Kolejka digestu");
    expect(markup).not.toContain("Podejrzyj digest");
    expect(markup).not.toContain("Kandydaci");
  });

  it("groups opened issue articles by source and exposes issue delivery actions", () => {
    const markup = renderMagazineSection({
      activeIssueId: "dig_may",
      deliveryPreflight: {
        artifact: {
          artifact_bytes: 4096,
          artifact_exists: true,
          title: "Majowy magazyn",
        },
        checks: [{ name: "artifact", status: "passed" }],
        recipient: "kindle@example.com",
        status: "ready",
      },
      deliverySettings: { smtp_ready: true },
      history: issueHistory,
    });

    expect(markup).toContain("RSSmaster Weekly");
    expect(markup).toContain("2 artykułów");
    expect(markup).toContain("Market Notes");
    expect(markup).toContain("Pierwszy artykuł w wydaniu");
    expect(markup).toContain("Drugi artykuł z tego samego źródła");
    expect(markup).toContain("Artykuł biznesowy");
    expect(markup).toContain("Technologia · 2 artykułów");
    expect(markup).toContain("Preflight tego wydania");
    expect(markup).toContain("Test tego wydania");
    expect(markup).toContain("Wyślij to wydanie");
    expect(markup).toContain("Czytaj przed");
    expect(markup).toContain("Czytaj wydanie przed");
    expect(markup).toContain("Pelna tresc pierwszego artykulu w magazynie przed wysylka.");
    expect(markup).toContain("Autor: Anna Tester");
    expect(markup).toContain("status:ready");
    expect(markup).toContain("kindle@example.com");
  });

  it("uses the selected issue rather than always showing the latest issue", () => {
    const markup = renderMagazineSection({
      activeIssueId: "dig_april",
      history: issueHistory,
    });

    expect(markup).toContain("Kwietniowy magazyn");
    expect(markup).toContain("Science Daily");
    expect(markup).toContain("Artykuł naukowy");
  });

  it("keeps next issue build controls secondary", () => {
    const markup = renderMagazineSection({
      history: [],
      preview: {
        category_summary: [{ article_count: 2, category: "Technologia" }],
        selection_mode: "digest_candidates",
        stats: {
          article_count: 2,
          digest_candidate_count: 2,
          estimated_read_minutes: 4,
          favorite_count: 0,
          word_count: 800,
        },
        title: "Następny magazyn",
      },
      status: "ready",
    });

    expect(markup).toContain("Następne wydanie");
    expect(markup).toContain("Zbuduj kolejny numer");
    expect(markup).toContain("Sprawdź zawartość");
    expect(markup).toContain("Zbuduj następne wydanie");
    expect(markup).toContain("Następny magazyn");
    expect(markup).toContain("Przykład struktury");
    expect(markup).toContain("Wydanie 1/2026");
    expect(markup).toContain("Zbuduj pierwsze wydanie");
    expect(markup).toContain("Gotowe miejsce na Wydanie 1/2026");
  });

  it("shows magazine schedule settings as a first-class magazine surface", () => {
    const markup = renderMagazineSection({
      history: issueHistory,
      magazineSettings: {
        article_limit: 12,
        day_of_week: 5,
        frequency: "weekly",
        issues: [],
        kindle_delivery_enabled: true,
        output_format: "epub",
        ready: true,
        source_scope: "digest_candidates",
        time_of_day: "08:30",
        timezone: "Europe/Warsaw",
        updated_at: "2026-05-10T08:00:00Z",
        updated_by: "user",
      },
      magazineSettingsDraft: {
        article_limit: "12",
        day_of_week: "5",
        frequency: "weekly",
        kindle_delivery_enabled: true,
        output_format: "epub",
        source_scope: "digest_candidates",
        time_of_day: "08:30",
        timezone: "Europe/Warsaw",
      },
      magazineSettingsPreflight: {
        can_generate: true,
        checks: [{ message: "Harmonogram magazynu jest ustawiony: weekly.", name: "frequency", status: "passed" }],
        status: "ready",
      },
    });

    expect(markup).toContain("Harmonogram wydań");
    expect(markup).toContain("Zapisz harmonogram");
    expect(markup).toContain("Sprawdź harmonogram");
    expect(markup).toContain("Europe/Warsaw");
    expect(markup).toContain("EPUB Kindle-ready");
    expect(markup).toContain("Preflight harmonogramu: status:ready");
    expect(markup).toContain("można generować");
  });
});
