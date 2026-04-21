import { getDomainLabel } from "@/app/lib/editorial-support";

export type SourcePreviewMode = "website" | "web_feed";

export type SourcePreviewItem = {
  title: string;
  url: string;
  published_at: string | null;
  image_url: string | null;
};

export type SourcePreviewCandidateInput = {
  feed_url: string;
  title: string;
  site_url: string | null;
  description: string | null;
  language: string | null;
  estimated_items_per_week: number | null;
  sample_items: SourcePreviewItem[];
  already_subscribed: boolean;
  existing_channel_id: string | null;
};

export type SourcePreviewPayloadInput = {
  status: "ready" | "already_subscribed" | "multiple_candidates";
  feed: SourcePreviewCandidateInput | null;
};

export type SourcePreviewUiState =
  | "idle"
  | "loading"
  | "single_match"
  | "multiple_candidates"
  | "already_followed"
  | "error";

type PreviewStateInput = {
  previewBusy: boolean;
  preview: SourcePreviewPayloadInput | null;
  hasError: boolean;
};

type TopicInput = {
  category: string | null | undefined;
  existingCategory: string | null | undefined;
  inputUrl: string | null | undefined;
  feedUrl: string | null | undefined;
  siteUrl: string | null | undefined;
  language: string | null | undefined;
  modeLabel: string;
  sampleItems?: readonly SourcePreviewItem[];
  sourceGroupNames?: readonly string[];
};

type MetricInput = {
  candidate: SourcePreviewCandidateInput | null;
  unreadCount?: number | null;
  discoveryLabel?: string | null;
  languageLabel?: string | null;
};

export function getSourcePreviewUiState({
  previewBusy,
  preview,
  hasError,
}: PreviewStateInput): SourcePreviewUiState {
  if (previewBusy) {
    return "loading";
  }
  if (preview?.status === "multiple_candidates") {
    return "multiple_candidates";
  }
  if (preview?.status === "already_subscribed") {
    return "already_followed";
  }
  if (preview?.feed) {
    return "single_match";
  }
  if (hasError) {
    return "error";
  }
  return "idle";
}

export function canAutoPreviewSourceInput(mode: SourcePreviewMode, value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 4) {
    return false;
  }
  if (mode === "website") {
    return /[.:/]/.test(trimmed);
  }
  return /^https?:\/\//i.test(trimmed) || /feed|rss|atom|xml/i.test(trimmed) || trimmed.includes("/");
}

export function buildSourcePreviewRequestKey(mode: SourcePreviewMode, value: string) {
  const trimmed = value.trim();
  if (!canAutoPreviewSourceInput(mode, trimmed)) {
    return null;
  }
  return `${mode}:${trimmed.toLowerCase()}`;
}

export function buildSourcePreviewTopics({
  category,
  existingCategory,
  inputUrl,
  feedUrl,
  siteUrl,
  language,
  modeLabel,
  sampleItems = [],
  sourceGroupNames = [],
}: TopicInput): string[] {
  const tokens = new Set<string>();

  const pushToken = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    for (const part of value.split(/[,\|/]/)) {
      const normalized = formatTopicChip(part);
      if (normalized) {
        tokens.add(normalized);
      }
    }
  };

  pushToken(category);
  pushToken(existingCategory);
  pushToken(getDomainLabel(siteUrl ?? feedUrl ?? inputUrl ?? null));
  pushToken(language);
  pushToken(modeLabel);
  sourceGroupNames.slice(0, 4).forEach((name) => pushToken(name));
  sampleItems.slice(0, 3).forEach((item) => {
    item.title
      .split(/\s+/)
      .filter((part) => part.length >= 5)
      .slice(0, 2)
      .forEach((part) => pushToken(part));
  });

  const ordered = [...tokens];
  const fallbackTokens = ["#rss", "#czytanie", "#research", "#monitoring"];
  for (const token of fallbackTokens) {
    if (!ordered.includes(token)) {
      ordered.push(token);
    }
  }

  return ordered.slice(0, 8);
}

export function buildSourcePreviewMetrics({
  candidate,
  unreadCount,
  discoveryLabel,
  languageLabel,
}: MetricInput): string[] {
  if (!candidate) {
    return [];
  }

  const metrics = [
    candidate.estimated_items_per_week && candidate.estimated_items_per_week > 0
      ? `~${candidate.estimated_items_per_week} wpis${candidate.estimated_items_per_week === 1 ? "" : "y"}/tydz.`
      : null,
    typeof unreadCount === "number" && unreadCount > 0 ? `${unreadCount} nieprzeczytanych` : null,
    languageLabel,
    discoveryLabel,
  ].filter((value): value is string => Boolean(value));

  return metrics;
}

export function formatTopicChip(value: string) {
  const normalized = value
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  if (!/\p{L}/u.test(normalized)) {
    return null;
  }
  return normalized ? `#${normalized}` : null;
}
