"use client";

import {
  ChangeEvent,
  FormEvent,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AccountStatus,
  AppShell,
  ArchiveIcon,
  AnnotationPanel,
  ArticleQueueList,
  BackofficeIcon,
  BookmarkIcon,
  CaptureIcon,
  DeliveryIcon,
  DigestIcon,
  DismissIcon,
  DiscoverIcon,
  FeedBrowser,
  FeedIcon,
  FeedStream,
  HighlightIcon,
  ImportIcon,
  KeyboardIcon,
  LibraryIcon,
  LibraryViewsNav,
  LocalAuthGate,
  MenuIcon,
  NoteIcon,
  RankingPreferencesPanel,
  ReaderArticleCard,
  ReaderIcon,
  ReaderArticleTopbar,
  ReaderBrowseView,
  ReaderDecisionBar,
  SavedViewChip,
  SettingsIcon,
  SourceHealthCard,
  SourcesIcon,
  SparkIcon,
  StoryClusterCard,
  StatusIcon,
  SyncIcon,
  TopicIcon,
  WebsiteIcon,
  WorkspaceButton,
  WorkspaceChip,
  WorkspacePanel,
} from "./components";
import {
  buildContinuityBundle,
  buildRestoreStateFromContinuityBundle,
  buildFeedBrowserTree,
  buildFeedIconUrl,
  buildSourcePreviewMetrics,
  buildSourcePreviewRequestKey,
  buildSourcePreviewTopics,
  classifySourcePreviewFailure,
  formatCompactNumber,
  formatRelativeDate,
  getDomainLabel,
  getFeedGlyph,
  getSourcePreviewFailureDescription,
  getSourcePreviewFailureLabel,
  getSourcePreviewAnnouncement,
  getSourcePreviewStatusLabel,
  getSourcePreviewUiState,
  getFeedFolderId,
  getReaderViewControlsFromPreference,
  buildReaderDecisionPatch,
  didReaderDecisionAdvance,
  getReaderDecisionActionLabel,
  getReaderDecisionResultLine,
  inferLibraryViewForItemState,
  mapStoryClusterCard,
  normalizeReaderText,
  parseContinuityBundle,
  resolveReaderDecisionNextItemId,
  resolveContinuityExportReaderState,
  renderInlineHighlightHtml,
  sanitizeReaderHtml,
  sanitizeReaderParagraphs,
  shouldDropReaderParagraph,
  shouldApplyReaderViewPreference,
} from "./lib";
import type {
  AnnotationPanelModel,
  ContinuityBundle,
  FeedBrowserTreeFolder,
  RankingPreference,
  SavedViewChipModel,
  SourceHealthCardModel,
  ReaderDecisionAction,
} from "./lib";
import {
  buildAppHref,
  isAppReadSurface,
  isAppLibraryView,
  isAppSection,
  parseAppPath,
  parseLegacyQueryPath,
  type AppLibraryView,
  type AppSection,
} from "@/app/lib/app-routes";
import { sourceAddModes, type SourceAddModeId } from "./lib/source-add-modes";

type Channel = {
  id: string;
  title: string;
  site_url: string | null;
  feed_url: string;
  category: string | null;
  state: "active" | "inactive" | "archived";
  unread_count: number;
  last_fetch_at?: string | null;
  last_error?: string | null;
  health?: ChannelHealth | null;
};

type ChannelHealth = {
  status: "healthy" | "warning" | "error" | "unknown";
  summary: string;
  indicators: string[];
  stale: boolean;
  noisy: boolean;
  last_fetch_at: string | null;
  last_successful_fetch_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
  items_last_24h: number;
  items_last_7d: number;
  total_items: number;
  latest_item_at: string | null;
};

type LibraryView = AppLibraryView;

type ItemLibrary = {
  state: "inbox" | "saved" | "archived";
  saved_at: string | null;
  archived_at: string | null;
  is_saved: boolean;
  is_archived: boolean;
};

type Item = {
  id: string;
  channel_id: string;
  title: string;
  author: string | null;
  source_url: string;
  excerpt: string | null;
  published_at: string | null;
  is_read: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  digest_candidate: boolean;
  extraction_status: "pending" | "running" | "completed" | "failed" | "skipped";
  has_cleaned_content: boolean;
  has_raw_content: boolean;
  story_cluster_id?: string | null;
  story_cluster_size?: number | null;
  library: ItemLibrary;
  search_match?: {
    primary_field:
      | "title"
      | "author"
      | "source"
      | "excerpt"
      | "body"
      | "category"
      | "organization"
      | "annotation";
    fields: Array<
      "title" | "author" | "source" | "excerpt" | "body" | "category" | "organization" | "annotation"
    >;
    snippet: string | null;
  } | null;
  channel: {
    id: string;
    title: string;
    category: string | null;
    feed_url: string;
    site_url: string | null;
    state: string;
  };
  digest: {
    is_candidate: boolean;
    status: "ready" | "excluded" | "pending_extraction" | "blocked_by_extraction" | "needs_content_review";
    reason: string;
  };
};

type ItemDetail = Item & {
  cleaned_html: string | null;
  content_text: string | null;
};

type DigestPreview = {
  title: string;
  selection_mode: "digest_candidates" | "explicit";
  period_start: string | null;
  period_end: string | null;
  stats: {
    article_count: number;
    category_count: number;
    unread_count: number;
    favorite_count: number;
    digest_candidate_count: number;
    word_count: number;
    estimated_read_minutes: number;
  };
  category_summary: Array<{
    category: string;
    article_count: number;
  }>;
};

type DigestHistory = {
  id: string;
  status: "pending" | "building" | "completed" | "failed" | "sent" | "archived";
  title: string;
  article_count: number;
  generated_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  artifact: {
    path: string | null;
    sha256: string | null;
    size_bytes: number | null;
  };
};

type DeliverySettings = {
  smtp_host: string | null;
  smtp_port: number;
  smtp_username: string | null;
  smtp_password: {
    configured: boolean;
    redacted_value: string | null;
  };
  smtp_from: string | null;
  kindle_email: string | null;
  smtp_ready: boolean;
  updated_at: string | null;
  updated_by: string | null;
  issues: string[];
};

type DeliveryPreflight = {
  status: "ready" | "needs_configuration" | "missing_artifact" | "connection_failed";
  can_send: boolean;
  mode: "dry_run" | "send";
  target_kind: "kindle" | "smtp";
  recipient: string | null;
  artifact: {
    digest_id: string;
    title: string;
    status: string;
    artifact_path: string | null;
    artifact_exists: boolean;
    artifact_bytes: number;
    artifact_sha256: string | null;
    generated_at: string | null;
  };
  checks: Array<{
    name: string;
    status: "passed" | "failed" | "warning" | "skipped";
    message: string;
  }>;
};

type DeliveryLog = {
  id: string;
  digest_id: string | null;
  digest_title: string | null;
  target_kind: "kindle" | "smtp" | "download";
  recipient: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  provider_message_id: string | null;
  sent_at: string | null;
  error_message: string | null;
};

type SyncRun = {
  id: string;
  job_type: "sync";
  trigger_kind: "manual" | "scheduled" | "system";
  status: "pending" | "running" | "partial_success" | "failed" | "canceled" | "completed";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  channels_total: number;
  channels_succeeded: number;
  channels_failed: number;
  items_seen: number;
  items_created: number;
  items_skipped: number;
  error_message: string | null;
  errors: Array<{
    channel_id: string;
    channel_title: string;
    code: string;
    message: string;
  }>;
};

type WorkspaceInterest = {
  id: string;
  label: string;
  normalized_topic: string | null;
  kind: "topic" | "source";
  weight: -1 | 0 | 1 | 2;
};

type WorkspaceProfile = {
  id: string;
  name: string;
  candidate_window_hours: number;
  default_source_cap: number;
  priority_source_cap: number;
  emergency_source_cap: number;
  daily_reading_goal: number;
  interests: WorkspaceInterest[];
};

type WorkspaceItemCard = {
  id: string;
  channel_id: string;
  title: string;
  author: string | null;
  source_url: string;
  excerpt: string | null;
  published_at: string | null;
  is_read: boolean;
  is_favorite: boolean;
  digest_candidate: boolean;
  channel_title: string;
  channel_category: string | null;
  channel_feed_url: string;
  story_cluster_id: string | null;
  story_cluster_size: number;
};

type WorkspaceRankingItem = {
  item: WorkspaceItemCard;
  candidate_status: "eligible" | "excluded" | "suppressed";
  candidate_reason: string | null;
  source_cap: number;
  source_window_hours: number;
  breakdown: {
    relevance_score: number;
    user_preference_score: number;
    source_quality_score: number;
    freshness_score: number;
    originality_score: number;
    engagement_score: number;
    duplicate_penalty: number;
    noise_penalty: number;
    saturation_penalty: number;
    final_score: number;
    matched_interests: string[];
    reason: string;
  };
};

type WorkspaceBriefing = {
  generated_at: string;
  stats: {
    unread_count: number;
    saved_count: number;
    digest_count: number;
    archived_count: number;
    recommended_count: number;
  };
  summary_lines: string[];
  resume_item: WorkspaceItemCard | null;
  recommended: WorkspaceRankingItem[];
  source_warnings: string[];
};

type WorkspaceAnnotation = {
  id: string;
  item_id: string;
  kind: "highlight" | "note";
  quote_text: string | null;
  note_text: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

type WorkspaceTag = {
  id: string;
  name: string;
  color: string | null;
  item_count: number;
};

type WorkspaceCollection = {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
};

type WorkspaceSavedSearch = {
  id: string;
  name: string;
  query: string;
  default_view: "inbox" | "saved" | "digest" | "archive";
};

type WorkspaceSourceGroup = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  channel_count: number;
};

type WorkspaceSourceHealthEntry = {
  channel_id: string;
  title: string;
  feed_url: string;
  category: string | null;
  state: string;
  unread_count: number;
  health_status: "healthy" | "warning" | "error" | "unknown";
  health_summary: string;
  group_name: string | null;
  control: {
    channel_id: string;
    group_id: string | null;
    tier: "priority" | "default" | "muted";
    custom_source_cap: number | null;
    paused_until: string | null;
    snoozed_until: string | null;
    notes: string | null;
    group_name: string | null;
  };
};

type WorkspaceStoryCluster = {
  id: string;
  headline: string;
  item_count: number;
  category: string | null;
  primary: WorkspaceItemCard;
  alternates: WorkspaceItemCard[];
};

type ListPage = {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
};

type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: {
      candidates?: string[];
      [key: string]: unknown;
    };
  };
};

type AuthAccount = {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
};

type AuthSessionPayload = {
  has_accounts: boolean;
  auth_required: boolean;
  session: {
    account: AuthAccount;
  } | null;
};

type AuthStatus = "loading" | "ready" | "unauthenticated";

type FallbackErrorPayload = {
  detail?: string;
};

type ChannelListPayload = {
  items: Channel[];
};

type ChannelCreatePayload = {
  channel: Channel;
  discovery: {
    mode: string;
    resolved_feed_url: string;
    candidates: string[];
  };
};

type ChannelMutationPayload = {
  channel: Channel;
};

type ChannelPreviewCandidate = {
  feed_url: string;
  title: string;
  site_url: string | null;
  description: string | null;
  language: string | null;
  estimated_items_per_week: number | null;
  sample_items: ChannelPreviewItem[];
  already_subscribed: boolean;
  existing_channel_id: string | null;
};

type ChannelPreviewItem = {
  title: string;
  url: string;
  published_at: string | null;
  image_url: string | null;
};

type ChannelPreviewPayload = {
  status: "ready" | "already_subscribed" | "multiple_candidates";
  input_url: string;
  discovery: {
    mode: "direct" | "head_metadata" | "heuristic";
    resolved_feed_url: string | null;
    candidates: string[];
  };
  feed: ChannelPreviewCandidate | null;
  candidates: ChannelPreviewCandidate[];
  existing_channel: Channel | null;
};

type SourceSurfaceMode = "add" | "manage";

type SyncRunPayload = {
  run: SyncRun;
};

type SyncRunListPayload = {
  items: SyncRun[];
};

type ItemListPayload = {
  items: Item[];
  page?: ListPage;
};

type ItemDetailPayload = {
  item: ItemDetail;
};

type DigestPreviewPayload = {
  preview: DigestPreview;
};

type DigestHistoryListPayload = {
  items: DigestHistory[];
  page?: ListPage;
};

type DigestHistoryPayload = {
  digest: DigestHistory;
};

type DeliverySettingsPayload = {
  settings: DeliverySettings;
};

type DeliverySettingsPreflightPayload = {
  preflight: {
    status: "ready" | "needs_configuration" | "connection_failed";
    smtp_ready: boolean;
    can_send: boolean;
    checks: Array<{
      name: string;
      status: "passed" | "failed" | "warning" | "skipped";
      message: string;
    }>;
  };
};

type DeliveryPreflightPayload = {
  preflight: DeliveryPreflight;
};

type DeliveryDispatchPayload = {
  preflight: DeliveryPreflight;
  run: {
    id: string;
    status: "pending" | "running" | "partial_success" | "failed" | "canceled" | "completed";
  };
  log: DeliveryLog;
};

type DeliveryLogListPayload = {
  items: DeliveryLog[];
  page?: ListPage;
};

type ItemStatePatch = Partial<Pick<Item, "is_read" | "is_favorite" | "is_archived" | "digest_candidate">> & {
  library_action?: "save" | "unsave" | "archive" | "restore";
};

type ItemMutationPayload = {
  item: Item;
};

type WorkspaceProfilePayload = {
  profile: WorkspaceProfile;
};

type WorkspaceBriefingPayload = {
  briefing: WorkspaceBriefing;
};

type WorkspaceRankingPayload = {
  generated_at: string;
  items: WorkspaceRankingItem[];
};

type WorkspaceAnnotationListPayload = {
  items: WorkspaceAnnotation[];
};

type WorkspaceAnnotationMutationPayload = {
  annotation: WorkspaceAnnotation;
};

type WorkspaceTagListPayload = {
  items: WorkspaceTag[];
};

type WorkspaceItemTagPayload = {
  item_id: string;
  tags: WorkspaceTag[];
};

type WorkspaceCollectionListPayload = {
  items: WorkspaceCollection[];
};

type WorkspaceCollectionMutationPayload = {
  collection: WorkspaceCollection;
};

type WorkspaceSavedSearchListPayload = {
  items: WorkspaceSavedSearch[];
};

type WorkspaceSourceHealthPayload = {
  items: WorkspaceSourceHealthEntry[];
};

type WorkspaceSourceGroupListPayload = {
  items: WorkspaceSourceGroup[];
};

type WorkspaceSourceGroupMutationPayload = {
  group: WorkspaceSourceGroup;
};

type WorkspaceChannelControlPayload = {
  control: WorkspaceSourceHealthEntry["control"];
};

type WorkspaceStoryClusterPayload = {
  items: WorkspaceStoryCluster[];
};

type WorkspaceCapturePayload = {
  item: WorkspaceItemCard;
};

type WorkspaceContinuityItem = WorkspaceItemCard & {
  is_archived: boolean;
};

type WorkspaceItemTagAssignment = {
  item_id: string;
  tag_id: string;
  tag_name: string;
};

type WorkspaceCollectionItemAssignment = {
  collection_id: string;
  item_id: string;
};

type WorkspaceExportPayload = {
  exported_at: string;
  profile: WorkspaceProfile;
  sources_opml: string;
  annotations: WorkspaceAnnotation[];
  tags: WorkspaceTag[];
  collections: WorkspaceCollection[];
  saved_searches: WorkspaceSavedSearch[];
  saved_items: WorkspaceItemCard[];
  continuity_items: WorkspaceContinuityItem[];
  item_tags: WorkspaceItemTagAssignment[];
  collection_items: WorkspaceCollectionItemAssignment[];
};

type WorkspaceContinuityImportPayload = {
  imported_source_count: number;
  duplicate_source_count: number;
  matched_item_count: number;
  unmatched_item_count: number;
  restored_read_count: number;
  restored_saved_count: number;
  restored_digest_count: number;
  restored_archive_count: number;
  restored_annotation_count: number;
  restored_tag_assignment_count: number;
  restored_collection_count: number;
  restored_collection_item_count: number;
  restored_saved_search_count: number;
  matched_items: Array<{
    source_url: string;
    item_id: string;
    title: string;
    matched_by: "normalized_source_url";
  }>;
  unmatched_source_urls: string[];
};

type WorkspaceOpmlImportPayload = {
  imported_count: number;
  duplicate_count: number;
  channels: string[];
};

type FeedbackState =
  | {
      tone: "idle";
      title: string;
      lines: string[];
    }
  | {
      tone: "success" | "error";
      title: string;
      lines: string[];
    };

type ReaderStatus = "loading" | "ready" | "error" | "unsupported";

type ItemSortMode = "newest" | "oldest";
type ViewDensity = "comfortable" | "compact";
type ReaderWidthMode = "narrow" | "comfortable" | "wide";
type ReaderTextMode = "standard" | "large";
type ReaderImageMode = "safe" | "immersive";
type RecallWindow = "all" | "today" | "week";

type ViewPreference = {
  sort: ItemSortMode;
  density: ViewDensity;
  showReadItems: boolean;
};

type FeedFilter =
  | { kind: "all" }
  | { kind: "category"; value: string }
  | { kind: "channel"; value: string };

type ReaderProgressSnapshot = {
  progress: number;
  scrollTop: number;
  updatedAt: string;
};

type ReaderContinuitySnapshot = {
  section: AppSection;
  activeItemId: string | null;
  readingItemId: string | null;
  showReadItems: boolean;
  libraryView: LibraryView;
  itemSearch: string;
};

type PendingContinuityRouteRestore = {
  href: string;
  section: AppSection;
  continuity: ReaderContinuitySnapshot;
};

type ReaderQualityState = {
  kind: "loading" | "cleaned" | "text_fallback" | "raw_only" | "excerpt_only" | "source_only";
  badge: string;
  heading: string;
  description: string;
  allowsInApp: boolean;
  actionLabel: string;
};

type ReaderCommandGroup = {
  title: string;
  items: Array<{
    keys: string;
    label: string;
    note: string;
  }>;
};

type UndoOperation = {
  item: Item;
  patch: ItemStatePatch;
};

type UndoEntry = {
  id: string;
  label: string;
  operations: UndoOperation[];
};

const initialFeedback: FeedbackState = {
  tone: "idle",
  title: "Import feedow gotowy",
  lines: [
    "Dodaj adres feedu albo strony glownej, a potem uruchom reczny sync.",
    "Kolejka czytnika po lewej wypelni sie po pierwszym udanym syncu.",
  ],
};

const terminalSyncStates = new Set<SyncRun["status"]>(["partial_success", "failed", "canceled", "completed"]);

const readerPreferenceKeys = {
  compact: "rssmaster.reader.compact-list",
  focused: "rssmaster.reader.focused-mode",
  width: "rssmaster.reader.width-mode",
  textMode: "rssmaster.reader.text-mode",
  imageMode: "rssmaster.reader.image-mode",
  continuity: "rssmaster.reader.continuity",
  progress: "rssmaster.reader.progress",
  viewPreferences: "rssmaster.reader.view-preferences",
} as const;

const defaultViewPreferences: Record<LibraryView, ViewPreference> = {
  inbox: {
    sort: "newest",
    density: "comfortable",
    showReadItems: false,
  },
  continue: {
    sort: "newest",
    density: "comfortable",
    showReadItems: true,
  },
  saved: {
    sort: "newest",
    density: "compact",
    showReadItems: true,
  },
  digest: {
    sort: "newest",
    density: "compact",
    showReadItems: true,
  },
  archive: {
    sort: "oldest",
    density: "compact",
    showReadItems: true,
  },
};

const shortcutHints = [
  { key: "J / Down", label: "nastepny" },
  { key: "K / Up", label: "poprzedni" },
  { key: "M", label: "przeczytany" },
  { key: "F", label: "zapisz" },
  { key: "D", label: "digest" },
  { key: "Shift + M/F/D", label: "akcja + dalej" },
  { key: "S", label: "widok zapisanych" },
  { key: "E", label: "widok archiwum" },
  { key: "X", label: "zaznacz" },
  { key: "*", label: "zaznacz wszystko" },
  { key: "?", label: "pomoc" },
  { key: "/", label: "szukaj" },
  { key: "U / A", label: "filtr" },
  { key: "C", label: "gestosc" },
  { key: "Z", label: "tryb focus" },
];

const commandGroups: ReaderCommandGroup[] = [
  {
    title: "Nawigacja",
    items: [
      { keys: "J / Down", label: "Nastepny artykul", note: "Przejdz nizej w biezacej kolejce." },
      { keys: "K / Up", label: "Poprzedni artykul", note: "Przejdz wyzej bez zmiany stanu czytania." },
      { keys: "O", label: "Otworz zrodlo", note: "Otworz oryginalny artykul w nowej karcie." },
      { keys: "/", label: "Przejdz do szukania", note: "Od razu ustaw fokus na wyszukiwaniu kolejki." },
    ],
  },
  {
    title: "Selekcja",
    items: [
      { keys: "M", label: "Przelacz przeczytane", note: "Oznacz aktywny artykul jako przeczytany albo nieprzeczytany." },
      { keys: "F", label: "Przelacz zapisanie", note: "Dodaj lub usun artykul z zapisanych." },
      { keys: "D", label: "Przelacz digest", note: "Dodaj lub usun artykul z kolejki digestu." },
      { keys: "Shift + M", label: "Przeczytaj i dalej", note: "Oznacz jako przeczytany i przejdz dalej jednym ruchem." },
      { keys: "Shift + F", label: "Zapisz i dalej", note: "Zapisz artykul i przejdz dalej." },
      { keys: "Shift + D", label: "Do digestu i dalej", note: "Dodaj do digestu i kontynuuj przeglad." },
    ],
  },
  {
    title: "Zaznaczanie",
    items: [
      { keys: "X", label: "Zaznacz aktywny", note: "Dodaj lub usun aktywny artykul z akcji zbiorczych." },
      { keys: "*", label: "Zaznacz widoczne", note: "Zaznacz cala aktualnie widoczna kolejke jednym ruchem." },
      { keys: "Esc", label: "Wyczysc zaznaczenie", note: "Zamknij zaznaczenie, wyszukiwarke albo nakladke." },
      { keys: "?", label: "Pomoc klawiatury", note: "Otworz mape komend bez wychodzenia z aplikacji." },
    ],
  },
  {
    title: "Widoki",
    items: [
      { keys: "U / A", label: "Nieprzeczytane lub wszystkie", note: "Przelaczaj miedzy nieprzeczytanymi a pelna kolejka." },
      { keys: "S", label: "Widok zapisanych", note: "Przelaczaj miedzy Skrzynka a Zapisane." },
      { keys: "E", label: "Widok archiwum", note: "Otworz archiwum bez wychodzenia z czytnika." },
      { keys: "C", label: "Zwarta lista", note: "Przelaczaj miedzy gesta a wygodna lista." },
      { keys: "Z", label: "Tryb focus", note: "Ukryj boczne panele dla czystszej powierzchni czytania." },
    ],
  },
];

function isErrorEnvelope(payload: unknown): payload is ApiErrorEnvelope {
  return typeof payload === "object" && payload !== null && "error" in payload;
}

function hasDetailMessage(payload: unknown): payload is FallbackErrorPayload {
  return typeof payload === "object" && payload !== null && "detail" in payload;
}

function sleep(delayMs: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function parseStoredJson(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isUnsupportedEndpoint(status: number) {
  return status === 404 || status === 405 || status === 501;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function splitReaderParagraphs(text: string | null | undefined) {
  if (!text) {
    return [];
  }

  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function countWords(text: string | null | undefined) {
  if (!text) {
    return 0;
  }

  return text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function getRowContentState(item: Pick<Item, "has_cleaned_content" | "has_raw_content" | "excerpt">) {
  if (item.has_cleaned_content) {
    return {
      label: "Czysty",
      tone: "clean",
    };
  }

  if (item.has_raw_content && item.excerpt) {
    return {
      label: "Czesciowy",
      tone: "partial",
    };
  }

  if (item.excerpt) {
    return {
      label: "Skrot",
      tone: "excerpt",
    };
  }

  return {
    label: "Zrodlo",
    tone: "source",
  };
}

function matchesLibraryView(item: Pick<Item, "library" | "digest_candidate">, view: LibraryView) {
  if (view === "archive") {
    return item.library.state === "archived";
  }
  if (view === "digest") {
    return item.digest_candidate && item.library.state !== "archived";
  }
  if (view === "saved") {
    return item.library.state === "saved";
  }
  if (view === "continue") {
    return item.library.state === "inbox";
  }
  return item.library.state === "inbox";
}

function getLibraryViewLabel(view: LibraryView) {
  if (view === "continue") {
    return "Kontynuuj";
  }
  if (view === "saved") {
    return "Zapisane";
  }
  if (view === "digest") {
    return "Kolejka digestu";
  }
  if (view === "archive") {
    return "Archiwum";
  }
  return "Skrzynka";
}

function getSearchFieldLabel(field: NonNullable<Item["search_match"]>["fields"][number]) {
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

function getSortLabel(sort: ItemSortMode) {
  return sort === "oldest" ? "Od najstarszych" : "Od najnowszych";
}

function normalizeViewPreference(
  value: unknown,
  fallback: ViewPreference,
): ViewPreference {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Partial<ViewPreference>;
  return {
    sort: candidate.sort === "oldest" ? "oldest" : candidate.sort === "newest" ? "newest" : fallback.sort,
    density: candidate.density === "comfortable" || candidate.density === "compact" ? candidate.density : fallback.density,
    showReadItems: typeof candidate.showReadItems === "boolean" ? candidate.showReadItems : fallback.showReadItems,
  };
}

function normalizeViewPreferences(
  value: unknown,
  { legacyCompact }: { legacyCompact: boolean },
): Record<LibraryView, ViewPreference> {
  const source =
    value && typeof value === "object"
      ? (value as Partial<Record<LibraryView, Partial<ViewPreference>>>)
      : {};
  const defaults = {
    inbox: {
      ...defaultViewPreferences.inbox,
      density: legacyCompact ? "compact" : defaultViewPreferences.inbox.density,
    },
    continue: {
      ...defaultViewPreferences.continue,
      density: legacyCompact ? "compact" : defaultViewPreferences.continue.density,
    },
    saved: {
      ...defaultViewPreferences.saved,
      density: legacyCompact ? "compact" : defaultViewPreferences.saved.density,
    },
    digest: {
      ...defaultViewPreferences.digest,
      density: legacyCompact ? "compact" : defaultViewPreferences.digest.density,
    },
    archive: {
      ...defaultViewPreferences.archive,
      density: legacyCompact ? "compact" : defaultViewPreferences.archive.density,
    },
  } satisfies Record<LibraryView, ViewPreference>;

  return {
    inbox: normalizeViewPreference(source.inbox, defaults.inbox),
    continue: normalizeViewPreference(source.continue, defaults.continue),
    saved: normalizeViewPreference(source.saved, defaults.saved),
    digest: normalizeViewPreference(source.digest, defaults.digest),
    archive: normalizeViewPreference(source.archive, defaults.archive),
  };
}

function patchViewPreferenceMap(
  current: Record<LibraryView, ViewPreference>,
  view: LibraryView,
  patch: Partial<ViewPreference>,
): Record<LibraryView, ViewPreference> {
  return {
    ...current,
    [view]: {
      ...current[view],
      ...patch,
    },
  };
}

function filterVisibleSelection(selectedItemIds: string[], queueItems: Item[]) {
  return selectedItemIds.filter((itemId) => queueItems.some((item) => item.id === itemId));
}

function resolveActiveQueueItemId(activeItemId: string | null, queueItems: Item[], preserveMissingActiveItemId = false) {
  if (queueItems.length === 0) {
    return preserveMissingActiveItemId ? activeItemId : null;
  }

  if (activeItemId && queueItems.some((item) => item.id === activeItemId)) {
    return activeItemId;
  }

  if (preserveMissingActiveItemId && activeItemId) {
    return activeItemId;
  }

  return queueItems[0].id;
}

function getChannelHealthTone(status: ChannelHealth["status"] | undefined) {
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

function getPreviewTitle(payload: ChannelPreviewPayload) {
  if (payload.status === "already_subscribed") {
    return "Zrodlo juz istnieje";
  }
  if (payload.status === "multiple_candidates") {
    return "Wybierz wykryty feed";
  }
  return "Podglad zrodla gotowy";
}

function getSourceDiscoveryModeLabel(mode: ChannelPreviewPayload["discovery"]["mode"] | undefined) {
  if (mode === "direct") {
    return "Bezposredni feed";
  }
  if (mode === "head_metadata") {
    return "Autodetect w stronie";
  }
  if (mode === "heuristic") {
    return "Heurystyka";
  }
  return "Autodetect";
}

function isSourcePreviewMode(mode: SourceAddModeId) {
  return mode === "website" || mode === "web_feed";
}

function getSourceLanguageLabel(language: string | null | undefined) {
  if (!language) {
    return "Bez oznaczenia jezyka";
  }
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return "Bez oznaczenia jezyka";
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

function getSourceHostLabel(value: string | null | undefined) {
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

function SourceIdentityMark({
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

function getChannelStateLabel(state: Channel["state"]) {
  if (state === "active") {
    return "Aktywny";
  }
  if (state === "inactive") {
    return "Nieaktywny";
  }
  return "Zarchiwizowany";
}

function getHealthStatusLabel(status: ChannelHealth["status"] | WorkspaceSourceHealthEntry["health_status"] | undefined) {
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

function getSyncRunStatusLabel(status: SyncRun["status"] | string) {
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

function getSyncRunSummaryLine(run: SyncRun | null) {
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

function getDigestStatusLabel(status: string) {
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

function getDeliveryStatusLabel(status: string) {
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

function getExtractionStatusLabel(status: string) {
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

function compareIsoTimestampsDesc(left: string | null | undefined, right: string | null | undefined) {
  const leftValue = left ? Date.parse(left) : 0;
  const rightValue = right ? Date.parse(right) : 0;
  return rightValue - leftValue;
}

function orderQueueItemsWithRanking(
  pool: Item[],
  rankedItems: WorkspaceRankingItem[],
  options: {
    deferredSearch: string;
    libraryView: LibraryView;
    itemSortMode: ItemSortMode;
  },
) {
  if (options.libraryView !== "inbox" || options.itemSortMode !== "newest" || options.deferredSearch.trim()) {
    return pool;
  }

  const rankedIds = new Set(rankedItems.map((entry) => entry.item.id));
  const rankingIndex = new Map(rankedItems.map((entry, index) => [entry.item.id, index]));
  const rankedPool = pool.filter((item) => rankedIds.has(item.id));
  const orderingPool = rankedPool.length > 0 ? rankedPool : pool;

  return [...orderingPool].sort((left, right) => {
    const leftRank = rankingIndex.get(left.id);
    const rightRank = rankingIndex.get(right.id);
    if (leftRank !== undefined || rightRank !== undefined) {
      if (leftRank === undefined) {
        return 1;
      }
      if (rightRank === undefined) {
        return -1;
      }
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
    }
    return compareIsoTimestampsDesc(left.published_at, right.published_at);
  });
}

function mapProfileToRankingPreferences(profile: WorkspaceProfile | null): RankingPreference<string>[] {
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

function mapSavedSearchToChip(
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

function mapSourceHealthCard(entry: WorkspaceSourceHealthEntry): SourceHealthCardModel {
  return {
    id: entry.channel_id,
    title: entry.title,
    category: entry.category,
    state: entry.state === "inactive" || entry.state === "archived" ? entry.state : "active",
    feedUrl: entry.feed_url,
    unreadCount: entry.unread_count,
    health: {
      status: entry.health_status,
      summary: entry.health_summary,
      indicators: [entry.control.tier, entry.group_name ?? "bez grupy"].filter(Boolean),
      pausedUntil: entry.control.paused_until,
    } as SourceHealthCardModel["health"],
  };
}

function mapAnnotationsToPanel(
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

function getPublishedAfterForRecallWindow(recallWindow: RecallWindow): string | null {
  const now = new Date();
  if (recallWindow === "today") {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay.toISOString();
  }
  if (recallWindow === "week") {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return sevenDaysAgo.toISOString();
  }
  return null;
}

function dedupeStoryQueue(pool: Item[], enabled: boolean) {
  if (!enabled) {
    return pool;
  }

  const seenClusters = new Set<string>();
  return pool.filter((item) => {
    if (!item.story_cluster_id) {
      return true;
    }
    if (seenClusters.has(item.story_cluster_id)) {
      return false;
    }
    seenClusters.add(item.story_cluster_id);
    return true;
  });
}

function legacySanitizeReaderHtml(cleanedHtml: string | null | undefined, articleTitle?: string | null) {
  if (!cleanedHtml) {
    return null;
  }

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return cleanedHtml;
  }

  const documentRoot = new DOMParser().parseFromString(`<article>${cleanedHtml}</article>`, "text/html");
  const container = documentRoot.body.firstElementChild;
  if (!(container instanceof HTMLElement)) {
    return cleanedHtml;
  }

  const normalizedTitle = articleTitle ? normalizeReaderText(articleTitle).toLocaleLowerCase("pl-PL") : null;
  const nodes = Array.from(container.querySelectorAll("p, li, blockquote, h2, h3, h4"));
  const nodeTexts = nodes.map((node) => normalizeReaderText(node.textContent ?? ""));

  for (const [index, node] of nodes.entries()) {
    if (shouldDropReaderParagraph(nodeTexts, index, normalizedTitle)) {
      node.remove();
    }
  }

  legacyEnhanceReaderHtml(container);

  return container.innerHTML;
}

function legacyEnhanceReaderHtml(container: HTMLElement) {
  container.querySelectorAll("script, style, noscript, iframe, object, embed, form, input, button, select, textarea, canvas").forEach((node) => {
    node.remove();
  });

  container.querySelectorAll("p").forEach((paragraph) => {
    const elementChildren = Array.from(paragraph.children);
    const hasOnlyStandaloneMedia =
      elementChildren.length === 1 &&
      paragraph.textContent !== null &&
      normalizeReaderText(paragraph.textContent) === "" &&
      ["IMG", "PICTURE"].includes(elementChildren[0]?.tagName ?? "");

    if (!hasOnlyStandaloneMedia) {
      return;
    }

    const figure = document.createElement("figure");
    figure.className = "reader-article-figure";
    paragraph.replaceWith(figure);
    figure.append(elementChildren[0]);
  });

  container.querySelectorAll("figure").forEach((figure) => {
    figure.classList.add("reader-article-figure");
  });

  container.querySelectorAll("figcaption").forEach((figcaption) => {
    figcaption.classList.add("reader-article-caption");
  });

  container.querySelectorAll("img").forEach((image) => {
    const src = image.getAttribute("src")?.trim();
    if (!src) {
      image.remove();
      return;
    }

    image.classList.add("reader-article-image");
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
    image.setAttribute("referrerpolicy", "no-referrer");
    if (!image.getAttribute("alt")) {
      image.setAttribute("alt", "");
    }
  });

  container.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href")?.trim();
    if (!href) {
      return;
    }

    link.classList.add("reader-article-link");
    link.setAttribute("rel", "noopener noreferrer");
  });

  container.querySelectorAll("blockquote").forEach((blockquote) => {
    blockquote.classList.add("reader-article-quote");
  });

  container.querySelectorAll("hr").forEach((hr) => {
    hr.classList.add("reader-article-divider");
  });

  container.querySelectorAll("ul, ol").forEach((list) => {
    list.classList.add("reader-article-list");
  });

  container.querySelectorAll("pre").forEach((pre) => {
    pre.classList.add("reader-article-pre");
  });

  container.querySelectorAll("code").forEach((code) => {
    if (code.parentElement?.tagName !== "PRE") {
      code.classList.add("reader-article-inline-code");
    }
  });

  container.querySelectorAll("table").forEach((table) => {
    table.classList.add("reader-article-table");
    const parent = table.parentElement;
    if (parent?.classList.contains("reader-article-table-shell")) {
      return;
    }

    const shell = document.createElement("div");
    shell.className = "reader-article-table-shell";
    parent?.insertBefore(shell, table);
    shell.append(table);
  });
}

function legacyRenderInlineHighlightHtml(
  cleanedHtml: string | null | undefined,
  annotations: WorkspaceAnnotation[],
): string | null {
  if (!cleanedHtml) {
    return null;
  }

  const highlightAnnotations = annotations.filter(
    (annotation) => annotation.kind === "highlight" && annotation.quote_text?.trim(),
  );
  if (highlightAnnotations.length === 0) {
    return cleanedHtml;
  }

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return cleanedHtml;
  }

  const documentRoot = new DOMParser().parseFromString(`<article>${cleanedHtml}</article>`, "text/html");
  const container = documentRoot.body.firstElementChild;
  if (!(container instanceof HTMLElement)) {
    return cleanedHtml;
  }

  for (const annotation of highlightAnnotations) {
    legacyApplyInlineHighlight(container, annotation.quote_text!.trim(), annotation.id);
  }

  return container.innerHTML;
}

function legacyApplyInlineHighlight(root: HTMLElement, quote: string, annotationId: string) {
  if (!quote) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (currentNode instanceof Text && currentNode.parentElement?.closest("mark[data-annotation-id]") === null) {
      textNodes.push(currentNode);
    }
    currentNode = walker.nextNode();
  }

  const normalizedQuote = quote.replace(/\s+/g, " ").trim();
  for (const textNode of textNodes) {
    const originalText = textNode.textContent ?? "";
    const normalizedText = originalText.replace(/\s+/g, " ");
    const startIndex = normalizedText.indexOf(normalizedQuote);
    if (startIndex < 0) {
      continue;
    }

    const rawStartIndex = originalText.indexOf(normalizedQuote);
    if (rawStartIndex < 0) {
      continue;
    }

    const before = originalText.slice(0, rawStartIndex);
    const match = originalText.slice(rawStartIndex, rawStartIndex + normalizedQuote.length);
    const after = originalText.slice(rawStartIndex + normalizedQuote.length);
    const fragment = document.createDocumentFragment();

    if (before) {
      fragment.append(document.createTextNode(before));
    }

    const mark = document.createElement("mark");
    mark.className = "reader-inline-highlight";
    mark.dataset.annotationId = annotationId;
    mark.textContent = match;
    fragment.append(mark);

    if (after) {
      fragment.append(document.createTextNode(after));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
    return;
  }
}

function applyItemPatch<T extends Item | ItemDetail>(item: T, patch: ItemStatePatch): T {
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

function buildUndoPatch(before: Item, after: Item): ItemStatePatch | null {
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

function describeItemMutation(patch: ItemStatePatch) {
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

function getReaderQualityState(
  item: Item,
  detail: ItemDetail | null,
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
      description: "Metadane kolejki sa widoczne, ale do czasu dostarczenia szczegolow artykulu najpewniejszym fallbackiem jest oryginalne zrodlo.",
      allowsInApp: false,
      actionLabel: "Otworz zrodlo",
    };
  }

  if (hasLoadedDetail && detail?.cleaned_html) {
    return {
      kind: "cleaned",
      badge: "Oczyszczony artykul",
      heading: "Premium copy do czytania jest gotowe",
      description: "Ten artykul ma dostepny oczyszczony HTML, wiec mozesz czytac lokalna wersje bez reklam i elementow zrodla.",
      allowsInApp: true,
      actionLabel: "Czytaj oczyszczony artykul",
    };
  }

  if (hasLoadedDetail && detail?.content_text) {
    return {
      kind: "text_fallback",
      badge: "Fallback tekstowy",
      heading: "Dostepny jest czytelny fallback tekstowy",
      description: "Ekstrakcja zachowala tekst artykulu, ale nie pelna oczyszczona strukture. Aplikacja nadal utrzymuje lokalny flow czytania.",
      allowsInApp: true,
      actionLabel: "Czytaj fallback tekstowy",
    };
  }

  if (item.has_raw_content && item.excerpt) {
    return {
      kind: "raw_only",
      badge: "Slaba ekstrakcja",
      heading: "Ekstrakcja jest slaba, ale UI nadal jest bezpieczne",
      description: "rssmaster przechwycil material zrodla, ale oczyszczony rendering nie jest tu jeszcze wystarczajaco wiarygodny. Aplikacja schodzi do skrotu i daje latwe wyjscie do zrodla.",
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

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getPayloadMessage(payload: unknown, fallback: string) {
  if (isErrorEnvelope(payload)) {
    return payload.error?.message ?? fallback;
  }
  if (hasDetailMessage(payload) && typeof payload.detail === "string") {
    return payload.detail;
  }
  return fallback;
}

function isAuthRequiredPayload(payload: unknown): payload is ApiErrorEnvelope {
  return isErrorEnvelope(payload) && payload.error?.code === "auth_required";
}

function isAuthSessionPayload(payload: unknown): payload is AuthSessionPayload {
  return typeof payload === "object" && payload !== null && "auth_required" in payload && "has_accounts" in payload;
}

function formatTimestamp(value: string | null | undefined, fallback: string) {
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

function ReaderItemRow({
  channelTitle,
  compact,
  isActive,
  isBusy,
  isSelectedForBulk,
  item,
  itemNumber,
  onSelect,
  onToggleBulk,
  onToggleDigest,
  onToggleFavorite,
  onToggleRead,
  progressPercent,
  registerRow,
}: {
  channelTitle: string;
  compact: boolean;
  isActive: boolean;
  isBusy: boolean;
  isSelectedForBulk: boolean;
  item: Item;
  itemNumber: number;
  onSelect: () => void;
  onToggleBulk: () => void;
  onToggleDigest: () => void;
  onToggleFavorite: () => void;
  onToggleRead: () => void;
  progressPercent?: number;
  registerRow: (node: HTMLLIElement | null) => void;
}) {
  const shouldShowActions = isActive || !compact;
  const contentState = getRowContentState(item);

  return (
    <li
      aria-selected={isActive}
      className={`reader-item-row ${isActive ? "reader-item-row-active" : ""} ${compact ? "reader-item-row-compact" : ""} ${isSelectedForBulk ? "reader-item-row-selected" : ""}`}
      onClick={onSelect}
      ref={registerRow}
    >
      <div
        className="reader-item-select"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <input
          aria-label={`Zaznacz ${item.title}`}
          checked={isSelectedForBulk}
          onChange={onToggleBulk}
          type="checkbox"
        />
      </div>

      <div className="reader-item-order">
        <span>{String(itemNumber).padStart(2, "0")}</span>
        {isActive ? <strong>Na zywo</strong> : null}
      </div>

      <div className="reader-item-main">
        <div className="reader-item-heading">
          <strong>{item.title}</strong>
          <div className="reader-item-flags">
            {!item.is_read ? <span className="reader-flag reader-flag-new">Nieprzeczytane</span> : null}
            {item.is_favorite ? <span className="reader-flag reader-flag-favorite">Zapisane</span> : null}
            {item.digest_candidate ? <span className="reader-flag">Digest</span> : null}
            <span className={`reader-flag reader-flag-${contentState.tone}`}>{contentState.label}</span>
            {progressPercent && progressPercent > 2 ? (
              <span className="reader-flag reader-flag-progress">{progressPercent}%</span>
            ) : null}
          </div>
        </div>

        <div className="reader-item-meta">
          <span>{channelTitle}</span>
          <span>{formatTimestamp(item.published_at, "Nieznany czas publikacji")}</span>
          <span>{item.author ? item.author : "Autor nieznany"}</span>
        </div>

        {item.search_match ? (
          <div className="reader-search-cues">
            {item.search_match.fields.map((field) => (
              <span className="reader-flag reader-flag-search" key={`${item.id}-${field}`}>
                {getSearchFieldLabel(field)}
              </span>
            ))}
          </div>
        ) : null}

        {!compact ? (
          <p>
            {item.search_match?.snippet
              ? item.search_match.snippet
              : item.excerpt
                ? item.excerpt
                : "Brak skrotu. Otworz adres zrodla, aby zobaczyc oryginalny tekst artykulu."}
          </p>
        ) : null}
      </div>

      {shouldShowActions ? (
        <div className="reader-item-actions">
          <button
            className="mini-button"
            disabled={isBusy}
            onClick={(event) => {
              event.stopPropagation();
              onToggleRead();
            }}
            type="button"
          >
            {item.is_read ? "Nieprzeczytane" : "Przeczytane"}
          </button>
          <button
            className="mini-button"
            disabled={isBusy}
            onClick={(event) => {
              event.stopPropagation();
              onToggleDigest();
            }}
            type="button"
          >
            {item.digest_candidate ? "Usun z digestu" : "Digest"}
          </button>
          <button
            className="mini-button mini-button-accent"
            disabled={isBusy}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            type="button"
          >
            {item.is_favorite ? "Cofnij zapis" : "Zapisz"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function ChannelLab({ apiBaseUrl }: { apiBaseUrl: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authSession, setAuthSession] = useState<AuthSessionPayload | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({
    username: "",
    displayName: "",
    password: "",
  });
  const [inputUrl, setInputUrl] = useState("");
  const [category, setCategory] = useState("");
  const [sourceSurfaceMode, setSourceSurfaceMode] = useState<SourceSurfaceMode>("add");
  const [sourceAddMode, setSourceAddMode] = useState<SourceAddModeId>("website");
  const [showSourceOptions, setShowSourceOptions] = useState(false);
  const [sourceLanguageFilter, setSourceLanguageFilter] = useState("all");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [draftCategories, setDraftCategories] = useState<Record<string, string>>({});
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [undoEntries, setUndoEntries] = useState<UndoEntry[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [itemsStatus, setItemsStatus] = useState<ReaderStatus>("loading");
  const [itemsMessage, setItemsMessage] = useState<string | null>(null);
  const [itemsPage, setItemsPage] = useState<ListPage | null>(null);
  const [itemsRefreshing, setItemsRefreshing] = useState(false);
  const [itemActionId, setItemActionId] = useState<string | null>(null);
  const [itemDetail, setItemDetail] = useState<ItemDetail | null>(null);
  const [itemDetailStatus, setItemDetailStatus] = useState<ReaderStatus>("loading");
  const [itemDetailMessage, setItemDetailMessage] = useState<string | null>(null);
  const [readingItemId, setReadingItemId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showReadInspector, setShowReadInspector] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>({ kind: "all" });
  const [collapsedFeedFolders, setCollapsedFeedFolders] = useState<string[]>([]);
  const [readSurfaceMode, setReadSurfaceMode] = useState<"browse" | "article">("browse");
  const [readerWidthMode, setReaderWidthMode] = useState<ReaderWidthMode>("comfortable");
  const [readerTextMode, setReaderTextMode] = useState<ReaderTextMode>("standard");
  const [readerImageMode, setReaderImageMode] = useState<ReaderImageMode>("safe");
  const [readerProgress, setReaderProgress] = useState<Record<string, ReaderProgressSnapshot>>({});
  const [itemSortMode, setItemSortMode] = useState<ItemSortMode>("newest");
  const [showReadItems, setShowReadItems] = useState(false);
  const [libraryView, setLibraryView] = useState<LibraryView>("inbox");
  const [viewPreferences, setViewPreferences] = useState<Record<LibraryView, ViewPreference>>(defaultViewPreferences);
  const [channelPreview, setChannelPreview] = useState<ChannelPreviewPayload | null>(null);
  const [digestPreview, setDigestPreview] = useState<DigestPreview | null>(null);
  const [digestHistory, setDigestHistory] = useState<DigestHistory[]>([]);
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings | null>(null);
  const [deliverySettingsMessage, setDeliverySettingsMessage] = useState<string | null>(null);
  const [deliveryPreflight, setDeliveryPreflight] = useState<DeliveryPreflight | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);
  const [settingsDraft, setSettingsDraft] = useState({
    smtp_host: "",
    smtp_port: "587",
    smtp_username: "",
    smtp_password: "",
    smtp_from: "",
    kindle_email: "",
  });
  const [digestBusy, setDigestBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFocusedMode, setIsFocusedMode] = useState(false);
  const [isCompactList, setIsCompactList] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferredSection, setPreferredSection] = useState<AppSection>("read");
  const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceProfile | null>(null);
  const [workspaceBriefing, setWorkspaceBriefing] = useState<WorkspaceBriefing | null>(null);
  const [rankingItems, setRankingItems] = useState<WorkspaceRankingItem[]>([]);
  const [sourceHealthEntries, setSourceHealthEntries] = useState<WorkspaceSourceHealthEntry[]>([]);
  const [sourceGroups, setSourceGroups] = useState<WorkspaceSourceGroup[]>([]);
  const [storyClusters, setStoryClusters] = useState<WorkspaceStoryCluster[]>([]);
  const [itemAnnotations, setItemAnnotations] = useState<WorkspaceAnnotation[]>([]);
  const [annotationHubItems, setAnnotationHubItems] = useState<WorkspaceAnnotation[]>([]);
  const [itemTags, setItemTags] = useState<WorkspaceTag[]>([]);
  const [tagCatalog, setTagCatalog] = useState<WorkspaceTag[]>([]);
  const [collections, setCollections] = useState<WorkspaceCollection[]>([]);
  const [savedSearches, setSavedSearches] = useState<WorkspaceSavedSearch[]>([]);
  const [interestDraft, setInterestDraft] = useState("");
  const [interestWeight, setInterestWeight] = useState<WorkspaceInterest["weight"]>(1);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [annotationHubQuery, setAnnotationHubQuery] = useState("");
  const [annotationHubLoading, setAnnotationHubLoading] = useState(false);
  const [selectedTextQuote, setSelectedTextQuote] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [collectionDraft, setCollectionDraft] = useState("");
  const [sourceGroupDraft, setSourceGroupDraft] = useState("");
  const [sourceGroupColor, setSourceGroupColor] = useState("#155e75");
  const [captureUrl, setCaptureUrl] = useState("");
  const [opmlDraft, setOpmlDraft] = useState("");
  const [captureBusy, setCaptureBusy] = useState(false);
  const [opmlImportBusy, setOpmlImportBusy] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceExportBusy, setWorkspaceExportBusy] = useState(false);
  const [workspaceImportBusy, setWorkspaceImportBusy] = useState(false);
  const [recallWindow, setRecallWindow] = useState<RecallWindow>("all");
  const [storyQueueGrouped, setStoryQueueGrouped] = useState(true);
  const [expandedStoryClusterIds, setExpandedStoryClusterIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const routeState = useMemo(() => parseAppPath(pathname ?? "/"), [pathname]);
  const searchParams = useSearchParams();
  const currentSection = routeState.section ?? preferredSection;
  const authRequired = authSession?.auth_required ?? false;
  const hasLocalAccounts = authSession?.has_accounts ?? false;
  const authenticatedAccount = authSession?.session?.account ?? null;
  const resolvedAuthMode = !hasLocalAccounts ? "register" : authMode;
  const requestedReadSurface = useMemo(() => {
    const surface = searchParams.get("surface");
    return isAppReadSurface(surface) ? surface : null;
  }, [searchParams]);

  const deferredItemSearch = useDeferredValue(itemSearch);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const itemRowRefs = useRef(new Map<string, HTMLLIElement>());
  const articleContentRef = useRef<HTMLDivElement | null>(null);
  const readingProgressRef = useRef<Record<string, ReaderProgressSnapshot>>({});
  const pendingReaderProgressRestoreRef = useRef<Record<string, true>>({});
  const pendingContinuityRouteRestoreRef = useRef<PendingContinuityRouteRestore | null>(null);
  const lastReadLibraryViewRef = useRef<LibraryView>(libraryView);
  const lastReadShowReadItemsRef = useRef(showReadItems);
  const applyingViewPreferenceRef = useRef(false);
  const sourcePreviewRequestIdRef = useRef(0);
  const sourcePreviewAbortRef = useRef<AbortController | null>(null);
  const lastSourcePreviewKeyRef = useRef<string | null>(null);

  function getReaderScrollSnapshot(surface: HTMLDivElement) {
    const computedStyle = window.getComputedStyle(surface);
    const usesDocumentScroll =
      computedStyle.overflowY === "visible" || Math.abs(surface.scrollHeight - surface.clientHeight) < 4;

    if (usesDocumentScroll) {
      const scrollElement = document.scrollingElement ?? document.documentElement;
      const maxScroll = Math.max(scrollElement.scrollHeight - scrollElement.clientHeight, 0);
      return {
        scrollTop: scrollElement.scrollTop,
        maxScroll,
        target: "document" as const,
      };
    }

    return {
      scrollTop: surface.scrollTop,
      maxScroll: Math.max(surface.scrollHeight - surface.clientHeight, 0),
      target: "surface" as const,
    };
  }

  function markReaderProgressRestorePending(progressByItemId: Record<string, ReaderProgressSnapshot>) {
    const pendingEntries = Object.keys(progressByItemId).map((itemId) => [itemId, true] as const);
    if (pendingEntries.length === 0) {
      return;
    }
    pendingReaderProgressRestoreRef.current = {
      ...pendingReaderProgressRestoreRef.current,
      ...Object.fromEntries(pendingEntries),
    };
  }
  const previousSourceAddModeRef = useRef<SourceAddModeId>(sourceAddMode);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const continuityImportInputRef = useRef<HTMLInputElement | null>(null);
  const sourceImportTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceCategoryInputRef = useRef<HTMLInputElement | null>(null);
  const sourceResultsRegionRef = useRef<HTMLDivElement | null>(null);
  const sourceBackofficeRegionRef = useRef<HTMLDivElement | null>(null);
  const pendingSourceFocusTargetRef = useRef<"input" | "import" | "category" | "results" | "backoffice" | null>(null);
  const sourcePrimaryModesLabelId = useId();
  const sourceSecondaryActionsLabelId = useId();
  const sourceSearchHintId = useId();
  const sourceSearchOptionsId = useId();
  const sourceSearchOptionsNoteId = useId();
  const sourceResultsHeadingId = useId();
  const sourceResultsRegionId = useId();
  const sourceFeedbackRegionId = useId();
  const sourceBackofficeHeadingId = useId();
  const sourceBackofficeRegionId = useId();
  const libraryScopedItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesLibraryView(item, libraryView)) {
          return false;
        }
        if (libraryView === "continue" && !(readerProgress[item.id]?.progress && readerProgress[item.id].progress > 2)) {
          return false;
        }
        if (!showReadItems && item.is_read) {
          return false;
        }
        return true;
      }),
    [items, libraryView, readerProgress, showReadItems],
  );
  const visibleItems = useMemo(
    () =>
      libraryScopedItems.filter((item) => {
        if (feedFilter.kind === "channel") {
          return item.channel_id === feedFilter.value;
        }
        if (feedFilter.kind === "category") {
          return getFeedFolderId(item.channel.category) === feedFilter.value;
        }
        return true;
      }),
    [feedFilter, libraryScopedItems],
  );
  const queueItems = useMemo(
    () =>
      dedupeStoryQueue(
        orderQueueItemsWithRanking(visibleItems, rankingItems, {
          deferredSearch: deferredItemSearch,
          libraryView: libraryView === "continue" ? "inbox" : libraryView,
          itemSortMode,
        }),
        storyQueueGrouped && (libraryView === "inbox" || libraryView === "continue") && !deferredItemSearch.trim(),
      ),
    [deferredItemSearch, itemSortMode, libraryView, rankingItems, storyQueueGrouped, visibleItems],
  );
  const visibleUnreadCount = useMemo(
    () => queueItems.filter((item) => !item.is_read).length,
    [queueItems],
  );
  const visibleFavoriteCount = useMemo(
    () => queueItems.filter((item) => item.is_favorite).length,
    [queueItems],
  );
  const totalUnreadCount = channels.reduce((sum, channel) => sum + channel.unread_count, 0);
  const continueReadingCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.library.state === "inbox" &&
          typeof readerProgress[item.id]?.progress === "number" &&
          (readerProgress[item.id]?.progress ?? 0) > 2,
      ).length,
    [items, readerProgress],
  );
  const digestCandidateIds = useMemo(
    () => queueItems.filter((item) => item.digest_candidate).map((item) => item.id),
    [queueItems],
  );
  const selectedItem = useMemo(
    () => {
      const activeItem = queueItems.find((item) => item.id === activeItemId) ?? null;
      if (activeItem) {
        return activeItem;
      }
      if (requestedReadSurface === "article" && activeItemId) {
        return null;
      }
      return queueItems[0] ?? null;
    },
    [activeItemId, queueItems, requestedReadSurface],
  );
  const selectedItemIndex = useMemo(
    () => (selectedItem ? queueItems.findIndex((item) => item.id === selectedItem.id) : -1),
    [queueItems, selectedItem],
  );
  const activeChannelCount = channels.filter((channel) => channel.state === "active").length;
  const archivedChannelCount = channels.filter((channel) => channel.state === "archived").length;
  const channelTitles = useMemo(
    () => Object.fromEntries(channels.map((channel) => [channel.id, channel.title])),
    [channels],
  );
  const channelSiteUrls = useMemo(
    () => Object.fromEntries(channels.map((channel) => [channel.id, channel.site_url ?? channel.feed_url])),
    [channels],
  );
  const feedCountsByChannelId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of libraryScopedItems) {
      counts.set(item.channel_id, (counts.get(item.channel_id) ?? 0) + 1);
    }
    return counts;
  }, [libraryScopedItems]);
  const feedBrowserFolders = useMemo(() => {
    return buildFeedBrowserTree(
      channels
        .map((channel) => ({
          id: channel.id,
          label: channel.title,
          category: channel.category,
          siteUrl: channel.site_url ?? channel.feed_url,
          unreadCount: feedCountsByChannelId.get(channel.id) ?? 0,
        }))
        .filter((channel) => channel.unreadCount > 0),
    );
  }, [channels, feedCountsByChannelId]);
  const latestDigest = digestHistory[0] ?? null;
  const selectedBulkItems = useMemo(
    () => queueItems.filter((item) => selectedItemIds.includes(item.id)),
    [queueItems, selectedItemIds],
  );
  const selectedReadingProgress = selectedItem ? readerProgress[selectedItem.id] ?? null : null;
  const latestUndoEntry = undoEntries[undoEntries.length - 1] ?? null;
  const rankingPreferences = useMemo(
    () => mapProfileToRankingPreferences(workspaceProfile),
    [workspaceProfile],
  );
  const savedViewChips = useMemo(
    () => savedSearches.map((search) => mapSavedSearchToChip(search, itemSearch, libraryView)),
    [itemSearch, libraryView, savedSearches],
  );
  const annotationPanelModel = useMemo(
    () => mapAnnotationsToPanel(selectedItem, itemAnnotations, selectedTextQuote),
    [itemAnnotations, selectedItem, selectedTextQuote],
  );

  function pushUndoEntry(entry: UndoEntry) {
    setUndoEntries((current) => [...current.slice(-4), entry]);
  }

  function dismissUndoEntry(entryId: string) {
    setUndoEntries((current) => current.filter((entry) => entry.id !== entryId));
  }

  function upsertRun(run: SyncRun) {
    startTransition(() => {
      setSyncRuns((current) => [run, ...current.filter((candidate) => candidate.id !== run.id)].slice(0, 8));
    });
  }

  async function loadChannels() {
    const { response, payload } = await fetchApi<ChannelListPayload>("/api/v1/channels?limit=200");
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac zapisanych kanalow."));
    }

    startTransition(() => {
      setChannels(payload.items);
      setDraftCategories(Object.fromEntries(payload.items.map((channel) => [channel.id, channel.category ?? ""])));
    });
  }

  async function loadSyncRuns() {
    const { response, payload } = await fetchApi<SyncRunListPayload>("/api/v1/sync/runs");
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac historii syncow."));
    }

    startTransition(() => {
      setSyncRuns(payload.items);
    });
  }

  async function loadDigestHistory() {
    const { response, payload } = await fetchApi<DigestHistoryListPayload>("/api/v1/digests/history?limit=8");
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac historii digestow."));
    }

    startTransition(() => {
      setDigestHistory(payload.items);
    });
  }

  async function loadDeliverySettings() {
    const { response, payload } = await fetchApi<DeliverySettingsPayload>("/api/v1/settings/delivery");
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac ustawien wysylki."));
    }

    startTransition(() => {
      setDeliverySettings(payload.settings);
      setSettingsDraft({
        smtp_host: payload.settings.smtp_host ?? "",
        smtp_port: String(payload.settings.smtp_port ?? 587),
        smtp_username: payload.settings.smtp_username ?? "",
        smtp_password: "",
        smtp_from: payload.settings.smtp_from ?? "",
        kindle_email: payload.settings.kindle_email ?? "",
      });
    });
  }

  async function loadDeliveryLogs(digestId?: string) {
    const params = new URLSearchParams({
      limit: "8",
    });
    if (digestId) {
      params.set("digest_id", digestId);
    }

    const { response, payload } = await fetchApi<DeliveryLogListPayload>(`/api/v1/delivery/logs?${params.toString()}`);
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, "Nie udalo sie wczytac logow wysylki."));
    }

    startTransition(() => {
      setDeliveryLogs(payload.items);
    });
  }

  function handleAuthRequired(message?: string) {
    setAuthSession((current) => ({
      has_accounts: current?.has_accounts ?? true,
      auth_required: true,
      session: null,
    }));
    setAuthStatus("unauthenticated");
    setAuthMessage(message ?? "Zaloguj się, aby otworzyć swoją bibliotekę RSSmaster.");
  }

  async function fetchApi<TPayload = unknown>(path: string, init?: RequestInit) {
    const { headers, ...restInit } = init ?? {};
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...restInit,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
    });
    const payload = (await readResponsePayload(response)) as TPayload | ApiErrorEnvelope;

    if (response.status === 401 && isAuthRequiredPayload(payload)) {
      handleAuthRequired(payload.error?.message ?? "Zaloguj się, aby otworzyć swoją bibliotekę RSSmaster.");
      throw new Error(payload.error?.message ?? "Zaloguj się, aby otworzyć swoją bibliotekę RSSmaster.");
    }

    return {
      response,
      payload,
    };
  }

  async function fetchWorkspace<TPayload>(path: string, init?: RequestInit) {
    const { response, payload } = await fetchApi<TPayload>(path, init);
    if (!response.ok || isErrorEnvelope(payload)) {
      throw new Error(getPayloadMessage(payload, `Workspace request failed for ${path}.`));
    }
    return payload as TPayload;
  }

  async function loadAuthSession() {
    try {
      const { response, payload } = await fetchApi<AuthSessionPayload>("/api/v1/auth/session");
      if (!response.ok || !isAuthSessionPayload(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie sprawdzic lokalnej sesji RSSmaster."));
      }

      setAuthSession(payload);
      setAuthStatus(payload.auth_required && !payload.session ? "unauthenticated" : "ready");
      setAuthMode(payload.has_accounts ? "login" : "register");
      setAuthMessage(null);
    } catch (error) {
      setAuthSession({
        has_accounts: false,
        auth_required: false,
        session: null,
      });
      setAuthStatus("ready");
      setAuthMessage(null);
      setFeedback({
        tone: "error",
        title: "Nie udalo sie sprawdzic sesji",
        lines: [error instanceof Error ? error.message : "Nieznany blad frontendu."],
      });
    }
  }

  async function handleAuthSubmit() {
    const username = authForm.username.trim();
    const password = authForm.password;
    const displayName = authForm.displayName.trim();

    if (!username || !password) {
      setAuthMessage("Podaj nazwę konta i hasło.");
      return;
    }

    if (resolvedAuthMode === "register" && password.length < 8) {
      setAuthMessage("Hasło musi mieć co najmniej 8 znaków.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage(null);

    try {
      const { response, payload } = await fetchApi<AuthSessionPayload>(
        resolvedAuthMode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login",
        {
          method: "POST",
          body: JSON.stringify(
            resolvedAuthMode === "register"
              ? {
                  username,
                  password,
                  display_name: displayName || undefined,
                  claim_legacy_workspace: !hasLocalAccounts,
                }
              : {
                  username,
                  password,
                },
          ),
        },
      );

      if (!response.ok || !isAuthSessionPayload(payload)) {
        throw new Error(
          getPayloadMessage(
            payload,
            resolvedAuthMode === "register"
              ? "Nie udało się utworzyć lokalnego konta."
              : "Nie udało się zalogować do RSSmaster.",
          ),
        );
      }

      setAuthSession(payload);
      setAuthStatus("ready");
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Nieznany blad logowania.");
    } finally {
      setAuthBusy(false);
    }
  }

  function openAuthScreen(mode: "login" | "register") {
    setAuthMode(mode);
    setAuthStatus("unauthenticated");
    setAuthMessage(null);
    setAuthSession((current) => ({
      has_accounts: mode === "login" ? true : (current?.has_accounts ?? false),
      auth_required: mode === "login" ? true : (current?.auth_required ?? false),
      session: null,
    }));
  }

  async function handleLogout() {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      await fetchApi<AuthSessionPayload>("/api/v1/auth/logout", {
        method: "POST",
      });
      setAuthSession({
        has_accounts: true,
        auth_required: true,
        session: null,
      });
      setAuthStatus("unauthenticated");
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Nie udalo sie wylogowac.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function loadWorkspaceOverview() {
    const [
      profileResult,
      briefingResult,
      rankingResult,
      sourceHealthResult,
      sourceGroupResult,
      storyResult,
      tagResult,
      savedSearchResult,
      collectionResult,
    ] = await Promise.allSettled([
      fetchWorkspace<WorkspaceProfilePayload>("/api/v1/workspace/profile"),
      fetchWorkspace<WorkspaceBriefingPayload>("/api/v1/workspace/briefing"),
      fetchWorkspace<WorkspaceRankingPayload>("/api/v1/workspace/ranking?limit=14"),
      fetchWorkspace<WorkspaceSourceHealthPayload>("/api/v1/workspace/source-health"),
      fetchWorkspace<WorkspaceSourceGroupListPayload>("/api/v1/workspace/source-groups"),
      fetchWorkspace<WorkspaceStoryClusterPayload>("/api/v1/workspace/stories?limit=6"),
      fetchWorkspace<WorkspaceTagListPayload>("/api/v1/workspace/tags"),
      fetchWorkspace<WorkspaceSavedSearchListPayload>("/api/v1/workspace/saved-searches"),
      fetchWorkspace<WorkspaceCollectionListPayload>("/api/v1/workspace/collections"),
    ]);

    startTransition(() => {
      if (profileResult.status === "fulfilled") {
        setWorkspaceProfile(profileResult.value.profile);
      }
      if (briefingResult.status === "fulfilled") {
        setWorkspaceBriefing(briefingResult.value.briefing);
      }
      if (rankingResult.status === "fulfilled") {
        setRankingItems(rankingResult.value.items);
      }
      if (sourceHealthResult.status === "fulfilled") {
        setSourceHealthEntries(sourceHealthResult.value.items);
      }
      if (sourceGroupResult.status === "fulfilled") {
        setSourceGroups(sourceGroupResult.value.items);
      }
      if (storyResult.status === "fulfilled") {
        setStoryClusters(storyResult.value.items);
      }
      if (tagResult.status === "fulfilled") {
        setTagCatalog(tagResult.value.items);
      }
      if (savedSearchResult.status === "fulfilled") {
        setSavedSearches(savedSearchResult.value.items);
      }
      if (collectionResult.status === "fulfilled") {
        setCollections(collectionResult.value.items);
      }
    });

  }

  async function loadSelectedItemWorkspace(itemId: string | null) {
    if (!itemId) {
      startTransition(() => {
        setItemAnnotations([]);
        setItemTags([]);
      });
      return;
    }

    const [annotationPayload, tagPayload] = await Promise.all([
      fetchWorkspace<WorkspaceAnnotationListPayload>(`/api/v1/workspace/annotations?item_id=${encodeURIComponent(itemId)}&limit=30`),
      fetchWorkspace<WorkspaceItemTagPayload>(`/api/v1/workspace/items/${encodeURIComponent(itemId)}/tags`),
    ]);

    startTransition(() => {
      setItemAnnotations(annotationPayload.items);
      setItemTags(tagPayload.tags);
    });
  }

  async function focusArticleById(itemId: string) {
    try {
      const payload = await fetchWorkspace<ItemDetailPayload>(`/api/v1/items/${encodeURIComponent(itemId)}`);
      const resolvedView = inferLibraryViewForItemState(payload.item);
      startTransition(() => {
        setItems((current) => [payload.item, ...current.filter((entry) => entry.id !== payload.item.id)]);
      });
      setRecallWindow("all");
      navigateToReadLibraryView(resolvedView, {
        itemId: payload.item.id,
        showReadItems: true,
        surface: "article",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie ponownie otworzyc artykulu",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    }
  }

  async function loadAnnotationHub(search = annotationHubQuery) {
    setAnnotationHubLoading(true);
    try {
      const query = search.trim();
      const path = query
        ? `/api/v1/workspace/annotations?search=${encodeURIComponent(query)}&limit=12`
        : "/api/v1/workspace/annotations?limit=12";
      const payload = await fetchWorkspace<WorkspaceAnnotationListPayload>(path);
      startTransition(() => {
        setAnnotationHubItems(payload.items);
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie wczytac centrum adnotacji",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setAnnotationHubLoading(false);
    }
  }

  async function saveWorkspaceProfile(patch: Partial<WorkspaceProfile> & { interests?: WorkspaceInterest[] }) {
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceProfilePayload>("/api/v1/workspace/profile", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      startTransition(() => {
        setWorkspaceProfile(payload.profile);
      });
      await Promise.all([loadWorkspaceOverview(), loadItems()]);
      setFeedback({
        tone: "success",
        title: "Ustawienia czytnika zaktualizowane",
        lines: ["Preferencje rankingu zostaly zapisane, a powierzchnie rekomendacji odswiezone."],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac ustawien czytnika",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateNote() {
    if (!selectedItem || !annotationDraft.trim()) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      await fetchWorkspace<WorkspaceAnnotationMutationPayload>("/api/v1/workspace/annotations", {
        method: "POST",
        body: JSON.stringify({
          item_id: selectedItem.id,
          kind: "note",
          note_text: annotationDraft.trim(),
        }),
      });
      setAnnotationDraft("");
      await Promise.all([loadSelectedItemWorkspace(selectedItem.id), loadAnnotationHub()]);
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac notatki",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateHighlight() {
    if (!selectedItem || !selectedTextQuote.trim()) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      await fetchWorkspace<WorkspaceAnnotationMutationPayload>("/api/v1/workspace/annotations", {
        method: "POST",
        body: JSON.stringify({
          item_id: selectedItem.id,
          kind: "highlight",
          quote_text: selectedTextQuote.trim(),
          note_text: annotationDraft.trim() || null,
        }),
      });
      setAnnotationDraft("");
      setSelectedTextQuote("");
      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }
      await Promise.all([loadSelectedItemWorkspace(selectedItem.id), loadAnnotationHub()]);
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac podkreslenia",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleSaveTags() {
    if (!selectedItem) {
      return;
    }
    const existingNames = itemTags.map((tag) => tag.name);
    const draftNames = tagDraft
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const names = Array.from(new Set([...existingNames, ...draftNames]));
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceItemTagPayload>(`/api/v1/workspace/items/${selectedItem.id}/tags`, {
        method: "PUT",
        body: JSON.stringify({ names }),
      });
      setItemTags(payload.tags);
      setTagDraft("");
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac tagow",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateCollection() {
    if (!collectionDraft.trim()) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceCollectionMutationPayload>("/api/v1/workspace/collections", {
        method: "POST",
        body: JSON.stringify({
          name: collectionDraft.trim(),
          item_id: selectedItem?.id ?? null,
        }),
      });
      startTransition(() => {
        setCollections((current) => [payload.collection, ...current.filter((entry) => entry.id !== payload.collection.id)]);
      });
      setCollectionDraft("");
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie utworzyc kolekcji",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleAddToCollection(collectionId: string) {
    if (!selectedItem) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceCollectionMutationPayload>(`/api/v1/workspace/collections/${collectionId}/items`, {
        method: "POST",
        body: JSON.stringify({ item_id: selectedItem.id }),
      });
      startTransition(() => {
        setCollections((current) => current.map((entry) => (entry.id === payload.collection.id ? payload.collection : entry)));
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie dodac artykulu do kolekcji",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateSavedSearch() {
    const query = deferredItemSearch.trim();
    if (!query) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceSavedSearchListPayload>("/api/v1/workspace/saved-searches", {
        method: "POST",
        body: JSON.stringify({
          name: query.length > 28 ? `${query.slice(0, 28)}...` : query,
          query,
          default_view: libraryView,
        }),
      });
      startTransition(() => {
        setSavedSearches(payload.items);
      });
      setFeedback({
        tone: "success",
        title: "Zapisane wyszukiwanie utworzone",
        lines: [`${query} jest teraz dostepne jako wielokrotnie uzywany widok czytnika.`],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zapisac wyszukiwania",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleSourceTierChange(channelId: string, tier: "priority" | "default" | "muted") {
    await handleSourceControlUpdate(channelId, { tier });
  }

  async function handleSourceControlUpdate(
    channelId: string,
    patch: Partial<WorkspaceSourceHealthEntry["control"]>,
  ) {
    setWorkspaceBusy(true);
    try {
      await fetchWorkspace<WorkspaceChannelControlPayload>(`/api/v1/workspace/source-controls/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await loadWorkspaceOverview();
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zaktualizowac kontroli zrodla",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateSourceGroup() {
    if (!sourceGroupDraft.trim()) {
      return;
    }
    setWorkspaceBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceSourceGroupMutationPayload>("/api/v1/workspace/source-groups", {
        method: "POST",
        body: JSON.stringify({
          name: sourceGroupDraft.trim(),
          color: sourceGroupColor,
        }),
      });
      startTransition(() => {
        setSourceGroups((current) => [payload.group, ...current.filter((entry) => entry.id !== payload.group.id)]);
      });
      setSourceGroupDraft("");
      setFeedback({
        tone: "success",
        title: "Pakiet zrodel utworzony",
        lines: [`${payload.group.name} jest gotowy do grupowania i wyciszania powiazanych feedow.`],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie utworzyc pakietu zrodel",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCaptureUrl() {
    if (!captureUrl.trim()) {
      return;
    }
    setCaptureBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceCapturePayload>("/api/v1/workspace/capture", {
        method: "POST",
        body: JSON.stringify({ url: captureUrl.trim() }),
      });
      setCaptureUrl("");
      await Promise.all([loadChannels(), loadItems(), loadWorkspaceOverview()]);
      setLibraryView("saved");
      setActiveItemId(payload.item.id);
      setFeedback({
        tone: "success",
        title: "Artykul do pozniejszego czytania zapisany",
        lines: [`${payload.item.title} jest teraz w zapisanej bibliotece.`],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie przechwycic artykulu",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setCaptureBusy(false);
    }
  }

  async function handleExportWorkspace() {
    setWorkspaceExportBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceExportPayload>("/api/v1/workspace/export");
      const continuityActiveItemId = activeItemId;
      const continuityReadingItemId = readingItemId ?? (currentSection !== "read" && activeItemId ? activeItemId : null);
      const continuityReaderState = resolveContinuityExportReaderState({
        currentSection,
        libraryView,
        showReadItems,
        contextItemId: continuityReadingItemId ?? continuityActiveItemId,
        lastReadLibraryView: lastReadLibraryViewRef.current,
        lastReadShowReadItems: lastReadShowReadItemsRef.current,
        items,
        viewPreferences,
      });
      const bundle = buildContinuityBundle({
        workspaceExport: payload,
        knownItems: items.map((item) => ({ id: item.id, source_url: item.source_url })),
        activeItemId: continuityActiveItemId,
        readingItemId: continuityReadingItemId,
        section:
          currentSection === "read" || continuityActiveItemId || continuityReadingItemId ? "read" : currentSection,
        libraryView: continuityReaderState.libraryView,
        showReadItems: continuityReaderState.showReadItems,
        itemSearch,
        widthMode: readerWidthMode,
        textMode: readerTextMode,
        imageMode: readerImageMode,
        focusedMode: isFocusedMode,
        viewPreferences,
        progressByItemId: readerProgress,
      });
      if (typeof window !== "undefined") {
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const objectUrl = URL.createObjectURL(blob);
        const link = window.document.createElement("a");
        link.href = objectUrl;
        link.download = `rssmaster-continuity-${payload.exported_at.slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(objectUrl);
      }
      setFeedback({
        tone: "success",
        title: "Continuity bundle gotowy",
        lines: [
          "Bundle zawiera feedy, stany biblioteki oraz lokalny kontekst czytnika do odtworzenia na drugiej instancji RSSmastera.",
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie wyeksportowac workspace",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setWorkspaceExportBusy(false);
    }
  }

  async function handleImportContinuityBundleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setWorkspaceImportBusy(true);
    try {
      const rawBundle = await file.text();
      const bundle = parseContinuityBundle(rawBundle);
      const payload = await fetchWorkspace<WorkspaceContinuityImportPayload>("/api/v1/workspace/continuity/import", {
        method: "POST",
        body: JSON.stringify({
          sources_opml: bundle.sources_opml,
          continuity_items: bundle.continuity_items.map((item) => ({
            item_id: item.id,
            source_url: item.source_url,
            is_read: Boolean(item.is_read),
            is_favorite: Boolean(item.is_favorite),
            digest_candidate: Boolean(item.digest_candidate),
            is_archived: Boolean(item.is_archived),
          })),
          annotations: bundle.annotations,
          tags: bundle.tags,
          collections: bundle.collections,
          saved_searches: bundle.saved_searches,
          item_tags: bundle.item_tags,
          collection_items: bundle.collection_items,
        }),
      });
      const matchedItemIdBySourceUrl = Object.fromEntries(payload.matched_items.map((entry) => [entry.source_url, entry.item_id]));
      const restoreState = buildRestoreStateFromContinuityBundle(bundle, matchedItemIdBySourceUrl);
      const restoredViewPreferences = normalizeViewPreferences(bundle.reader_state.viewPreferences, { legacyCompact: false });
      let resolvedRestoreLibraryView = restoreState.libraryView;
      let resolvedRestoreShowReadItems = restoreState.showReadItems;

      if (restoreState.section === "read" && restoreState.activeItemId && restoreState.libraryView === "inbox") {
        try {
          const restoredItemPayload = await fetchWorkspace<ItemDetailPayload>(
            `/api/v1/items/${encodeURIComponent(restoreState.activeItemId)}`,
          );
          const inferredRestoreLibraryView = inferLibraryViewForItemState(restoredItemPayload.item);
          if (inferredRestoreLibraryView !== "inbox") {
            resolvedRestoreLibraryView = inferredRestoreLibraryView;
            resolvedRestoreShowReadItems = restoredViewPreferences[inferredRestoreLibraryView].showReadItems;
          }
        } catch {
          // Keep the bundle-provided inbox view when the post-import item detail is temporarily unavailable.
        }
      }

      const restoredViewPreference = restoredViewPreferences[resolvedRestoreLibraryView];
      const restoredContinuitySnapshot: ReaderContinuitySnapshot = {
        section: restoreState.section,
        activeItemId: restoreState.activeItemId,
        readingItemId: restoreState.readingItemId,
        showReadItems: resolvedRestoreShowReadItems,
        libraryView: resolvedRestoreLibraryView,
        itemSearch: restoreState.itemSearch,
      };

      setViewPreferences(restoredViewPreferences);
      setPreferredSection(restoreState.section);
      setLibraryView(resolvedRestoreLibraryView);
      setItemSortMode(restoredViewPreference.sort);
      setIsCompactList(restoredViewPreference.density === "compact");
      setShowReadItems(resolvedRestoreShowReadItems);
      setItemSearch(restoreState.itemSearch);
      setActiveItemId(restoreState.activeItemId);
      setReadingItemId(restoreState.readingItemId);
      setReadSurfaceMode(restoreState.readingItemId ? "article" : "browse");
      setReaderWidthMode(restoreState.widthMode);
      setReaderTextMode(restoreState.textMode);
      setReaderImageMode(restoreState.imageMode);
      setIsFocusedMode(restoreState.focusedMode);
      markReaderProgressRestorePending(restoreState.progressByItemId);
      setReaderProgress(restoreState.progressByItemId);

      const restoreHref = buildAppHref({
        section: restoreState.section,
        libraryView: resolvedRestoreLibraryView,
        scope: resolvedRestoreShowReadItems ? "all" : "unread",
        sort: restoredViewPreference.sort,
        q: restoreState.itemSearch.trim() || null,
        item: restoreState.activeItemId,
        surface:
          restoreState.section === "read" &&
          restoreState.activeItemId &&
          restoreState.readingItemId &&
          restoreState.activeItemId === restoreState.readingItemId
            ? "article"
            : null,
      });

      pendingContinuityRouteRestoreRef.current = {
        href: restoreHref,
        section: restoreState.section,
        continuity: restoredContinuitySnapshot,
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(readerPreferenceKeys.continuity, JSON.stringify(restoredContinuitySnapshot));
        window.localStorage.setItem(readerPreferenceKeys.progress, JSON.stringify(restoreState.progressByItemId));
        window.history.replaceState(null, "", restoreHref);
      }

      router.replace(restoreHref);

      await Promise.all([loadChannels(), loadWorkspaceOverview()]);

      const feedbackLines = [
        `Dopasowano ${payload.matched_item_count} ${payload.matched_item_count === 1 ? "artykul" : "artykulow"} i odtworzono lokalny kontekst czytnika.`,
      ];
      if (payload.imported_source_count > 0 || payload.duplicate_source_count > 0) {
        feedbackLines.push(
          `Feedy: +${payload.imported_source_count}, duplikaty pominiete: ${payload.duplicate_source_count}.`,
        );
      }
      if (
        payload.restored_annotation_count > 0 ||
        payload.restored_tag_assignment_count > 0 ||
        payload.restored_collection_item_count > 0 ||
        payload.restored_saved_search_count > 0
      ) {
        feedbackLines.push(
          `Warstwa wiedzy: notatki i podkreslenia ${payload.restored_annotation_count}, tagi ${payload.restored_tag_assignment_count}, kolekcje ${payload.restored_collection_item_count}, zapisane wyszukiwania ${payload.restored_saved_search_count}.`,
        );
      }
      if (payload.unmatched_item_count > 0) {
        feedbackLines.push(
          `${payload.unmatched_item_count} pozycji nie dopasowano jeszcze lokalnie. Po synchronizacji mozesz zaimportowac bundle ponownie, aby odzyskac ich stany.`,
        );
      }
      setFeedback({
        tone: "success",
        title: "Continuity bundle odtworzony",
        lines: feedbackLines,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie odtworzyc continuity bundle",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      event.target.value = "";
      setWorkspaceImportBusy(false);
    }
  }

  async function handleImportOpml() {
    if (!opmlDraft.trim()) {
      return;
    }
    setOpmlImportBusy(true);
    try {
      const payload = await fetchWorkspace<WorkspaceOpmlImportPayload>("/api/v1/workspace/opml/import", {
        method: "POST",
        body: JSON.stringify({ opml: opmlDraft.trim() }),
      });
      setOpmlDraft("");
      await Promise.all([loadChannels(), loadWorkspaceOverview()]);
      setFeedback({
        tone: "success",
        title: "Import OPML zakonczony",
        lines: [
          `Zaimportowano ${payload.imported_count} ${payload.imported_count === 1 ? "zrodlo" : "zrodla"}.`,
          `Pominieto ${payload.duplicate_count} ${payload.duplicate_count === 1 ? "duplikat" : "duplikatow"}.`,
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Nie udalo sie zaimportowac OPML",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setOpmlImportBusy(false);
    }
  }

  function buildItemQueryParams(cursor?: string) {
    const params = new URLSearchParams({
      limit: "40",
    });

    if (libraryView === "digest") {
      params.set("digest_candidate", "true");
    } else {
      params.set("view", libraryView === "continue" ? "inbox" : libraryView);
    }

    if (cursor) {
      params.set("cursor", cursor);
    }
    params.set("sort", itemSortMode);
    if (!showReadItems && libraryView !== "archive") {
      params.set("is_read", "false");
    }
    if (deferredItemSearch.trim()) {
      params.set("search", deferredItemSearch.trim());
    }
    const publishedAfter = getPublishedAfterForRecallWindow(recallWindow);
    if (publishedAfter) {
      params.set("published_after", publishedAfter);
    }

    return params;
  }

  async function loadItems(options?: { signal?: AbortSignal; cursor?: string; append?: boolean }) {
    const { signal, cursor, append = false } = options ?? {};

    if (!append && (items.length === 0 || itemsStatus === "error" || itemsStatus === "unsupported")) {
      setItemsStatus("loading");
    } else {
      setItemsRefreshing(true);
    }

    try {
      const { response, payload } = await fetchApi<ItemListPayload>(`/api/v1/items?${buildItemQueryParams(cursor).toString()}`, {
        signal,
      });

      if (!response.ok) {
        if (isUnsupportedEndpoint(response.status)) {
          setItems([]);
          setItemsPage(null);
          setItemsStatus("unsupported");
          setItemsMessage("Endpoint biblioteki artykulow jest niedostepny w tym runtime.");
          return;
        }

        setItemsStatus("error");
        setItemsMessage(getPayloadMessage(payload, "Nie udalo sie wczytac artykulow."));
        return;
      }

      if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) {
        setItemsStatus("error");
        setItemsMessage("API zwrocilo nieoczekiwany payload listy artykulow.");
        return;
      }

      startTransition(() => {
        setItems((current) =>
          append
            ? [
                ...current,
                ...payload.items.filter((candidate) => !current.some((existing) => existing.id === candidate.id)),
              ]
            : payload.items,
        );
        setItemsPage(payload.page ?? null);
      });
      setItemsStatus("ready");
      setItemsMessage(null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setItemsStatus("error");
      setItemsMessage(error instanceof Error ? error.message : "Nieznany blad przegladarki.");
    } finally {
      setItemsRefreshing(false);
    }
  }

  async function loadMoreItems() {
    if (!itemsPage?.has_more || !itemsPage.next_cursor || itemsRefreshing) {
      return;
    }

    await loadItems({
      cursor: itemsPage.next_cursor,
      append: true,
    });
  }

  useEffect(() => {
    void loadAuthSession();
  }, [apiBaseUrl]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }

    async function loadDashboard() {
      try {
        await Promise.all([
          loadChannels(),
          loadSyncRuns(),
          loadDigestHistory(),
          loadDeliverySettings(),
          loadWorkspaceOverview(),
          loadAnnotationHub(""),
        ]);
      } catch (error) {
        setFeedback({
          tone: "error",
          title: "Nie udalo sie polaczyc z API",
          lines: [error instanceof Error ? error.message : "Nieznany blad frontendu."],
        });
      }
    }

    void loadDashboard();
  }, [apiBaseUrl, authStatus]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }
    void loadDeliveryLogs(latestDigest?.id);
  }, [apiBaseUrl, authStatus, latestDigest?.id]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }
    void loadSelectedItemWorkspace(selectedItem?.id ?? null);
  }, [apiBaseUrl, authStatus, selectedItem?.id]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }
    const timer = window.setTimeout(() => {
      void loadAnnotationHub(annotationHubQuery);
    }, annotationHubQuery.trim() ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [annotationHubQuery]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleSelectionChange() {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      setSelectedTextQuote(text.length >= 12 ? text : "");
    }

    window.document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      window.document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (authStatus !== "ready") {
      return;
    }

    const controller = new AbortController();
    void loadItems({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, authStatus, deferredItemSearch, itemSortMode, libraryView, preferencesReady, recallWindow, showReadItems]);

  useEffect(() => {
    const shouldPreserveActiveItemId = requestedReadSurface === "article" || currentSection !== "read";
    setActiveItemId((current) => {
      const nextActiveItemId = resolveActiveQueueItemId(current, queueItems, shouldPreserveActiveItemId);
      return nextActiveItemId === current ? current : nextActiveItemId;
    });
  }, [currentSection, queueItems, requestedReadSurface]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setIsFocusedMode(window.localStorage.getItem(readerPreferenceKeys.focused) === "true");
    const storedWidthMode = window.localStorage.getItem(readerPreferenceKeys.width);
    const storedTextMode = window.localStorage.getItem(readerPreferenceKeys.textMode);
    const storedImageMode = window.localStorage.getItem(readerPreferenceKeys.imageMode);
    const storedContinuity = window.localStorage.getItem(readerPreferenceKeys.continuity);
    const storedProgress = window.localStorage.getItem(readerPreferenceKeys.progress);
    const legacyCompact = window.localStorage.getItem(readerPreferenceKeys.compact) === "true";
    let nextViewPreferences = normalizeViewPreferences(
      parseStoredJson(window.localStorage.getItem(readerPreferenceKeys.viewPreferences)),
      { legacyCompact },
    );
    let nextSection: AppSection = "read";
    let nextLibraryView: LibraryView = "inbox";
    let nextActiveItemId: string | null = null;
    let nextReadingItemId: string | null = null;
    let nextItemSearch = "";
    let nextReadSurfaceMode: "browse" | "article" = "browse";

    if (storedWidthMode === "narrow" || storedWidthMode === "comfortable" || storedWidthMode === "wide") {
      setReaderWidthMode(storedWidthMode);
    }
    if (storedTextMode === "standard" || storedTextMode === "large") {
      setReaderTextMode(storedTextMode);
    }
    if (storedImageMode === "safe" || storedImageMode === "immersive") {
      setReaderImageMode(storedImageMode);
    }

    if (storedContinuity) {
      try {
        const continuity = JSON.parse(storedContinuity) as Partial<ReaderContinuitySnapshot>;
        const legacyFavoritesOnly = (continuity as { favoritesOnly?: boolean }).favoritesOnly;

        if (typeof continuity.activeItemId === "string") {
          nextActiveItemId = continuity.activeItemId;
        }
        if (typeof continuity.readingItemId === "string") {
          nextReadingItemId = continuity.readingItemId;
        }
        if (typeof continuity.itemSearch === "string") {
          nextItemSearch = continuity.itemSearch;
        }
        if (isAppSection(continuity.section)) {
          nextSection = continuity.section;
        }
        if (isAppLibraryView(continuity.libraryView)) {
          nextLibraryView = continuity.libraryView;
        } else if (typeof legacyFavoritesOnly === "boolean" && legacyFavoritesOnly) {
          nextLibraryView = "saved";
        }
        if (typeof continuity.showReadItems === "boolean") {
          nextViewPreferences = patchViewPreferenceMap(nextViewPreferences, nextLibraryView, {
            showReadItems: continuity.showReadItems,
          });
        }
      } catch {
        // Ignore malformed continuity payloads and keep the runtime bootable.
      }
    }

    const pathState = parseAppPath(window.location.pathname);
    if (pathState.section) {
      nextSection = pathState.section;
      if (pathState.section === "read") {
        nextLibraryView = pathState.libraryView;
      }
    }

    const params = new URLSearchParams(window.location.search);
    const urlView = params.get("view");
    const urlItemId = params.get("item");
    const urlQuery = params.get("q");
    const urlScope = params.get("scope");
    const urlSort = params.get("sort");
    const urlSurface = params.get("surface");

    if (urlView === "inbox" || urlView === "continue" || urlView === "saved" || urlView === "digest" || urlView === "archive") {
      nextLibraryView = urlView;
      nextSection = "read";
    }
    if (nextSection === "read") {
      if (typeof urlItemId === "string" && urlItemId.trim()) {
        nextActiveItemId = urlItemId.trim();
        nextReadingItemId = urlItemId.trim();
      }
      if (nextActiveItemId && urlSurface === "article") {
        nextReadSurfaceMode = "article";
      }
      if (typeof urlQuery === "string") {
        nextItemSearch = urlQuery;
      }
      if (urlScope === "all" || urlScope === "unread") {
        nextViewPreferences = patchViewPreferenceMap(nextViewPreferences, nextLibraryView, {
          showReadItems: urlScope === "all",
        });
      }
      if (urlSort === "newest" || urlSort === "oldest") {
        nextViewPreferences = patchViewPreferenceMap(nextViewPreferences, nextLibraryView, {
          sort: urlSort,
        });
      }
    }

    setPreferredSection(nextSection);
    setViewPreferences(nextViewPreferences);
    setLibraryView(nextLibraryView);
    setShowReadItems(nextViewPreferences[nextLibraryView].showReadItems);
    setItemSortMode(nextViewPreferences[nextLibraryView].sort);
    setIsCompactList(nextViewPreferences[nextLibraryView].density === "compact");
    setActiveItemId(nextActiveItemId);
    setReadingItemId(nextReadingItemId);
    setReadSurfaceMode(nextReadSurfaceMode);
    setItemSearch(nextItemSearch);

    if (storedProgress) {
      try {
        const progress = JSON.parse(storedProgress) as Record<string, ReaderProgressSnapshot>;
        markReaderProgressRestorePending(progress);
        setReaderProgress(progress);
        readingProgressRef.current = progress;
      } catch {
        // Ignore malformed progress payloads and start with an empty resume map.
      }
    }

    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    const preference = viewPreferences[libraryView];
    if (!preference) {
      return;
    }

    if (
      !shouldApplyReaderViewPreference(preference, {
        showReadItems,
        itemSortMode,
        isCompactList,
      })
    ) {
      return;
    }

    const nextControls = getReaderViewControlsFromPreference(preference);
    applyingViewPreferenceRef.current = true;

    if (showReadItems !== nextControls.showReadItems) {
      setShowReadItems(nextControls.showReadItems);
    }
    if (itemSortMode !== nextControls.itemSortMode) {
      setItemSortMode(nextControls.itemSortMode);
    }
    if (isCompactList !== nextControls.isCompactList) {
      setIsCompactList(nextControls.isCompactList);
    }
  }, [isCompactList, itemSortMode, libraryView, preferencesReady, showReadItems, viewPreferences]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (applyingViewPreferenceRef.current) {
      applyingViewPreferenceRef.current = false;
      return;
    }

    const density: ViewDensity = isCompactList ? "compact" : "comfortable";
    setViewPreferences((current) => {
      const currentPreference = current[libraryView];
      if (
        currentPreference &&
        currentPreference.showReadItems === showReadItems &&
        currentPreference.sort === itemSortMode &&
        currentPreference.density === density
      ) {
        return current;
      }

      return patchViewPreferenceMap(current, libraryView, {
        showReadItems,
        sort: itemSortMode,
        density,
      });
    });
  }, [isCompactList, itemSortMode, libraryView, preferencesReady, showReadItems]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.focused, String(isFocusedMode));
  }, [isFocusedMode, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.width, readerWidthMode);
  }, [preferencesReady, readerWidthMode]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.textMode, readerTextMode);
  }, [preferencesReady, readerTextMode]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.imageMode, readerImageMode);
  }, [preferencesReady, readerImageMode]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.viewPreferences, JSON.stringify(viewPreferences));
  }, [preferencesReady, viewPreferences]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    const currentUrl = `${window.location.pathname}${window.location.search}`;
    const pendingRouteRestore = pendingContinuityRouteRestoreRef.current;
    if (pendingRouteRestore && (currentUrl !== pendingRouteRestore.href || routeState.section !== pendingRouteRestore.section)) {
      return;
    }

    const continuity: ReaderContinuitySnapshot = {
      section: currentSection,
      activeItemId,
      readingItemId,
      showReadItems,
      libraryView,
      itemSearch,
    };

    window.localStorage.setItem(readerPreferenceKeys.continuity, JSON.stringify(continuity));
  }, [activeItemId, currentSection, itemSearch, libraryView, preferencesReady, readingItemId, showReadItems]);

  useEffect(() => {
    if (routeState.section !== "read") {
      return;
    }

    lastReadLibraryViewRef.current = routeState.libraryView;
    lastReadShowReadItemsRef.current = viewPreferences[routeState.libraryView]?.showReadItems ?? showReadItems;
  }, [routeState.libraryView, routeState.section, showReadItems, viewPreferences]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const pendingRouteRestore = pendingContinuityRouteRestoreRef.current;
    if (!pendingRouteRestore) {
      return;
    }

    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === pendingRouteRestore.href && routeState.section === pendingRouteRestore.section) {
      pendingContinuityRouteRestoreRef.current = null;
    }
  }, [pathname, routeState.section, searchParams]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    if (routeState.section) {
      if (typeof window !== "undefined") {
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        const pendingRouteRestore = pendingContinuityRouteRestoreRef.current;
        if (pendingRouteRestore && (currentUrl !== pendingRouteRestore.href || routeState.section !== pendingRouteRestore.section)) {
          return;
        }
      }

      const nextSection = routeState.section;
      setPreferredSection((current) => (current === nextSection ? current : nextSection));
    }
  }, [preferencesReady, routeState.section]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [currentSection, libraryView, pathname]);

  useEffect(() => {
    if (currentSection !== "read") {
      return;
    }

    const shouldOpenRequestedArticle = requestedReadSurface === "article" && activeItemId;
    const nextMode = shouldOpenRequestedArticle ? "article" : "browse";
    setReadSurfaceMode((current) => (current === nextMode ? current : nextMode));
    if (shouldOpenRequestedArticle && activeItemId) {
      setReadingItemId((current) => (current === activeItemId ? current : activeItemId));
    }
  }, [activeItemId, currentSection, requestedReadSurface]);

  useEffect(() => {
    if (currentSection !== "read" || isFocusedMode) {
      setShowReadInspector(false);
    }
  }, [currentSection, isFocusedMode]);

  useEffect(() => {
    if (selectedTextQuote.trim()) {
      setShowReadInspector(true);
    }
  }, [selectedTextQuote]);

  useEffect(() => {
    if (!preferencesReady || routeState.section !== "read" || routeState.libraryView === libraryView) {
      return;
    }

    setLibraryView(routeState.libraryView);
  }, [libraryView, preferencesReady, routeState.libraryView, routeState.section]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    if (window.location.pathname === "/") {
      return;
    }

    const currentUrl = `${window.location.pathname}${window.location.search}`;
    const pendingRouteRestore = pendingContinuityRouteRestoreRef.current;
    if (pendingRouteRestore && (currentUrl !== pendingRouteRestore.href || routeState.section !== pendingRouteRestore.section)) {
      return;
    }

    const shouldPersistArticleSurface =
      currentSection === "read" &&
      Boolean(activeItemId) &&
      readSurfaceMode === "article" &&
      (readingItemId === activeItemId || requestedReadSurface === "article");

    const nextUrl = buildAppHref({
      section: currentSection,
      libraryView,
      scope: showReadItems ? "all" : "unread",
      sort: itemSortMode,
      q: itemSearch.trim() || null,
      item: activeItemId,
      surface: shouldPersistArticleSurface ? "article" : null,
    });
    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [
    activeItemId,
    currentSection,
    itemSearch,
    itemSortMode,
    libraryView,
    preferencesReady,
    readSurfaceMode,
    readingItemId,
    requestedReadSurface,
    showReadItems,
  ]);

  useEffect(() => {
    if (!preferencesReady || pathname !== "/") {
      return;
    }

    router.replace(
      buildAppHref({
        section: preferredSection,
        libraryView,
        scope: showReadItems ? "all" : "unread",
        sort: itemSortMode,
        q: itemSearch.trim() || null,
        item: activeItemId,
        surface:
          preferredSection === "read" && readSurfaceMode === "article" && readingItemId && readingItemId === activeItemId
            ? "article"
            : null,
      }),
    );
  }, [
    activeItemId,
    itemSearch,
    itemSortMode,
    libraryView,
    pathname,
    preferencesReady,
    preferredSection,
    readSurfaceMode,
    readingItemId,
    router,
    showReadItems,
  ]);

  useEffect(() => {
    readingProgressRef.current = readerProgress;
  }, [readerProgress]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(readerPreferenceKeys.progress, JSON.stringify(readerProgress));
  }, [preferencesReady, readerProgress]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const row = itemRowRefs.current.get(selectedItem.id);
    row?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedItem) {
      if (readSurfaceMode === "article" && activeItemId) {
        return;
      }
      setReadingItemId(null);
      return;
    }

    setReadingItemId((current) => {
      if (current && current === selectedItem.id) {
        return current;
      }
      if (readSurfaceMode === "article" && activeItemId === selectedItem.id) {
        return selectedItem.id;
      }
      return null;
    });
  }, [activeItemId, readSurfaceMode, selectedItem?.id]);

  useEffect(() => {
    setSelectedItemIds((current) => {
      const nextSelection = filterVisibleSelection(current, queueItems);
      return nextSelection.length === current.length ? current : nextSelection;
    });
  }, [queueItems]);

  useEffect(() => {
    if (!selectedItem || readingItemId !== selectedItem.id) {
      return;
    }

    articleContentRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [readingItemId, selectedItem?.id, itemDetailStatus]);

  useEffect(() => {
    if (!selectedItem || readingItemId !== selectedItem.id || !articleContentRef.current) {
      return;
    }

    const snapshot = readerProgress[selectedItem.id];
    if (!snapshot) {
      return;
    }

    const applyRestoredScroll = () => {
      if (articleContentRef.current) {
        const { maxScroll, target } = getReaderScrollSnapshot(articleContentRef.current);
        const nextScrollTop = Math.max(0, Math.min(snapshot.scrollTop, maxScroll));
        if (target === "document") {
          window.scrollTo({
            top: nextScrollTop,
            behavior: "auto",
          });
        } else {
          articleContentRef.current.scrollTop = nextScrollTop;
        }
      }
    };

    const timers = [
      window.setTimeout(applyRestoredScroll, 80),
      window.setTimeout(applyRestoredScroll, 220),
      window.setTimeout(applyRestoredScroll, 480),
      window.setTimeout(applyRestoredScroll, 900),
      window.setTimeout(() => {
        applyRestoredScroll();
        delete pendingReaderProgressRestoreRef.current[selectedItem.id];
      }, 1600),
    ];

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [readerProgress, readingItemId, selectedItem?.id, itemDetailStatus]);

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }

    if (!selectedItem) {
      setItemDetail(null);
      setItemDetailStatus("ready");
      setItemDetailMessage(null);
      return;
    }

    const controller = new AbortController();

    async function loadItemDetail(itemId: string, signal: AbortSignal) {
      setItemDetailStatus("loading");
      setItemDetailMessage(null);

      try {
        const { response, payload } = await fetchApi<ItemDetailPayload>(`/api/v1/items/${itemId}`, {
          signal,
        });

        if (!response.ok) {
          if (isUnsupportedEndpoint(response.status)) {
            setItemDetailStatus("unsupported");
            setItemDetailMessage("Item detail endpoint is not available yet. Falling back to list metadata.");
            return;
          }

          setItemDetailStatus("error");
          setItemDetailMessage(getPayloadMessage(payload, "Nie udalo sie wczytac szczegolow artykulu."));
          return;
        }

        if (!payload || typeof payload !== "object" || !("item" in payload)) {
          setItemDetailStatus("error");
          setItemDetailMessage("The API returned an unexpected article detail payload.");
          return;
        }

        startTransition(() => {
          setItemDetail(payload.item);
        });
        setItemDetailStatus("ready");
        setItemDetailMessage(null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setItemDetailStatus("error");
        setItemDetailMessage(error instanceof Error ? error.message : "Nieznany blad przegladarki.");
      }
    }

    void loadItemDetail(selectedItem.id, controller.signal);

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, authStatus, selectedItem?.id]);

  function cancelSourcePreviewRequest() {
    sourcePreviewRequestIdRef.current += 1;
    sourcePreviewAbortRef.current?.abort();
    sourcePreviewAbortRef.current = null;
    setPreviewBusy(false);
  }

  function resetSourcePreviewState(options?: { clearFeedbackError?: boolean; clearPreview?: boolean }) {
    cancelSourcePreviewRequest();
    lastSourcePreviewKeyRef.current = null;
    if (options?.clearPreview ?? true) {
      setChannelPreview(null);
    }
    if (options?.clearFeedbackError && feedback.tone === "error") {
      setFeedback(initialFeedback);
    }
  }

  const requestSourcePreview = useEffectEvent(
    async ({
      origin = "manual",
      overrideInput,
    }: {
      origin?: "manual" | "auto";
      overrideInput?: string;
    } = {}) => {
      const resolvedInput = (overrideInput ?? inputUrl).trim();
      if (!resolvedInput) {
        resetSourcePreviewState();
        return;
      }

      const previewMode = sourceAddMode === "web_feed" ? "web_feed" : "website";
      const requestKey = buildSourcePreviewRequestKey(previewMode, resolvedInput);
      if (requestKey) {
        lastSourcePreviewKeyRef.current = requestKey;
      }

      const requestId = sourcePreviewRequestIdRef.current + 1;
      sourcePreviewRequestIdRef.current = requestId;
      sourcePreviewAbortRef.current?.abort();
      const controller = new AbortController();
      sourcePreviewAbortRef.current = controller;
      setPreviewBusy(true);

      if (origin === "manual") {
        setFeedback({
          tone: "idle",
          title: "Podglad zrodla",
          lines: ["Backend sprawdza bezposredni feed, autodiscovery na stronie i heurystyki RSS."],
        });
      }

      try {
        const response = await fetch("/api/v1/channels/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            input_url: resolvedInput,
          }),
        });

        const payload = (await readResponsePayload(response)) as ChannelPreviewPayload | ApiErrorEnvelope;
        if (requestId !== sourcePreviewRequestIdRef.current) {
          return;
        }

        const upstreamStatus = Number.parseInt(response.headers.get("x-rssmaster-upstream-status") ?? "", 10);
        const responseStatus = Number.isFinite(upstreamStatus) ? upstreamStatus : response.status;

        if (responseStatus >= 400) {
          const previewFailureKind =
            isErrorEnvelope(payload) && typeof payload.error?.details?.preview_failure_kind === "string"
              ? payload.error.details.preview_failure_kind
              : null;
          const failure = classifySourcePreviewFailure({
            httpStatus: responseStatus,
            errorCode: isErrorEnvelope(payload) ? payload.error?.code ?? null : null,
            previewFailureKind,
          });
          const lines = [getSourcePreviewFailureDescription(failure)];
          const candidates = isErrorEnvelope(payload) ? payload.error?.details?.candidates : undefined;
          if (Array.isArray(candidates) && candidates.length > 0) {
            lines.push("Wykryte kandydaty:");
            lines.push(...candidates);
          }

          setChannelPreview(null);
          setFeedback({
            tone: "error",
            title: getSourcePreviewFailureLabel(failure),
            lines,
          });
          if (origin === "manual") {
            pendingSourceFocusTargetRef.current = "results";
          }
          return;
        }

        if (isErrorEnvelope(payload) || !payload) {
          setChannelPreview(null);
          setFeedback({
            tone: "error",
            title: "channel_preview_failed",
            lines: [isErrorEnvelope(payload) ? payload.error?.message ?? "Podglad kanalu nie powiodl sie." : "Podglad kanalu nie powiodl sie."],
          });
          if (origin === "manual") {
            pendingSourceFocusTargetRef.current = "results";
          }
          return;
        }

        setChannelPreview(payload);
        setFeedback({
          tone: "idle",
          title: getPreviewTitle(payload),
          lines:
            payload.status === "multiple_candidates"
              ? [
                  `Tryb wykrywania: ${payload.discovery.mode}`,
                  `Wybierz 1 z ${payload.candidates.length} poprawnych feedow do subskrypcji.`,
                ]
              : payload.status === "already_subscribed"
                ? [
                    `Juz subskrybowane: ${payload.existing_channel?.title ?? payload.feed?.title ?? "istniejace zrodlo"}`,
                    `Rozwiazany feed: ${payload.discovery.resolved_feed_url ?? payload.feed?.feed_url ?? "nieznany"}`,
                  ]
                : [
                    `Tryb wykrywania: ${payload.discovery.mode}`,
                  `Rozwiazany feed: ${payload.discovery.resolved_feed_url ?? payload.feed?.feed_url ?? "nieznany"}`,
                ],
        });
        if (origin === "manual") {
          pendingSourceFocusTargetRef.current = "results";
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (requestId !== sourcePreviewRequestIdRef.current) {
          return;
        }

        setChannelPreview(null);
        setFeedback({
          tone: "error",
          title: "Zadanie nie powiodlo sie",
          lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
        });
        if (origin === "manual") {
          pendingSourceFocusTargetRef.current = "results";
        }
      } finally {
        if (requestId === sourcePreviewRequestIdRef.current) {
          if (sourcePreviewAbortRef.current === controller) {
            sourcePreviewAbortRef.current = null;
          }
          setPreviewBusy(false);
        }
      }
    },
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestSourcePreview({ origin: "manual" });
  }

  function activateSourceAddMode(nextMode: SourceAddModeId, focusTarget: "input" | "import") {
    cancelSourcePreviewRequest();
    lastSourcePreviewKeyRef.current = null;
    setChannelPreview(null);
    setSourceLanguageFilter("all");
    setShowSourceOptions(false);
    setSourceSurfaceMode("add");
    setSourceAddMode(nextMode);
    pendingSourceFocusTargetRef.current = focusTarget;
    if (feedback.tone === "error") {
      setFeedback(initialFeedback);
    }
  }

  function handleSourceDraftInputChange(nextValue: string) {
    setInputUrl(nextValue);

    const previewMode = sourceAddMode === "web_feed" ? "web_feed" : "website";
    const nextRequestKey = buildSourcePreviewRequestKey(previewMode, nextValue);

    if (!nextValue.trim()) {
      resetSourcePreviewState({ clearFeedbackError: true });
      return;
    }

    if (!nextRequestKey) {
      cancelSourcePreviewRequest();
      lastSourcePreviewKeyRef.current = null;
      setChannelPreview(null);
      return;
    }

    if (nextRequestKey !== lastSourcePreviewKeyRef.current) {
      cancelSourcePreviewRequest();
      lastSourcePreviewKeyRef.current = null;
      setChannelPreview(null);
      if (feedback.tone === "error") {
        setFeedback(initialFeedback);
      }
    }
  }

  useEffect(() => {
    if (sourceAddMode !== "website") {
      const switchedAwayFromWebsite = previousSourceAddModeRef.current === "website";
      previousSourceAddModeRef.current = sourceAddMode;
      if (switchedAwayFromWebsite && previewBusy) {
        cancelSourcePreviewRequest();
        lastSourcePreviewKeyRef.current = null;
      }
      return;
    }
    previousSourceAddModeRef.current = sourceAddMode;

    const requestKey = buildSourcePreviewRequestKey("website", inputUrl);
    if (!requestKey) {
      cancelSourcePreviewRequest();
      lastSourcePreviewKeyRef.current = null;
      if (!inputUrl.trim()) {
        setChannelPreview(null);
      }
      return;
    }

    if (requestKey === lastSourcePreviewKeyRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void requestSourcePreview({ origin: "auto", overrideInput: inputUrl });
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [inputUrl, previewBusy, requestSourcePreview, sourceAddMode]);

  async function handleConfirmChannelAdd(feedUrl?: string) {
    const resolvedUrl = feedUrl ?? channelPreview?.feed?.feed_url ?? inputUrl.trim();
    if (!resolvedUrl) {
      return;
    }

    setSubscribeBusy(true);
    setFeedback({
      tone: "idle",
      title: "Zapisywanie zrodla",
      lines: ["Wybrany feed jest teraz dodawany do Twojej biblioteki."],
    });

    try {
      const { response, payload } = await fetchApi<ChannelCreatePayload>("/api/v1/channels", {
        method: "POST",
        body: JSON.stringify({
          input_url: resolvedUrl,
          category: category || undefined,
        }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        setFeedback({
          tone: "error",
          title: isErrorEnvelope(payload) ? payload.error?.code ?? "channel_add_failed" : "channel_add_failed",
          lines: [getPayloadMessage(payload, "Dodanie kanalu nie powiodlo sie.")],
        });
        return;
      }

      await loadChannels();
      setInputUrl("");
      setCategory("");
      resetSourcePreviewState();
      setShowSourceOptions(false);
      setSourceSurfaceMode("add");
      pendingSourceFocusTargetRef.current = "input";
      setFeedback({
        tone: "success",
        title: "Kanal zapisany",
        lines: [
          `Tryb wykrywania: ${payload.discovery.mode}`,
          `Rozwiazany feed: ${payload.discovery.resolved_feed_url}`,
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Zadanie nie powiodlo sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setSubscribeBusy(false);
    }
  }

  async function pollRun(runId: string) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await sleep(800);

      try {
        const { response, payload } = await fetchApi<SyncRunPayload>(`/api/v1/sync/runs/${runId}`);
        if (!response.ok || isErrorEnvelope(payload)) {
          continue;
        }

        upsertRun(payload.run);
        if (!terminalSyncStates.has(payload.run.status)) {
          continue;
        }

        setIsSyncing(false);
        try {
          await Promise.all([loadChannels(), loadSyncRuns(), loadItems()]);
        } catch {
          // Keep the terminal run visible even if follow-up refreshes fail.
        }

        const summaryLine =
          payload.run.status === "completed"
            ? `Sync finished cleanly. ${payload.run.items_created} new item(s) from ${payload.run.channels_succeeded} channel(s).`
            : payload.run.status === "partial_success"
              ? `Sync finished with mixed results. ${payload.run.channels_failed} channel(s) failed and ${payload.run.items_created} new item(s) were still saved.`
              : payload.run.error_message ?? "Sync did not finish cleanly.";

        setFeedback({
          tone: payload.run.status === "completed" ? "success" : "error",
          title: `Sync ${payload.run.status}`,
          lines: [
            summaryLine,
            `Items seen: ${payload.run.items_seen}, items skipped: ${payload.run.items_skipped}.`,
            ...payload.run.errors.slice(0, 3).map((error) => `${error.channel_title}: ${error.message}`),
          ],
        });
        return;
      } catch {
        // Keep polling for transient local runtime delays.
      }
    }

    setIsSyncing(false);
    setFeedback({
      tone: "error",
      title: "Oczekiwanie na sync przekroczylo czas",
      lines: [
        "Uruchomienie zostalo przyjete, ale przegladarka nie zobaczyla jeszcze stanu koncowego.",
        "Uzyj panelu ostatnich syncow, aby sprawdzic zapisany status.",
      ],
    });
  }

  async function handleSyncAll() {
    setIsSyncing(true);
    setFeedback({
      tone: "idle",
      title: "Kolejkowanie syncu",
      lines: ["Backend tworzy zapisany run syncu i pobierze w tle kazdy aktywny kanal."],
    });

    try {
      const { response, payload } = await fetchApi<SyncRunPayload>("/api/v1/sync/runs", {
        method: "POST",
        body: JSON.stringify({ mode: "manual" }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        setIsSyncing(false);
        setFeedback({
          tone: "error",
          title: isErrorEnvelope(payload) ? payload.error?.code ?? "sync_queue_failed" : "sync_queue_failed",
          lines: [getPayloadMessage(payload, "Nie udalo sie uruchomic syncu.")],
        });
        return;
      }

      upsertRun(payload.run);
      setFeedback({
        tone: "idle",
        title: "Sync przyjety",
        lines: [
          `Run ${payload.run.id} zostal zapisany i czeka na zakonczenie.`,
          "Lista runow i kolejka czytnika odswieza sie po zakonczeniu pracy w tle.",
        ],
      });
      void pollRun(payload.run.id);
    } catch (error) {
      setIsSyncing(false);
      setFeedback({
        tone: "error",
        title: "Zadanie nie powiodlo sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    }
  }

  async function mutateChannel(
    channelId: string,
    options: {
      body?: Record<string, unknown>;
      method: "PATCH" | "DELETE";
      successLines: string[];
      successTitle: string;
    },
  ) {
    setActiveChannelId(channelId);
    try {
      const { response, payload } = await fetchApi<ChannelMutationPayload>(`/api/v1/channels/${channelId}`, {
        method: options.method,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        setFeedback({
          tone: "error",
        title: isErrorEnvelope(payload) ? payload.error?.code ?? "channel_update_failed" : "channel_update_failed",
          lines: [getPayloadMessage(payload, "Aktualizacja kanalu nie powiodla sie.")],
        });
        return;
      }

      startTransition(() => {
        setChannels((current) =>
          current.map((channel) => (channel.id === payload.channel.id ? payload.channel : channel)),
        );
        setDraftCategories((current) => ({
          ...current,
          [payload.channel.id]: payload.channel.category ?? "",
        }));
      });
      setFeedback({
        tone: "success",
        title: options.successTitle,
        lines: options.successLines,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Zadanie nie powiodlo sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setActiveChannelId(null);
    }
  }

  async function mutateItemState(
    item: Item,
    patch: ItemStatePatch,
    options?: {
      recordUndo?: boolean;
      undoLabel?: string;
    },
  ): Promise<boolean> {
    const previous = item;
    const previousDetail = itemDetail && itemDetail.id === item.id ? itemDetail : null;
    const nextItem = applyItemPatch(previous, patch);
    const undoPatch = buildUndoPatch(previous, nextItem);
    const shouldRecordUndo = options?.recordUndo ?? true;

    setItemActionId(item.id);
    setItemsMessage(null);
    startTransition(() => {
      setItems((current) =>
        current.map((candidate) => (candidate.id === item.id ? applyItemPatch(candidate, patch) : candidate)),
      );
      setItemDetail((current) => (current && current.id === item.id ? applyItemPatch(current, patch) : current));
    });

    try {
      const { response, payload } = await fetchApi<ItemMutationPayload>(`/api/v1/items/${item.id}/state`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        if (isUnsupportedEndpoint(response.status)) {
          throw new Error("item_state_endpoint_unavailable");
        }

          throw new Error(getPayloadMessage(payload, "Nie udalo sie zaktualizowac stanu artykulu."));
      }

      if (payload && typeof payload === "object" && "item" in payload) {
        startTransition(() => {
          setItems((current) => current.map((candidate) => (candidate.id === item.id ? payload.item : candidate)));
          setItemDetail((current) => (current && current.id === item.id ? { ...current, ...payload.item } : current));
        });
      }

      if (shouldRecordUndo && undoPatch) {
        pushUndoEntry({
          id: `undo_${Date.now()}_${item.id}`,
          label: options?.undoLabel ?? describeItemMutation(patch),
          operations: [
            {
              item: previous,
              patch: undoPatch,
            },
          ],
        });
      }

      if (patch.library_action || "is_archived" in patch || (libraryView === "saved" && "is_favorite" in patch)) {
        void loadItems();
      }
      return true;
    } catch (error) {
      startTransition(() => {
        setItems((current) => current.map((candidate) => (candidate.id === item.id ? previous : candidate)));
        if (previousDetail) {
          setItemDetail(previousDetail);
        }
      });

      setItemsMessage(
        error instanceof Error && error.message === "item_state_endpoint_unavailable"
          ? "PATCH /api/v1/items/{id}/state nie jest jeszcze dostepny. Optymistyczna zmiana zostala cofnieta."
          : error instanceof Error
            ? error.message
            : "Nie udalo sie zaktualizowac stanu artykulu.",
      );
      return false;
    } finally {
      setItemActionId(null);
    }
  }

  async function handleUndo() {
    if (!latestUndoEntry || undoBusy) {
      return;
    }

    setUndoBusy(true);
    const failures: string[] = [];

    for (const operation of [...latestUndoEntry.operations].reverse()) {
      const liveItem = items.find((candidate) => candidate.id === operation.item.id) ?? operation.item;
      const success = await mutateItemState(liveItem, operation.patch, {
        recordUndo: false,
      });
      if (!success) {
        failures.push(operation.item.id);
      }
    }

    if (failures.length === 0) {
      dismissUndoEntry(latestUndoEntry.id);
      setFeedback({
        tone: "success",
        title: "Ostatnia akcja cofnieta",
        lines: [`Cofnieto ${latestUndoEntry.operations.length} ${latestUndoEntry.operations.length === 1 ? "zmiane" : "zmiany"} artykulu.`],
      });
    } else {
      setFeedback({
        tone: "error",
        title: "Cofanie nie powiodlo sie",
        lines: [`Nie udalo sie bezpiecznie cofnac ${failures.length} ${failures.length === 1 ? "zmiany" : "zmian"} artykulu.`],
      });
    }

    setUndoBusy(false);
  }

  async function handleCategorySave(channelId: string) {
    await mutateChannel(channelId, {
      method: "PATCH",
      body: {
        category: draftCategories[channelId] || null,
      },
      successTitle: "Kategoria zaktualizowana",
      successLines: ["Kategoria kanalu zostala zapisana bez naruszania istniejacych artykulow."],
    });
  }

  async function handleStateToggle(channel: Channel) {
    const nextState = channel.state === "active" ? "inactive" : "active";
    await mutateChannel(channel.id, {
      method: "PATCH",
      body: {
        state: nextState,
      },
      successTitle: "Stan kanalu zaktualizowany",
      successLines: [
        nextState === "inactive"
          ? "Kanal jest wylaczony i nie powinien brac udzialu w kolejnych syncach."
          : "Kanal jest znow aktywny i gotowy na kolejny sync.",
      ],
    });
  }

  async function handleArchive(channel: Channel) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Zarchiwizowac ten kanal? Istniejace artykuly zostana w bazie, ale zrodlo zniknie z aktywnej listy.",
      );
      if (!confirmed) {
        return;
      }
    }

    await mutateChannel(channel.id, {
      method: "DELETE",
      successTitle: "Kanal zarchiwizowany",
      successLines: ["Zrodlo zostalo zarchiwizowane. Historyczne artykuly pozostaja zachowane do pozniejszego przegladu."],
    });
  }

  function buildDigestSelectionPayload() {
    const limit = Math.min(Math.max(queueItems.length, 1), 25);
    const itemIds = digestCandidateIds.length > 0 ? digestCandidateIds : queueItems.map((item) => item.id);

    return {
      item_ids: itemIds.slice(0, limit),
      title: `rssmaster digest ${new Date().toISOString().slice(0, 10)}`,
      digest_candidates_only: digestCandidateIds.length > 0,
      include_read: showReadItems || libraryView === "archive",
      favorites_only: libraryView === "saved",
      limit,
    };
  }

  async function handleDigestPreview() {
    if (queueItems.length === 0) {
      setFeedback({
        tone: "error",
        title: "Brak kandydatow do digestu",
        lines: ["Zsynchronizuj przynajmniej jedno zrodlo i zostaw kilka widocznych artykulow przed podgladem digestu."],
      });
      return;
    }

    setDigestBusy(true);
    try {
      const { response, payload } = await fetchApi<DigestPreviewPayload>("/api/v1/digests/preview", {
        method: "POST",
        body: JSON.stringify(buildDigestSelectionPayload()),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie przygotowac podgladu digestu."));
      }

      startTransition(() => {
        setDigestPreview(payload.preview);
      });
      setFeedback({
        tone: "success",
        title: "Podglad digestu gotowy",
        lines: [
          `${payload.preview.stats.article_count} artykul(y) w ${payload.preview.stats.category_count} grupach kategorii.`,
          `${payload.preview.stats.word_count} slow, szacunkowo ${payload.preview.stats.estimated_read_minutes} min czytania.`,
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Podglad digestu nie powiodl sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setDigestBusy(false);
    }
  }

  async function handleDigestBuild() {
    if (queueItems.length === 0) {
      setFeedback({
        tone: "error",
        title: "Brak kandydatow do digestu",
        lines: ["Zsynchronizuj przynajmniej jedno zrodlo przed budowaniem artefaktu digestu."],
      });
      return;
    }

    setDigestBusy(true);
    try {
      const { response, payload } = await fetchApi<DigestHistoryPayload>("/api/v1/digests/build", {
        method: "POST",
        body: JSON.stringify(buildDigestSelectionPayload()),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie zbudowac digestu."));
      }

      await Promise.all([loadDigestHistory(), loadDeliveryLogs(payload.digest.id)]);
      setFeedback({
        tone: "success",
        title: "Artefakt digestu utworzony",
        lines: [
          `${payload.digest.title} z ${payload.digest.article_count} artykulami zostal zapisany lokalnie.`,
          payload.digest.artifact.path ? `Artefakt: ${payload.digest.artifact.path}` : "Metadane artefaktu jeszcze czekaja.",
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Budowa digestu nie powiodla sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setDigestBusy(false);
    }
  }

  async function handleSaveDeliverySettings() {
    setSettingsBusy(true);
    setDeliverySettingsMessage(null);
    try {
      const { response, payload } = await fetchApi<DeliverySettingsPayload>("/api/v1/settings/delivery", {
        method: "PATCH",
        body: JSON.stringify({
          smtp_host: settingsDraft.smtp_host || null,
          smtp_port: Number.parseInt(settingsDraft.smtp_port, 10) || 587,
          smtp_username: settingsDraft.smtp_username || null,
          smtp_password: settingsDraft.smtp_password || null,
          smtp_from: settingsDraft.smtp_from || null,
          kindle_email: settingsDraft.kindle_email || null,
        }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie zapisac ustawien wysylki."));
      }

      startTransition(() => {
        setDeliverySettings(payload.settings);
        setSettingsDraft((current) => ({
          ...current,
          smtp_password: "",
        }));
      });
      setDeliverySettingsMessage("Ustawienia wysylki zapisane.");
    } catch (error) {
      setDeliverySettingsMessage(error instanceof Error ? error.message : "Nie udalo sie zapisac ustawien wysylki.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleDeliverySettingsPreflight() {
    setDeliveryBusy(true);
    try {
      const { response, payload } = await fetchApi<DeliverySettingsPreflightPayload>("/api/v1/settings/delivery/preflight", {
        method: "POST",
        body: JSON.stringify({ check_connection: false }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie uruchomic preflightu ustawien."));
      }

      setFeedback({
        tone: payload.preflight.can_send ? "success" : "error",
        title: `Preflight ustawien: ${payload.preflight.status}`,
        lines: payload.preflight.checks.map((check) => `${check.name}: ${check.message}`),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Preflight ustawien nie powiodl sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function handleDeliveryPreflight(targetKind: "kindle" | "smtp") {
    if (!latestDigest) {
      setFeedback({
        tone: "error",
        title: "Brak dostepnego digestu",
        lines: ["Zbuduj artefakt digestu przed uruchomieniem preflightu wysylki."],
      });
      return;
    }

    setDeliveryBusy(true);
    try {
      const { response, payload } = await fetchApi<DeliveryPreflightPayload>("/api/v1/delivery/preflight", {
        method: "POST",
        body: JSON.stringify({
          digest_id: latestDigest.id,
          target_kind: targetKind,
        }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie uruchomic preflightu wysylki."));
      }

      startTransition(() => {
        setDeliveryPreflight(payload.preflight);
      });
      setFeedback({
        tone: payload.preflight.can_send ? "success" : "error",
        title: `Preflight wysylki: ${payload.preflight.status}`,
        lines: payload.preflight.checks.map((check) => `${check.name}: ${check.message}`),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Preflight wysylki nie powiodl sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setDeliveryBusy(false);
    }
  }

  async function handleSendDigest(mode: "dry_run" | "send", targetKind: "kindle" | "smtp") {
    if (!latestDigest) {
      setFeedback({
        tone: "error",
        title: "Brak dostepnego digestu",
        lines: ["Zbuduj artefakt digestu przed wysylka."],
      });
      return;
    }

    setDeliveryBusy(true);
    try {
      const { response, payload } = await fetchApi<DeliveryDispatchPayload>("/api/v1/delivery/send", {
        method: "POST",
        body: JSON.stringify({
          digest_id: latestDigest.id,
          target_kind: targetKind,
          mode,
        }),
      });
      if (!response.ok || isErrorEnvelope(payload)) {
        throw new Error(getPayloadMessage(payload, "Nie udalo sie wyslac digestu."));
      }

      startTransition(() => {
        setDeliveryPreflight(payload.preflight);
      });
      await Promise.all([loadDeliveryLogs(latestDigest.id), loadDigestHistory()]);
      setFeedback({
        tone: payload.run.status === "completed" ? "success" : "error",
        title: `Wysylka ${payload.run.status}`,
        lines: [
          `${payload.log.status} dla ${payload.log.target_kind} ${payload.log.recipient ?? "odbiorca jeszcze nieustalony"}.`,
          payload.log.provider_message_id ? `Id wiadomosci dostawcy: ${payload.log.provider_message_id}` : "Brak identyfikatora od dostawcy.",
        ],
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Wysylka nie powiodla sie",
        lines: [error instanceof Error ? error.message : "Nieznany blad przegladarki."],
      });
    } finally {
      setDeliveryBusy(false);
    }
  }

  function selectRelativeItem(offset: number) {
    if (queueItems.length === 0) {
      return;
    }

    const currentIndex = selectedItem ? queueItems.findIndex((item) => item.id === selectedItem.id) : 0;
    const nextIndex = clamp((currentIndex >= 0 ? currentIndex : 0) + offset, 0, queueItems.length - 1);
    setActiveItemId(queueItems[nextIndex].id);
  }

  function openSelectedSource() {
    if (!selectedItem || typeof window === "undefined") {
      return;
    }

    window.open(selectedItem.source_url, "_blank", "noopener,noreferrer");
  }

  function focusFirstItemFromChannel(channel: Channel) {
    const firstVisibleItem = queueItems.find((item) => item.channel_id === channel.id);
    if (firstVisibleItem) {
      if (currentSection !== "read") {
        router.push(
          buildAppHref({
            section: "read",
            libraryView,
            scope: showReadItems ? "all" : "unread",
            sort: itemSortMode,
            q: itemSearch.trim() || null,
            item: firstVisibleItem.id,
          }),
        );
      }
      setActiveItemId(firstVisibleItem.id);
      return;
    }

    setFeedback({
      tone: "idle",
      title: `${channel.title} jest gotowe`,
      lines: ["To zrodlo jest zapisane, ale nie ma jeszcze widocznego artykulu w biezacych filtrach listy."],
    });
  }

  function toggleBulkSelection(itemId: string) {
    setSelectedItemIds((current) =>
      current.includes(itemId) ? current.filter((candidate) => candidate !== itemId) : [...current, itemId],
    );
  }

  function selectVisibleItems() {
    setSelectedItemIds(queueItems.map((item) => item.id));
  }

  function clearBulkSelection() {
    setSelectedItemIds([]);
  }

  async function handleBulkAction(action: "read" | "save" | "digest" | "archive") {
    if (selectedBulkItems.length === 0 || bulkBusy) {
      return;
    }

    const patch =
      action === "read"
        ? { is_read: true }
        : action === "save"
          ? { library_action: "save" as const }
          : action === "archive"
            ? { library_action: "archive" as const }
            : { digest_candidate: true };

    const actionTitle =
      action === "read"
        ? "Masowo oznacz jako przeczytane"
        : action === "save"
          ? "Masowy zapis"
          : action === "archive"
            ? "Masowe archiwizowanie"
            : "Masowa kolejka digestu";

    setBulkBusy(true);
    const failures: string[] = [];
    const undoOperations: UndoOperation[] = [];

    for (const item of selectedBulkItems) {
      const undoPatch = buildUndoPatch(item, applyItemPatch(item, patch));
      const success = await mutateItemState(item, patch, {
        recordUndo: false,
      });
      if (!success) {
        failures.push(item.id);
      } else if (undoPatch) {
        undoOperations.push({
          item,
          patch: undoPatch,
        });
      }
    }

    setBulkBusy(false);
    setSelectedItemIds(failures);
    if (undoOperations.length > 0) {
      pushUndoEntry({
        id: `undo_${Date.now()}_bulk`,
        label: actionTitle,
        operations: undoOperations,
      });
    }
    setFeedback({
      tone: failures.length === 0 ? "success" : "error",
      title: actionTitle,
      lines:
        failures.length === 0
          ? [`Zaktualizowano ${selectedBulkItems.length} zaznaczonych pozycji.`]
          : [`Zaktualizowano ${selectedBulkItems.length - failures.length} pozycji, ${failures.length} nie powiodlo sie i pozostalo zaznaczonych.`],
    });
  }

  async function handlePresetAction(action: ReaderDecisionAction) {
    if (!selectedItem || itemActionId === selectedItem.id) {
      return;
    }

    const patch: ItemStatePatch = buildReaderDecisionPatch(action);
    const actionLabel = getReaderDecisionActionLabel(action);
    const nextItemId = resolveReaderDecisionNextItemId(queueItems, selectedItem.id);
    const didAdvance = didReaderDecisionAdvance(nextItemId, selectedItem.id);
    const keepReaderOpen = readingItemId === selectedItem.id;
    const success = await mutateItemState(selectedItem, patch, {
      undoLabel: actionLabel,
    });
    if (!success) {
      return;
    }

    if (didAdvance && nextItemId) {
      setActiveItemId(nextItemId);
      setReadingItemId(keepReaderOpen ? nextItemId : null);
    }

    setFeedback({
      tone: "success",
      title: actionLabel,
      lines: [getReaderDecisionResultLine(didAdvance)],
    });
  }

  const handleGlobalKeydown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (showKeyboardHelp) {
      if (event.key === "Escape" || event.key === "?") {
        event.preventDefault();
        setShowKeyboardHelp(false);
      }
      return;
    }

    const typing = isTypingTarget(event.target);
    const normalizedKey = event.key.toLowerCase();

    if (typing) {
      if (event.key === "Escape" && event.target instanceof HTMLElement) {
        event.preventDefault();
        event.target.blur();
      }
      return;
    }

    if (event.repeat && !["j", "k", "arrowdown", "arrowup"].includes(normalizedKey)) {
      return;
    }

    if (normalizedKey === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      selectRelativeItem(1);
      return;
    }

    if (normalizedKey === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      selectRelativeItem(-1);
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      return;
    }

    if (event.key === "?") {
      event.preventDefault();
      setShowKeyboardHelp(true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (itemSearch) {
        setItemSearch("");
        return;
      }

      if (selectedItemIds.length > 0) {
        clearBulkSelection();
        return;
      }

      if (isFocusedMode) {
        setIsFocusedMode(false);
      }
      return;
    }

    if (normalizedKey === "u") {
      event.preventDefault();
      setShowReadItems(false);
      return;
    }

    if (normalizedKey === "a") {
      event.preventDefault();
      setShowReadItems(true);
      return;
    }

    if (normalizedKey === "s") {
      event.preventDefault();
      navigateToReadLibraryView(libraryView === "saved" ? "inbox" : "saved");
      return;
    }

    if (normalizedKey === "e") {
      event.preventDefault();
      navigateToReadLibraryView(libraryView === "archive" ? "inbox" : "archive");
      return;
    }

    if (normalizedKey === "z") {
      event.preventDefault();
      setIsFocusedMode((current) => !current);
      return;
    }

    if (normalizedKey === "c") {
      event.preventDefault();
      setIsCompactList((current) => !current);
      return;
    }

    if (normalizedKey === "r") {
      event.preventDefault();
      if (event.shiftKey && !isSyncing && channels.length > 0) {
        void handleSyncAll();
        return;
      }

      void loadItems();
      return;
    }

    if (normalizedKey === "o") {
      event.preventDefault();
      openSelectedSource();
      return;
    }

    if (normalizedKey === "x" && selectedItem) {
      event.preventDefault();
      toggleBulkSelection(selectedItem.id);
      return;
    }

    if (event.key === "*") {
      event.preventDefault();
      if (selectedItemIds.length === queueItems.length) {
        clearBulkSelection();
      } else {
        selectVisibleItems();
      }
      return;
    }

    if (!selectedItem || itemActionId === selectedItem.id) {
      return;
    }

    if (event.shiftKey && normalizedKey === "m") {
      event.preventDefault();
      void handlePresetAction("read_next");
      return;
    }

    if (event.shiftKey && normalizedKey === "f") {
      event.preventDefault();
      void handlePresetAction("save_next");
      return;
    }

    if (event.shiftKey && normalizedKey === "d") {
      event.preventDefault();
      void handlePresetAction("digest_next");
      return;
    }

    if (normalizedKey === "m") {
      event.preventDefault();
      void mutateItemState(selectedItem, { is_read: !selectedItem.is_read });
      return;
    }

    if (normalizedKey === "f") {
      event.preventDefault();
      void mutateItemState(selectedItem, { library_action: selectedItem.is_favorite ? "unsave" : "save" });
      return;
    }

    if (normalizedKey === "d") {
      event.preventDefault();
      void mutateItemState(selectedItem, { digest_candidate: !selectedItem.digest_candidate });
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeydown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
    };
  }, [handleGlobalKeydown]);

  const handleReadingSurfaceScroll = useEffectEvent(() => {
    if (!selectedItem || readingItemId !== selectedItem.id || !articleContentRef.current) {
      return;
    }
    if (pendingReaderProgressRestoreRef.current[selectedItem.id]) {
      return;
    }

    const surface = articleContentRef.current;
    const { maxScroll, scrollTop } = getReaderScrollSnapshot(surface);
    const progress = maxScroll === 0 ? 100 : Math.round((scrollTop / maxScroll) * 100);
    const previous = readingProgressRef.current[selectedItem.id];

    if (previous && previous.progress === progress && Math.abs(previous.scrollTop - scrollTop) < 24) {
      return;
    }

    const nextSnapshot = {
      progress,
      scrollTop,
      updatedAt: new Date().toISOString(),
    };

    readingProgressRef.current = {
      ...readingProgressRef.current,
      [selectedItem.id]: nextSnapshot,
    };

    setReaderProgress((current) => ({
      ...current,
      [selectedItem.id]: nextSnapshot,
    }));
  });

  useEffect(() => {
    if (!selectedItem || readingItemId !== selectedItem.id || !articleContentRef.current) {
      return;
    }

    const handleWindowScroll = () => {
      handleReadingSurfaceScroll();
    };

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, [handleReadingSurfaceScroll, itemDetailStatus, readingItemId, selectedItem?.id]);

  function renderReaderContent() {
    if (itemsStatus === "loading" && queueItems.length === 0) {
      return (
        <div className="reader-state-card">
          <strong>Ladowanie kolejki czytnika</strong>
          <p>Pobieram `/api/v1/items` z biezacymi filtrami.</p>
          <div className="reader-skeleton-list">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="reader-skeleton-row" key={index} />
            ))}
          </div>
        </div>
      );
    }

    if (itemsStatus === "unsupported") {
      return (
        <div className="reader-state-card">
          <strong>Endpoint biblioteki czytnika jest niedostepny</strong>
          <p>{itemsMessage}</p>
          <p>Sprawdz lokalny runtime API albo zrestartuj uslugi aplikacji i sprobuj ponownie.</p>
        </div>
      );
    }

    if (itemsStatus === "error" && queueItems.length === 0) {
      return (
        <div className="reader-state-card reader-state-card-error">
          <strong>Nie udalo sie wczytac kolejki czytnika</strong>
          <p>{itemsMessage ?? "Nieznany blad ladowania artykulow."}</p>
          <button className="mini-button mini-button-accent" onClick={() => void loadItems()} type="button">
            Sprobuj ponownie
          </button>
        </div>
      );
    }

    if (queueItems.length === 0) {
      const emptyLine =
        channels.length === 0
          ? "Dodaj zrodlo w prawym panelu, aby utworzyc pierwszy feed."
          : syncRuns.length === 0
            ? "Uruchom pierwszy reczny sync. Nowe artykuly pojawia sie tutaj po imporcie."
            : "Zaden artykul nie pasuje jeszcze do biezacych filtrow.";

      return (
        <div className="reader-state-card">
          <strong>Kolejka jest pusta</strong>
          <p>{emptyLine}</p>
          {isFocusedMode ? <p>Tryb focus ukrywa panel operacji. Nacisnij Z, aby przywrocic sterowanie.</p> : null}
          {itemsPage?.has_more ? <p>Wyzej sa jeszcze kolejne artykuly, ale biezacy widok kursora jest pusty.</p> : null}
        </div>
      );
    }

    return (
      <div className={`reader-grid ${isCompactList ? "reader-grid-compact" : ""}`}>
        <section className="reader-list-panel">
          <div className="reader-list-header">
            <div className="reader-list-summary">
              <span className="panel-badge">{isCompactList ? "Zwarta kolumna" : "Kolumna czytnika"}</span>
              <strong>
                {selectedItemIndex >= 0 ? `${selectedItemIndex + 1} / ${queueItems.length}` : `0 / ${queueItems.length}`}
              </strong>
            </div>
            <span>{itemsRefreshing ? "Odswiezanie..." : itemsPage?.has_more ? "Wiecej wyzej" : "Lokalny wycinek"}</span>
          </div>

          <ArticleQueueList
            activeItemId={selectedItem?.id ?? null}
            busyItemId={itemActionId}
            channelTitles={channelTitles}
            compact={isCompactList}
            formatTimestamp={formatTimestamp}
            getSearchFieldLabel={getSearchFieldLabel}
            items={queueItems}
            onSelect={(itemId) => setActiveItemId(itemId)}
            onToggleBulk={(itemId) => toggleBulkSelection(itemId)}
            onToggleDigest={(itemId) => {
              const item = queueItems.find((candidate) => candidate.id === itemId);
              if (item) {
                void mutateItemState(item, { digest_candidate: !item.digest_candidate });
              }
            }}
            onToggleFavorite={(itemId) => {
              const item = queueItems.find((candidate) => candidate.id === itemId);
              if (item) {
                void mutateItemState(item, { library_action: item.is_favorite ? "unsave" : "save" });
              }
            }}
            onToggleRead={(itemId) => {
              const item = queueItems.find((candidate) => candidate.id === itemId);
              if (item) {
                void mutateItemState(item, { is_read: !item.is_read });
              }
            }}
            progressByItemId={Object.fromEntries(
              queueItems.map((item) => [item.id, readerProgress[item.id]?.progress]),
            )}
            registerRow={(itemId, node) => {
              if (node) {
                itemRowRefs.current.set(itemId, node);
              } else {
                itemRowRefs.current.delete(itemId);
              }
            }}
            selectedItemIds={selectedItemIds}
          />

          {itemsPage?.has_more ? (
            <div className="reader-list-footer">
              <button className="mini-button" disabled={itemsRefreshing} onClick={() => void loadMoreItems()} type="button">
                {itemsRefreshing ? "Ladowanie..." : "Wczytaj wiecej"}
              </button>
            </div>
          ) : null}
        </section>

        <aside className="reader-preview-panel">
          {selectedItem ? (
            <>
              {(() => {
                const previewItem = itemDetail && itemDetail.id === selectedItem.id ? itemDetail : selectedItem;
                const isReadingArticle = readingItemId === selectedItem.id;
                const qualityState = getReaderQualityState(selectedItem, itemDetail, itemDetailStatus);
                const readerWordCount =
                  itemDetail && itemDetail.id === selectedItem.id
                    ? countWords(itemDetail.content_text ?? itemDetail.excerpt)
                    : countWords(selectedItem.excerpt);
                const highlightCount = itemAnnotations.filter((annotation) => annotation.kind === "highlight").length;
                const noteCount = itemAnnotations.filter((annotation) => annotation.kind === "note").length;
                const sanitizedCleanedHtml =
                  itemDetail && itemDetail.id === selectedItem.id
                    ? sanitizeReaderHtml(itemDetail.cleaned_html, selectedItem.title)
                    : null;
                const readerView =
                  itemDetail && itemDetail.id === selectedItem.id
                    ? sanitizedCleanedHtml
                      ? "cleaned_html"
                      : itemDetail.content_text
                        ? "content_text"
                        : itemDetail.excerpt
                          ? "excerpt"
                          : "missing"
                    : selectedItem.excerpt
                      ? "excerpt"
                      : "missing";
                const highlightedCleanedHtml =
                  itemDetail && itemDetail.id === selectedItem.id && sanitizedCleanedHtml
                    ? renderInlineHighlightHtml(sanitizedCleanedHtml, itemAnnotations)
                    : null;
                const bodyParagraphs =
                  itemDetail && itemDetail.id === selectedItem.id
                    ? readerView === "content_text"
                      ? sanitizeReaderParagraphs(splitReaderParagraphs(itemDetail.content_text), selectedItem.title)
                      : readerView === "excerpt"
                        ? sanitizeReaderParagraphs(splitReaderParagraphs(itemDetail.excerpt), selectedItem.title)
                        : []
                    : sanitizeReaderParagraphs(splitReaderParagraphs(selectedItem.excerpt), selectedItem.title);
                const resumeProgress = readerProgress[selectedItem.id];
                const readerSurfaceClasses = [
                  "reader-reading-surface",
                  `reader-reading-surface-width-${readerWidthMode}`,
                  `reader-reading-surface-text-${readerTextMode}`,
                  `reader-reading-surface-media-${readerImageMode}`,
                ].join(" ");

                return (
                  <>
              <div className="reader-preview-topline">
                <div className="reader-preview-meta">
                  <span className="panel-badge">{isFocusedMode ? "Tryb focus" : "Wybrany artykul"}</span>
                  <a href={selectedItem.source_url} rel="noreferrer" target="_blank">
                    Otworz zrodlo
                  </a>
                </div>
                <span className="reader-preview-position">
                  Kolejka {selectedItemIndex >= 0 ? selectedItemIndex + 1 : 0} z {queueItems.length}
                </span>
              </div>

              <h3>{previewItem.title}</h3>
              <div className="reader-preview-stack">
                <span>{previewItem.channel.title ?? channelTitles[previewItem.channel_id] ?? "Nieznane zrodlo"}</span>
                <span>{formatTimestamp(previewItem.published_at, "Nieznany czas publikacji")}</span>
                <span>{previewItem.author ? previewItem.author : "Autor nieznany"}</span>
              </div>

              <div className="reader-preview-actions">
                <button
                  className="action-button"
                  disabled={itemDetailStatus === "loading" && !isReadingArticle}
                  onClick={() => {
                    if (qualityState.allowsInApp) {
                      setReadingItemId((current) => (current === selectedItem.id ? null : selectedItem.id));
                      return;
                    }

                    openSelectedSource();
                  }}
                  type="button"
                >
                  {isReadingArticle ? "Ukryj artykul" : qualityState.allowsInApp ? "Czytaj artykul" : "Otworz zrodlo"}
                </button>
                <button
                  className="secondary-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void mutateItemState(selectedItem, { is_read: !selectedItem.is_read })}
                  type="button"
                >
                  <span className="button-with-icon">
                    <ReaderIcon className="app-icon button-inline-icon" />
                    {selectedItem.is_read ? "Oznacz jako nieprzeczytane (M)" : "Oznacz jako przeczytane (M)"}
                  </span>
                </button>
                <button
                  className="secondary-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void mutateItemState(selectedItem, { digest_candidate: !selectedItem.digest_candidate })}
                  type="button"
                >
                  <span className="button-with-icon">
                    <DigestIcon className="app-icon button-inline-icon" />
                    {selectedItem.digest_candidate ? "Usun z digestu (D)" : "Dodaj do digestu (D)"}
                  </span>
                </button>
                <button
                  className="secondary-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() =>
                    void mutateItemState(selectedItem, {
                      library_action: selectedItem.is_favorite ? "unsave" : "save",
                    })
                  }
                  type="button"
                >
                  <span className="button-with-icon">
                    <BookmarkIcon className="app-icon button-inline-icon" />
                    {selectedItem.is_favorite ? "Cofnij zapis (F)" : "Zapisz na krotkiej liscie (F)"}
                  </span>
                </button>
                <button
                  className="mini-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() =>
                    void mutateItemState(selectedItem, {
                      library_action: selectedItem.is_archived ? "restore" : "archive",
                    })
                  }
                  type="button"
                >
                  <span className="button-with-icon">
                    <ArchiveIcon className="app-icon button-inline-icon" />
                    {selectedItem.is_archived ? "Przywroc" : "Archiwizuj"}
                  </span>
                </button>
                <button
                  className="mini-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void handlePresetAction("read_next")}
                  type="button"
                >
                  <span className="button-with-icon">
                    <ReaderIcon className="app-icon button-inline-icon" />
                    Przeczytaj + dalej
                  </span>
                </button>
                <button
                  className="mini-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void handlePresetAction("save_next")}
                  type="button"
                >
                  <span className="button-with-icon">
                    <BookmarkIcon className="app-icon button-inline-icon" />
                    Zapisz + dalej
                  </span>
                </button>
                <button
                  className="mini-button"
                  disabled={itemActionId === selectedItem.id}
                  onClick={() => void handlePresetAction("digest_next")}
                  type="button"
                >
                  Digest + dalej
                </button>
              </div>

              <div className={`reader-quality-card reader-quality-card-${qualityState.kind}`}>
                <div className="reader-quality-card-header">
                  <span className="panel-badge">{qualityState.badge}</span>
                  <strong>{qualityState.heading}</strong>
                </div>
                <p>{qualityState.description}</p>
                {highlightCount > 0 || noteCount > 0 ? (
                  <div className="reader-highlight-meta">
                    {highlightCount > 0 ? <span className="reader-progress-chip">{highlightCount} podkreslen{highlightCount === 1 ? "ie" : "ia"}</span> : null}
                    {noteCount > 0 ? <span className="reader-progress-chip">{noteCount} notatk{noteCount === 1 ? "a" : "i"}</span> : null}
                  </div>
                ) : null}
                {resumeProgress && resumeProgress.progress > 2 ? (
                  <span className="reader-progress-chip">Wznow na tym urzadzeniu: {resumeProgress.progress}%</span>
                ) : null}
              </div>

              <div className="reader-preview-body">
                <p className="reader-preview-note">
                  {itemDetailStatus === "loading"
                    ? "Ladowanie pelnego widoku artykulu..."
                    : itemDetailStatus === "ready" && itemDetail && itemDetail.id === selectedItem.id
                      ? readerView === "cleaned_html"
                        ? `Gotowy oczyszczony widok | ${readerWordCount} slow`
                        : readerView === "content_text"
                          ? `Fallback czytnika uzywa wyekstrahowanego tekstu | ${readerWordCount} slow`
                          : readerView === "excerpt"
                            ? "Dla tego artykulu jest teraz dostepny tylko poziom skrotu."
                            : "Brak czytelnej tresci artykulu."
                      : itemDetailStatus === "unsupported"
                        ? "Endpoint szczegolow jest niedostepny, wiec czytnik opiera sie tylko na metadanych kolejki."
                        : itemDetailStatus === "error"
                          ? itemDetailMessage ?? "Nie udalo sie wczytac szczegolow artykulu."
                          : previewItem.excerpt
                            ? "Czytnik uzywa zapisanego skrotu, dopoki pelna tresc sie nie ustabilizuje."
                            : "Brak skrotu dla tego artykulu."}
                </p>

                <div className="reader-display-controls">
                  <div className="reader-display-group">
                    <span>Szerokosc</span>
                    <div className="reader-display-toggle" role="group" aria-label="Szerokosc czytnika">
                      {(["narrow", "comfortable", "wide"] as ReaderWidthMode[]).map((option) => (
                        <button
                          className={readerWidthMode === option ? "reader-display-toggle-active" : ""}
                          key={option}
                          onClick={() => setReaderWidthMode(option)}
                          type="button"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="reader-display-group">
                    <span>Tekst</span>
                    <div className="reader-display-toggle" role="group" aria-label="Skala tekstu czytnika">
                      {(["standard", "large"] as ReaderTextMode[]).map((option) => (
                        <button
                          className={readerTextMode === option ? "reader-display-toggle-active" : ""}
                          key={option}
                          onClick={() => setReaderTextMode(option)}
                          type="button"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="reader-display-group">
                    <span>Media</span>
                    <div className="reader-display-toggle" role="group" aria-label="Tryb mediow czytnika">
                      {(["safe", "immersive"] as ReaderImageMode[]).map((option) => (
                        <button
                          className={readerImageMode === option ? "reader-display-toggle-active" : ""}
                          key={option}
                          onClick={() => setReaderImageMode(option)}
                          type="button"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {!isReadingArticle ? (
                  <div className="reader-article-gate">
                    <strong>{qualityState.allowsInApp ? "Czytaj artykul w aplikacji" : "Fallback zrodla"}</strong>
                    <p>{qualityState.description}</p>
                    <div className="reader-gate-actions">
                      <button
                        className="action-button"
                        disabled={itemDetailStatus === "loading"}
                        onClick={() => {
                          if (qualityState.allowsInApp) {
                            setReadingItemId(selectedItem.id);
                            return;
                          }

                          openSelectedSource();
                        }}
                        type="button"
                      >
                        {resumeProgress && resumeProgress.progress > 2
                          ? `Resume ${resumeProgress.progress}%`
                          : qualityState.actionLabel}
                      </button>
                      <button className="secondary-button" onClick={openSelectedSource} type="button">
                        Otworz zrodlo
                      </button>
                    </div>
                  </div>
                ) : itemDetailStatus === "loading" ? (
                  <div className="reader-article-loading" ref={articleContentRef}>
                    Przygotowywanie lokalnego widoku czytania.
                  </div>
                ) : itemDetailStatus === "ready" && itemDetail && itemDetail.id === selectedItem.id && readerView === "cleaned_html" && sanitizedCleanedHtml ? (
                  <div
                    className={readerSurfaceClasses}
                    onScroll={handleReadingSurfaceScroll}
                    ref={articleContentRef}
                  >
                    <div
                      className="reader-article-prose"
                      dangerouslySetInnerHTML={{ __html: highlightedCleanedHtml ?? sanitizedCleanedHtml }}
                    />
                  </div>
                ) : bodyParagraphs.length > 0 ? (
                  <div
                    className={readerSurfaceClasses}
                    onScroll={handleReadingSurfaceScroll}
                    ref={articleContentRef}
                  >
                    <div className="reader-article-prose">
                      {bodyParagraphs.map((paragraph) => (
                        <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="reader-article-loading reader-article-loading-empty" ref={articleContentRef}>
                    Brak oczyszczonej tresci artykulu. Uzyj linku do zrodla jako fallbacku.
                  </div>
                )}
              </div>

              <dl className="reader-preview-facts">
                <div>
                  <dt>Status</dt>
                  <dd>{previewItem.is_read ? "Przeczytane" : "Nieprzeczytane"}</dd>
                </div>
                <div>
                  <dt>Zapisanie</dt>
                  <dd>{previewItem.is_favorite ? "Zapisane" : "Niezapisane"}</dd>
                </div>
                <div>
                  <dt>Biblioteka</dt>
                  <dd>{getLibraryViewLabel(previewItem.is_archived ? "archive" : previewItem.is_favorite ? "saved" : "inbox")}</dd>
                </div>
                <div>
                  <dt>Digest</dt>
                  <dd>{getDigestStatusLabel(previewItem.digest.status)}</dd>
                </div>
                <div>
                  <dt>Ekstrakcja</dt>
                  <dd>{getExtractionStatusLabel(previewItem.extraction_status)}</dd>
                </div>
                <div>
                  <dt>Tresc</dt>
                  <dd>{previewItem.has_cleaned_content ? "Oczyszczona" : previewItem.has_raw_content ? "Tylko surowa" : "Brak"}</dd>
                </div>
                <div>
                  <dt>Zrodlo</dt>
                  <dd>{previewItem.channel.title ?? channelTitles[previewItem.channel_id] ?? "Nieznane zrodlo"}</dd>
                </div>
                <div>
                  <dt>Notatka digestu</dt>
                  <dd>{previewItem.digest.reason}</dd>
                </div>
                <div>
                  <dt>Widok czytnika</dt>
                  <dd>
                    {itemDetail && itemDetail.id === selectedItem.id
                      ? readerView
                      : itemDetailStatus === "loading"
                        ? "ladowanie"
                        : "skrot"}
                  </dd>
                </div>
                <div>
                  <dt>Postep</dt>
                  <dd>{resumeProgress ? `${resumeProgress.progress}% na tym urzadzeniu` : "Nie zaczeto"}</dd>
                </div>
              </dl>
                  </>
                );
              })()}
            </>
          ) : (
            <div className="reader-state-card">
              <strong>Wybierz artykul</strong>
              <p>Panel podgladu pokazuje wybrany artykul i dostepne akcje stanu.</p>
            </div>
          )}
        </aside>
      </div>
    );
  }

  const latestRun = syncRuns[0] ?? null;
  const latestRunSummaryLine = getSyncRunSummaryLine(latestRun);
  const firstDigestCandidate = queueItems.find((item) => item.digest_candidate) ?? null;
  const currentSourceAddMode = sourceAddModes.find((entry) => entry.id === sourceAddMode) ?? sourceAddModes[0];
  const sourcePreviewPool = useMemo(() => {
    const seen = new Set<string>();
    const entries: ChannelPreviewCandidate[] = [];

    const collect = (candidate: ChannelPreviewCandidate | null | undefined) => {
      if (!candidate || seen.has(candidate.feed_url)) {
        return;
      }
      seen.add(candidate.feed_url);
      entries.push(candidate);
    };

    collect(channelPreview?.feed);
    for (const candidate of channelPreview?.candidates ?? []) {
      collect(candidate);
    }

    return entries;
  }, [channelPreview]);
  const sourceLanguageOptions = useMemo(() => {
    const entries = new Map<string, string>([["all", "Wszystkie wyniki"]]);

    for (const candidate of sourcePreviewPool) {
      const value = candidate.language?.trim().toLowerCase() || "unknown";
      if (!entries.has(value)) {
        entries.set(value, getSourceLanguageLabel(candidate.language));
      }
    }

    return Array.from(entries.entries()).map(([value, label]) => ({ value, label }));
    }, [sourcePreviewPool]);
  const visibleSourceCandidates = useMemo(() => {
    return sourcePreviewPool.filter((candidate) => {
      if (sourceLanguageFilter === "all") {
        return true;
      }

      const candidateLanguage = candidate.language?.trim().toLowerCase() || "unknown";
      return candidateLanguage === sourceLanguageFilter;
    });
  }, [sourceLanguageFilter, sourcePreviewPool]);
  const primarySourceCandidate = visibleSourceCandidates[0] ?? sourcePreviewPool[0] ?? null;
  const sourceExistingChannel = useMemo(() => {
    const existingChannelId = channelPreview?.existing_channel?.id ?? primarySourceCandidate?.existing_channel_id ?? null;
    if (!existingChannelId) {
      return null;
    }
    return channels.find((channel) => channel.id === existingChannelId) ?? channelPreview?.existing_channel ?? null;
  }, [channelPreview, channels, primarySourceCandidate]);
  const sourcePreviewState = getSourcePreviewUiState({
    previewBusy,
    preview: channelPreview
      ? {
          status: channelPreview.status,
          feed: channelPreview.feed,
        }
      : null,
    hasError: feedback.tone === "error",
  });
  const sourcePreviewAnnouncement = useMemo(
    () =>
      getSourcePreviewAnnouncement({
        uiState: sourcePreviewState,
        resultCount: sourcePreviewState === "multiple_candidates" ? visibleSourceCandidates.length : primarySourceCandidate ? 1 : 0,
        feedbackTitle: feedback.tone === "error" ? feedback.title : null,
        feedbackLines: feedback.tone === "error" ? feedback.lines : [],
      }),
    [feedback.lines, feedback.title, feedback.tone, primarySourceCandidate, sourcePreviewState, visibleSourceCandidates.length],
  );
  const sourcePreviewItems = primarySourceCandidate?.sample_items ?? [];
  const sourcePrimaryMetrics = useMemo(
    () =>
      buildSourcePreviewMetrics({
        candidate: primarySourceCandidate,
        unreadCount: sourceExistingChannel?.unread_count ?? null,
        discoveryLabel: getSourceDiscoveryModeLabel(channelPreview?.discovery.mode),
        languageLabel: primarySourceCandidate ? getSourceLanguageLabel(primarySourceCandidate.language) : null,
      }),
    [channelPreview?.discovery.mode, primarySourceCandidate, sourceExistingChannel?.unread_count],
  );
  const sourceTopicChips = useMemo(() => {
    return buildSourcePreviewTopics({
      category,
      existingCategory: sourceExistingChannel?.category ?? null,
      inputUrl,
      feedUrl: primarySourceCandidate?.feed_url ?? null,
      siteUrl: primarySourceCandidate?.site_url ?? null,
      language: primarySourceCandidate?.language ?? null,
      modeLabel: currentSourceAddMode.label,
      sampleItems: primarySourceCandidate?.sample_items ?? [],
      sourceGroupNames: sourceGroups.map((group) => group.name),
    });
  }, [category, currentSourceAddMode.label, inputUrl, primarySourceCandidate, sourceExistingChannel, sourceGroups]);
  const shouldShowSourceFeedback = feedback.tone !== "idle" || subscribeBusy || opmlImportBusy || captureBusy || sourcePreviewState === "error";
  const hasReaderSearch = deferredItemSearch.trim().length > 0;

  useEffect(() => {
    if (!sourceLanguageOptions.some((option) => option.value === sourceLanguageFilter)) {
      setSourceLanguageFilter("all");
    }
  }, [sourceLanguageFilter, sourceLanguageOptions]);

  useEffect(() => {
    return () => {
      sourcePreviewAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const target = pendingSourceFocusTargetRef.current;
    if (!target) {
      return;
    }

    if (target === "category") {
      if (!showSourceOptions || !sourceCategoryInputRef.current) {
        return;
      }
      sourceCategoryInputRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
      return;
    }

    if (target === "backoffice") {
      if (sourceSurfaceMode !== "manage" || !sourceBackofficeRegionRef.current) {
        return;
      }
      sourceBackofficeRegionRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
      return;
    }

    if (target === "results") {
      if (sourcePreviewState === "loading" || !sourceResultsRegionRef.current) {
        return;
      }
      sourceResultsRegionRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
      return;
    }

    if (target === "import") {
      if (sourceAddMode !== "import_feeds" || !sourceImportTextareaRef.current) {
        return;
      }
      sourceImportTextareaRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
      return;
    }

    if (target === "input" && sourceInputRef.current) {
      sourceInputRef.current.focus();
      pendingSourceFocusTargetRef.current = null;
    }
  }, [showSourceOptions, sourceAddMode, sourcePreviewState, sourceSurfaceMode]);

  const readerSectionLabel =
    libraryView === "continue"
      ? "Kontynuuj czytanie"
      : libraryView === "saved"
      ? showReadItems
        ? "Zapisane artykuly"
        : "Nieprzeczytane zapisane"
      : libraryView === "digest"
        ? showReadItems
          ? "Kolejka digestu"
          : "Nieprzeczytana kolejka digestu"
      : libraryView === "archive"
        ? "Zarchiwizowane artykuly"
      : showReadItems
          ? "Skrzynka"
          : "Nieprzeczytana skrzynka";

  const uiRuntimeLinks = [
    { href: "/api/health", label: "Stan web" },
    { href: `${apiBaseUrl}/health`, label: "Stan API" },
    { href: "/api/diagnostics/startup", label: "Diagnostyka" },
  ];
  const uiTopRankingItems = rankingItems.slice(0, 8);
  const uiSectionCopy: Record<AppSection, { eyebrow: string; title: string; description: string }> = {
    read: {
      eyebrow: "Czytaj",
      title: readerSectionLabel,
      description: deferredItemSearch.trim()
        ? `Wyniki wyszukiwania dla "${deferredItemSearch.trim()}".`
        : "Czytaj, triage'uj i wracaj do kolejki bez przechodzenia przez panele operacyjne.",
    },
    discover: {
      eyebrow: "Odkrywaj",
      title: "Przeglad dnia",
      description: "Briefing, rekomendacje i klastry historii pomagajace zdecydowac, co warto przeczytac teraz.",
    },
    sources: {
      eyebrow: "Zrodla",
      title: "Dodawanie zrodel",
      description: "Dodaj strone albo feed, zobacz wynik discovery i dopiero wtedy zapisz zrodlo do biblioteki.",
    },
    digest: {
      eyebrow: "Digest",
      title: "Digest i dostarczanie",
      description: "Buduj preview, eksportuj EPUB i wysylaj wydania bez mieszania tego z codziennym czytaniem.",
    },
    settings: {
      eyebrow: "Ustawienia",
      title: "Ustawienia i profil czytania",
      description: "Konfiguracja delivery, preferencje rankingu i runtime helpers w jednym miejscu.",
    },
  };

  const uiGlobalNav = [
    {
      id: "read" as const,
      shortLabel: "R",
      label: "Czytaj",
      icon: <ReaderIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({
        section: "read",
        libraryView,
        scope: showReadItems ? "all" : "unread",
        sort: itemSortMode,
        q: itemSearch.trim() || null,
        item: activeItemId,
      }),
      meta: totalUnreadCount,
    },
    {
      id: "discover" as const,
      shortLabel: "O",
      label: "Odkrywaj",
      icon: <DiscoverIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({ section: "discover" }),
      meta: uiTopRankingItems.length,
    },
    {
      id: "sources" as const,
      shortLabel: "Z",
      label: "Zrodla",
      icon: <SourcesIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({ section: "sources" }),
      meta: activeChannelCount,
    },
    {
      id: "digest" as const,
      shortLabel: "D",
      label: "Digest",
      icon: <DigestIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({ section: "digest" }),
      meta: digestCandidateIds.length,
    },
    {
      id: "settings" as const,
      shortLabel: "U",
      label: "Ustawienia",
      icon: <SettingsIcon className="app-icon workspace-nav-rail-glyph" />,
      href: buildAppHref({ section: "settings" }),
      meta: deliverySettings?.smtp_ready ? "ok" : "cfg",
    },
  ];
  const currentSectionNavItem = uiGlobalNav.find((item) => item.id === currentSection) ?? uiGlobalNav[0];
  const activeFeedScopeBaseLabel =
    feedFilter.kind === "channel"
      ? channelTitles[feedFilter.value] ?? "Wybrane zrodlo"
      : feedFilter.kind === "category"
        ? feedFilter.value
        : "Wszystkie feedy";
  const activeFeedScopeLabel =
    libraryView === "inbox"
      ? activeFeedScopeBaseLabel
      : `${getLibraryViewLabel(libraryView)} - ${activeFeedScopeBaseLabel}`;

  function navigateToReadLibraryView(
    nextLibraryView: LibraryView,
    options?: {
      itemId?: string | null;
      search?: string | null;
      showReadItems?: boolean;
      sort?: ItemSortMode;
      surface?: "article" | "browse";
    },
  ) {
    const hasSearchOverride = options?.search !== undefined;
    const nextShowReadItems = options?.showReadItems ?? viewPreferences[nextLibraryView]?.showReadItems ?? showReadItems;
    const nextSort = options?.sort ?? itemSortMode;
    const nextItemId = options?.itemId ?? null;
    const nextSearchText = (hasSearchOverride ? (options?.search ?? "") : itemSearch).trim();
    const shouldOpenArticle = options?.surface === "article" && Boolean(nextItemId);
    const nextReadingItemId = shouldOpenArticle && nextItemId ? nextItemId : null;
    const continuity: ReaderContinuitySnapshot = {
      section: "read",
      activeItemId: nextItemId,
      readingItemId: nextReadingItemId,
      showReadItems: nextShowReadItems,
      libraryView: nextLibraryView,
      itemSearch: nextSearchText,
    };
    const href = buildAppHref({
      section: "read",
      libraryView: nextLibraryView,
      scope: nextShowReadItems ? "all" : "unread",
      sort: nextSort,
      q: nextSearchText || null,
      item: nextItemId,
      surface: shouldOpenArticle ? "article" : null,
    });

    pendingContinuityRouteRestoreRef.current = {
      href,
      section: "read",
      continuity,
    };
    setViewPreferences((current) =>
      patchViewPreferenceMap(current, nextLibraryView, {
        showReadItems: nextShowReadItems,
        sort: nextSort,
      }),
    );
    setPreferredSection("read");
    setLibraryView(nextLibraryView);
    setShowReadItems(nextShowReadItems);
    setItemSortMode(nextSort);
    if (hasSearchOverride) {
      setItemSearch(nextSearchText);
    }
    setActiveItemId(nextItemId);
    setReadingItemId(nextReadingItemId);
    setReadSurfaceMode(shouldOpenArticle ? "article" : "browse");
    router.push(href);
  }

  function folderContainsSelectedFilter(folder: FeedBrowserTreeFolder): boolean {
    if (feedFilter.kind === "category" && feedFilter.value === folder.id) {
      return true;
    }

    if (feedFilter.kind === "channel" && folder.channels.some((channel) => channel.id === feedFilter.value)) {
      return true;
    }

    return folder.children.some((child) => folderContainsSelectedFilter(child));
  }

  type FeedBrowserFolderNode = {
    id: string;
    label: string;
    meta: string | number;
    active?: boolean;
    expanded?: boolean;
    onSelect: () => void;
    onToggle: () => void;
    children: FeedBrowserFolderNode[];
    channels: {
      id: string;
      label: string;
      siteUrl: string | null;
      meta: string | number;
      active?: boolean;
      onSelect: () => void;
    }[];
  };

  function mapFolderToFeedBrowserNode(folder: FeedBrowserTreeFolder): FeedBrowserFolderNode {
    const isActive = feedFilter.kind === "category" && feedFilter.value === folder.id;
    const isExpanded = isActive || folderContainsSelectedFilter(folder) || !collapsedFeedFolders.includes(folder.id);

    return {
      id: folder.id,
      label: folder.label,
      meta: folder.unreadCount,
      active: isActive,
      expanded: isExpanded,
      onSelect: () => {
        setFeedFilter({ kind: "category", value: folder.id });
        setIsSidebarOpen(false);
      },
      onToggle: () =>
        setCollapsedFeedFolders((current) =>
          current.includes(folder.id)
            ? current.filter((entry) => entry !== folder.id)
            : [...current, folder.id],
        ),
      children: folder.children.map((child) => mapFolderToFeedBrowserNode(child)),
      channels: folder.channels.map((channel) => ({
        id: channel.id,
        label: channel.label,
        siteUrl: channel.siteUrl,
        meta: channel.unreadCount,
        active: feedFilter.kind === "channel" && feedFilter.value === channel.id,
        onSelect: () => {
          setFeedFilter({ kind: "channel", value: channel.id });
          setIsSidebarOpen(false);
        },
      })),
    };
  }

  function renderUiFeedbackCard(options?: { live?: boolean; regionId?: string; testId?: string }) {
    return (
      <section
        aria-atomic={options?.live ? "true" : undefined}
        aria-live={options?.live ? "polite" : undefined}
        className={`feedback-card feedback-${feedback.tone}`}
        data-testid={options?.testId}
        id={options?.regionId}
        role={options?.live ? "status" : undefined}
      >
        <strong>{feedback.title}</strong>
        <ul className="feedback-list">
          {feedback.lines.map((line, lineIndex) => (
            <li key={`${line}-${lineIndex}`}>{line}</li>
          ))}
        </ul>
      </section>
    );
  }

  function renderUiReadRail() {
    return (
      <div className="screen-stack">
        <WorkspacePanel
          description="Kanoniczne widoki biblioteki. Tutaj zaczyna sie codzienna sesja czytania."
          eyebrow={
            <span className="workspace-eyebrow-with-icon">
              <LibraryIcon className="app-icon app-icon-xs" />
              Biblioteka
            </span>
          }
          title="Widoki czytelnika"
        >
          <LibraryViewsNav
            items={[
              {
                id: "inbox",
                label: "Skrzynka",
                meta: libraryView === "inbox" ? queueItems.length : totalUnreadCount,
                hint: "Domyslny przeplyw",
                active: libraryView === "inbox",
                onSelect: () => navigateToReadLibraryView("inbox"),
              },
              {
                id: "continue",
                label: "Kontynuuj",
                meta: libraryView === "continue" ? queueItems.length : continueReadingCount,
                hint: "Wroc do rozpoczetego czytania",
                active: libraryView === "continue",
                onSelect: () => navigateToReadLibraryView("continue"),
              },
              {
                id: "saved",
                label: "Zapisane",
                meta: libraryView === "saved" ? queueItems.length : visibleFavoriteCount,
                hint: "Wazne na pozniej",
                active: libraryView === "saved",
                onSelect: () => navigateToReadLibraryView("saved"),
              },
              {
                id: "digest",
                label: "Digest queue",
                meta: libraryView === "digest" ? queueItems.length : digestCandidateIds.length,
                hint: "Krotka lista do wydania",
                active: libraryView === "digest",
                highlighted: Boolean(firstDigestCandidate),
                onSelect: () => {
                  if (firstDigestCandidate) {
                    navigateToReadLibraryView("digest", {
                      itemId: firstDigestCandidate.id,
                    });
                    return;
                  }
                  setFeedback({
                    tone: "idle",
                    title: "Kolejka digestu jest pusta",
                    lines: ["Oznacz artykuly klawiszem D albo przyciskiem Digest, aby przygotowac kolejne wydanie."],
                  });
                },
              },
              {
                id: "archive",
                label: "Archiwum",
                meta: libraryView === "archive" ? queueItems.length : archivedChannelCount,
                hint: "Historia i odzyskiwanie",
                active: libraryView === "archive",
                onSelect: () => navigateToReadLibraryView("archive"),
              },
            ]}
          />
        </WorkspacePanel>

        <WorkspacePanel
          description="Szybkie wejscia do biblioteki, kiedy nie chcesz zaczynac od surowej chronologii."
          eyebrow={
            <span className="workspace-eyebrow-with-icon">
              <ReaderIcon className="app-icon app-icon-xs" />
              Powroty
            </span>
          }
          title="Szybkie sciezki"
          tone="success"
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <WorkspaceButton
              active={recallWindow === "all" && libraryView === "inbox"}
              onClick={() => {
                setRecallWindow("all");
                navigateToReadLibraryView("inbox", { showReadItems: true });
              }}
            >
              Cala kolejka
            </WorkspaceButton>
            <WorkspaceButton
              active={recallWindow === "today"}
              onClick={() => {
                setRecallWindow("today");
                navigateToReadLibraryView("inbox", { showReadItems: true });
              }}
              tone="accent"
            >
              Dzis
            </WorkspaceButton>
            <WorkspaceButton
              active={recallWindow === "week"}
              onClick={() => {
                setRecallWindow("week");
                navigateToReadLibraryView("inbox", { showReadItems: true });
              }}
            >
              Ten tydzien
            </WorkspaceButton>
            <WorkspaceButton
              active={libraryView === "saved" && itemSortMode === "newest"}
              onClick={() => {
                setRecallWindow("all");
                navigateToReadLibraryView("saved", {
                  showReadItems: true,
                  sort: "newest",
                });
              }}
            >
              Ostatnio zapisane
            </WorkspaceButton>
          </div>
        </WorkspacePanel>

        {(savedViewChips.length > 0 || deferredItemSearch.trim()) ? (
          <WorkspacePanel
            eyebrow={
              <span className="workspace-eyebrow-with-icon">
                <BookmarkIcon className="app-icon app-icon-xs" />
                Pinned views
              </span>
            }
            title="Zapisane filtry"
            description="Zapisane widoki i szybki powrot do ostatnich zapytan."
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
              {savedViewChips.map((chip) => (
                <SavedViewChip
                  key={chip.id}
                  onClear={() => setItemSearch("")}
                  onSelect={(viewId) => {
                    const savedView = savedSearches.find((entry) => entry.id === viewId);
                    if (!savedView) {
                      return;
                    }
                    navigateToReadLibraryView(savedView.default_view, {
                      search: savedView.query,
                    });
                  }}
                  view={chip}
                />
              ))}
              <WorkspaceButton disabled={!deferredItemSearch.trim()} onClick={() => void handleCreateSavedSearch()} tone="accent">
                <span className="button-with-icon">
                  <BookmarkIcon className="app-icon button-inline-icon" />
                  Zapisz biezace zapytanie
                </span>
              </WorkspaceButton>
            </div>
          </WorkspacePanel>
        ) : null}
      </div>
    );
  }

  function renderUiReadInspector() {
    return (
      <div className="screen-stack">
        <WorkspacePanel
          description={selectedItem ? `Organizuj ${selectedItem.title} tagami, kolekcjami i notatkami.` : "Wybierz artykul, aby dodac tagi, kolekcje i notatki."}
          eyebrow={
            <span className="workspace-eyebrow-with-icon">
              <NoteIcon className="app-icon app-icon-xs" />
              Inspector
            </span>
          }
          title="Adnotacje i porzadkowanie"
          tone="warning"
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.75rem" }}>
            {itemTags.map((tag) => (
              <WorkspaceChip key={tag.id} active tone="accent">
                {tag.name}
              </WorkspaceChip>
            ))}
            {!selectedItem ? <WorkspaceChip>Najpierw wybierz artykul</WorkspaceChip> : null}
          </div>

          <div style={{ display: "grid", gap: "0.55rem" }}>
            <input onChange={(event) => setTagDraft(event.target.value)} placeholder="Dodaj tagi: rynek, longform, explainery" value={tagDraft} />
            <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
              <WorkspaceButton disabled={!selectedItem || !tagDraft.trim() || workspaceBusy} onClick={() => void handleSaveTags()} tone="accent">
                <span className="button-with-icon">
                  <BookmarkIcon className="app-icon button-inline-icon" />
                  Zapisz tagi
                </span>
              </WorkspaceButton>
              <input onChange={(event) => setCollectionDraft(event.target.value)} placeholder="Nowa kolekcja" value={collectionDraft} />
              <WorkspaceButton disabled={!collectionDraft.trim() || workspaceBusy} onClick={() => void handleCreateCollection()}>
                <span className="button-with-icon">
                  <LibraryIcon className="app-icon button-inline-icon" />
                  Utworz kolekcje
                </span>
              </WorkspaceButton>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
              {collections.map((collection) => (
                <WorkspaceButton key={collection.id} disabled={!selectedItem || workspaceBusy} onClick={() => void handleAddToCollection(collection.id)}>
                  {collection.name} ({collection.item_count})
                </WorkspaceButton>
              ))}
            </div>

            {selectedTextQuote ? (
              <blockquote style={{ margin: 0, padding: "0.75rem 0.9rem", borderRadius: "0.75rem", background: "var(--surface-subtle)", border: "1px solid var(--line)" }}>
                {selectedTextQuote}
              </blockquote>
            ) : null}

            <textarea onChange={(event) => setAnnotationDraft(event.target.value)} placeholder="Napisz notatke albo dodaj komentarz do biezacego zaznaczenia" rows={4} value={annotationDraft} />
            <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
              <WorkspaceButton disabled={!selectedItem || !annotationDraft.trim() || workspaceBusy} onClick={() => void handleCreateNote()} tone="accent">
                <span className="button-with-icon">
                  <NoteIcon className="app-icon button-inline-icon" />
                  Zapisz notatke
                </span>
              </WorkspaceButton>
              <WorkspaceButton disabled={!selectedItem || !selectedTextQuote.trim() || workspaceBusy} onClick={() => void handleCreateHighlight()} tone="warning">
                <span className="button-with-icon">
                  <HighlightIcon className="app-icon button-inline-icon" />
                  Zapisz podkreslenie
                </span>
              </WorkspaceButton>
            </div>
          </div>
        </WorkspacePanel>

        <AnnotationPanel panel={annotationPanelModel} />
      </div>
    );
  }

  function renderUiFeedArticle() {
    if (!selectedItem) {
      return (
        <div className="reader-state-card">
          <strong>Wybierz artykul</strong>
          <p>Otworz artykul ze strumienia feedu, aby przejsc do czystego trybu czytania.</p>
        </div>
      );
    }

    const previewItem = itemDetail && itemDetail.id === selectedItem.id ? itemDetail : selectedItem;
    const qualityState = getReaderQualityState(selectedItem, itemDetail, itemDetailStatus);
    const readerWordCount =
      itemDetail && itemDetail.id === selectedItem.id
        ? countWords(itemDetail.content_text ?? itemDetail.excerpt)
        : countWords(selectedItem.excerpt);
    const highlightCount = itemAnnotations.filter((annotation) => annotation.kind === "highlight").length;
    const noteCount = itemAnnotations.filter((annotation) => annotation.kind === "note").length;
    const sanitizedCleanedHtml =
      itemDetail && itemDetail.id === selectedItem.id
        ? sanitizeReaderHtml(itemDetail.cleaned_html, selectedItem.title)
        : null;
    const readerView =
      itemDetail && itemDetail.id === selectedItem.id
        ? sanitizedCleanedHtml
          ? "cleaned_html"
          : itemDetail.content_text
            ? "content_text"
            : itemDetail.excerpt
              ? "excerpt"
              : "missing"
        : selectedItem.excerpt
          ? "excerpt"
          : "missing";
    const highlightedCleanedHtml =
      itemDetail && itemDetail.id === selectedItem.id && sanitizedCleanedHtml
        ? renderInlineHighlightHtml(sanitizedCleanedHtml, itemAnnotations)
        : null;
    const bodyParagraphs =
      itemDetail && itemDetail.id === selectedItem.id
        ? readerView === "content_text"
          ? sanitizeReaderParagraphs(splitReaderParagraphs(itemDetail.content_text), selectedItem.title)
          : readerView === "excerpt"
            ? sanitizeReaderParagraphs(splitReaderParagraphs(itemDetail.excerpt), selectedItem.title)
            : []
        : sanitizeReaderParagraphs(splitReaderParagraphs(selectedItem.excerpt), selectedItem.title);
    const resumeProgress = readerProgress[selectedItem.id];
    const readerSurfaceClasses = [
      "reader-reading-surface",
      "feed-reader-surface",
      `reader-reading-surface-width-${readerWidthMode}`,
      `reader-reading-surface-text-${readerTextMode}`,
      `reader-reading-surface-media-${readerImageMode}`,
    ].join(" ");
    const sourceLabel = previewItem.channel.title ?? channelTitles[previewItem.channel_id] ?? "Nieznane zrodlo";
    const detailLine =
      itemDetailStatus === "loading"
        ? "Przygotowujemy czysty widok artykulu."
        : itemDetailStatus === "ready" && readerView === "cleaned_html"
          ? `Czysty widok gotowy do czytania${readerWordCount ? ` · ${readerWordCount} slow` : ""}`
          : itemDetailStatus === "ready" && readerView === "content_text"
            ? `Pokazujemy tekst zastepczy${readerWordCount ? ` · ${readerWordCount} slow` : ""}`
            : itemDetailStatus === "ready" && readerView === "excerpt"
              ? "Dostepny jest tylko skrot artykulu."
              : itemDetailStatus === "error"
                ? itemDetailMessage ?? "Nie udalo sie wczytac pelnej tresci."
                : qualityState.description;
    const hasReadableBody =
      Boolean(itemDetail && itemDetail.id === selectedItem.id && readerView === "cleaned_html" && sanitizedCleanedHtml) ||
      bodyParagraphs.length > 0;
    const nextDecisionItemId = resolveReaderDecisionNextItemId(queueItems, selectedItem.id);
    const nextDecisionItem =
      nextDecisionItemId && nextDecisionItemId !== selectedItem.id
        ? queueItems.find((candidate) => candidate.id === nextDecisionItemId) ?? null
        : null;
    const decisionBusy = itemActionId === selectedItem.id;

    return (
      <section className="feed-reader-shell">
        <ReaderArticleTopbar
          busy={decisionBusy}
          digestCandidate={selectedItem.digest_candidate}
          isArchived={selectedItem.is_archived}
          isFavorite={selectedItem.is_favorite}
          isRead={selectedItem.is_read}
          onBackToFeed={() => setReadSurfaceMode("browse")}
          onToggleArchive={() =>
            void mutateItemState(selectedItem, {
              library_action: selectedItem.is_archived ? "restore" : "archive",
            })
          }
          onToggleDigest={() => void mutateItemState(selectedItem, { digest_candidate: !selectedItem.digest_candidate })}
          onToggleFavorite={() =>
            void mutateItemState(selectedItem, {
              library_action: selectedItem.is_favorite ? "unsave" : "save",
            })
          }
          onToggleInspector={() => setShowReadInspector((current) => !current)}
          onToggleRead={() => void mutateItemState(selectedItem, { is_read: !selectedItem.is_read })}
          showInspector={showReadInspector}
          sourceUrl={selectedItem.source_url}
        />

        <ReaderDecisionBar
          busy={decisionBusy}
          canArchive={!selectedItem.is_archived}
          canUndo={Boolean(latestUndoEntry)}
          nextItemTitle={nextDecisionItem?.title ?? null}
          onAction={(action) => void handlePresetAction(action)}
          onUndo={() => void handleUndo()}
          undoBusy={undoBusy}
        />

        <ReaderArticleCard
          authorLabel={previewItem.author ? previewItem.author : "Autor nieznany"}
          bodyParagraphs={bodyParagraphs}
          contentRef={articleContentRef}
          detailLine={detailLine}
          digestCandidate={previewItem.digest_candidate}
          hasReadableBody={hasReadableBody}
          highlightedCleanedHtml={highlightedCleanedHtml}
          highlightCount={highlightCount}
          isFavorite={previewItem.is_favorite}
          isLoading={itemDetailStatus === "loading"}
          isRead={previewItem.is_read}
          noteCount={noteCount}
          onOpenSource={openSelectedSource}
          onSurfaceScroll={handleReadingSurfaceScroll}
          publishedLabel={formatTimestamp(previewItem.published_at, "Nieznany czas publikacji")}
          qualityAllowsInApp={qualityState.allowsInApp}
          qualityBadge={qualityState.badge}
          qualityDescription={qualityState.description}
          qualityHeading={qualityState.heading}
          readerSurfaceClasses={readerSurfaceClasses}
          resumeProgress={resumeProgress?.progress ?? null}
          sanitizedCleanedHtml={sanitizedCleanedHtml}
          showCleanedHtml={
            itemDetailStatus === "ready" &&
            Boolean(itemDetail && itemDetail.id === selectedItem.id && readerView === "cleaned_html" && sanitizedCleanedHtml)
          }
          sourceLabel={sourceLabel}
          title={previewItem.title}
        />

        {showReadInspector && !isFocusedMode ? <div className="feed-reader-inspector">{renderUiReadInspector()}</div> : null}
      </section>
    );
  }

  function renderUiReadSection() {
    const isBrowseMode = readSurfaceMode === "browse";

    if (!isBrowseMode) {
      return (
        <section className={`reader-pane reader-pane-flat reader-pane-article ${isFocusedMode ? "reader-pane-focused" : ""}`}>
          {itemsMessage && itemsStatus !== "unsupported" ? (
            <div className={`reader-inline-note ${itemsStatus === "error" ? "reader-inline-note-error" : ""}`}>
              {itemsMessage}
            </div>
          ) : null}

          {renderUiFeedArticle()}
        </section>
      );
    }

    const currentLibraryLabel = getLibraryViewLabel(libraryView);
    const isNarrowLibraryEmptyState = libraryView !== "inbox";
    const emptySearch = deferredItemSearch.trim();
    const emptyTitle = isNarrowLibraryEmptyState
      ? `Brak artykulow w widoku: ${currentLibraryLabel}`
      : undefined;
    const emptyDescription = isNarrowLibraryEmptyState
      ? emptySearch
        ? `Szukasz "${emptySearch}" tylko w widoku ${currentLibraryLabel}. Przelacz na Skrzynke, zeby przeszukac feedy.`
        : `Widok ${currentLibraryLabel} ma wlasna kolejke. Przelacz na Skrzynke, zeby wrocic do wszystkich feedow.`
      : undefined;
    const emptyActionLabel = isNarrowLibraryEmptyState ? "Przejdz do skrzynki feedow" : null;

    return (
      <ReaderBrowseView
        activeFeedScopeLabel={activeFeedScopeLabel}
        activeItemId={activeItemId}
        busyItemId={itemActionId}
        channelSiteUrls={channelSiteUrls}
        channelTitles={channelTitles}
        emptyActionLabel={emptyActionLabel}
        emptyDescription={emptyDescription}
        emptyTitle={emptyTitle}
        formatTimestamp={formatTimestamp}
        isFocusedMode={isFocusedMode}
        isLoading={itemsStatus === "loading"}
        itemSearch={itemSearch}
        itemSortMode={itemSortMode}
        items={queueItems}
        message={itemsMessage}
        messageTone={itemsStatus === "error" ? "error" : "default"}
        onItemSearchChange={setItemSearch}
        onOpenItem={(itemId) => {
          setActiveItemId(itemId);
          setReadingItemId(itemId);
          setReadSurfaceMode("article");
        }}
        onRefresh={() => void loadItems()}
        onSelectItem={(itemId) => setActiveItemId(itemId)}
        onShowReadItemsChange={setShowReadItems}
        onSortModeChange={setItemSortMode}
        onToggleDigest={(itemId) => {
          const item = queueItems.find((candidate) => candidate.id === itemId);
          if (item) {
            void mutateItemState(item, { digest_candidate: !item.digest_candidate });
          }
        }}
        onEmptyAction={
          isNarrowLibraryEmptyState
            ? () =>
                navigateToReadLibraryView("inbox", {
                  showReadItems: true,
                })
            : null
        }
        onToggleFavorite={(itemId) => {
          const item = queueItems.find((candidate) => candidate.id === itemId);
          if (item) {
            void mutateItemState(item, { library_action: item.is_favorite ? "unsave" : "save" });
          }
        }}
        onToggleRead={(itemId) => {
          const item = queueItems.find((candidate) => candidate.id === itemId);
          if (item) {
            void mutateItemState(item, { is_read: !item.is_read });
          }
        }}
        showMessage={Boolean(itemsMessage && itemsStatus !== "unsupported")}
        showReadItems={showReadItems}
        visibleUnreadCount={visibleUnreadCount}
      />
    );
  }

  function renderUiDiscoverSection() {
    return (
      <section className="section-screen">
        <div className="section-screen-header">
          <div>
            <span className="panel-badge panel-badge-with-icon">
              <DiscoverIcon className="app-icon app-icon-xs" />
              {uiSectionCopy.discover.eyebrow}
            </span>
            <h2>{uiSectionCopy.discover.title}</h2>
            <p>{uiSectionCopy.discover.description}</p>
          </div>
        </div>

        <div className="section-grid section-grid-two">
          <div className="screen-stack">
            {workspaceBriefing ? (
              <WorkspacePanel
                eyebrow={
                  <span className="workspace-eyebrow-with-icon">
                    <SparkIcon className="app-icon app-icon-xs" />
                    Briefing
                  </span>
                }
                title="Dzis w skrocie"
                description="Najwazniejsze sygnaly z kolejki, zrodel i rankingu w jednym widoku startowym."
                tone="accent"
              >
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  {workspaceBriefing.summary_lines.map((line, lineIndex) => (
                     <span key={`${line}-${lineIndex}`} style={{ fontSize: "0.9rem", lineHeight: 1.55 }}>
                      {line}
                    </span>
                  ))}
                </div>
                {workspaceBriefing.resume_item ? (
                  <WorkspaceButton onClick={() => void focusArticleById(workspaceBriefing.resume_item!.id)} style={{ marginTop: "0.8rem", width: "100%", justifyContent: "space-between" }} tone="accent">
                    <span className="button-with-icon">
                      <ReaderIcon className="app-icon button-inline-icon" />
                      Wznow czytanie
                    </span>
                    <strong>{workspaceBriefing.resume_item.title}</strong>
                  </WorkspaceButton>
                ) : null}
                {workspaceBriefing.source_warnings.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.8rem" }}>
                    {workspaceBriefing.source_warnings.map((warning, warningIndex) => (
                      <WorkspaceChip key={`${warning}-${warningIndex}`} tone="warning">
                        {warning}
                      </WorkspaceChip>
                    ))}
                  </div>
                ) : null}
              </WorkspacePanel>
            ) : renderUiFeedbackCard()}

            <WorkspacePanel
              eyebrow={
                <span className="workspace-eyebrow-with-icon">
                  <SparkIcon className="app-icon app-icon-xs" />
                  Ranking
                </span>
              }
              title="Polecane teraz"
              description="Najwyzej ocenione artykuly z aktualnego rankingu, gotowe do otwarcia jednym kliknieciem."
              tone="success"
            >
              <div style={{ display: "grid", gap: "0.55rem" }}>
                {uiTopRankingItems.map((entry) => (
                  <WorkspaceButton key={entry.item.id} onClick={() => void focusArticleById(entry.item.id)} style={{ justifyContent: "space-between", textAlign: "left" }}>
                    <span style={{ display: "grid", gap: "0.18rem" }}>
                      <strong>{entry.item.title}</strong>
                      <small>{entry.item.channel_title}</small>
                    </span>
                    <WorkspaceChip active tone="accent">
                      {Math.round(entry.breakdown.final_score)}
                    </WorkspaceChip>
                  </WorkspaceButton>
                ))}
                {uiTopRankingItems.length === 0 ? <WorkspaceChip>Brak rekomendacji do wyswietlenia</WorkspaceChip> : null}
              </div>
            </WorkspacePanel>
          </div>

          <div className="screen-stack">
            <WorkspacePanel
              eyebrow={
                <span className="workspace-eyebrow-with-icon">
                  <NoteIcon className="app-icon app-icon-xs" />
                  Knowledge
                </span>
              }
              title="Wroc do wlasnych mysli"
              description="Przeszukiwalne notatki i podkreslenia w calej bibliotece."
              tone="accent"
            >
              <div style={{ display: "grid", gap: "0.65rem" }}>
                <input onChange={(event) => setAnnotationHubQuery(event.target.value)} placeholder="Szukaj notatek, cytatow z podkreslen i tresci adnotacji" value={annotationHubQuery} />
                {annotationHubLoading ? <WorkspaceChip>Szukanie adnotacji...</WorkspaceChip> : null}
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  {annotationHubItems.map((annotation) => (
                    <WorkspaceButton key={annotation.id} onClick={() => void focusArticleById(annotation.item_id)} style={{ justifyContent: "space-between", textAlign: "left" }}>
                      <span style={{ display: "grid", gap: "0.18rem" }}>
                        <strong>{annotation.kind === "highlight" ? "Podkreslenie" : "Notatka"}</strong>
                        <small>{annotation.note_text ?? annotation.quote_text ?? "Open linked article"}</small>
                      </span>
                      <WorkspaceChip active tone={annotation.kind === "highlight" ? "warning" : "accent"}>
                        {annotation.kind}
                      </WorkspaceChip>
                    </WorkspaceButton>
                  ))}
                  {!annotationHubLoading && annotationHubItems.length === 0 ? <WorkspaceChip>Brak pasujacych adnotacji</WorkspaceChip> : null}
                </div>
              </div>
            </WorkspacePanel>

            <div className="screen-stack">
              {storyClusters.slice(0, 6).map((cluster) => (
                <StoryClusterCard
                  actions={
                    <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                      <WorkspaceButton onClick={() => void focusArticleById(cluster.primary.id)} tone="accent">
                        Otworz lead
                      </WorkspaceButton>
                      <WorkspaceButton
                        onClick={() =>
                          setExpandedStoryClusterIds((current) =>
                            current.includes(cluster.id) ? current.filter((entry) => entry !== cluster.id) : [...current, cluster.id],
                          )
                        }
                      >
                        {expandedStoryClusterIds.includes(cluster.id) ? "Zwin" : `Pokaz alternatywy (${cluster.alternates.length})`}
                      </WorkspaceButton>
                    </div>
                  }
                  cluster={mapStoryClusterCard(cluster)}
                  key={cluster.id}
                  maxStories={expandedStoryClusterIds.includes(cluster.id) ? cluster.item_count : 3}
                  onStorySelect={(storyId) => void focusArticleById(storyId)}
                />
              ))}
              {storyClusters.length === 0 ? (
                <WorkspacePanel
                  eyebrow={
                    <span className="workspace-eyebrow-with-icon">
                      <DiscoverIcon className="app-icon app-icon-xs" />
                      Stories
                    </span>
                  }
                  title="Klastry historii sa puste"
                  description="Po kolejnym syncu i deduplikacji klastry historii pojawia sie tutaj."
                >
                  <WorkspaceChip>Uruchom sync albo dodaj wiecej zrodel, aby zobaczyc grupy tematyczne.</WorkspaceChip>
                </WorkspacePanel>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderUiSourcesSection() {
    const sourceModePlaceholder =
      currentSourceAddMode.id === "web_feed"
        ? "https://example.com/feed.xml albo bezposredni adres RSS"
        : "xyz.pl albo https://xyz.pl";
    const sourceResultsCount = channelPreview
      ? channelPreview.status === "multiple_candidates"
        ? visibleSourceCandidates.length
        : primarySourceCandidate
          ? 1
          : 0
      : 0;
    const showSourceImportMode = currentSourceAddMode.id === "import_feeds";
    const showWebsiteMode = currentSourceAddMode.id === "website";
    const showBackoffice = sourceSurfaceMode === "manage";
    const sourceInputDescribedBy = showSourceOptions ? `${sourceSearchHintId} ${sourceSearchOptionsNoteId}` : sourceSearchHintId;
    const enabledSourceAddModes = sourceAddModes.filter((mode) => mode.enabled);
    const primarySourceAddModes = enabledSourceAddModes.filter((mode) => mode.id === "website" || mode.id === "web_feed");
    const importSourceAddMode = enabledSourceAddModes.find((mode) => mode.id === "import_feeds") ?? null;
    const upcomingSourceAddModes = sourceAddModes.filter((mode) => !mode.enabled);
    const showTopicSuggestions =
      showWebsiteMode && Boolean(inputUrl.trim() || category.trim() || primarySourceCandidate || sourceExistingChannel);
    const sourceHeroTitle = showSourceImportMode
      ? "Zaimportuj zrodla z OPML"
      : showWebsiteMode
        ? "Dodaj strone i sprawdz wykryty feed"
        : "Dodaj bezposredni RSS lub Atom";
    const sourceHeroDescription = showSourceImportMode
      ? "Przenies feedy z innego czytnika bez recznego przepisywania adresow i od razu przygotuj biblioteke do syncu."
      : showWebsiteMode
        ? "Wklej domene albo adres strony. Najpierw pokazemy wynik discovery, a dopiero potem zapiszesz zrodlo."
        : "Wklej bezposredni RSS albo Atom. Najpierw zobaczysz podglad, a dopiero potem zapiszesz zrodlo.";
    const sourceSearchHint = showWebsiteMode
      ? "Podglad uruchamia sie automatycznie po chwili. Enter sprawdza od razu."
      : "Enter sprawdza podany adres i pokazuje podglad przed zapisem.";

    function renderSourceModeIcon(modeId: SourceAddModeId) {
      if (modeId === "website") {
        return <WebsiteIcon className="app-icon" />;
      }
      if (modeId === "web_feed") {
        return <FeedIcon className="app-icon" />;
      }
      if (modeId === "import_feeds") {
        return <ImportIcon className="app-icon" />;
      }
      return <BackofficeIcon className="app-icon" />;
    }

    return (
      <section className="section-screen section-screen-sources">
        <div className="section-screen-header">
          <div>
            <span className="panel-badge panel-badge-with-icon">
              <SourcesIcon className="app-icon app-icon-xs" />
              {uiSectionCopy.sources.eyebrow}
            </span>
            <h2>{uiSectionCopy.sources.title}</h2>
            <p>{uiSectionCopy.sources.description}</p>
          </div>
          <div className="section-screen-header-actions">
            <button
              aria-controls={sourceBackofficeRegionId}
              aria-expanded={showBackoffice}
              className="secondary-button compact-button"
              data-testid="source-manage-toggle"
              onClick={() => {
                setSourceSurfaceMode((current) => {
                  const nextMode = current === "manage" ? "add" : "manage";
                  pendingSourceFocusTargetRef.current =
                    nextMode === "manage" ? "backoffice" : sourceAddMode === "import_feeds" ? "import" : "input";
                  return nextMode;
                });
              }}
              type="button"
            >
              <span className="button-with-icon">
                <BackofficeIcon className="app-icon button-inline-icon" />
                {showBackoffice ? "Wroc do dodawania" : "Zarzadzaj zrodlami"}
              </span>
            </button>
            <button className="action-button compact-button" disabled={isSyncing || channels.length === 0} onClick={() => void handleSyncAll()} type="button">
              <span className="button-with-icon">
                <SyncIcon className="app-icon button-inline-icon" />
                {isSyncing ? "Syncowanie..." : "Sync aktywnych"}
              </span>
            </button>
          </div>
        </div>

        <div className="source-follow-layout">
          <aside className="source-add-nav" aria-label="Typ dodawanego zrodla">
            <div className="source-add-nav-header">
              <strong id={sourcePrimaryModesLabelId}>Dodaj zrodlo</strong>
              <p>Zacznij od strony albo bezposredniego feedu. Migracje i operacje reczne zostaja w tle.</p>
            </div>
            <div aria-labelledby={sourcePrimaryModesLabelId} className="source-add-nav-list" role="group">
              {primarySourceAddModes.map((mode) => (
                <button
                  aria-pressed={sourceAddMode === mode.id}
                  className={`source-add-nav-item ${sourceAddMode === mode.id ? "source-add-nav-item-active" : ""}`}
                  data-testid={`source-mode-${mode.id}`}
                  key={mode.id}
                  onClick={() => activateSourceAddMode(mode.id, "input")}
                  type="button"
                >
                  <span className="source-add-nav-icon">{renderSourceModeIcon(mode.id)}</span>
                  <span className="source-add-nav-copy">
                    <strong>{mode.label}</strong>
                    <small>{mode.enabled ? mode.description : "Wkrotce"}</small>
                  </span>
                </button>
              ))}
            </div>
            {importSourceAddMode ? (
              <div className="source-add-nav-secondary">
                <div className="source-add-nav-secondary-copy">
                  <strong id={sourceSecondaryActionsLabelId}>Migracja i przechwytywanie</strong>
                  <p>Przenies biblioteke z OPML albo zapisz pojedynczy link bez opuszczania produktu.</p>
                </div>
                <div aria-labelledby={sourceSecondaryActionsLabelId} className="source-add-nav-link-list" role="group">
                  <button
                    aria-pressed={sourceAddMode === importSourceAddMode.id}
                    className={`source-add-nav-link ${sourceAddMode === importSourceAddMode.id ? "source-add-nav-link-active" : ""}`}
                    data-testid="source-mode-import"
                  onClick={() => activateSourceAddMode(importSourceAddMode.id, "import")}
                  type="button"
                >
                    <span className="button-with-icon">
                      <ImportIcon className="app-icon button-inline-icon" />
                      {importSourceAddMode.label}
                    </span>
                  </button>
                  <button className="source-add-nav-link" data-testid="source-capture-link" onClick={() => router.push("/capture")} type="button">
                    <span className="button-with-icon">
                      <CaptureIcon className="app-icon button-inline-icon" />
                      Przechwyc link
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
            {upcomingSourceAddModes.length > 0 ? (
              <details className="source-add-nav-upcoming">
                <summary>
                  <span className="button-with-icon">
                    <SparkIcon className="app-icon button-inline-icon" />
                    Wiecej wkrotce ({upcomingSourceAddModes.length})
                  </span>
                </summary>
                <div className="source-add-nav-upcoming-list">
                  {upcomingSourceAddModes.map((mode) => (
                    <span className="source-add-nav-upcoming-chip" key={mode.id}>
                      {mode.label}
                    </span>
                  ))}
                </div>
              </details>
            ) : null}
          </aside>

          <div className="source-follow-main">
            <div className="source-follow-hero">
              <span className="panel-badge panel-badge-with-icon">
                {renderSourceModeIcon(currentSourceAddMode.id)}
                {currentSourceAddMode.label}
              </span>
              <h3 data-testid="source-main-heading">{sourceHeroTitle}</h3>
              <p>{sourceHeroDescription}</p>
            </div>

            {showSourceImportMode ? (
              <div className="source-import-shell">
                  <label className="source-import-field">
                    <span>Wklej OPML albo liste feedow</span>
                    <textarea
                      ref={sourceImportTextareaRef}
                      onChange={(event) => setOpmlDraft(event.target.value)}
                      placeholder="Wklej tutaj OPML, aby przeniesc feedy z innego czytnika RSS"
                      rows={9}
                    value={opmlDraft}
                  />
                </label>
                <div className="source-import-actions">
                  <button className="action-button" disabled={!opmlDraft.trim() || opmlImportBusy} onClick={() => void handleImportOpml()} type="button">
                    {opmlImportBusy ? "Importowanie..." : "Importuj feedy"}
                  </button>
                  <span>RSSmaster zachowa adresy feedow i po imporcie od razu uruchomisz reczny sync.</span>
                </div>
              </div>
            ) : (
              <>
                <form
                  aria-describedby={sourceSearchHintId}
                  aria-label="Dodaj zrodlo przez preview"
                  className={`source-search-shell ${showWebsiteMode ? "source-search-shell-website" : ""}`}
                  data-testid="source-search-form"
                  onSubmit={handleSubmit}
                  role="search"
                >
                  <label className="source-search-field">
                    <span className="sr-only">Adres strony lub feedu</span>
                    <span className="source-search-icon" aria-hidden="true">
                      <svg viewBox="0 0 20 20">
                        <circle cx="8.75" cy="8.75" fill="none" r="5.5" stroke="currentColor" strokeWidth="1.55" />
                        <path d="m12.9 12.9 3.35 3.35" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.55" />
                      </svg>
                    </span>
                    <input
                      aria-describedby={sourceInputDescribedBy}
                      ref={sourceInputRef}
                      autoComplete="off"
                      data-testid="source-input"
                      name="inputUrl"
                      onChange={(event) => {
                        handleSourceDraftInputChange(event.target.value);
                      }}
                      placeholder={sourceModePlaceholder}
                      required
                      value={inputUrl}
                    />
                    {inputUrl.trim() ? (
                      <button
                        aria-label="Wyczysc adres"
                        className="source-search-clear"
                        data-testid="source-input-clear"
                        onClick={() => {
                          handleSourceDraftInputChange("");
                          pendingSourceFocusTargetRef.current = "input";
                        }}
                        type="button"
                      >
                        <DismissIcon className="app-icon" />
                      </button>
                    ) : null}
                  </label>

                  <select
                    aria-label="Filtr wynikow po jezyku"
                    className="source-search-select"
                    data-testid="source-language-filter"
                    onChange={(event) => setSourceLanguageFilter(event.target.value)}
                    title="Filtr wynikow po jezyku"
                    value={sourceLanguageFilter}
                  >
                    {sourceLanguageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  {!showWebsiteMode ? (
                    <button className="source-search-submit" disabled={previewBusy || subscribeBusy || isPending} type="submit">
                      {previewBusy ? "Szukam..." : "Znajdz"}
                    </button>
                  ) : null}
                </form>

                <div className="source-search-subline">
                  <span className="source-search-hint" id={sourceSearchHintId}>
                    {sourceSearchHint}
                  </span>
                  <button
                    aria-controls={sourceSearchOptionsId}
                    aria-expanded={showSourceOptions}
                    className="source-options-toggle"
                    data-testid="source-options-toggle"
                    onClick={() =>
                      setShowSourceOptions((current) => {
                        const nextValue = !current;
                        if (nextValue) {
                          pendingSourceFocusTargetRef.current = "category";
                        }
                        return nextValue;
                      })
                    }
                    type="button"
                  >
                    <span className="button-with-icon">
                      <SettingsIcon className="app-icon button-inline-icon" />
                      {showSourceOptions ? "Ukryj opcje" : "Opcje"}
                    </span>
                  </button>
                </div>

                {showSourceOptions ? (
                  <div aria-label="Opcje zapisu zrodla" className="source-search-meta" id={sourceSearchOptionsId} role="group">
                    <label className="source-search-category">
                      <span>Kategoria opcjonalna</span>
                      <input
                        aria-describedby={sourceSearchOptionsNoteId}
                        autoComplete="off"
                        data-testid="source-category-input"
                        name="category"
                        ref={sourceCategoryInputRef}
                        onChange={(event) => setCategory(event.target.value)}
                        placeholder="rynek, design, research"
                        value={category}
                      />
                    </label>
                    <span className="source-search-meta-note" id={sourceSearchOptionsNoteId}>
                      Kategoria zapisze sie razem z feedem, ale nie blokuje prostego flow dodawania strony.
                    </span>
                  </div>
                ) : null}
              </>
            )}

            {shouldShowSourceFeedback ? (
              <div className="source-feedback-card">
                {renderUiFeedbackCard({ live: true, regionId: sourceFeedbackRegionId, testId: "source-feedback-card" })}
              </div>
            ) : null}

            {!showSourceImportMode ? (
              <div
                aria-busy={sourcePreviewState === "loading"}
                aria-labelledby={sourceResultsHeadingId}
                className="source-results-section"
                data-testid="source-results-region"
                id={sourceResultsRegionId}
                ref={sourceResultsRegionRef}
                role="region"
                tabIndex={-1}
              >
                <p aria-atomic="true" aria-live={sourcePreviewState === "error" ? "assertive" : "polite"} className="sr-only" data-testid="source-live-region">
                  {sourcePreviewAnnouncement}
                </p>
              <div className="source-results-header">
                <div>
                    <strong id={sourceResultsHeadingId}>Wyniki</strong>
                    <span>
                      {channelPreview
                        ? `${sourceResultsCount} znalezionych`
                        : showWebsiteMode
                          ? "Wklej adres strony, aby zobaczyc podglad"
                          : "Wklej bezposredni RSS lub Atom, aby zobaczyc podglad"}
                    </span>
                  </div>
                  {channelPreview ? <span className="source-result-chip">{getSourcePreviewStatusLabel(channelPreview.status)}</span> : null}
                </div>

                {sourcePreviewState === "loading" ? (
                  <div aria-live="polite" className="source-empty-state" data-testid="source-loading-state" role="status">
                    <strong>Szukam feedu dla podanego adresu</strong>
                    <p>Backend sprawdza bezposredni RSS, znaczniki na stronie i heurystyki autodiscovery.</p>
                  </div>
                ) : sourcePreviewState === "multiple_candidates" ? (
                  visibleSourceCandidates.length > 0 ? (
                    <div className="source-candidate-grid">
                      {visibleSourceCandidates.map((candidate) => {
                        const existingChannel =
                          candidate.existing_channel_id ? channels.find((channel) => channel.id === candidate.existing_channel_id) ?? null : null;
                        const candidateMetrics = buildSourcePreviewMetrics({
                          candidate,
                          unreadCount: existingChannel?.unread_count ?? null,
                          languageLabel: getSourceLanguageLabel(candidate.language),
                        });
                        return (
                          <article className="source-candidate-card" key={candidate.feed_url}>
                            <div className="source-candidate-card-head">
                              <SourceIdentityMark label={candidate.title} siteUrl={candidate.site_url ?? candidate.feed_url} />
                              <div className="source-candidate-copy">
                                <strong>{candidate.title}</strong>
                                <span>
                                  {[getSourceHostLabel(candidate.site_url ?? candidate.feed_url), getSourceLanguageLabel(candidate.language)]
                                    .filter(Boolean)
                                    .join(" | ")}
                                </span>
                                {candidateMetrics.length > 0 ? (
                                  <div className="source-result-metrics">
                                    {candidateMetrics.map((metric) => (
                                      <span className="source-metric-chip" key={`${candidate.feed_url}-${metric}`}>
                                        {metric}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <p>{candidate.description ?? candidate.feed_url}</p>
                            {candidate.sample_items.length > 0 ? (
                              <div className="source-candidate-preview-list">
                                {candidate.sample_items.slice(0, 2).map((item) => (
                                  <span className="source-candidate-preview-item" key={`${candidate.feed_url}-${item.url}`}>
                                    {item.title}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <div className="source-candidate-footer">
                              <span>{candidate.feed_url}</span>
                              {candidate.already_subscribed && existingChannel ? (
                                <button className="secondary-button" onClick={() => focusFirstItemFromChannel(existingChannel)} type="button">
                                  Przejdz do feedu
                                </button>
                              ) : (
                                <button className="action-button compact-button" disabled={subscribeBusy} onClick={() => void handleConfirmChannelAdd(candidate.feed_url)} type="button">
                                  {subscribeBusy ? "Zapisywanie..." : "Obserwuj"}
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="source-empty-state" data-testid="source-filter-empty-state">
                      <strong>Ten filtr ukryl wszystkie wyniki</strong>
                      <p>Na stronie znalezlismy feedy, ale zaden nie pasuje do wybranego jezyka. Zmien filtr, aby zobaczyc wszystkie kandydatury.</p>
                    </div>
                  )
                ) : primarySourceCandidate ? (
                  <article className="source-result-card">
                    <div className="source-result-header">
                      <div className="source-result-headline">
                        <SourceIdentityMark
                          label={getSourceHostLabel(primarySourceCandidate.site_url ?? primarySourceCandidate.feed_url) ?? primarySourceCandidate.title}
                          siteUrl={primarySourceCandidate.site_url ?? primarySourceCandidate.feed_url}
                        />
                        <div className="source-result-copy">
                          <div className="source-result-title-row">
                            <h3>{primarySourceCandidate.title}</h3>
                            <p>{getSourceHostLabel(primarySourceCandidate.site_url ?? primarySourceCandidate.feed_url) ?? primarySourceCandidate.feed_url}</p>
                          </div>
                          {sourcePrimaryMetrics.length > 0 ? (
                            <div className="source-result-metrics">
                              {sourcePrimaryMetrics.map((metric) => (
                                <span className="source-metric-chip" key={`${primarySourceCandidate.feed_url}-${metric}`}>
                                  {metric}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <span>{primarySourceCandidate.description ?? primarySourceCandidate.feed_url}</span>
                        </div>
                      </div>
                      <div className="source-result-actions">
                        {sourceExistingChannel ? (
                          <>
                            <span className={`source-result-chip ${sourceExistingChannel.state === "archived" ? "source-result-chip-muted" : ""}`}>
                              {sourceExistingChannel.state === "archived" ? "Zarchiwizowane" : "Juz obserwujesz"}
                            </span>
                            {sourceExistingChannel.state !== "archived" ? (
                              <>
                                <button className="secondary-button" onClick={() => focusFirstItemFromChannel(sourceExistingChannel)} type="button">
                                  Przejdz do feedu
                                </button>
                                <button className="source-result-secondary-action" disabled={activeChannelId === sourceExistingChannel.id} onClick={() => void handleArchive(sourceExistingChannel)} type="button">
                                  <span className="button-with-icon">
                                    <ArchiveIcon className="app-icon button-inline-icon" />
                                    Przestan obserwowac
                                  </span>
                                </button>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <button className="action-button compact-button" disabled={subscribeBusy} onClick={() => void handleConfirmChannelAdd(primarySourceCandidate.feed_url)} type="button">
                            {subscribeBusy ? "Zapisywanie..." : "Obserwuj"}
                          </button>
                        )}
                      </div>
                    </div>

                    {sourcePreviewItems.length > 0 ? (
                      <div className="source-result-preview-grid">
                        {sourcePreviewItems.map((item) => (
                          <article className="source-preview-card source-preview-card-article" key={`${primarySourceCandidate.feed_url}-${item.url}`}>
                            {item.image_url ? <img alt="" className="source-preview-image" loading="lazy" src={item.image_url} /> : null}
                            <div className="source-preview-content">
                              <strong>{item.title}</strong>
                              <p>{formatRelativeDate(item.published_at, new Date(), "Nowy wpis")}</p>
                            </div>
                            <a className="source-preview-link" href={item.url} rel="noreferrer" target="_blank">
                              Otworz wpis
                            </a>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="source-empty-state" data-testid="source-preview-empty-state">
                        <strong>Feed gotowy do obserwowania</strong>
                        <p>
                          {sourceExistingChannel
                            ? "To zrodlo jest juz w bibliotece, ale ten feed nie udostepnil krotkiego preview ostatnich wpisow."
                            : "Feed zostal wykryty poprawnie, ale nie zwrocil krotkiego preview ostatnich wpisow."}
                        </p>
                      </div>
                    )}
                  </article>
                ) : (
                  <div
                    aria-live={sourcePreviewState === "error" ? "polite" : undefined}
                    className="source-empty-state"
                    data-testid="source-empty-state"
                    role={sourcePreviewState === "error" ? "status" : undefined}
                  >
                    <strong>{sourcePreviewState === "error" ? feedback.title : "Zacznij od adresu strony"}</strong>
                    <p>
                      {sourcePreviewState === "error"
                        ? feedback.lines[0] ?? "Nie udalo sie wykryc poprawnego feedu dla podanego adresu."
                        : "Wklej adres strony lub feedu. Najpierw pokazemy wykryty wynik, a dopiero potem zapiszesz zrodlo do biblioteki."}
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <aside className="source-follow-aside">
            <section className="source-aside-card source-aside-card-subtle">
              <span className="panel-badge panel-badge-with-icon">
                <TopicIcon className="app-icon app-icon-xs" />
                {showTopicSuggestions ? "Podpowiedzi kategorii" : "Na start"}
              </span>
              {showTopicSuggestions ? (
                <>
                  <p>Klik ustawia kategorie pomocnicza. Nie zmienia wykrywania feedu ani samego preview.</p>
                  <div className="source-topic-list">
                    {sourceTopicChips.map((chip) => (
                      <button
                        className="source-topic-chip"
                        key={chip}
                        onClick={() => {
                          setShowSourceOptions(true);
                          setCategory(chip.replace(/^#/, "").replace(/-/g, ", "));
                          pendingSourceFocusTargetRef.current = "category";
                        }}
                        type="button"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p>Wklej adres strony, a po wykryciu feedu podpowiemy kilka kategorii do zapisania razem ze zrodlem.</p>
              )}
            </section>

            <section className="source-aside-card source-aside-card-quiet">
              <span className="panel-badge panel-badge-with-icon">
                <StatusIcon className="app-icon app-icon-xs" />
                Szybki stan
              </span>
              <strong>{activeChannelCount} aktywnych zrodel</strong>
              <p>
                {latestRun
                  ? `Ostatni sync: ${formatTimestamp(latestRun.completed_at ?? latestRun.created_at, "brak znacznika czasu")}.`
                  : "Jeszcze nie masz zakonczonego syncu dla tej biblioteki."}
              </p>
              <p>{latestRunSummaryLine}</p>
              <div className="source-aside-metrics">
                <span>{formatCompactNumber(channels.length)} wszystkich zrodel</span>
                <span>{formatCompactNumber(archivedChannelCount)} zarchiwizowanych</span>
                {latestRun ? <span>{getSyncRunStatusLabel(latestRun.status)}</span> : null}
              </div>
              <button className="secondary-button" disabled={isSyncing || channels.length === 0} onClick={() => void handleSyncAll()} type="button">
                <span className="button-with-icon">
                  <SyncIcon className="app-icon button-inline-icon" />
                  {isSyncing ? "Syncowanie..." : "Uruchom sync"}
                </span>
              </button>
            </section>
          </aside>
        </div>

        <div className="source-ops-divider">
          <div>
            <span className="panel-badge panel-badge-with-icon">
              <BackofficeIcon className="app-icon app-icon-xs" />
              Backoffice zrodel
            </span>
            <h3 id={sourceBackofficeHeadingId}>Stan, pakiety i reczne operacje</h3>
          </div>
          <button
            aria-controls={sourceBackofficeRegionId}
            aria-expanded={showBackoffice}
            className="secondary-button compact-button"
            data-testid="source-backoffice-toggle"
            onClick={() => {
              setSourceSurfaceMode((current) => {
                const nextMode = current === "manage" ? "add" : "manage";
                pendingSourceFocusTargetRef.current =
                  nextMode === "manage" ? "backoffice" : sourceAddMode === "import_feeds" ? "import" : "input";
                return nextMode;
              });
            }}
            type="button"
          >
            {showBackoffice ? "Ukryj backoffice" : "Pokaz backoffice"}
          </button>
        </div>

        <div
          aria-labelledby={sourceBackofficeHeadingId}
          className="source-backoffice-region"
          id={sourceBackofficeRegionId}
          ref={sourceBackofficeRegionRef}
          role="region"
          tabIndex={-1}
        >
        {showBackoffice ? (
          <div className="section-grid section-grid-two">
            <div className="screen-stack">
              <WorkspacePanel eyebrow="Zdrowie zrodel" title="Grupuj i wyciszaj zrodla" description="Pakiety zrodel, priorytety i czasowe wyciszanie bez ryzyka zgubienia zawartosci." tone="success">
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                    <input onChange={(event) => setSourceGroupDraft(event.target.value)} placeholder="Utworz pakiet: rynki, longform, research" value={sourceGroupDraft} />
                    <input onChange={(event) => setSourceGroupColor(event.target.value)} type="color" value={sourceGroupColor} />
                    <WorkspaceButton disabled={!sourceGroupDraft.trim() || workspaceBusy} onClick={() => void handleCreateSourceGroup()} tone="accent">
                      Utworz pakiet
                    </WorkspaceButton>
                  </div>
                  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                    {sourceGroups.map((group) => (
                      <WorkspaceChip key={group.id}>{group.name} ({group.channel_count})</WorkspaceChip>
                    ))}
                    {sourceGroups.length === 0 ? <WorkspaceChip>Brak pakietow</WorkspaceChip> : null}
                  </div>
                </div>
              </WorkspacePanel>

              {sourceHealthEntries.slice(0, 6).map((entry) => (
                <SourceHealthCard
                  actions={
                    <div style={{ display: "grid", gap: "0.55rem" }}>
                      <select onChange={(event) => void handleSourceControlUpdate(entry.channel_id, { group_id: event.target.value || null })} value={entry.control.group_id ?? ""}>
                        <option value="">Bez pakietu</option>
                        {sourceGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <WorkspaceButton disabled={workspaceBusy} onClick={() => void handleSourceControlUpdate(entry.channel_id, { snoozed_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })}>
                          Wstrzymaj na 1d
                        </WorkspaceButton>
                        <WorkspaceButton disabled={workspaceBusy} onClick={() => void handleSourceControlUpdate(entry.channel_id, { paused_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })}>
                          Pauza 7d
                        </WorkspaceButton>
                        <WorkspaceButton disabled={workspaceBusy} onClick={() => void handleSourceControlUpdate(entry.channel_id, { paused_until: null, snoozed_until: null })}>
                          <span className="button-with-icon">
                            <DismissIcon className="app-icon button-inline-icon" />
                            Wyczysc timery
                          </span>
                        </WorkspaceButton>
                      </div>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <WorkspaceButton active={entry.control.tier === "priority"} disabled={workspaceBusy} onClick={() => void handleSourceTierChange(entry.channel_id, "priority")} tone="accent">
                          Priorytet
                        </WorkspaceButton>
                        <WorkspaceButton active={entry.control.tier === "default"} disabled={workspaceBusy} onClick={() => void handleSourceTierChange(entry.channel_id, "default")}>
                          Domyslnie
                        </WorkspaceButton>
                        <WorkspaceButton active={entry.control.tier === "muted"} disabled={workspaceBusy} onClick={() => void handleSourceTierChange(entry.channel_id, "muted")} tone="danger">
                          Wycisz
                        </WorkspaceButton>
                      </div>
                    </div>
                  }
                  key={entry.channel_id}
                  source={mapSourceHealthCard(entry)}
                />
              ))}
            </div>

            <div className="screen-stack">
              <WorkspacePanel eyebrow="Migracje" title="Przechwytywanie i eksport" description="Capture i migracje z innych czytnikow sa tutaj, z dala od glownego flow dodawania zrodel." tone="success">
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                    <WorkspaceButton onClick={() => router.push("/capture")} tone="accent">
                      Otworz szybki capture
                    </WorkspaceButton>
                    <WorkspaceButton disabled={workspaceExportBusy} onClick={() => void handleExportWorkspace()}>
                      {workspaceExportBusy ? "Przygotowywanie..." : "Eksportuj continuity bundle"}
                    </WorkspaceButton>
                    <WorkspaceButton disabled={workspaceImportBusy} onClick={() => continuityImportInputRef.current?.click()} tone="accent">
                      {workspaceImportBusy ? "Odtwarzanie..." : "Odtworz continuity bundle"}
                    </WorkspaceButton>
                  </div>
                  <WorkspaceChip>Dedykowany ekran capture obsluguje deep link, bookmarklet i systemowe udostepnianie.</WorkspaceChip>
                  <WorkspaceChip>Continuity bundle przywraca feedy, stany biblioteki i lokalny kontekst czytania.</WorkspaceChip>
                  <textarea onChange={(event) => setOpmlDraft(event.target.value)} placeholder="Wklej tutaj OPML, aby przeniesc feedy z innego czytnika RSS" rows={5} value={opmlDraft} />
                  <WorkspaceButton disabled={!opmlDraft.trim() || opmlImportBusy} onClick={() => void handleImportOpml()} tone="accent">
                    {opmlImportBusy ? "Importowanie..." : "Importuj OPML"}
                  </WorkspaceButton>
                </div>
              </WorkspacePanel>

              <section className="ops-section">
                <div className="ops-section-header">
                  <div>
                    <span className="panel-badge">Reczny sync</span>
                    <h3>Ostatnie runy</h3>
                  </div>
                  <span>{syncRuns.length} runow</span>
                </div>

                {syncRuns.length === 0 ? (
                  <p className="empty-state">Brak runow syncu. Dodaj zrodlo i uruchom pierwszy reczny sync.</p>
                ) : (
                  <ul className="ops-list">
                    {syncRuns.map((run) => (
                      <li className="ops-row" key={run.id}>
                        <div className="ops-row-top">
                          <strong>{getSyncRunStatusLabel(run.status)}</strong>
                          <span>{formatTimestamp(run.completed_at ?? run.created_at, "Brak znacznika czasu")}</span>
                        </div>
                        <span>Kanaly {run.channels_succeeded}/{run.channels_total} ok, {run.channels_failed} nieudanych</span>
                        <span>Artykuly {run.items_created} nowych, {run.items_seen} widzianych, {run.items_skipped} pominietych</span>
                        {run.error_message ? <span>{run.error_message}</span> : null}
                        {run.errors.length > 0 ? (
                          <ul className="run-error-list">
                            {run.errors.slice(0, 2).map((error) => (
                              <li key={`${run.id}-${error.channel_id}-${error.code}`}>
                                <strong>{error.channel_title}</strong>: {error.message}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="ops-section">
                <div className="ops-section-header">
                  <div>
                    <span className="panel-badge">Zrodla</span>
                    <h3>Zarzadzaj kanalami</h3>
                  </div>
                  <span>{archivedChannelCount} zarchiwizowanych</span>
                </div>
                {channels.length === 0 ? (
                  <p className="empty-state">Brak zapisanych kanalow. Uzyj formularza powyzej, aby utworzyc pierwszy.</p>
                ) : (
                  <ul className="ops-list">
                    {channels.map((channel) => (
                      <li className="ops-row" key={channel.id}>
                        <div className="ops-row-top">
                          <strong>{channel.title}</strong>
                          <span className={`channel-state channel-state-${channel.state}`}>{getChannelStateLabel(channel.state)}</span>
                        </div>
                        <span>{channel.feed_url}</span>
                        <span>{channel.category ? `Kategoria: ${channel.category}` : "Brak kategorii"}</span>
                        <span>Nieprzeczytane artykuly: {channel.unread_count}</span>
                        {channel.health ? <span>{`Stan: ${getHealthStatusLabel(channel.health.status)} | ${channel.health.summary}`}</span> : null}
                        <span>{channel.last_fetch_at ? `Ostatni fetch: ${formatTimestamp(channel.last_fetch_at, "nigdy nie synchronizowano")}` : "Ostatni fetch: nigdy nie synchronizowano"}</span>
                        <span>{channel.last_error ? `Ostatni blad: ${channel.last_error}` : "Ostatni blad: brak"}</span>
                        <div className="channel-actions">
                          <input className="channel-inline-input" onChange={(event) => setDraftCategories((current) => ({ ...current, [channel.id]: event.target.value }))} placeholder="Zmien kategorie" value={draftCategories[channel.id] ?? ""} />
                          <button className="secondary-button" disabled={activeChannelId === channel.id} onClick={() => void handleCategorySave(channel.id)} type="button">
                            Zapisz kategorie
                          </button>
                          <button className="secondary-button" disabled={activeChannelId === channel.id || channel.state === "archived"} onClick={() => void handleStateToggle(channel)} type="button">
                            {channel.state === "active" ? "Wylacz" : channel.state === "inactive" ? "Wlacz" : "Zarchiwizowany"}
                          </button>
                          <button className="danger-button" disabled={activeChannelId === channel.id || channel.state === "archived"} onClick={() => void handleArchive(channel)} type="button">
                            Archiwizuj
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div className="source-backoffice-collapsed">
            <strong>Backoffice zostaje w tle</strong>
            <p>Pakiety zrodel, reczne synci, capture i zarzadzanie kanalami sa schowane, aby pierwszy ekran zostal skupiony na prostym dodawaniu strony.</p>
          </div>
        )}
        </div>
      </section>
    );
  }

  function renderUiDigestSection() {
    return (
      <section className="section-screen">
        <div className="section-screen-header">
          <div>
            <span className="panel-badge panel-badge-with-icon">
              <DigestIcon className="app-icon app-icon-xs" />
              {uiSectionCopy.digest.eyebrow}
            </span>
            <h2>{uiSectionCopy.digest.title}</h2>
            <p>{uiSectionCopy.digest.description}</p>
          </div>
        </div>

        <div className="section-grid section-grid-two">
          <div className="screen-stack">
            {renderUiFeedbackCard()}
            <section className="ops-section">
              <div className="ops-section-header">
                <div>
                  <span className="panel-badge panel-badge-with-icon">
                    <DigestIcon className="app-icon app-icon-xs" />
                    Digest
                  </span>
                  <h3>Podglad i budowa</h3>
                </div>
                <span>{digestCandidateIds.length} zaznaczonych</span>
              </div>
              <div className="channel-actions">
                <button className="secondary-button" disabled={digestBusy || queueItems.length === 0} onClick={() => void handleDigestPreview()} type="button">
                  <span className="button-with-icon">
                    <DigestIcon className="app-icon button-inline-icon" />
                    {digestBusy ? "Praca..." : "Podejrzyj digest"}
                  </span>
                </button>
                <button className="action-button compact-button" disabled={digestBusy || queueItems.length === 0} onClick={() => void handleDigestBuild()} type="button">
                  <span className="button-with-icon">
                    <DigestIcon className="app-icon button-inline-icon" />
                    Zbuduj EPUB
                  </span>
                </button>
              </div>
              {digestPreview ? (
                <div className="ops-row">
                  <div className="ops-row-top">
                    <strong>{digestPreview.title}</strong>
                    <span>{digestPreview.selection_mode}</span>
                  </div>
                  <span>{digestPreview.stats.article_count} artykul(y), {digestPreview.stats.word_count} slow, {digestPreview.stats.estimated_read_minutes} min</span>
                  <span>{digestPreview.stats.digest_candidate_count} kandydatow digestu, {digestPreview.stats.favorite_count} zapisanych</span>
                  <span>{digestPreview.category_summary.map((group) => `${group.category}: ${group.article_count}`).join(" | ")}</span>
                </div>
              ) : (
                <p className="empty-state">Podglad uzywa aktualnie widocznej kolejki i preferuje jawnie oznaczonych kandydatow digestu.</p>
              )}
            </section>

            <section className="ops-section">
              <div className="ops-section-header">
                <div>
                  <span className="panel-badge panel-badge-with-icon">
                    <StatusIcon className="app-icon app-icon-xs" />
                    Historia
                  </span>
                  <h3>Zbudowane wydania</h3>
                </div>
                <span>{digestHistory.length}</span>
              </div>
              {digestHistory.length > 0 ? (
                <ul className="ops-list">
                  {digestHistory.map((digest) => (
                    <li className="ops-row" key={digest.id}>
                      <div className="ops-row-top">
                        <strong>{digest.title}</strong>
                        <span>{getDigestStatusLabel(digest.status)}</span>
                      </div>
                      <span>{digest.article_count} artykul(y)</span>
                      <span>{formatTimestamp(digest.generated_at, "Jeszcze nie wygenerowano")}</span>
                      <span>{digest.artifact.path ? `Artefakt: ${digest.artifact.path}` : "Artefakt oczekuje"}</span>
                      {digest.error_message ? <span>{digest.error_message}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">Jeszcze nie zbudowano zadnego wydania.</p>
              )}
            </section>
          </div>

          <div className="screen-stack">
            <section className="ops-section">
              <div className="ops-section-header">
                <div>
                  <span className="panel-badge panel-badge-with-icon">
                    <DeliveryIcon className="app-icon app-icon-xs" />
                    Delivery
                  </span>
                  <h3>Preflight i wysylka</h3>
                </div>
                <span>{deliverySettings?.smtp_ready ? "gotowe" : "wymaga konfiguracji"}</span>
              </div>
              <div className="channel-actions">
                <button className="secondary-button" disabled={deliveryBusy || !latestDigest} onClick={() => void handleDeliveryPreflight("kindle")} type="button">
                  <span className="button-with-icon">
                    <DeliveryIcon className="app-icon button-inline-icon" />
                    Preflight Kindle
                  </span>
                </button>
                <button className="secondary-button" disabled={deliveryBusy || !latestDigest} onClick={() => void handleSendDigest("dry_run", "kindle")} type="button">
                  <span className="button-with-icon">
                    <DeliveryIcon className="app-icon button-inline-icon" />
                    Test na sucho
                  </span>
                </button>
                <button className="action-button compact-button" disabled={deliveryBusy || !latestDigest} onClick={() => void handleSendDigest("send", "kindle")} type="button">
                  <span className="button-with-icon">
                    <DeliveryIcon className="app-icon button-inline-icon" />
                    Wyslij na Kindle
                  </span>
                </button>
              </div>
              {deliveryPreflight ? (
                <div className="ops-row">
                  <div className="ops-row-top">
                    <strong>{deliveryPreflight.artifact.title}</strong>
                    <span>{getDeliveryStatusLabel(deliveryPreflight.status)}</span>
                  </div>
                  <span>{deliveryPreflight.recipient ? `Odbiorca: ${deliveryPreflight.recipient}` : "Odbiorca nieustalony"}</span>
                  <span>{deliveryPreflight.artifact.artifact_exists ? `Rozmiar artefaktu: ${deliveryPreflight.artifact.artifact_bytes}` : "Brak artefaktu"}</span>
                  <span>{deliveryPreflight.checks.map((check) => `${check.name}:${check.status}`).join(" | ")}</span>
                </div>
              ) : (
                <p className="empty-state">Najpierw zbuduj digest, potem uruchom preflight lub wysylke.</p>
              )}
            </section>

            <section className="ops-section">
              <div className="ops-section-header">
                <div>
                  <span className="panel-badge panel-badge-with-icon">
                    <StatusIcon className="app-icon app-icon-xs" />
                    Logi
                  </span>
                  <h3>Historia delivery</h3>
                </div>
                <span>{deliveryLogs.length}</span>
              </div>
              {deliveryLogs.length > 0 ? (
                <ul className="ops-list">
                  {deliveryLogs.map((log) => (
                    <li className="ops-row" key={log.id}>
                      <div className="ops-row-top">
                        <strong>{log.digest_title ?? "Wysylka digestu"}</strong>
                        <span>{getDeliveryStatusLabel(log.status)}</span>
                      </div>
                      <span>{log.target_kind} {log.recipient ?? "odbiorca oczekuje"}</span>
                      <span>{formatTimestamp(log.sent_at, "Jeszcze nie wyslano")}</span>
                      {log.error_message ? <span>{log.error_message}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">Brak logow delivery dla biezacego wydania.</p>
              )}
            </section>
          </div>
        </div>
      </section>
    );
  }

  function renderUiSettingsSection() {
    return (
      <section className="section-screen">
        <div className="section-screen-header">
          <div>
            <span className="panel-badge panel-badge-with-icon">
              <SettingsIcon className="app-icon app-icon-xs" />
              {uiSectionCopy.settings.eyebrow}
            </span>
            <h2>{uiSectionCopy.settings.title}</h2>
            <p>{uiSectionCopy.settings.description}</p>
          </div>
        </div>

        <div className="section-grid section-grid-two">
          <div className="screen-stack">
            {renderUiFeedbackCard()}

            <section className="ops-section">
              <div className="ops-section-header">
                <div>
                  <span className="panel-badge panel-badge-with-icon">
                    <LibraryIcon className="app-icon app-icon-xs" />
                    Konto lokalne
                  </span>
                  <h3>Sesja operatora</h3>
                </div>
                <span>{authenticatedAccount ? "zalogowane" : authRequired ? "wymaga logowania" : "tryb otwarty"}</span>
              </div>
              <AccountStatus
                account={authenticatedAccount}
                authRequired={authRequired}
                busy={authBusy}
                formatTimestamp={formatTimestamp}
                hasLocalAccounts={hasLocalAccounts}
                onLogin={() => openAuthScreen(hasLocalAccounts ? "login" : "register")}
                onLogout={() => void handleLogout()}
              />
            </section>

            <section className="ops-section">
              <div className="ops-section-header">
                <div>
                  <span className="panel-badge panel-badge-with-icon">
                    <DeliveryIcon className="app-icon app-icon-xs" />
                    Delivery
                  </span>
                  <h3>SMTP i Kindle</h3>
                </div>
                <span>{deliverySettings?.smtp_ready ? "gotowe" : "wymaga konfiguracji"}</span>
              </div>
              <form className="channel-form" onSubmit={(event) => { event.preventDefault(); void handleSaveDeliverySettings(); }}>
                <label className="field">
                  <span>SMTP host</span>
                  <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_host: event.target.value }))} value={settingsDraft.smtp_host} />
                </label>
                <label className="field">
                  <span>Port</span>
                  <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_port: event.target.value }))} value={settingsDraft.smtp_port} />
                </label>
                <label className="field">
                  <span>Uzytkownik</span>
                  <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_username: event.target.value }))} value={settingsDraft.smtp_username} />
                </label>
                <label className="field">
                  <span>Haslo</span>
                  <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_password: event.target.value }))} type="password" value={settingsDraft.smtp_password} />
                </label>
                <label className="field">
                  <span>Od</span>
                  <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_from: event.target.value }))} value={settingsDraft.smtp_from} />
                </label>
                <label className="field">
                  <span>Kindle email</span>
                  <input onChange={(event) => setSettingsDraft((current) => ({ ...current, kindle_email: event.target.value }))} value={settingsDraft.kindle_email} />
                </label>
                <div className="channel-actions">
                  <button className="secondary-button" disabled={settingsBusy} type="submit">
                    <span className="button-with-icon">
                      <SettingsIcon className="app-icon button-inline-icon" />
                      {settingsBusy ? "Zapisywanie..." : "Zapisz ustawienia"}
                    </span>
                  </button>
                  <button className="mini-button" disabled={deliveryBusy} onClick={() => void handleDeliverySettingsPreflight()} type="button">
                    <span className="button-with-icon">
                      <DeliveryIcon className="app-icon button-inline-icon" />
                      Sprawdz konfiguracje
                    </span>
                  </button>
                </div>
              </form>
              {deliverySettings ? (
                <div className="ops-row">
                  <div className="ops-row-top">
                    <strong>Aktualna konfiguracja wysylki</strong>
                    <span>{deliverySettings.smtp_ready ? "gotowa" : "niepelna"}</span>
                  </div>
                  <span>{deliverySettings.smtp_host ? `${deliverySettings.smtp_host}:${deliverySettings.smtp_port}` : "Brak hosta SMTP"}</span>
                  <span>{deliverySettings.smtp_password.configured ? "Haslo zapisane" : "Haslo niezapisane"}</span>
                  <span>{deliverySettings.kindle_email ? `Kindle: ${deliverySettings.kindle_email}` : "Brak adresu Kindle"}</span>
                  {deliverySettings.issues.length > 0 ? <span>{deliverySettings.issues.join(" | ")}</span> : null}
                  {deliverySettingsMessage ? <span>{deliverySettingsMessage}</span> : null}
                </div>
              ) : null}
            </section>

            <WorkspacePanel
              eyebrow={
                <span className="workspace-eyebrow-with-icon">
                  <StatusIcon className="app-icon app-icon-xs" />
                  Diagnostyka
                </span>
              }
              title="Stan aplikacji"
              description="Narzedia diagnostyczne i szybkie wejscie do healthcheckow po przebudowie shellu."
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem" }}>
                {uiRuntimeLinks.map((item) => (
                  <a className="app-inline-link" href={item.href} key={item.href} target={item.href.startsWith("http") ? "_blank" : undefined}>
                    {item.label}
                  </a>
                ))}
              </div>
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                <WorkspaceChip active tone="accent">
                  API {apiBaseUrl.replace(/^https?:\/\//, "")}
                </WorkspaceChip>
                <WorkspaceChip>{activeChannelCount} aktywnych zrodel</WorkspaceChip>
              </div>
            </WorkspacePanel>
          </div>

          <div className="screen-stack">
            <section className="ops-section">
              <RankingPreferencesPanel
                actions={
                  workspaceProfile ? (
                    <WorkspaceChip active tone="accent">
                      Limit awaryjny {workspaceProfile.emergency_source_cap}
                    </WorkspaceChip>
                  ) : null
                }
                onPreferenceChange={(preferenceId, nextValue) =>
                  void saveWorkspaceProfile({
                    [preferenceId]: Number.parseInt(nextValue, 10),
                  } as Partial<WorkspaceProfile>)
                }
                preferences={rankingPreferences}
              />
            </section>

            <WorkspacePanel
              eyebrow={
                <span className="workspace-eyebrow-with-icon">
                  <TopicIcon className="app-icon app-icon-xs" />
                  Profil
                </span>
              }
              title="Zainteresowania tematyczne"
              description="Deklaruj trwale tematy, aby korygowac ranking kolejki i ograniczac przeciazenie czytnikiem."
              tone="accent"
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.75rem" }}>
                {workspaceProfile?.interests.map((interest) => (
                  <WorkspaceButton key={interest.id} onClick={() => void saveWorkspaceProfile({ interests: workspaceProfile.interests.filter((entry) => entry.id !== interest.id) })} tone={interest.weight > 0 ? "accent" : interest.weight < 0 ? "danger" : "default"}>
                    {interest.label} {interest.weight > 0 ? "wzmacniaj" : interest.weight < 0 ? "tlum" : "neutralnie"}
                  </WorkspaceButton>
                ))}
                {!workspaceProfile?.interests.length ? <WorkspaceChip>Brak skonfigurowanych zainteresowan</WorkspaceChip> : null}
              </div>
              <div style={{ display: "grid", gap: "0.55rem" }}>
                <input onChange={(event) => setInterestDraft(event.target.value)} placeholder="szachy, AI, ksiazki, security" value={interestDraft} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem" }}>
                  <select onChange={(event) => setInterestWeight(Number.parseInt(event.target.value, 10) as WorkspaceInterest["weight"])} value={interestWeight}>
                    <option value={2}>Wzmacniaj</option>
                    <option value={1}>Preferuj</option>
                    <option value={0}>Neutralnie</option>
                    <option value={-1}>Tlum</option>
                  </select>
                  <WorkspaceButton
                    disabled={!interestDraft.trim() || !workspaceProfile || workspaceBusy}
                    onClick={() =>
                      workspaceProfile
                        ? void saveWorkspaceProfile({
                            interests: [
                              ...workspaceProfile.interests.filter((entry) => entry.label.toLowerCase() !== interestDraft.trim().toLowerCase()),
                              {
                                id: `draft_${interestDraft.trim().toLowerCase()}`,
                                label: interestDraft.trim(),
                                normalized_topic: interestDraft.trim().toLowerCase(),
                                kind: "topic",
                                weight: interestWeight,
                              },
                            ],
                          }).then(() => {
                            setInterestDraft("");
                            setInterestWeight(1);
                          })
                        : undefined
                    }
                    tone="accent"
                  >
                    <span className="button-with-icon">
                      <TopicIcon className="app-icon button-inline-icon" />
                      Dodaj zainteresowanie
                    </span>
                  </WorkspaceButton>
                </div>
              </div>
            </WorkspacePanel>
          </div>
        </div>
      </section>
    );
  }

  const uiShellContent =
    currentSection === "discover"
      ? renderUiDiscoverSection()
      : currentSection === "sources"
          ? renderUiSourcesSection()
        : currentSection === "digest"
          ? renderUiDigestSection()
          : currentSection === "settings"
            ? renderUiSettingsSection()
            : renderUiReadSection();
  const isReadFeedSection = currentSection === "read";

  if (authStatus !== "ready") {
    return (
      <LocalAuthGate
        authStatus={authStatus}
        screen={{
          busy: authBusy,
          form: authForm,
          hasLocalAccounts,
          message: authMessage,
          mode: resolvedAuthMode,
          onFormChange: (patch) => setAuthForm((current) => ({ ...current, ...patch })),
          onModeToggle: () => {
            setAuthMode((current) => (current === "login" ? "register" : "login"));
            setAuthMessage(null);
          },
          onSubmit: () => void handleAuthSubmit(),
        }}
      >
        {null}
      </LocalAuthGate>
    );
  }

  if (pathname === "/") {
    return (
      <section className="workspace-redirect-shell">
        <span className="panel-badge panel-badge-with-icon">
          <LibraryIcon className="app-icon app-icon-xs" />
          rssmaster
        </span>
        <h2>Przygotowuje nowy shell czytnika</h2>
        <p>Odtwarzam ostatni widok i przekierowuje do odpowiedniej sekcji produktu.</p>
      </section>
    );
  }

  return (
    <>
      <input
        accept="application/json,.json"
        className="sr-only"
        onChange={(event) => void handleImportContinuityBundleFile(event)}
        ref={continuityImportInputRef}
        type="file"
      />
      <AppShell
        navRail={
          <div className="workspace-nav-rail">
            <div className="workspace-nav-rail-brand">
              <SourcesIcon className="app-icon workspace-nav-rail-brand-icon" />
            </div>

            <nav aria-label="Sekcje produktu" className="workspace-nav-rail-links">
              {uiGlobalNav.map((item) => (
                <button
                  className={`workspace-nav-rail-link ${currentSection === item.id ? "workspace-nav-rail-link-active" : ""}`}
                  key={item.id}
                  onClick={() => router.push(item.href)}
                  type="button"
                >
                  <span className="workspace-nav-rail-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="workspace-nav-rail-text">{item.label}</span>
                  <strong>{item.meta}</strong>
                </button>
              ))}
            </nav>
          </div>
        }
        onSidebarClose={() => setIsSidebarOpen(false)}
        sidebarOpen={isSidebarOpen}
        header={
          <div className="workspace-appbar-shell">
            <div className={`workspace-appbar workspace-appbar-flat ${isReadFeedSection ? "workspace-appbar-feed-mode" : ""}`}>
              <div className="workspace-appbar-leading">
                {currentSection === "sources" ? (
                  <button
                    className="workspace-source-skip-button"
                    data-testid="source-skip-link"
                    onClick={() => {
                      if (sourceAddMode === "import_feeds") {
                        sourceImportTextareaRef.current?.focus();
                        return;
                      }

                      sourceInputRef.current?.focus();
                    }}
                    type="button"
                  >
                    {sourceAddMode === "import_feeds" ? "Przejdz do importu OPML" : "Przejdz do pola dodawania zrodla"}
                  </button>
                ) : null}
                <button
                  aria-controls="rssmaster-sidebar"
                  aria-expanded={isSidebarOpen}
                  className="app-shell-menu-button"
                  onClick={() => setIsSidebarOpen(true)}
                  type="button"
                >
                  <span className="button-with-icon">
                    <MenuIcon className="app-icon button-inline-icon" />
                    Menu
                  </span>
                </button>
                <div className="workspace-appbar-brand">
                  <span className="workspace-appbar-mark">{currentSectionNavItem.icon}</span>
                  <div>
                    <strong>{currentSection === "read" ? activeFeedScopeLabel : uiSectionCopy[currentSection].title}</strong>
                    <span>{currentSection === "read" ? "Czytnik feedow" : uiSectionCopy[currentSection].description}</span>
                  </div>
                </div>
              </div>

              <div />

              <div className="workspace-appbar-status">
                {currentSection === "read" ? (
                  <button className={`mini-button ${isFocusedMode ? "mini-button-accent" : ""}`} onClick={() => setIsFocusedMode((current) => !current)} type="button">
                    {isFocusedMode ? "Wyjdz z trybu skupienia" : "Tryb skupienia"}
                  </button>
                ) : null}
                <AccountStatus
                  account={authenticatedAccount}
                  authRequired={authRequired}
                  busy={authBusy}
                  compact
                  formatTimestamp={formatTimestamp}
                  hasLocalAccounts={hasLocalAccounts}
                  onLogin={() => openAuthScreen(hasLocalAccounts ? "login" : "register")}
                  onLogout={() => void handleLogout()}
                />
                <span className="runtime-pill runtime-pill-ok">API {apiBaseUrl.replace(/^https?:\/\//, "")}</span>
              </div>
            </div>
          </div>
        }
        sidebar={
          <>
            <div className="app-sidebar-mobile-top">
              <strong>{activeFeedScopeLabel}</strong>
              <button className="mini-button" onClick={() => setIsSidebarOpen(false)} type="button">
                Zamknij
              </button>
            </div>
            <div className="workspace-mobile-nav">
              {uiGlobalNav.map((item) => (
                <button
                  className={`workspace-mobile-nav-link ${currentSection === item.id ? "workspace-mobile-nav-link-active" : ""}`}
                  key={item.id}
                  onClick={() => {
                    router.push(item.href);
                    setIsSidebarOpen(false);
                  }}
                  type="button"
                >
                  <span className="workspace-mobile-nav-label">
                    <span className="workspace-mobile-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  <strong>{item.meta}</strong>
                </button>
              ))}
            </div>
            <FeedBrowser
              folders={feedBrowserFolders.map((folder) => mapFolderToFeedBrowserNode(folder))}
              onOverviewSelect={() => {
                setFeedFilter({ kind: "all" });
                setIsSidebarOpen(false);
              }}
              onManageFeeds={() => {
                setFeedFilter({ kind: "all" });
                setIsSidebarOpen(false);
              }}
              onAddFeed={() => {
                router.push(buildAppHref({ section: "sources" }));
                setIsSidebarOpen(false);
              }}
              onOpenSettings={() => {
                router.push(buildAppHref({ section: "settings" }));
                setIsSidebarOpen(false);
              }}
              overviewActive={feedFilter.kind === "all"}
              overviewLabel="Wszystkie feedy"
              overviewMeta={libraryScopedItems.length}
              title="Feedy"
            />
          </>
        }
      >
        {uiShellContent}
      </AppShell>

      {showKeyboardHelp ? (
        <div aria-modal="true" className="reader-command-overlay" onClick={() => setShowKeyboardHelp(false)} role="dialog">
          <div className="reader-command-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="reader-command-header">
              <div>
                <span className="panel-badge panel-badge-with-icon">
                  <KeyboardIcon className="app-icon app-icon-xs" />
                  Pomoc klawiatury
                </span>
                <h3>Mapa komend</h3>
              </div>
              <button className="mini-button" onClick={() => setShowKeyboardHelp(false)} type="button">
                Zamknij
              </button>
            </div>

            <div className="reader-command-grid">
              {commandGroups.map((group) => (
                <section className="reader-command-group" key={group.title}>
                  <strong>{group.title}</strong>
                  <ul>
                    {group.items.map((item) => (
                      <li key={`${group.title}-${item.keys}`}>
                        <div>
                          <kbd>{item.keys}</kbd>
                          <span>{item.label}</span>
                        </div>
                        <p>{item.note}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <p className="reader-command-note">
              Zapisane i Archiwum korzystaja teraz z API biblioteki, wiec mapa klawiatury odzwierciedla ten sam model selekcji co UI.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );

  /* Legacy dashboard layout retained temporarily for reference during the reader-first rebuild.
  return (
    <section className={`desk-layout ${isFocusedMode ? "desk-layout-focused" : ""}`}>
      <aside className="nav-pane">
        <div className="nav-pane-header">
          <div className="nav-brand">
            <span className="nav-brand-mark">RSS</span>
            <div className="nav-brand-copy">
              <strong>Przestrzen czytania</strong>
              <span>{activeChannelCount} aktywne zrodla</span>
            </div>
          </div>

          <button
            className={`mini-button ${isFocusedMode ? "mini-button-accent" : ""}`}
            onClick={() => setIsFocusedMode((current) => !current)}
            type="button"
          >
            {isFocusedMode ? "Wyjdz z trybu focus" : "Tryb focus"}
          </button>
        </div>

        <section className="nav-section">
          <div className="nav-section-header">
            <span className="panel-badge">Biblioteka</span>
            <span>{queueItems.length} widoczne</span>
          </div>

          <div className="nav-primary-list">
            <button
              className={`nav-primary-item ${libraryView === "inbox" ? "nav-primary-item-active" : ""}`}
              onClick={() => navigateToReadLibraryView("inbox")}
              type="button"
            >
              <span>Skrzynka</span>
              <strong>{libraryView === "inbox" ? queueItems.length : totalUnreadCount}</strong>
            </button>

            <button
              className={`nav-primary-item ${libraryView === "saved" ? "nav-primary-item-active" : ""}`}
              onClick={() => navigateToReadLibraryView("saved")}
              type="button"
            >
              <span>Zapisane</span>
              <strong>{libraryView === "saved" ? queueItems.length : visibleFavoriteCount}</strong>
            </button>

            <button
              className={`nav-primary-item ${libraryView === "archive" ? "nav-primary-item-active" : ""}`}
              onClick={() => navigateToReadLibraryView("archive")}
              type="button"
            >
              <span>Archiwum</span>
              <strong>{libraryView === "archive" ? queueItems.length : 0}</strong>
            </button>

            <button
              className={`nav-primary-item ${libraryView === "digest" ? "nav-primary-item-active" : firstDigestCandidate ? "nav-primary-item-highlight" : ""}`}
              onClick={() => {
                if (firstDigestCandidate) {
                  navigateToReadLibraryView("digest", {
                    itemId: firstDigestCandidate.id,
                  });
                } else {
                  setFeedback({
                    tone: "idle",
                    title: "Kolejka digestu jest pusta",
                    lines: ["Oznacz artykuly klawiszem D, aby zbudowac krotka liste do kolejnego podgladu digestu."],
                  });
                }
              }}
              type="button"
            >
              <span>Kolejka digestu</span>
              <strong>{libraryView === "digest" ? queueItems.length : digestCandidateIds.length}</strong>
            </button>
          </div>
        </section>

        <section className="nav-section">
          <div className="nav-section-header">
            <span className="panel-badge">Przeglad</span>
            <span>{currentSection === "read" ? (hasReaderSearch ? "Wyszukiwanie aktywne" : "Kolejka na zywo") : "Stan czytnika"}</span>
          </div>

          <div className="nav-metric-grid">
            <div>
              <span>Kolejka</span>
              <strong>{getLibraryViewLabel(libraryView)}</strong>
              <small>{libraryView === "archive" ? "Biblioteka historyczna" : showReadItems ? "Przeczytane + nieprzeczytane" : "Najpierw nieprzeczytane"}</small>
            </div>
            <div>
              <span>Ostatni sync</span>
              <strong>{latestRun ? getSyncRunStatusLabel(latestRun.status) : "Bezczynny"}</strong>
              <small>{latestRun ? formatTimestamp(latestRun.completed_at ?? latestRun.created_at, "Nigdy") : "Nigdy"}</small>
            </div>
            <div>
              <span>Szukaj</span>
              <strong>{currentSection === "read" ? (hasReaderSearch ? "Zawazone" : "Globalne") : "Czytaj"}</strong>
              <small>{currentSection === "read" ? (deferredItemSearch.trim() || "Tytul, autor, zrodlo") : "Filtr kolejki jest aktywny tylko w sekcji Czytaj"}</small>
            </div>
          </div>
        </section>

        {workspaceBriefing ? (
          <section className="nav-section">
            <WorkspacePanel
              description="Zwarty poranny lub wieczorny przeglad zbudowany z rankingu artykulow, stanu zrodel i biezacej biblioteki."
              eyebrow="Briefing"
              title="Dzis w skrocie"
              tone="accent"
            >
              <div
                style={{
                  display: "grid",
                  gap: "0.55rem",
                }}
              >
                {workspaceBriefing.summary_lines.map((line, lineIndex) => (
                  <span key={`${line}-${lineIndex}`} style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>
                    {line}
                  </span>
                ))}
              </div>

              {workspaceBriefing.resume_item ? (
                <WorkspaceButton
                  onClick={() => {
                    navigateToReadLibraryView("inbox", {
                      itemId: workspaceBriefing.resume_item!.id,
                      showReadItems: true,
                      surface: "article",
                    });
                  }}
                  style={{ marginTop: "0.75rem", width: "100%", justifyContent: "space-between" }}
                  tone="accent"
                >
                  <span>Wznow czytanie</span>
                  <strong>{workspaceBriefing.resume_item.title}</strong>
                </WorkspaceButton>
              ) : null}

              {workspaceBriefing.recommended.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: "0.55rem",
                    marginTop: "0.75rem",
                  }}
                >
                  {workspaceBriefing.recommended.slice(0, 3).map((entry) => (
                    <WorkspaceButton
                      key={entry.item.id}
                      onClick={() =>
                        navigateToReadLibraryView("inbox", {
                          itemId: entry.item.id,
                        })
                      }
                      style={{ justifyContent: "space-between", textAlign: "left" }}
                    >
                      <span style={{ display: "grid", gap: "0.18rem" }}>
                        <strong>{entry.item.title}</strong>
                        <small>{entry.item.channel_title}</small>
                      </span>
                      <WorkspaceChip active tone="accent">
                        {Math.round(entry.breakdown.final_score)}
                      </WorkspaceChip>
                    </WorkspaceButton>
                  ))}
                </div>
              ) : null}
            </WorkspacePanel>
          </section>
        ) : null}

        <section className="nav-section">
          <WorkspacePanel
            description="Wchodz od razu w przydatne wycinki biblioteki, zamiast zawsze zaczynac od surowej chronologii."
            eyebrow="Powroty"
            title="Szybkie sciezki"
            tone="success"
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <WorkspaceButton
                active={recallWindow === "all" && libraryView === "inbox"}
                onClick={() => {
                  setRecallWindow("all");
                  navigateToReadLibraryView("inbox", { showReadItems: true });
                }}
              >
                Cala kolejka
              </WorkspaceButton>
              <WorkspaceButton
                active={recallWindow === "today"}
                onClick={() => {
                  setRecallWindow("today");
                  navigateToReadLibraryView("inbox", { showReadItems: true });
                }}
                tone="accent"
              >
                Dzis
              </WorkspaceButton>
              <WorkspaceButton
                active={recallWindow === "week"}
                onClick={() => {
                  setRecallWindow("week");
                  navigateToReadLibraryView("inbox", { showReadItems: true });
                }}
              >
                Ten tydzien
              </WorkspaceButton>
              <WorkspaceButton
                active={libraryView === "saved" && itemSortMode === "newest"}
                onClick={() => {
                  setRecallWindow("all");
                  navigateToReadLibraryView("saved", {
                    showReadItems: true,
                    sort: "newest",
                  });
                }}
              >
                Ostatnio zapisane
              </WorkspaceButton>
            </div>

            {tagCatalog.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.45rem",
                  marginTop: "0.8rem",
                }}
              >
                {tagCatalog.slice(0, 6).map((tag) => (
                  <WorkspaceButton
                    key={tag.id}
                    onClick={() => {
                      setRecallWindow("all");
                      navigateToReadLibraryView("saved", {
                        search: tag.name,
                        showReadItems: true,
                      });
                    }}
                    title={`Otworz artykuly oznaczone tagiem ${tag.name}`}
                  >
                    {tag.name} ({tag.item_count})
                  </WorkspaceButton>
                ))}
              </div>
            ) : null}
          </WorkspacePanel>
        </section>

        {currentSection !== "sources" ? (
          <section className="nav-section">
            <div className="nav-section-header">
              <span className="panel-badge">Szybkie dodawanie</span>
              <span>{activeChannelCount} aktywnych</span>
            </div>

            <form className="channel-form" onSubmit={handleSubmit}>
              <label className="field field-wide">
                <span>Adres zrodla</span>
                <input
                  autoComplete="off"
                  name="inputUrl"
                  onChange={(event) => {
                    handleSourceDraftInputChange(event.target.value);
                  }}
                  placeholder="https://example.com lub https://example.com/feed.xml"
                  required
                  value={inputUrl}
                />
              </label>

              <label className="field">
                <span>Kategoria</span>
                <input
                  autoComplete="off"
                  name="category"
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="inzynieria, design, research"
                  value={category}
                />
              </label>

              <button className="action-button" disabled={previewBusy || subscribeBusy || isPending} type="submit">
                {previewBusy ? "Podglad..." : "Podejrzyj zrodlo"}
              </button>

              {channelPreview ? (
                <div className="ops-row nav-preview-card">
                  <div className="ops-row-top">
                    <strong>{getPreviewTitle(channelPreview)}</strong>
                    <span>{channelPreview.discovery.mode}</span>
                  </div>
                  <span>
                    {channelPreview.discovery.resolved_feed_url
                      ? `Rozwiazano: ${channelPreview.discovery.resolved_feed_url}`
                      : "Wybierz jeden z wykrytych feedow ponizej."}
                  </span>

                  {channelPreview.status === "already_subscribed" && channelPreview.existing_channel ? (
                    <>
                      <span>{channelPreview.existing_channel.title}</span>
                      <div className="channel-actions">
                        <button
                          className="secondary-button"
                          onClick={() => focusFirstItemFromChannel(channelPreview.existing_channel!)}
                          type="button"
                        >
                          Przejdz do zrodla
                        </button>
                      </div>
                    </>
                  ) : null}

                  {channelPreview.feed ? (
                    <>
                      <span>{channelPreview.feed.title}</span>
                      <span>{channelPreview.feed.description ?? channelPreview.feed.site_url ?? channelPreview.feed.feed_url}</span>
                      <div className="channel-actions">
                        <button
                          className="secondary-button"
                          disabled={subscribeBusy || channelPreview.status === "already_subscribed"}
                          onClick={() => void handleConfirmChannelAdd(channelPreview.feed?.feed_url)}
                          type="button"
                        >
                          {subscribeBusy ? "Zapisywanie..." : "Subskrybuj"}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {channelPreview.candidates.length > 0 ? (
                    <div className="nav-preview-candidates">
                      {channelPreview.candidates.map((candidate) => (
                        <div className="nav-preview-candidate" key={candidate.feed_url}>
                          <strong>{candidate.title}</strong>
                          <span>{candidate.description ?? candidate.feed_url}</span>
                          <div className="channel-actions">
                            <button
                              className="secondary-button"
                              disabled={subscribeBusy || candidate.already_subscribed}
                              onClick={() => void handleConfirmChannelAdd(candidate.feed_url)}
                              type="button"
                            >
                              {candidate.already_subscribed ? "Juz dodane" : subscribeBusy ? "Zapisywanie..." : "Subskrybuj"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </form>
          </section>
        ) : null}

        <section className="nav-section nav-section-scroll">
          <div className="nav-section-header">
            <span className="panel-badge">Zrodla</span>
            <button
              className="mini-button"
              disabled={isSyncing || channels.length === 0}
              onClick={() => void handleSyncAll()}
              type="button"
            >
              {isSyncing ? "Syncowanie..." : "Synchronizuj"}
            </button>
          </div>

          {channels.length === 0 ? (
            <p className="nav-empty">Brak zapisanych zrodel.</p>
          ) : (
            <ul className="nav-source-list">
              {channels.map((channel) => {
                const isChannelSelected = Boolean(selectedItem && selectedItem.channel_id === channel.id);

                return (
                  <li key={channel.id}>
                    <button
                      className={`nav-source-button ${isChannelSelected ? "nav-source-button-active" : ""}`}
                      onClick={() => focusFirstItemFromChannel(channel)}
                      type="button"
                    >
                      <div className="nav-source-copy">
                        <strong>{channel.title}</strong>
                        <span>{channel.category ? channel.category : channel.feed_url}</span>
                        {channel.health ? <span>{channel.health.summary}</span> : null}
                      </div>
                      <div className="nav-source-meta">
                        {channel.health ? (
                          <span className={`channel-state ${getChannelHealthTone(channel.health.status) ? `channel-state-${getChannelHealthTone(channel.health.status)}` : ""}`}>
                            {getHealthStatusLabel(channel.health.status)}
                          </span>
                        ) : null}
                        <span className={`channel-state channel-state-${channel.state}`}>{getChannelStateLabel(channel.state)}</span>
                        <strong>{channel.unread_count}</strong>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>

      <section className={`reader-pane ${isFocusedMode ? "reader-pane-focused" : ""}`}>
        <header className="reader-pane-header">
          <div>
            <span className="panel-badge">Artykuly</span>
            <h2>{readerSectionLabel}</h2>
            <p>
              {deferredItemSearch.trim()
                ? `Wyniki wyszukiwania dla "${deferredItemSearch.trim()}"`
                : "Uklad dostrojony pod czytnik RSS z bocznymi panelami: zrodla po lewej, kolejka na srodku, czytanie po prawej."}
            </p>
          </div>

          <div className="reader-header-side">
            <div className="reader-stats">
              <div>
                <strong>{queueItems.length}</strong>
                <span>widoczne</span>
              </div>
              <div>
                <strong>{visibleUnreadCount}</strong>
                <span>nieprzeczytane</span>
              </div>
              <div>
                <strong>{visibleFavoriteCount}</strong>
                <span>zapisane</span>
              </div>
            </div>

            <div className="reader-mode-controls">
              <button
                className={`mini-button ${isCompactList ? "mini-button-accent" : ""}`}
                onClick={() => setIsCompactList((current) => !current)}
                type="button"
              >
                {isCompactList ? "Wygodna lista" : "Zwarta lista"}
              </button>
              <div className="segmented-control" aria-label="Kolejnosc sortowania">
                <button
                  className={itemSortMode === "newest" ? "segment-active" : ""}
                  onClick={() => setItemSortMode("newest")}
                  type="button"
                >
                  Najnowsze
                </button>
                <button
                  className={itemSortMode === "oldest" ? "segment-active" : ""}
                  onClick={() => setItemSortMode("oldest")}
                  type="button"
                >
                  Najstarsze
                </button>
              </div>
              <button
                className={`mini-button ${libraryView === "saved" ? "mini-button-accent" : ""}`}
                onClick={() => {
                  const nextView = libraryView === "saved" ? "inbox" : "saved";
                  navigateToReadLibraryView(nextView);
                }}
                type="button"
              >
                {libraryView === "saved" ? "Wroc do skrzynki" : "Widok zapisanych"}
              </button>
              <button
                className={`mini-button ${storyQueueGrouped ? "mini-button-accent" : ""}`}
                onClick={() => setStoryQueueGrouped((current) => !current)}
                type="button"
              >
                {storyQueueGrouped ? "Zgrupowane historie" : "Pokaz powtorki"}
              </button>
            </div>
          </div>
        </header>

        <div className="reader-toolbar">
          <div className="segmented-control" aria-label="Filtr przeczytania">
            <button
              className={!showReadItems ? "segment-active" : ""}
              onClick={() => setShowReadItems(false)}
              type="button"
            >
              Nieprzeczytane
            </button>
            <button
              className={showReadItems ? "segment-active" : ""}
              onClick={() => setShowReadItems(true)}
              type="button"
            >
              Wszystkie
            </button>
          </div>

          <label className="search-field">
            <span>Szukaj /</span>
            <input
              onChange={(event) => setItemSearch(event.target.value)}
              placeholder="Szukaj po tytule, autorze, zrodle"
              ref={searchInputRef}
              value={itemSearch}
            />
          </label>

          <div className="reader-toolbar-actions">
            <button
              className={`mini-button ${selectedItemIds.length > 0 ? "mini-button-accent" : ""}`}
              onClick={() => {
                if (selectedItemIds.length === queueItems.length) {
                  clearBulkSelection();
                } else {
                  selectVisibleItems();
                }
              }}
              type="button"
            >
              {selectedItemIds.length === queueItems.length && queueItems.length > 0 ? "Wyczysc strone" : "Zaznacz strone"}
            </button>
            <button className="mini-button" onClick={() => setShowKeyboardHelp(true)} type="button">
              <span className="button-with-icon">
                <KeyboardIcon className="app-icon button-inline-icon" />
                Skroty ?
              </span>
            </button>
            <button className="mini-button" onClick={() => void loadItems()} type="button">
              <span className="button-with-icon">
                <SyncIcon className="app-icon button-inline-icon" />
                Odswiez
              </span>
            </button>
          </div>
        </div>

        {selectedItemIds.length > 0 ? (
          <div className="reader-bulk-bar" role="region" aria-label="Masowa selekcja">
            <div className="reader-bulk-summary">
              <strong>{selectedItemIds.length} zaznaczonych</strong>
              <span>Akcje zbiorcze dotycza tylko aktualnie widocznego wycinka kolejki.</span>
            </div>

            <div className="reader-bulk-actions">
              <button className="secondary-button" disabled={bulkBusy} onClick={() => void handleBulkAction("read")} type="button">
                <span className="button-with-icon">
                  <ReaderIcon className="app-icon button-inline-icon" />
                  {bulkBusy ? "Praca..." : "Oznacz jako przeczytane"}
                </span>
              </button>
              <button className="secondary-button" disabled={bulkBusy} onClick={() => void handleBulkAction("save")} type="button">
                <span className="button-with-icon">
                  <BookmarkIcon className="app-icon button-inline-icon" />
                  Zapisz
                </span>
              </button>
              <button className="secondary-button" disabled={bulkBusy} onClick={() => void handleBulkAction("digest")} type="button">
                <span className="button-with-icon">
                  <DigestIcon className="app-icon button-inline-icon" />
                  Dodaj do digestu
                </span>
              </button>
              <button className="mini-button" disabled={bulkBusy} onClick={() => void handleBulkAction("archive")} type="button">
                <span className="button-with-icon">
                  <ArchiveIcon className="app-icon button-inline-icon" />
                  Archiwizuj
                </span>
              </button>
              <button className="mini-button" disabled={bulkBusy} onClick={clearBulkSelection} type="button">
                <span className="button-with-icon">
                  <DismissIcon className="app-icon button-inline-icon" />
                  Wyczysc
                </span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="reader-shortcut-strip" role="note" aria-label="Skroty klawiaturowe">
          {shortcutHints.map((hint) => (
            <span className="reader-shortcut-chip" key={hint.key}>
              <kbd>{hint.key}</kbd>
              <span>{hint.label}</span>
            </span>
          ))}
        </div>

        <div className="reader-status-ribbon">
          <span>
            {libraryView === "saved"
              ? "Aktywny jest widok zapisanych"
              : libraryView === "digest"
                ? "Aktywna jest kolejka digestu"
                : libraryView === "archive"
                  ? "Aktywny jest widok archiwum"
                  : "Aktywna jest skrzynka"}
          </span>
          <span>{showReadItems ? "Pokazuje przeczytane i nieprzeczytane" : "Najpierw nieprzeczytane"}</span>
          <span>{getSortLabel(itemSortMode)}</span>
          <span>{storyQueueGrouped ? "Grupowanie historii wlaczone" : "Powtorki historii widoczne"}</span>
          <span>{isCompactList ? "Zwarta gestosc" : "Wygodna gestosc"}</span>
          <span>
            {recallWindow === "today" ? "Powrot: dzis" : recallWindow === "week" ? "Powrot: ten tydzien" : "Powrot: cala kolejka"}
          </span>
          <span>
            {selectedReadingProgress && selectedReadingProgress.progress > 2
              ? `Dostepne wznowienie: ${selectedReadingProgress.progress}%`
              : "Kontynuacja na urzadzeniu jest gotowa"}
          </span>
          <span>Zapisanie usuwa artykul ze skrzynki, archiwum ukrywa go do przywrocenia, a kolejka digestu pozostaje dodatkiem.</span>
          <span>{itemsRefreshing ? "Odswiezanie listy artykulow..." : itemsPage?.has_more ? "Wyzej sa jeszcze kolejne artykuly" : "Biezacy wycinek jest aktualny"}</span>
        </div>

        {savedViewChips.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "0.85rem",
            }}
          >
            {savedViewChips.map((chip) => (
              <SavedViewChip
                key={chip.id}
                onClear={() => setItemSearch("")}
                onSelect={(viewId) => {
                  const savedView = savedSearches.find((entry) => entry.id === viewId);
                  if (!savedView) {
                    return;
                  }
                  navigateToReadLibraryView(savedView.default_view, {
                    search: savedView.query,
                  });
                }}
                view={chip}
              />
            ))}
            <WorkspaceButton disabled={!deferredItemSearch.trim()} onClick={() => void handleCreateSavedSearch()} tone="accent">
              Zapisz biezace zapytanie
            </WorkspaceButton>
          </div>
        ) : null}

        {latestUndoEntry ? (
          <div className="reader-undo-bar" role="status" aria-live="polite">
            <div>
              <strong>{latestUndoEntry.label}</strong>
              <p>
                Cofniecie jest gotowe dla {latestUndoEntry.operations.length} {latestUndoEntry.operations.length === 1 ? "pozycji" : "pozycji"}.
              </p>
            </div>
            <div className="reader-undo-actions">
              <button className="secondary-button" disabled={undoBusy} onClick={() => void handleUndo()} type="button">
                {undoBusy ? "Cofanie..." : "Cofnij"}
              </button>
              <button className="mini-button" disabled={undoBusy} onClick={() => dismissUndoEntry(latestUndoEntry.id)} type="button">
                Odrzuc
              </button>
            </div>
          </div>
        ) : null}

        {itemsMessage && itemsStatus !== "unsupported" ? (
          <div className={`reader-inline-note ${itemsStatus === "error" ? "reader-inline-note-error" : ""}`}>
            {itemsMessage}
          </div>
        ) : null}

        {renderReaderContent()}
      </section>

      <aside className="ops-pane">
        <section className={`feedback-card feedback-${feedback.tone}`}>
          <strong>{feedback.title}</strong>
          <ul className="feedback-list">
            {feedback.lines.map((line, lineIndex) => (
              <li key={`${line}-${lineIndex}`}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="ops-section">
          <RankingPreferencesPanel
            actions={
              workspaceProfile ? (
                <WorkspaceChip active tone="accent">
                  Limit awaryjny {workspaceProfile.emergency_source_cap}
                </WorkspaceChip>
              ) : null
            }
            onPreferenceChange={(preferenceId, nextValue) =>
              void saveWorkspaceProfile({
                [preferenceId]: Number.parseInt(nextValue, 10),
              } as Partial<WorkspaceProfile>)
            }
            preferences={rankingPreferences}
          />

          <WorkspacePanel
            description="Deklaruj trwale tematy, aby korygowac ranking kolejki i ograniczac przeciazenie czytnikiem."
            eyebrow="Profil"
            title="Zainteresowania tematyczne"
            tone="accent"
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.45rem",
                marginBottom: "0.75rem",
              }}
            >
              {workspaceProfile?.interests.map((interest) => (
                <WorkspaceButton
                  key={interest.id}
                  onClick={() =>
                    void saveWorkspaceProfile({
                      interests: workspaceProfile.interests.filter((entry) => entry.id !== interest.id),
                    })
                  }
                  tone={interest.weight > 0 ? "accent" : interest.weight < 0 ? "danger" : "default"}
                >
                  {interest.label} {interest.weight > 0 ? "wzmacniaj" : interest.weight < 0 ? "tlum" : "neutralnie"}
                </WorkspaceButton>
              ))}
              {!workspaceProfile?.interests.length ? <WorkspaceChip>Brak skonfigurowanych zainteresowan</WorkspaceChip> : null}
            </div>

            <div
              style={{
                display: "grid",
                gap: "0.55rem",
              }}
            >
              <input
                onChange={(event) => setInterestDraft(event.target.value)}
                placeholder="szachy, AI, ksiazki, security"
                value={interestDraft}
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.55rem",
                }}
              >
                <select
                  onChange={(event) => setInterestWeight(Number.parseInt(event.target.value, 10) as WorkspaceInterest["weight"])}
                  value={interestWeight}
                >
                  <option value={2}>Wzmacniaj</option>
                  <option value={1}>Preferuj</option>
                  <option value={0}>Neutralnie</option>
                  <option value={-1}>Tlum</option>
                </select>
                <WorkspaceButton
                  disabled={!interestDraft.trim() || !workspaceProfile || workspaceBusy}
                  onClick={() =>
                    workspaceProfile
                      ? void saveWorkspaceProfile({
                          interests: [
                            ...workspaceProfile.interests.filter(
                              (entry) => entry.label.toLowerCase() !== interestDraft.trim().toLowerCase(),
                            ),
                            {
                              id: `draft_${interestDraft.trim().toLowerCase()}`,
                              label: interestDraft.trim(),
                              normalized_topic: interestDraft.trim().toLowerCase(),
                              kind: "topic",
                              weight: interestWeight,
                            },
                          ],
                        }).then(() => {
                          setInterestDraft("");
                          setInterestWeight(1);
                        })
                      : undefined
                  }
                  tone="accent"
                >
                  Dodaj zainteresowanie
                </WorkspaceButton>
              </div>
            </div>
          </WorkspacePanel>
        </section>

        <section className="ops-section">
          <WorkspacePanel
            description={selectedItem ? `Uporzadkuj ${selectedItem.title} notatkami, tagami i kolekcjami.` : "Wybierz artykul, aby dodac notatki, tagi i kolekcje."}
            eyebrow="Wiedza"
            title="Notatki, tagi i kolekcje"
            tone="warning"
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.45rem",
                marginBottom: "0.75rem",
              }}
            >
              {itemTags.map((tag) => (
                <WorkspaceChip key={tag.id} active tone="accent">
                  {tag.name}
                </WorkspaceChip>
              ))}
              {!selectedItem ? <WorkspaceChip>Najpierw wybierz artykul</WorkspaceChip> : null}
            </div>

            <div
              style={{
                display: "grid",
                gap: "0.55rem",
              }}
            >
              <input
                onChange={(event) => setTagDraft(event.target.value)}
                placeholder="Dodaj tagi: rynek, longform, explainery"
                value={tagDraft}
              />
              <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                <WorkspaceButton disabled={!selectedItem || !tagDraft.trim() || workspaceBusy} onClick={() => void handleSaveTags()} tone="accent">
                  Zapisz tagi
                </WorkspaceButton>
                <input
                  onChange={(event) => setCollectionDraft(event.target.value)}
                  placeholder="Nowa kolekcja"
                  value={collectionDraft}
                />
                <WorkspaceButton disabled={!collectionDraft.trim() || workspaceBusy} onClick={() => void handleCreateCollection()}>
                  Utworz kolekcje
                </WorkspaceButton>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                {collections.map((collection) => (
                  <WorkspaceButton
                    key={collection.id}
                    disabled={!selectedItem || workspaceBusy}
                    onClick={() => void handleAddToCollection(collection.id)}
                  >
                    {collection.name} ({collection.item_count})
                  </WorkspaceButton>
                ))}
              </div>

              {selectedTextQuote ? (
                <blockquote
                  style={{
                    margin: 0,
                    padding: "0.75rem 0.9rem",
                    borderRadius: "0.9rem",
                    background: "rgba(255,255,255,0.82)",
                    border: "1px solid rgba(21, 94, 117, 0.12)",
                  }}
                >
                  {selectedTextQuote}
                </blockquote>
              ) : null}

              <textarea
                onChange={(event) => setAnnotationDraft(event.target.value)}
                placeholder="Napisz notatke albo dodaj komentarz do biezacego zaznaczenia"
                rows={4}
                value={annotationDraft}
              />
              <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                <WorkspaceButton disabled={!selectedItem || !annotationDraft.trim() || workspaceBusy} onClick={() => void handleCreateNote()} tone="accent">
                  Zapisz notatke
                </WorkspaceButton>
                <WorkspaceButton disabled={!selectedItem || !selectedTextQuote.trim() || workspaceBusy} onClick={() => void handleCreateHighlight()} tone="warning">
                  Zapisz podkreslenie
                </WorkspaceButton>
              </div>
            </div>
          </WorkspacePanel>

          <AnnotationPanel panel={annotationPanelModel} />
        </section>

        <section className="ops-section">
          <WorkspacePanel
            description="Przeszukiwalne notatki i podkreslenia w calej bibliotece, nie tylko w biezacym artykule."
            eyebrow="Centrum adnotacji"
            title="Wroc do wlasnych mysli"
            tone="accent"
          >
            <div style={{ display: "grid", gap: "0.65rem" }}>
              <input
                onChange={(event) => setAnnotationHubQuery(event.target.value)}
                placeholder="Szukaj notatek, cytatow z podkreslen i tresci adnotacji"
                value={annotationHubQuery}
              />
              {annotationHubLoading ? <WorkspaceChip>Szukanie adnotacji...</WorkspaceChip> : null}
              <div style={{ display: "grid", gap: "0.55rem" }}>
                {annotationHubItems.map((annotation) => (
                  <WorkspaceButton
                    key={annotation.id}
                    onClick={() => void focusArticleById(annotation.item_id)}
                    style={{ justifyContent: "space-between", textAlign: "left" }}
                  >
                    <span style={{ display: "grid", gap: "0.18rem" }}>
                      <strong>{annotation.kind === "highlight" ? "Podkreslenie" : "Notatka"}</strong>
                      <small>{annotation.note_text ?? annotation.quote_text ?? "Open linked article"}</small>
                    </span>
                    <WorkspaceChip active tone={annotation.kind === "highlight" ? "warning" : "accent"}>
                      {annotation.kind}
                    </WorkspaceChip>
                  </WorkspaceButton>
                ))}
                {!annotationHubLoading && annotationHubItems.length === 0 ? (
                  <WorkspaceChip>Brak pasujacych adnotacji</WorkspaceChip>
                ) : null}
              </div>
            </div>
          </WorkspacePanel>
        </section>

        {storyClusters.length > 0 ? (
          <section className="ops-section">
            <div className="ops-section-header">
              <div>
                <span className="panel-badge">Stories</span>
                <h3>Deduplicated story clusters</h3>
              </div>
              <span>{storyClusters.length} groups</span>
            </div>
            <div style={{ display: "grid", gap: "0.85rem" }}>
              {storyClusters.slice(0, 4).map((cluster) => (
                <StoryClusterCard
                  actions={
                    <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                      <WorkspaceButton onClick={() => void focusArticleById(cluster.primary.id)} tone="accent">
                        Open lead
                      </WorkspaceButton>
                      <WorkspaceButton
                        onClick={() =>
                          setExpandedStoryClusterIds((current) =>
                            current.includes(cluster.id)
                              ? current.filter((entry) => entry !== cluster.id)
                              : [...current, cluster.id],
                          )
                        }
                      >
                        {expandedStoryClusterIds.includes(cluster.id) ? "Zwin" : `Pokaz alternatywy (${cluster.alternates.length})`}
                      </WorkspaceButton>
                    </div>
                  }
                  cluster={mapStoryClusterCard(cluster)}
                  key={cluster.id}
                  maxStories={expandedStoryClusterIds.includes(cluster.id) ? cluster.item_count : 3}
                  onStorySelect={(storyId) => void focusArticleById(storyId)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {sourceHealthEntries.length > 0 ? (
          <section className="ops-section">
            <div className="ops-section-header">
              <div>
                <span className="panel-badge">Stan zrodel</span>
                <h3>Priorytet i kontrola szumu</h3>
              </div>
              <span>{sourceHealthEntries.length} sledzonych</span>
            </div>
            <WorkspacePanel
              description="Tworz wielokrotnego uzytku pakiety zrodel, podpina feedy i stosuj pauze lub wyciszenie bez destrukcyjnego sprzatania."
              eyebrow="Pakiety"
              title="Grupuj i wyciszaj zrodla"
              tone="success"
            >
              <div style={{ display: "grid", gap: "0.55rem" }}>
                <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                  <input
                    onChange={(event) => setSourceGroupDraft(event.target.value)}
                    placeholder="Utworz pakiet: rynki, longform, research"
                    value={sourceGroupDraft}
                  />
                  <input onChange={(event) => setSourceGroupColor(event.target.value)} type="color" value={sourceGroupColor} />
                  <WorkspaceButton disabled={!sourceGroupDraft.trim() || workspaceBusy} onClick={() => void handleCreateSourceGroup()} tone="accent">
                    Utworz pakiet
                  </WorkspaceButton>
                </div>
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  {sourceGroups.map((group) => (
                    <WorkspaceChip key={group.id}>{group.name} ({group.channel_count})</WorkspaceChip>
                  ))}
                  {sourceGroups.length === 0 ? <WorkspaceChip>Brak pakietow</WorkspaceChip> : null}
                </div>
              </div>
            </WorkspacePanel>
            <div style={{ display: "grid", gap: "0.85rem" }}>
              {sourceHealthEntries.slice(0, 4).map((entry) => (
                <SourceHealthCard
                  actions={
                    <div style={{ display: "grid", gap: "0.55rem" }}>
                      <select
                        onChange={(event) =>
                          void handleSourceControlUpdate(entry.channel_id, {
                            group_id: event.target.value || null,
                          })
                        }
                        value={entry.control.group_id ?? ""}
                      >
                        <option value="">Bez pakietu</option>
                        {sourceGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                        <WorkspaceButton
                          disabled={workspaceBusy}
                          onClick={() =>
                            void handleSourceControlUpdate(entry.channel_id, {
                              snoozed_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                            })
                          }
                        >
                          Wstrzymaj na 1d
                        </WorkspaceButton>
                        <WorkspaceButton
                          disabled={workspaceBusy}
                          onClick={() =>
                            void handleSourceControlUpdate(entry.channel_id, {
                              paused_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                            })
                          }
                        >
                          Pauza 7d
                        </WorkspaceButton>
                        <WorkspaceButton
                          disabled={workspaceBusy}
                          onClick={() =>
                            void handleSourceControlUpdate(entry.channel_id, {
                              paused_until: null,
                              snoozed_until: null,
                            })
                          }
                        >
                          Wyczysc timery
                        </WorkspaceButton>
                      </div>
                      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                      <WorkspaceButton
                        active={entry.control.tier === "priority"}
                        disabled={workspaceBusy}
                        onClick={() => void handleSourceTierChange(entry.channel_id, "priority")}
                        tone="accent"
                      >
                        Priorytet
                      </WorkspaceButton>
                      <WorkspaceButton
                        active={entry.control.tier === "default"}
                        disabled={workspaceBusy}
                        onClick={() => void handleSourceTierChange(entry.channel_id, "default")}
                      >
                        Domyslnie
                      </WorkspaceButton>
                      <WorkspaceButton
                        active={entry.control.tier === "muted"}
                        disabled={workspaceBusy}
                        onClick={() => void handleSourceTierChange(entry.channel_id, "muted")}
                        tone="danger"
                      >
                        Wycisz
                      </WorkspaceButton>
                      </div>
                    </div>
                  }
                  key={entry.channel_id}
                  source={mapSourceHealthCard(entry)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="ops-section">
          <WorkspacePanel
            description="Zapisuj dowolne adresy artykulow bezposrednio do biblioteki i eksportuj caly workspace bez wychodzenia z aplikacji."
            eyebrow="Ciaglosc"
            title="Przechwytywanie i eksport"
            tone="success"
          >
            <div style={{ display: "grid", gap: "0.55rem" }}>
              <input
                onChange={(event) => setCaptureUrl(event.target.value)}
                placeholder="https://example.com/artykul-do-pozniejszego-czytania"
                value={captureUrl}
              />
              <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                <WorkspaceButton disabled={!captureUrl.trim() || captureBusy} onClick={() => void handleCaptureUrl()} tone="accent">
                  {captureBusy ? "Zapisywanie..." : "Zapisz URL"}
                </WorkspaceButton>
                <WorkspaceButton disabled={workspaceExportBusy} onClick={() => void handleExportWorkspace()}>
                  {workspaceExportBusy ? "Przygotowywanie..." : "Eksportuj continuity bundle"}
                </WorkspaceButton>
                <WorkspaceButton disabled={workspaceImportBusy} onClick={() => continuityImportInputRef.current?.click()} tone="accent">
                  {workspaceImportBusy ? "Odtwarzanie..." : "Odtworz continuity bundle"}
                </WorkspaceButton>
              </div>
              <textarea
                onChange={(event) => setOpmlDraft(event.target.value)}
                placeholder="Wklej tutaj OPML, aby przeniesc feedy z innego czytnika RSS"
                rows={5}
                value={opmlDraft}
              />
              <WorkspaceButton disabled={!opmlDraft.trim() || opmlImportBusy} onClick={() => void handleImportOpml()} tone="accent">
                {opmlImportBusy ? "Importowanie..." : "Importuj OPML"}
              </WorkspaceButton>
            </div>
          </WorkspacePanel>
        </section>

        <section className="ops-section">
          <div className="ops-section-header">
            <div>
              <span className="panel-badge">Reczny sync</span>
              <h3>Ostatnie runy</h3>
            </div>
            <button
              className="action-button compact-button"
              disabled={isSyncing || channels.length === 0}
              onClick={() => void handleSyncAll()}
              type="button"
            >
              {isSyncing ? "Syncowanie..." : "Sync aktywnych"}
            </button>
          </div>

          {syncRuns.length === 0 ? (
            <p className="empty-state">Brak runow syncu. Dodaj zrodlo i uruchom pierwszy reczny sync.</p>
          ) : (
            <ul className="ops-list">
              {syncRuns.map((run) => (
                <li className="ops-row" key={run.id}>
                  <div className="ops-row-top">
                    <strong>{getSyncRunStatusLabel(run.status)}</strong>
                    <span>{formatTimestamp(run.completed_at ?? run.created_at, "Brak znacznika czasu")}</span>
                  </div>
                  <span>
                    Kanaly {run.channels_succeeded}/{run.channels_total} ok, {run.channels_failed} nieudanych
                  </span>
                  <span>
                    Artykuly {run.items_created} nowych, {run.items_seen} widzianych, {run.items_skipped} pominietych
                  </span>
                  {run.error_message ? <span>{run.error_message}</span> : null}
                  {run.errors.length > 0 ? (
                    <ul className="run-error-list">
                      {run.errors.slice(0, 2).map((error) => (
                        <li key={`${run.id}-${error.channel_id}-${error.code}`}>
                          <strong>{error.channel_title}</strong>: {error.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ops-section">
          <div className="ops-section-header">
            <div>
              <span className="panel-badge">Zrodla</span>
              <h3>Zarzadzaj kanalami</h3>
            </div>
            <span>{archivedChannelCount} zarchiwizowanych</span>
          </div>

          {channels.length === 0 ? (
            <p className="empty-state">Brak zapisanych kanalow. Uzyj formularza powyzej, aby utworzyc pierwszy.</p>
          ) : (
            <ul className="ops-list">
              {channels.map((channel) => (
                <li className="ops-row" key={channel.id}>
                  <div className="ops-row-top">
                    <strong>{channel.title}</strong>
                    <span className={`channel-state channel-state-${channel.state}`}>{getChannelStateLabel(channel.state)}</span>
                  </div>
                  <span>{channel.feed_url}</span>
                  <span>{channel.category ? `Kategoria: ${channel.category}` : "Brak kategorii"}</span>
                  <span>Nieprzeczytane artykuly: {channel.unread_count}</span>
                  {channel.health ? <span>{`Stan: ${getHealthStatusLabel(channel.health.status)} | ${channel.health.summary}`}</span> : null}
                  <span>
                    {channel.last_fetch_at
                      ? `Ostatni fetch: ${formatTimestamp(channel.last_fetch_at, "nigdy nie synchronizowano")}`
                      : "Ostatni fetch: nigdy nie synchronizowano"}
                  </span>
                  <span>{channel.last_error ? `Ostatni blad: ${channel.last_error}` : "Ostatni blad: brak"}</span>
                  <div className="channel-actions">
                    <input
                      className="channel-inline-input"
                      onChange={(event) =>
                        setDraftCategories((current) => ({
                          ...current,
                          [channel.id]: event.target.value,
                        }))
                      }
                      placeholder="Zmien kategorie"
                      value={draftCategories[channel.id] ?? ""}
                    />
                    <button
                      className="secondary-button"
                      disabled={activeChannelId === channel.id}
                      onClick={() => void handleCategorySave(channel.id)}
                      type="button"
                    >
                      Zapisz kategorie
                    </button>
                    <button
                      className="secondary-button"
                      disabled={activeChannelId === channel.id || channel.state === "archived"}
                      onClick={() => void handleStateToggle(channel)}
                      type="button"
                    >
                      {channel.state === "active" ? "Wylacz" : channel.state === "inactive" ? "Wlacz" : "Zarchiwizowany"}
                    </button>
                    <button
                      className="danger-button"
                      disabled={activeChannelId === channel.id || channel.state === "archived"}
                      onClick={() => void handleArchive(channel)}
                      type="button"
                    >
                      Archiwizuj
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ops-section">
          <div className="ops-section-header">
            <div>
              <span className="panel-badge">Digest</span>
              <h3>Podglad i budowa</h3>
            </div>
            <span>{digestCandidateIds.length} zaznaczonych</span>
          </div>

          <div className="channel-actions">
            <button className="secondary-button" disabled={digestBusy || queueItems.length === 0} onClick={() => void handleDigestPreview()} type="button">
              {digestBusy ? "Praca..." : "Podejrzyj digest"}
            </button>
            <button className="action-button compact-button" disabled={digestBusy || queueItems.length === 0} onClick={() => void handleDigestBuild()} type="button">
              Zbuduj EPUB
            </button>
          </div>

          {digestPreview ? (
            <div className="ops-row">
              <div className="ops-row-top">
                <strong>{digestPreview.title}</strong>
                <span>{digestPreview.selection_mode}</span>
              </div>
              <span>
                {digestPreview.stats.article_count} artykul(y), {digestPreview.stats.word_count} slow, {digestPreview.stats.estimated_read_minutes} min
              </span>
              <span>
                {digestPreview.stats.digest_candidate_count} kandydatow digestu, {digestPreview.stats.favorite_count} zapisanych
              </span>
              <span>
                {digestPreview.category_summary.map((group) => `${group.category}: ${group.article_count}`).join(" | ")}
              </span>
            </div>
          ) : (
            <p className="empty-state">Podglad uzywa aktualnie widocznej kolejki i preferuje jawnie oznaczonych kandydatow digestu.</p>
          )}

          {digestHistory.length > 0 ? (
            <ul className="ops-list">
              {digestHistory.map((digest) => (
                <li className="ops-row" key={digest.id}>
                  <div className="ops-row-top">
                    <strong>{digest.title}</strong>
                <span>{getDigestStatusLabel(digest.status)}</span>
                  </div>
                  <span>{digest.article_count} artykul(y)</span>
                  <span>{formatTimestamp(digest.generated_at, "Jeszcze nie wygenerowano")}</span>
                  <span>{digest.artifact.path ? `Artefakt: ${digest.artifact.path}` : "Artefakt oczekuje"}</span>
                  {digest.error_message ? <span>{digest.error_message}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="ops-section">
          <div className="ops-section-header">
            <div>
              <span className="panel-badge">Delivery</span>
              <h3>SMTP i Kindle</h3>
            </div>
            <span>{deliverySettings?.smtp_ready ? "gotowe" : "wymaga konfiguracji"}</span>
          </div>

          <form className="channel-form" onSubmit={(event) => {
            event.preventDefault();
            void handleSaveDeliverySettings();
          }}>
            <label className="field">
              <span>SMTP host</span>
              <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_host: event.target.value }))} value={settingsDraft.smtp_host} />
            </label>
            <label className="field">
              <span>Port</span>
              <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_port: event.target.value }))} value={settingsDraft.smtp_port} />
            </label>
            <label className="field">
              <span>Uzytkownik</span>
              <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_username: event.target.value }))} value={settingsDraft.smtp_username} />
            </label>
            <label className="field">
              <span>Haslo</span>
              <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_password: event.target.value }))} type="password" value={settingsDraft.smtp_password} />
            </label>
            <label className="field">
              <span>Od</span>
              <input onChange={(event) => setSettingsDraft((current) => ({ ...current, smtp_from: event.target.value }))} value={settingsDraft.smtp_from} />
            </label>
            <label className="field">
              <span>Kindle email</span>
              <input onChange={(event) => setSettingsDraft((current) => ({ ...current, kindle_email: event.target.value }))} value={settingsDraft.kindle_email} />
            </label>
            <div className="channel-actions">
              <button className="secondary-button" disabled={settingsBusy} type="submit">
                {settingsBusy ? "Zapisywanie..." : "Zapisz ustawienia"}
              </button>
              <button className="mini-button" disabled={deliveryBusy} onClick={() => void handleDeliverySettingsPreflight()} type="button">
                Sprawdz konfiguracje
              </button>
            </div>
          </form>

          {deliverySettings ? (
            <div className="ops-row">
              <div className="ops-row-top">
                <strong>Aktualna konfiguracja wysylki</strong>
                <span>{deliverySettings.smtp_ready ? "gotowa" : "niepelna"}</span>
              </div>
              <span>{deliverySettings.smtp_host ? `${deliverySettings.smtp_host}:${deliverySettings.smtp_port}` : "Brak hosta SMTP"}</span>
              <span>{deliverySettings.smtp_password.configured ? "Haslo zapisane" : "Haslo niezapisane"}</span>
              <span>{deliverySettings.kindle_email ? `Kindle: ${deliverySettings.kindle_email}` : "Brak adresu Kindle"}</span>
              {deliverySettings.issues.length > 0 ? <span>{deliverySettings.issues.join(" | ")}</span> : null}
              {deliverySettingsMessage ? <span>{deliverySettingsMessage}</span> : null}
            </div>
          ) : null}

          <div className="channel-actions">
            <button className="secondary-button" disabled={deliveryBusy || !latestDigest} onClick={() => void handleDeliveryPreflight("kindle")} type="button">
              Preflight Kindle
            </button>
            <button className="secondary-button" disabled={deliveryBusy || !latestDigest} onClick={() => void handleSendDigest("dry_run", "kindle")} type="button">
              Test na sucho
            </button>
            <button className="action-button compact-button" disabled={deliveryBusy || !latestDigest} onClick={() => void handleSendDigest("send", "kindle")} type="button">
              Wyslij na Kindle
            </button>
          </div>

          {deliveryPreflight ? (
            <div className="ops-row">
              <div className="ops-row-top">
                <strong>{deliveryPreflight.artifact.title}</strong>
                <span>{getDeliveryStatusLabel(deliveryPreflight.status)}</span>
              </div>
              <span>{deliveryPreflight.recipient ? `Odbiorca: ${deliveryPreflight.recipient}` : "Odbiorca nieustalony"}</span>
              <span>{deliveryPreflight.artifact.artifact_exists ? `Rozmiar artefaktu: ${deliveryPreflight.artifact.artifact_bytes}` : "Brak artefaktu"}</span>
              <span>{deliveryPreflight.checks.map((check) => `${check.name}:${check.status}`).join(" | ")}</span>
            </div>
          ) : null}

          {deliveryLogs.length > 0 ? (
            <ul className="ops-list">
              {deliveryLogs.map((log) => (
                <li className="ops-row" key={log.id}>
                  <div className="ops-row-top">
                    <strong>{log.digest_title ?? "Wysylka digestu"}</strong>
                    <span>{getDeliveryStatusLabel(log.status)}</span>
                  </div>
                  <span>{log.target_kind} {log.recipient ?? "odbiorca oczekuje"}</span>
                  <span>{formatTimestamp(log.sent_at, "Jeszcze nie wyslano")}</span>
                  {log.error_message ? <span>{log.error_message}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </aside>

      {showKeyboardHelp ? (
        <div
          aria-modal="true"
          className="reader-command-overlay"
          onClick={() => setShowKeyboardHelp(false)}
          role="dialog"
        >
          <div
            className="reader-command-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="reader-command-header">
              <div>
                <span className="panel-badge">Pomoc klawiatury</span>
                <h3>Mapa komend</h3>
              </div>
              <button className="mini-button" onClick={() => setShowKeyboardHelp(false)} type="button">
                Zamknij
              </button>
            </div>

            <div className="reader-command-grid">
              {commandGroups.map((group) => (
                <section className="reader-command-group" key={group.title}>
                  <strong>{group.title}</strong>
                  <ul>
                    {group.items.map((item) => (
                      <li key={`${group.title}-${item.keys}`}>
                        <div>
                          <kbd>{item.keys}</kbd>
                          <span>{item.label}</span>
                        </div>
                        <p>{item.note}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <p className="reader-command-note">
              Zapisane i Archiwum korzystaja teraz z API biblioteki, wiec mapa klawiatury odzwierciedla ten sam model selekcji co UI.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
  */
}
