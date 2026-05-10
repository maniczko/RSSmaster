import { isErrorEnvelope, type ApiErrorEnvelope } from "@/app/lib/api-client";
import { getDomainLabel, type AnnotationPanelModel, type RankingPreference, type SavedViewChipModel } from "@/app/lib/editorial-support";
import { buildFeedIconUrl, getFeedGlyph } from "@/app/lib/feed-icon";
import type { ReaderEmptySourceLookupCandidate } from "@/app/lib/reader-empty-state";
import type { WorkspaceSourceHealthEntry } from "@/app/lib/source-health";
import type {
  AuthSessionPayload,
  Channel,
  ChannelHealth,
  ChannelPreviewPayload,
  Item,
  ItemDetail,
  ItemLibrary,
  ItemSortMode,
  ItemStatePatch,
  LibraryView,
  SyncRun,
  WorkspaceAnnotation,
  WorkspaceProfile,
  WorkspaceSavedSearch,
} from "./channel-lab-types";

/** Pure presenter helpers for ChannelLab labels, DTO mapping, and reader copy. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function splitReaderParagraphs(text: string | null | undefined) {
  if (!text) {
    return [];
  }

  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function countWords(text: string | null | undefined) {
  if (!text) {
    return 0;
  }

  return text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

export function getSearchFieldLabel(field: NonNullable<Item["search_match"]>["fields"][number]) {
  if (field === "body") {
    return "Tresc";
  }
  if (field === "excerpt") {
    return "Skrot";
  }
  if (field === "author") {
    return "Autor";
  }
  if (field === "category") {
    return "Kategoria";
  }
  if (field === "source") {
    return "Zrodlo";
  }
  if (field === "organization") {
    return "Tagi / kolekcje";
  }
  if (field === "annotation") {
    return "Notatki / podkreslenia";
  }
  return "Tytul";
}

export function getSortLabel(sort: ItemSortMode) {
  return sort === "oldest" ? "Od najstarszych" : "Od najnowszych";
}

export function getChannelHealthTone(status: ChannelHealth["status"] | undefined) {
  if (status === "healthy") {
    return "active";
  }
  if (status === "warning") {
    return "inactive";
  }
  if (status === "error") {
    return "archived";
  }
  return "";
}

export function getPreviewTitle(payload: ChannelPreviewPayload) {
  if (payload.status === "already_subscribed") {
    return "Źródło już istnieje";
  }
  if (payload.status === "multiple_candidates") {
    return "Wybierz wykryty feed";
  }
  return "Podgląd źródła gotowy";
}

export function getSourceDiscoveryModeLabel(mode: ChannelPreviewPayload["discovery"]["mode"] | undefined) {
  if (mode === "direct") {
    return "Bezpośredni feed";
  }
  if (mode === "head_metadata") {
    return "Autodetect w stronie";
  }
  if (mode === "heuristic") {
    return "Heurystyka";
  }
  return "Autodetect";
}

export function getSourceLanguageLabel(language: string | null | undefined) {
  if (!language) {
    return "Bez oznaczenia języka";
  }
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return "Bez oznaczenia języka";
  }
  if (normalized === "pl" || normalized === "pl-pl") {
    return "Polski";
  }
  if (normalized === "en" || normalized === "en-us" || normalized === "en-gb") {
    return "English";
  }
  if (normalized === "de" || normalized === "de-de") {
    return "Deutsch";
  }
  if (normalized === "fr" || normalized === "fr-fr") {
    return "Francais";
  }
  return normalized.toUpperCase();
}

export function getSourceHostLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return (
    getDomainLabel(value) ??
    value
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      ?.trim() ??
    null
  );
}

export function SourceIdentityMark({
  label,
  siteUrl,
}: {
  label: string;
  siteUrl?: string | null;
}) {
  const iconUrl = buildFeedIconUrl(siteUrl);

  return (
    <span aria-hidden="true" className="source-result-mark">
      {iconUrl ? (
        <img
          alt=""
          className="source-result-mark-image"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          src={iconUrl}
        />
      ) : null}
      <span className="source-result-mark-fallback">{getFeedGlyph(label)}</span>
    </span>
  );
}

export function getChannelStateLabel(state: Channel["state"]) {
  if (state === "active") {
    return "Aktywny";
  }
  if (state === "inactive") {
    return "Nieaktywny";
  }
  return "Zarchiwizowany";
}

export function getHealthStatusLabel(status: ChannelHealth["status"] | WorkspaceSourceHealthEntry["health_status"] | undefined) {
  if (status === "healthy") {
    return "Zdrowe";
  }
  if (status === "warning") {
    return "Uwaga";
  }
  if (status === "error") {
    return "Blad";
  }
  return "Nieznany";
}

export function getSyncRunStatusLabel(status: SyncRun["status"] | string) {
  switch (status) {
    case "queued":
      return "W kolejce";
    case "running":
      return "W toku";
    case "completed":
      return "Ukonczony";
    case "failed":
      return "Blad";
    case "partial_success":
      return "Czesciowy sukces";
    case "canceled":
      return "Anulowany";
    default:
      return status;
  }
}

export function getSyncRunSummaryLine(run: SyncRun | null) {
  if (!run) {
    return "Jeszcze nie masz zakonczonego syncu dla tej biblioteki.";
  }

  if (run.status === "completed") {
    return `Ostatni sync zakonczyl sie sukcesem: ${run.channels_succeeded}/${run.channels_total} kanalow zakonczonych poprawnie.`;
  }

  if (run.status === "partial_success") {
    return `Ostatni sync zakonczyl sie czesciowym sukcesem: ${run.channels_failed}/${run.channels_total} kanalow wymaga uwagi.`;
  }

  if (run.status === "failed") {
    return run.error_message ?? `Ostatni sync zakonczyl sie bledem dla ${run.channels_failed}/${run.channels_total} kanalow.`;
  }

  if (run.status === "running") {
    return "Ostatni sync nadal trwa i odswieza biblioteke w tle.";
  }

  if (run.status === "pending") {
    return "Ostatni sync czeka jeszcze w kolejce backendu.";
  }

  if (run.status === "canceled") {
    return "Ostatni sync zostal anulowany przed zakonczeniem.";
  }

  return `Ostatni sync ma status ${run.status}.`;
}

export function countKnownSourceItems(entry: WorkspaceSourceHealthEntry) {
  return entry.total_items ?? entry.items_last_7d ?? entry.readable_items_7d ?? entry.unread_count ?? null;
}

export function mapHealthEntryToReaderEmptySource(entry: WorkspaceSourceHealthEntry): ReaderEmptySourceLookupCandidate {
  return {
    title: entry.title,
    feedUrl: entry.feed_url,
    category: entry.category,
    groupName: entry.group_name,
    itemCount: countKnownSourceItems(entry),
    lastFetchAt: entry.last_fetch_at ?? null,
    lastSuccessfulFetchAt: entry.last_successful_fetch_at ?? null,
    lastErrorMessage: entry.last_error_message ?? null,
  };
}

export function mapChannelToReaderEmptySource(channel: Channel): ReaderEmptySourceLookupCandidate {
  const healthErrorMessage =
    channel.health?.status === "error" ? channel.health.last_error_message ?? channel.health.summary : channel.last_error ?? null;

  return {
    title: channel.title,
    feedUrl: channel.feed_url,
    siteUrl: channel.site_url,
    category: channel.category,
    itemCount: channel.unread_count,
    lastFetchAt: channel.last_fetch_at ?? channel.health?.last_fetch_at ?? null,
    lastSuccessfulFetchAt: channel.health?.last_successful_fetch_at ?? null,
    lastErrorMessage: healthErrorMessage,
  };
}

export function getDeliveryStatusLabel(status: string) {
  switch (status) {
    case "ready":
      return "Gotowe";
    case "needs_configuration":
      return "Wymaga konfiguracji";
    case "missing_artifact":
      return "Brak artefaktu";
    case "connection_failed":
      return "Blad polaczenia";
    case "completed":
      return "Ukonczono";
    case "failed":
      return "Blad";
    case "queued":
      return "W kolejce";
    case "running":
      return "W toku";
    case "sent":
      return "Wyslano";
    default:
      return status;
  }
}

export function getExtractionStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Oczekuje";
    case "completed":
      return "Ukonczona";
    case "failed":
      return "Blad";
    case "skipped":
      return "Pominieta";
    default:
      return status;
  }
}

export function mapProfileToRankingPreferences(profile: WorkspaceProfile | null): RankingPreference<string>[] {
  if (!profile) {
    return [];
  }

  return [
    {
      id: "candidate_window_hours",
      label: "Okno kandydatow",
      description: "Jak daleko wstecz siega rekomendacja, zanim zacznie liczyc scoring.",
      value: String(profile.candidate_window_hours),
      defaultValue: "72",
      scope: "freshness",
      options: [
        { value: "24", label: "24h", shortLabel: "24h" },
        { value: "48", label: "48h", shortLabel: "48h" },
        { value: "72", label: "72h", shortLabel: "72h" },
        { value: "120", label: "5d", shortLabel: "5d" },
      ],
    },
    {
      id: "default_source_cap",
      label: "Domyslny limit zrodla",
      description: "Maksymalna liczba kandydatow, ktore zwykly feed moze wepchnac do rankingu.",
      value: String(profile.default_source_cap),
      defaultValue: "30",
      scope: "source",
      options: [
        { value: "15", label: "15 pozycji", shortLabel: "15" },
        { value: "30", label: "30 pozycji", shortLabel: "30" },
        { value: "45", label: "45 pozycji", shortLabel: "45" },
        { value: "60", label: "60 pozycji", shortLabel: "60" },
      ],
    },
    {
      id: "priority_source_cap",
      label: "Limit zrodel priorytetowych",
      description: "Wyzej ustawiony limit dla zaufanych feedow, ktore chcesz widziec czesciej.",
      value: String(profile.priority_source_cap),
      defaultValue: "45",
      scope: "source",
      options: [
        { value: "30", label: "30 pozycji", shortLabel: "30" },
        { value: "45", label: "45 pozycji", shortLabel: "45" },
        { value: "60", label: "60 pozycji", shortLabel: "60" },
        { value: "90", label: "90 pozycji", shortLabel: "90" },
      ],
    },
    {
      id: "daily_reading_goal",
      label: "Dzienny cel czytania",
      description: "Pod ile mocnych rekomendacji aplikacja ma optymalizowac briefing.",
      value: String(profile.daily_reading_goal),
      defaultValue: "12",
      scope: "manual",
      options: [
        { value: "8", label: "8 lektur", shortLabel: "8" },
        { value: "12", label: "12 lektur", shortLabel: "12" },
        { value: "20", label: "20 lektur", shortLabel: "20" },
        { value: "30", label: "30 lektur", shortLabel: "30" },
      ],
    },
  ];
}

export function mapSavedSearchToChip(
  search: WorkspaceSavedSearch,
  activeQuery: string,
  libraryView: LibraryView,
): SavedViewChipModel {
  const active = activeQuery.trim() === search.query.trim() && libraryView === search.default_view;
  return {
    id: search.id,
    label: search.name,
    description: search.query,
    kind: "custom",
    resultCount: undefined,
    unreadCount: undefined,
    isActive: active,
    isPinned: search.default_view === "saved" || search.default_view === "digest",
  };
}

export function mapAnnotationsToPanel(
  item: Item | null,
  annotations: WorkspaceAnnotation[],
  selectedTextQuote: string,
): AnnotationPanelModel {
  return {
    id: item?.id ?? "reader-annotations",
    title: "Notatki czytelnika",
    storyTitle: item?.title,
    selectionLabel: selectedTextQuote ? "Zaznaczenie gotowe" : undefined,
    status: annotations.length > 0 ? "active" : "draft",
    updatedAt: annotations[0]?.updated_at ?? item?.published_at ?? null,
    entries: annotations.map((annotation) => ({
      id: annotation.id,
      authorLabel: annotation.kind === "highlight" ? "Podkreslenie" : "Notatka",
      body: annotation.note_text ?? annotation.quote_text ?? "Brak zapisanej tresci.",
      createdAt: annotation.created_at,
      kind: annotation.kind === "highlight" ? "highlight" : "note",
      status: "active",
      quote: annotation.quote_text ?? undefined,
      tags: annotation.color ? [annotation.color] : undefined,
    })),
    emptyState: {
      title: "Brak adnotacji",
      body: item
        ? "Zaznacz tekst w artykule albo dopisz notatke, aby budowac wlasna warstwe wiedzy."
        : "Wybierz artykul, aby zaczac anotowac.",
    },
  };
}

export function applyItemPatch<T extends Item | ItemDetail>(item: T, patch: ItemStatePatch): T {
  const now = new Date().toISOString();
  let nextFavorite = "is_favorite" in patch && typeof patch.is_favorite === "boolean" ? patch.is_favorite : item.is_favorite;
  let nextArchived = "is_archived" in patch && typeof patch.is_archived === "boolean" ? patch.is_archived : item.is_archived;

  if (patch.library_action === "save") {
    nextFavorite = true;
    nextArchived = false;
  } else if (patch.library_action === "unsave") {
    nextFavorite = false;
  } else if (patch.library_action === "archive") {
    nextArchived = true;
    nextFavorite = false;
  } else if (patch.library_action === "restore") {
    nextArchived = false;
  }

  const nextDigestCandidate =
    "digest_candidate" in patch && typeof patch.digest_candidate === "boolean"
      ? patch.digest_candidate
      : item.digest_candidate;
  const nextLibraryState: ItemLibrary["state"] = nextArchived ? "archived" : nextFavorite ? "saved" : "inbox";

  return {
    ...item,
    ...patch,
    is_favorite: nextFavorite,
    is_archived: nextArchived,
    digest_candidate: nextDigestCandidate,
    library: {
      ...item.library,
      state: nextLibraryState,
      is_saved: nextFavorite,
      is_archived: nextArchived,
      saved_at: nextFavorite ? item.library.saved_at ?? now : null,
      archived_at: nextArchived ? item.library.archived_at ?? now : null,
    },
    digest: {
      ...item.digest,
      is_candidate: nextDigestCandidate,
    },
  };
}

export function buildUndoPatch(before: Item, after: Item): ItemStatePatch | null {
  const patch: ItemStatePatch = {};

  if (before.is_read !== after.is_read) {
    patch.is_read = before.is_read;
  }
  if (before.is_favorite !== after.is_favorite) {
    patch.is_favorite = before.is_favorite;
  }
  if (before.is_archived !== after.is_archived) {
    patch.is_archived = before.is_archived;
  }
  if (before.digest_candidate !== after.digest_candidate) {
    patch.digest_candidate = before.digest_candidate;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function describeItemMutation(patch: ItemStatePatch) {
  if (patch.library_action === "save" || patch.is_favorite === true) {
    return "Zapisano artykul";
  }
  if (patch.library_action === "unsave" || patch.is_favorite === false) {
    return "Usunieto artykul z zapisanych";
  }
  if (patch.library_action === "archive" || patch.is_archived === true) {
    return "Zarchiwizowano artykul";
  }
  if (patch.library_action === "restore" || patch.is_archived === false) {
    return "Przywrocono artykul";
  }
  if (patch.is_read === true) {
    return "Oznaczono artykul jako przeczytany";
  }
  if (patch.is_read === false) {
    return "Oznaczono artykul jako nieprzeczytany";
  }
  if (patch.digest_candidate === true) {
    return "Dodano artykul do kolejki digestu";
  }
  if (patch.digest_candidate === false) {
    return "Usunieto artykul z kolejki digestu";
  }
  return "Zaktualizowano artykul";
}

export function isDigestSelectionEmptyPayload(payload: unknown): payload is ApiErrorEnvelope {
  return isErrorEnvelope(payload) && payload.error?.code === "digest_selection_empty";
}

export function isAuthSessionPayload(payload: unknown): payload is AuthSessionPayload {
  return typeof payload === "object" && payload !== null && "auth_required" in payload && "has_accounts" in payload;
}

export function formatTimestamp(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}
