import { describe, expect, it } from "vitest";

import {
  getReaderQualityState,
  getReextractFeedbackLines,
  shouldOfferReextract,
  type ItemReaderStatus,
  type ReaderQualityItem,
} from "./reader-quality";

function readerStatus(overrides: Partial<ItemReaderStatus> = {}): ItemReaderStatus {
  return {
    mode: "cleaned",
    quality: "ready",
    label: "Pełny tekst",
    summary: "Gotowe do czytania.",
    primary_action: "read_in_app",
    ...overrides,
  };
}

function item(overrides: Partial<ReaderQualityItem> = {}): ReaderQualityItem {
  return {
    id: "itm_1",
    excerpt: null,
    extraction_status: "completed",
    has_raw_content: false,
    reader_status: null,
    ...overrides,
  };
}

describe("reader quality helpers", () => {
  it("prefers API reader_status and keeps diagnostic context user-readable", () => {
    const quality = getReaderQualityState(
      item({
        reader_status: readerStatus({
          diagnostic_reason: "Ekstrakcja zakonczona ostrzezeniem",
        }),
      }),
      null,
      "ready",
    );

    expect(quality.kind).toBe("cleaned");
    expect(quality.badge).toBe("Pełny tekst");
    expect(quality.description).toContain("Powód: Ekstrakcja zakonczona ostrzezeniem");
  });

  it("falls back to excerpt reading before source-only", () => {
    const quality = getReaderQualityState(
      item({
        excerpt: "Krótki opis z feedu.",
        reader_status: readerStatus({
          mode: "excerpt",
          quality: "degraded",
          label: "Tylko skrót",
          summary: "Dostępny jest skrót.",
        }),
      }),
      null,
      "ready",
    );

    expect(quality.kind).toBe("excerpt_only");
    expect(quality.allowsInApp).toBe(true);
    expect(quality.actionLabel).toBe("Czytaj skrót");
  });

  it("offers re-extract only when local reading is missing or degraded", () => {
    expect(
      shouldOfferReextract(
        item({
          extraction_status: "completed",
          reader_status: readerStatus(),
        }),
        null,
        "ready",
      ),
    ).toBe(false);

    expect(
      shouldOfferReextract(
        item({
          extraction_status: "failed",
          reader_status: readerStatus({ mode: "source_only", quality: "blocked" }),
        }),
        null,
        "ready",
      ),
    ).toBe(true);
  });

  it("builds deterministic re-extract feedback copy", () => {
    const lines = getReextractFeedbackLines({
      item_id: "itm_1",
      mode: "write",
      write_applied: true,
      before: {
        extraction_status: "failed",
        reader_status: readerStatus({ mode: "source_only", quality: "blocked", label: "Źródło" }),
        has_cleaned_content: false,
        has_content_text: false,
        has_excerpt: false,
        cleaned_html_word_count_approx: 0,
        content_preview: null,
      },
      after: {
        extraction_status: "completed",
        reader_status: readerStatus({ label: "Pełny tekst", summary: "Treść jest gotowa." }),
        has_cleaned_content: true,
        has_content_text: true,
        has_excerpt: true,
        cleaned_html_word_count_approx: 350,
        content_preview: "Treść jest gotowa.",
      },
      stop_reasons: ["publisher_paywall"],
      item: null,
    });

    expect(lines).toEqual([
      "Zapisano nowy wynik ekstrakcji: Pełny tekst.",
      "Treść jest gotowa.",
      "Diagnostyka: publisher_paywall.",
    ]);
  });
});
