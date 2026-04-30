export const DIGEST_CANDIDATE_PREVIEW_LIMIT = 25;

export type DigestCandidatePreviewStatus = "idle" | "loading" | "ready" | "empty" | "error";

export type PersistedDigestSelectionPayload = {
  title: string;
  digest_candidates_only: true;
  include_read: true;
  favorites_only: false;
  limit: number;
};

export type DigestQueueCopy = {
  heading: string;
  body: string;
};

export function getDigestStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Oczekuje";
    case "building":
      return "Budowanie";
    case "completed":
      return "Gotowy";
    case "failed":
      return "Blad";
    case "sent":
      return "Wyslany";
    case "archived":
      return "Zarchiwizowany";
    case "ready":
      return "Gotowy";
    case "excluded":
      return "Wykluczony";
    case "pending_extraction":
      return "Oczekuje na ekstrakcje";
    case "blocked_by_extraction":
      return "Zablokowany przez ekstrakcje";
    case "needs_content_review":
      return "Wymaga sprawdzenia tresci";
    default:
      return status;
  }
}

export function buildDigestTitle(now = new Date()): string {
  return `rssmaster digest ${now.toISOString().slice(0, 10)}`;
}

export function buildPersistedDigestSelectionPayload(
  options: {
    limit?: number;
    now?: Date;
    title?: string;
  } = {},
): PersistedDigestSelectionPayload {
  const normalizedLimit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(Math.trunc(options.limit ?? DIGEST_CANDIDATE_PREVIEW_LIMIT), 200))
    : DIGEST_CANDIDATE_PREVIEW_LIMIT;

  return {
    title: options.title ?? buildDigestTitle(options.now),
    digest_candidates_only: true,
    include_read: true,
    favorites_only: false,
    limit: normalizedLimit,
  };
}

export function getDigestQueueCopy({
  hasActiveReaderFilter,
  persistedCount,
  status,
  visibleCandidateCount,
}: {
  hasActiveReaderFilter: boolean;
  persistedCount: number | null;
  status: DigestCandidatePreviewStatus;
  visibleCandidateCount: number;
}): DigestQueueCopy {
  if (status === "loading") {
    return {
      heading: "Sprawdzam trwałą kolejkę digestu",
      body: "RSSmaster pyta backend o artykuły oznaczone jako Digest, niezależnie od aktualnego wyszukiwania i filtrów czytnika.",
    };
  }

  if (status === "empty") {
    return {
      heading: "Nie ma jeszcze kandydatów digestu",
      body: "Oznacz artykuł przyciskiem Digest w czytniku. Jeśli lista czytnika jest zawężona, wyczyść wyszukiwanie albo pokaż wszystkie artykuły, żeby szybciej znaleźć materiały.",
    };
  }

  if (status === "error") {
    return {
      heading: "Nie udało się sprawdzić kolejki digestu",
      body: "Spróbuj ponownie za chwilę. Preview i build korzystają z trwałych kandydatów zapisanych w artykułach, więc filtr czytnika nie powinien zmieniać składu digestu.",
    };
  }

  if (persistedCount && persistedCount > 0) {
    if (hasActiveReaderFilter && visibleCandidateCount < persistedCount) {
      return {
        heading: "Filtr czytnika ukrywa część kandydatów",
        body: `Widoczna lista pokazuje ${visibleCandidateCount} z ${persistedCount} kandydatów, ale preview i build użyją trwałej kolejki digestu z backendu.`,
      };
    }

    return {
      heading: "Trwała kolejka digestu jest gotowa",
      body: `Preview i build użyją ${persistedCount} zapisanych kandydatów, nawet po zmianie trasy, wyszukiwania albo odświeżeniu strony.`,
    };
  }

  return {
    heading: "Digest używa trwałych kandydatów",
    body: "Podgląd nie bierze już artykułów z aktualnie widocznej listy. Używa pozycji zapisanych jako Digest w bibliotece.",
  };
}
