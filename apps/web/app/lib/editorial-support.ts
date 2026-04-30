import type { WorkspaceAccent, WorkspaceTone } from "@/app/lib/workspace-ui";

export type RankingPreferenceScope =
  | "freshness"
  | "source"
  | "cluster"
  | "format"
  | "author"
  | "manual";

export type RankingPreferenceOption<TValue extends string = string> = {
  value: TValue;
  label: string;
  description?: string;
  shortLabel?: string;
  score?: number;
};

export type RankingPreference<TValue extends string = string> = {
  id: string;
  label: string;
  description?: string;
  hint?: string;
  value: TValue;
  defaultValue: TValue;
  options: readonly RankingPreferenceOption<TValue>[];
  scope?: RankingPreferenceScope;
  weight?: number;
  isPinned?: boolean;
  locked?: boolean;
};

export type RankingPreferenceSummary = {
  total: number;
  customized: number;
  pinned: number;
  weightedScore: number | null;
  scopes: RankingPreferenceScope[];
};

export type SourceHealthStatus = "healthy" | "warning" | "error" | "unknown";
export type SourceState = "active" | "inactive" | "archived";
export type SourceReadingReadiness = "ready" | "degraded" | "blocked" | "unknown";

export type SourceHealthSnapshot = {
  status: SourceHealthStatus;
  summary: string;
  indicators: readonly string[];
  stale?: boolean;
  noisy?: boolean;
  lastFetchAt?: string | null;
  lastSuccessfulFetchAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  consecutiveFailures?: number;
  itemsLast24h?: number;
  itemsLast7d?: number;
  totalItems?: number;
  latestItemAt?: string | null;
  readableItems7d?: number;
  localReadableItems7d?: number;
  excerptFallbackItems7d?: number;
  sourceOnlyItems7d?: number;
  extractionFailedItems7d?: number;
  readingReadiness?: SourceReadingReadiness;
  readingSummary?: string | null;
};

export type SourceHealthCardModel = {
  id: string;
  title: string;
  category?: string | null;
  state?: SourceState;
  feedUrl?: string | null;
  siteUrl?: string | null;
  unreadCount?: number;
  health: SourceHealthSnapshot;
};

export type StoryClusterMomentum = "emerging" | "steady" | "peaking" | "cooling";
export type StoryClusterItemState = "unread" | "saved" | "archived" | "seen";

export type StoryClusterStory = {
  id: string;
  title: string;
  source: string;
  publishedAt?: string | null;
  summary?: string;
  url?: string | null;
  state?: StoryClusterItemState;
};

export type StoryClusterModel = {
  id: string;
  title: string;
  summary?: string;
  labels?: readonly string[];
  sourceCount: number;
  storyCount: number;
  savedCount?: number;
  unreadCount?: number;
  updatedAt?: string | null;
  leadSource?: string;
  momentum?: StoryClusterMomentum;
  stories: readonly StoryClusterStory[];
};

export type SavedViewKind = "saved" | "digest" | "cluster" | "custom";

export type SavedViewChipModel = {
  id: string;
  label: string;
  description?: string;
  kind: SavedViewKind;
  resultCount?: number;
  unreadCount?: number;
  isActive?: boolean;
  isPinned?: boolean;
  accent?: WorkspaceAccent;
};

export type AnnotationStatus = "draft" | "active" | "resolved" | "archived";
export type AnnotationKind = "note" | "highlight" | "summary" | "decision";

export type AnnotationEntry = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  kind: AnnotationKind;
  status?: AnnotationStatus;
  quote?: string;
  quoteContext?: string;
  tags?: readonly string[];
};

export type AnnotationPanelModel = {
  id: string;
  title: string;
  storyTitle?: string;
  selectionLabel?: string;
  status?: AnnotationStatus;
  updatedAt?: string | null;
  linkedStoryCount?: number;
  entries: readonly AnnotationEntry[];
  emptyState?: {
    title: string;
    body: string;
  };
};

type StatusMeta = {
  label: string;
  tone: WorkspaceTone;
};

type KindMeta = StatusMeta & {
  accent?: WorkspaceAccent;
};

const compactNumberFormatter = new Intl.NumberFormat("pl", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const absoluteDateFormatter = new Intl.DateTimeFormat("pl", {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeDateFormatter = new Intl.RelativeTimeFormat("pl", {
  numeric: "auto",
});

const healthMetaMap = {
  healthy: {
    label: "Zdrowe",
    tone: "success",
  },
  warning: {
    label: "Uwaga",
    tone: "warning",
  },
  error: {
    label: "Problem",
    tone: "danger",
  },
  unknown: {
    label: "Nieznany",
    tone: "muted",
  },
} satisfies Record<SourceHealthStatus, StatusMeta>;

const sourceStateMetaMap = {
  active: {
    label: "Aktywne",
    tone: "success",
  },
  inactive: {
    label: "Nieaktywne",
    tone: "muted",
  },
  archived: {
    label: "Zarchiwizowane",
    tone: "danger",
  },
} satisfies Record<SourceState, StatusMeta>;

const sourceReadingReadinessMetaMap = {
  ready: {
    label: "Czytelne",
    tone: "success",
  },
  degraded: {
    label: "Częściowe",
    tone: "warning",
  },
  blocked: {
    label: "Problem z czytaniem",
    tone: "danger",
  },
  unknown: {
    label: "Brak danych",
    tone: "muted",
  },
} satisfies Record<SourceReadingReadiness, StatusMeta>;

const clusterMomentumMetaMap = {
  emerging: {
    label: "Narastajace",
    tone: "accent",
  },
  steady: {
    label: "Stabilne",
    tone: "muted",
  },
  peaking: {
    label: "Szczyt",
    tone: "warning",
  },
  cooling: {
    label: "Wygasa",
    tone: "default",
  },
} satisfies Record<StoryClusterMomentum, StatusMeta>;

const savedViewMetaMap = {
  saved: {
    label: "Zapisane",
    tone: "accent",
    accent: "blue",
  },
  digest: {
    label: "Digest",
    tone: "warning",
    accent: "amber",
  },
  cluster: {
    label: "Klaster",
    tone: "success",
    accent: "green",
  },
  custom: {
    label: "Wlasne",
    tone: "muted",
    accent: "slate",
  },
} satisfies Record<SavedViewKind, KindMeta>;

const annotationStatusMetaMap = {
  draft: {
    label: "Szkic",
    tone: "muted",
  },
  active: {
    label: "Aktywne",
    tone: "accent",
  },
  resolved: {
    label: "Rozwiazane",
    tone: "success",
  },
  archived: {
    label: "Zarchiwizowane",
    tone: "danger",
  },
} satisfies Record<AnnotationStatus, StatusMeta>;

const annotationKindMetaMap = {
  note: {
    label: "Notatka",
    tone: "accent",
  },
  highlight: {
    label: "Podkreslenie",
    tone: "warning",
  },
  summary: {
    label: "Podsumowanie",
    tone: "success",
  },
  decision: {
    label: "Decyzja",
    tone: "danger",
  },
} satisfies Record<AnnotationKind, StatusMeta>;

type RelativeDivision = {
  seconds: number;
  unit: Intl.RelativeTimeFormatUnit;
};

const relativeDivisions: readonly RelativeDivision[] = [
  { seconds: 60 * 60 * 24 * 365, unit: "year" },
  { seconds: 60 * 60 * 24 * 30, unit: "month" },
  { seconds: 60 * 60 * 24 * 7, unit: "week" },
  { seconds: 60 * 60 * 24, unit: "day" },
  { seconds: 60 * 60, unit: "hour" },
  { seconds: 60, unit: "minute" },
  { seconds: 1, unit: "second" },
];

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatCompactNumber(value: number | null | undefined, fallback = "0"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return compactNumberFormatter.format(value);
}

export function formatAbsoluteDate(
  value: string | null | undefined,
  fallback = "Nieznany czas",
): string {
  const parsed = toDate(value);
  return parsed ? absoluteDateFormatter.format(parsed) : fallback;
}

export function formatRelativeDate(
  value: string | null | undefined,
  now: Date = new Date(),
  fallback = "Nieznany czas",
): string {
  const parsed = toDate(value);

  if (!parsed) {
    return fallback;
  }

  const differenceSeconds = (parsed.getTime() - now.getTime()) / 1000;
  const absoluteSeconds = Math.abs(differenceSeconds);

  if (absoluteSeconds < 45) {
    return differenceSeconds < 0 ? "przed chwila" : "za chwile";
  }

  for (const division of relativeDivisions) {
    if (absoluteSeconds >= division.seconds || division.unit === "second") {
      return relativeDateFormatter.format(
        Math.round(differenceSeconds / division.seconds),
        division.unit,
      );
    }
  }

  return fallback;
}

export function formatCountLabel(
  count: number | null | undefined,
  singular: string,
  plural = `${singular}s`,
  fallback = `0 ${plural}`,
): string {
  if (typeof count !== "number" || !Number.isFinite(count)) {
    return fallback;
  }

  return `${count} ${count === 1 ? singular : plural}`;
}

export function getDomainLabel(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function getRankingPreferenceOption<TValue extends string>(
  preference: RankingPreference<TValue>,
  value: TValue = preference.value,
): RankingPreferenceOption<TValue> | undefined {
  return preference.options.find((option) => option.value === value);
}

export function sortRankingPreferences<TValue extends string>(
  preferences: readonly RankingPreference<TValue>[],
): RankingPreference<TValue>[] {
  return [...preferences].sort((left, right) => {
    const weightDelta = (right.weight ?? 0) - (left.weight ?? 0);
    if (weightDelta !== 0) {
      return weightDelta;
    }

    const scopeDelta = (left.scope ?? "").localeCompare(right.scope ?? "");
    if (scopeDelta !== 0) {
      return scopeDelta;
    }

    return left.label.localeCompare(right.label);
  });
}

export function summarizeRankingPreferences<TValue extends string>(
  preferences: readonly RankingPreference<TValue>[],
): RankingPreferenceSummary {
  let customized = 0;
  let pinned = 0;
  let weightedScoreTotal = 0;
  let appliedWeightTotal = 0;
  const scopes = new Set<RankingPreferenceScope>();

  for (const preference of preferences) {
    if (preference.value !== preference.defaultValue) {
      customized += 1;
    }

    if (preference.isPinned) {
      pinned += 1;
    }

    if (preference.scope) {
      scopes.add(preference.scope);
    }

    const selectedOption = getRankingPreferenceOption(preference);
    if (selectedOption && typeof selectedOption.score === "number") {
      const appliedWeight = preference.weight ?? 1;
      weightedScoreTotal += selectedOption.score * appliedWeight;
      appliedWeightTotal += appliedWeight;
    }
  }

  return {
    total: preferences.length,
    customized,
    pinned,
    weightedScore:
      appliedWeightTotal > 0 ? weightedScoreTotal / appliedWeightTotal : null,
    scopes: [...scopes],
  };
}

export function getSourceHealthStatusMeta(status: SourceHealthStatus): StatusMeta {
  return healthMetaMap[status];
}

export function getSourceStateMeta(state: SourceState): StatusMeta {
  return sourceStateMetaMap[state];
}

export function getSourceReadingReadinessMeta(readiness: SourceReadingReadiness): StatusMeta {
  return sourceReadingReadinessMetaMap[readiness];
}

export function getSourceHealthFacts(
  source: SourceHealthCardModel,
): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [];

  if (typeof source.unreadCount === "number") {
    facts.push({
      label: "Nieprzeczytane",
      value: formatCompactNumber(source.unreadCount),
    });
  }

  if (typeof source.health.itemsLast24h === "number") {
    facts.push({
      label: "24h",
      value: formatCompactNumber(source.health.itemsLast24h),
    });
  }

  if (typeof source.health.itemsLast7d === "number") {
    facts.push({
      label: "7d",
      value: formatCompactNumber(source.health.itemsLast7d),
    });
  }

  if (typeof source.health.localReadableItems7d === "number") {
    facts.push({
      label: "Lokalny tekst 7d",
      value: formatCompactNumber(source.health.localReadableItems7d),
    });
  }

  if (typeof source.health.excerptFallbackItems7d === "number") {
    facts.push({
      label: "Skrót 7d",
      value: formatCompactNumber(source.health.excerptFallbackItems7d),
    });
  }

  if (typeof source.health.sourceOnlyItems7d === "number") {
    facts.push({
      label: "Źródło 7d",
      value: formatCompactNumber(source.health.sourceOnlyItems7d),
    });
  }

  if (typeof source.health.extractionFailedItems7d === "number") {
    facts.push({
      label: "Błędy ekstr.",
      value: formatCompactNumber(source.health.extractionFailedItems7d),
    });
  }

  if (typeof source.health.totalItems === "number") {
    facts.push({
      label: "Łącznie",
      value: formatCompactNumber(source.health.totalItems),
    });
  }

  if (typeof source.health.consecutiveFailures === "number") {
    facts.push({
      label: "Błędy syncu",
      value: formatCompactNumber(source.health.consecutiveFailures),
    });
  }

  return facts;
}

export function getStoryClusterMomentumMeta(
  momentum: StoryClusterMomentum | undefined,
): StatusMeta {
  return momentum ? clusterMomentumMetaMap[momentum] : { label: "Mieszane", tone: "default" };
}

export function getSavedViewMeta(kind: SavedViewKind): KindMeta {
  return savedViewMetaMap[kind];
}

export function getAnnotationStatusMeta(
  status: AnnotationStatus | undefined,
): StatusMeta {
  return status ? annotationStatusMetaMap[status] : { label: "Otwarte", tone: "default" };
}

export function getAnnotationKindMeta(kind: AnnotationKind): StatusMeta {
  return annotationKindMetaMap[kind];
}
