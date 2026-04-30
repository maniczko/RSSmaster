export type ItemReaderStatus = {
  mode: "cleaned" | "text_fallback" | "excerpt" | "source_only";
  quality: "ready" | "degraded" | "blocked" | "loading";
  label: string;
  summary: string;
  primary_action: "read_in_app" | "open_source" | "wait_for_sync" | "inspect_source";
  diagnostic_reason?: string | null;
};

export type ReaderStatus = "loading" | "ready" | "error" | "unsupported";

export type ReaderQualityState = {
  kind: "loading" | "cleaned" | "text_fallback" | "raw_only" | "excerpt_only" | "source_only";
  badge: string;
  heading: string;
  description: string;
  allowsInApp: boolean;
  actionLabel: string;
};

export type ReaderQualityItem = {
  id: string;
  excerpt: string | null;
  extraction_status: string | null;
  has_raw_content: boolean;
  reader_status?: ItemReaderStatus | null;
};

export type ReaderQualityDetail = {
  id: string;
  cleaned_html?: string | null;
  content_text?: string | null;
  reader_status?: ItemReaderStatus | null;
};

export type ItemReextractSnapshot = {
  extraction_status: string | null;
  reader_status: ItemReaderStatus;
  has_cleaned_content: boolean;
  has_content_text: boolean;
  has_excerpt: boolean;
  cleaned_html_word_count_approx: number;
  content_preview: string | null;
  diagnostic_reason?: string | null;
};

export type ItemReextractPayload<TItem> = {
  item_id: string;
  mode: "dry_run" | "write";
  write_applied: boolean;
  before: ItemReextractSnapshot;
  after: ItemReextractSnapshot;
  stop_reasons: string[];
  item: TItem;
};

export function getReaderQualityState(
  item: ReaderQualityItem,
  detail: ReaderQualityDetail | null,
  status: ReaderStatus,
): ReaderQualityState {
  const hasLoadedDetail = Boolean(detail && detail.id === item.id);

  if (status === "loading" && !hasLoadedDetail) {
    return {
      kind: "loading",
      badge: "Ladowanie",
      heading: "Przygotowywanie lokalnego widoku artykulu",
      description: "Pobieram najlepsza dostepna tresc artykulu i sygnaly fallback dla tej pozycji.",
      allowsInApp: false,
      actionLabel: "Przygotuj artykul",
    };
  }

  if (status === "unsupported") {
    return {
      kind: "source_only",
      badge: "Fallback zrodla",
      heading: "Endpoint szczegolow czytnika jest niedostepny",
      description:
        "Metadane kolejki sa widoczne, ale do czasu dostarczenia szczegolow artykulu najpewniejszym fallbackiem jest oryginalne zrodlo.",
      allowsInApp: false,
      actionLabel: "Otworz zrodlo",
    };
  }

  const readerStatus = (hasLoadedDetail ? detail?.reader_status : item.reader_status) ?? null;
  const diagnosticSuffix = readerStatus?.diagnostic_reason ? ` Powód: ${readerStatus.diagnostic_reason}` : "";

  if (readerStatus?.mode === "cleaned") {
    return {
      kind: "cleaned",
      badge: readerStatus.label,
      heading: "Lokalny widok jest gotowy",
      description: `${readerStatus.summary}${diagnosticSuffix}`,
      allowsInApp: true,
      actionLabel: "Czytaj pełny tekst",
    };
  }

  if (readerStatus?.mode === "text_fallback") {
    return {
      kind: "text_fallback",
      badge: readerStatus.label,
      heading: "Dostępny jest tekst z feedu",
      description: `${readerStatus.summary}${diagnosticSuffix}`,
      allowsInApp: true,
      actionLabel: "Czytaj tekst z feedu",
    };
  }

  if (readerStatus?.mode === "excerpt") {
    return {
      kind: "excerpt_only",
      badge: readerStatus.label,
      heading: "Dostępny jest tylko skrót",
      description: `${readerStatus.summary}${diagnosticSuffix}`,
      allowsInApp: true,
      actionLabel: "Czytaj skrót",
    };
  }

  if (readerStatus?.mode === "source_only" && readerStatus.quality !== "loading") {
    return {
      kind: "source_only",
      badge: readerStatus.label,
      heading: "Najlepszym fallbackiem jest źródło",
      description: `${readerStatus.summary}${diagnosticSuffix}`,
      allowsInApp: false,
      actionLabel: "Otwórz źródło",
    };
  }

  if (hasLoadedDetail && detail?.cleaned_html) {
    return {
      kind: "cleaned",
      badge: "Oczyszczony artykul",
      heading: "Premium copy do czytania jest gotowe",
      description:
        "Ten artykul ma dostepny oczyszczony HTML, wiec mozesz czytac lokalna wersje bez reklam i elementow zrodla.",
      allowsInApp: true,
      actionLabel: "Czytaj oczyszczony artykul",
    };
  }

  if (hasLoadedDetail && detail?.content_text) {
    return {
      kind: "text_fallback",
      badge: "Fallback tekstowy",
      heading: "Dostepny jest czytelny fallback tekstowy",
      description:
        "Ekstrakcja zachowala tekst artykulu, ale nie pelna oczyszczona strukture. Aplikacja nadal utrzymuje lokalny flow czytania.",
      allowsInApp: true,
      actionLabel: "Czytaj fallback tekstowy",
    };
  }

  if (item.has_raw_content && item.excerpt) {
    return {
      kind: "raw_only",
      badge: "Slaba ekstrakcja",
      heading: "Ekstrakcja jest slaba, ale UI nadal jest bezpieczne",
      description:
        "rssmaster przechwycil material zrodla, ale oczyszczony rendering nie jest tu jeszcze wystarczajaco wiarygodny. Aplikacja schodzi do skrotu i daje latwe wyjscie do zrodla.",
      allowsInApp: true,
      actionLabel: "Czytaj skrot",
    };
  }

  if (item.excerpt) {
    return {
      kind: "excerpt_only",
      badge: "Tylko skrot",
      heading: "Lokalnie dostepny jest tylko skrot z feedu",
      description: "Mozesz zostac w aplikacji do szybkiego przegladu, ale pelny kontekst moze byc lepszy w oryginalnym zrodle.",
      allowsInApp: true,
      actionLabel: "Czytaj skrot",
    };
  }

  return {
    kind: "source_only",
    badge: "Fallback zrodla",
    heading: "Lokalna kopia do czytania nie jest jeszcze gotowa",
    description: "Link do zrodla jest tu najlepszym fallbackiem, bo w aplikacji nie ma jeszcze oczyszczonej tresci ani skrotu.",
    allowsInApp: false,
    actionLabel: "Otworz zrodlo",
  };
}

export function shouldOfferReextract(
  item: ReaderQualityItem,
  detail: ReaderQualityDetail | null,
  status: ReaderStatus,
): boolean {
  if (status === "loading") {
    return false;
  }
  const readerStatus = (detail && detail.id === item.id ? detail.reader_status : item.reader_status) ?? null;
  if (!readerStatus) {
    return item.extraction_status !== "completed";
  }
  if (readerStatus.mode !== "cleaned") {
    return true;
  }
  if (readerStatus.quality !== "ready") {
    return true;
  }
  return item.extraction_status === "failed" || item.extraction_status === "skipped";
}

export function getReextractFeedbackLines(payload: ItemReextractPayload<unknown>): string[] {
  const afterStatus = payload.after.reader_status;
  const lines = [
    payload.write_applied
      ? `Zapisano nowy wynik ekstrakcji: ${afterStatus.label}.`
      : `Podgląd wyniku ekstrakcji: ${afterStatus.label}.`,
    afterStatus.summary,
  ];
  if (payload.stop_reasons.length > 0) {
    lines.push(`Diagnostyka: ${payload.stop_reasons.join(", ")}.`);
  }
  return lines;
}
