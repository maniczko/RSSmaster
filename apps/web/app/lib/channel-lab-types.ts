import type { AppLibraryView } from "@/app/lib/app-routes";
import type { DigestCandidatePreviewStatus } from "@/app/lib/digest-selection";
import type { SourceAddModeId } from "@/app/lib/source-add-modes";
import type { ReaderItemSortMode, ReaderReadSurfaceMode, ReaderFeedFilter } from "@/app/lib/reader-controller";
import type { ReaderDisplayImageMode, ReaderDisplayTextMode, ReaderDisplayWidthMode } from "@/app/lib/reader-display-controller";
import type { ItemReaderStatus } from "@/app/lib/reader-quality";
import type { ReaderRecallWindow } from "@/app/lib/reader-queue";
import type { ItemReextractPayload as ReaderItemReextractPayload } from "@/app/lib/reader-quality";
import type { WorkspaceSourceHealthEntry } from "@/app/lib/source-health";

/**
 * DTOs and UI workflow types consumed by the legacy ChannelLab shell.
 * Keeping them here lets the shell shrink without changing API/runtime behavior.
 */
export type Channel = {
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

export type ChannelHealth = {
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

export type LibraryView = AppLibraryView;

export type ItemLibrary = {
  state: "inbox" | "saved" | "archived";
  saved_at: string | null;
  archived_at: string | null;
  is_saved: boolean;
  is_archived: boolean;
};

export type Item = {
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
  reader_status?: ItemReaderStatus | null;
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

export type ItemDetail = Item & {
  cleaned_html: string | null;
  content_text: string | null;
};

export type DigestPreview = {
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

export type DigestSelectionSnapshotItem = {
  item_id: string;
  position: number;
  channel_id: string | null;
  channel_title: string | null;
  category: string | null;
  title: string;
  author?: string | null;
  source_url: string | null;
  excerpt?: string | null;
  published_at: string | null;
  content_html?: string | null;
  word_count?: number | null;
  content_hash: string | null;
};

export type DigestHistory = {
  id: string;
  job_run_id?: string | null;
  status: "pending" | "building" | "completed" | "failed" | "sent" | "archived";
  title: string;
  period_start: string | null;
  period_end: string | null;
  article_count: number;
  selection_snapshot: DigestSelectionSnapshotItem[];
  category_summary: Array<{
    category: string;
    article_count: number;
  }>;
  generated_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at?: string | null;
  error_code?: string | null;
  error_message: string | null;
  artifact: {
    path: string | null;
    sha256: string | null;
    size_bytes: number | null;
  };
};

export type DeliverySettings = {
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

export type DeliverySettingsDraft = {
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  smtp_from: string;
  kindle_email: string;
};

export type AISettings = {
  enabled: boolean;
  provider: "openai";
  chat_model: string;
  embedding_model: string;
  openai_api_key: {
    configured: boolean;
    redacted_value: string | null;
  };
  ready: boolean;
  updated_at: string | null;
  updated_by: string | null;
  issues: string[];
};

export type AISettingsDraft = {
  enabled: boolean;
  chat_model: string;
  embedding_model: string;
  openai_api_key: string;
  clear_openai_api_key: boolean;
};

export type AISettingsPreflight = {
  status: "ready" | "needs_configuration" | "connection_failed";
  can_use_ai: boolean;
  checks: Array<{
    name: string;
    status: "passed" | "failed" | "warning" | "skipped";
    message: string;
  }>;
};

export type DeliveryPreflight = {
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

export type DeliveryLog = {
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

export type SyncRun = {
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

export type WorkspaceInterest = {
  id: string;
  label: string;
  normalized_topic: string | null;
  kind: "topic" | "source";
  weight: -1 | 0 | 1 | 2;
};

export type WorkspaceProfile = {
  id: string;
  name: string;
  candidate_window_hours: number;
  default_source_cap: number;
  priority_source_cap: number;
  emergency_source_cap: number;
  daily_reading_goal: number;
  interests: WorkspaceInterest[];
};

export type WorkspaceItemCard = {
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

export type WorkspaceRankingItem = {
  item: WorkspaceItemCard;
  candidate_status: "eligible" | "excluded" | "suppressed";
  candidate_reason: string | null;
  source_cap: number;
  source_window_hours: number;
  visibility: "shown" | "hidden";
  visibility_reason: string | null;
  quality_flags: string[];
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
    diversity_penalty: number;
    final_score: number;
    matched_interests: string[];
    matched_positive_signals: string[];
    matched_negative_signals: string[];
    quality_flags: string[];
    visibility: "shown" | "hidden";
    visibility_reason: string | null;
    reason: string;
  };
};

export type ReaderFeedbackAction =
  | "more_like_this"
  | "less_like_this"
  | "hide_topic"
  | "mute_source"
  | "important";

export type ReaderFeedbackPayload = {
  feedback: {
    id: string;
    item_id: string | null;
    source_id: string | null;
    action: ReaderFeedbackAction;
    topic: string | null;
    reason: string | null;
    created_at: string;
  };
};

export type WorkspaceBriefing = {
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

export type WorkspaceAnnotation = {
  id: string;
  item_id: string;
  kind: "highlight" | "note";
  quote_text: string | null;
  note_text: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceTag = {
  id: string;
  name: string;
  color: string | null;
  item_count: number;
};

export type WorkspaceCollection = {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
};

export type WorkspaceSavedSearch = {
  id: string;
  name: string;
  query: string;
  default_view: "inbox" | "saved" | "digest" | "archive";
};

export type WorkspaceSourceGroup = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  channel_count: number;
};

export type WorkspaceStoryCluster = {
  id: string;
  headline: string;
  item_count: number;
  category: string | null;
  primary: WorkspaceItemCard;
  alternates: WorkspaceItemCard[];
};

export type ListPage = {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
};

export type AuthAccount = {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
};

export type AuthSessionPayload = {
  has_accounts: boolean;
  auth_required: boolean;
  session: {
    account: AuthAccount;
  } | null;
};

export type AuthStatus = "loading" | "ready" | "unauthenticated";

export type ChannelListPayload = {
  items: Channel[];
};

export type ChannelCreatePayload = {
  channel: Channel;
  discovery: {
    mode: string;
    resolved_feed_url: string;
    candidates: string[];
  };
};

export type SourceCreatePayload = {
  status: "created" | "existing" | "reactivated";
  source: Channel;
  discovery: {
    mode: string;
    resolved_feed_url: string | null;
    candidates: string[];
  };
  initial_sync_run?: SyncRun | null;
};

export type SourceSyncPayload = {
  source: Channel;
  run: SyncRun;
};

export type SourceOpmlSummary = {
  total_feeds: number;
  new_feeds: number;
  existing_feeds: number;
  invalid_feeds: number;
  duplicate_feeds: number;
  folder_count: number;
};

export type SourceOpmlPreviewPayload = {
  summary: SourceOpmlSummary;
  folders: Array<{
    path: string[];
    feed_count: number;
  }>;
  feeds: Array<{
    title: string;
    feed_url: string;
    site_url: string | null;
    folder_path: string[];
    already_subscribed: boolean;
    existing_source_id: string | null;
  }>;
  warnings: string[];
};

export type SourceOpmlImportPayload = {
  summary: SourceOpmlSummary;
  created_sources: Channel[];
  existing_source_ids: string[];
  created_folder_ids: string[];
  warnings: string[];
};

export type ChannelMutationPayload = {
  channel: Channel;
};

export type ChannelPreviewCandidate = {
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

export type ChannelPreviewItem = {
  title: string;
  url: string;
  published_at: string | null;
  image_url: string | null;
};

export type ChannelPreviewPayload = {
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

export type SourceSurfaceMode = "add" | "manage";

export type SyncRunPayload = {
  run: SyncRun;
};

export type SyncRunListPayload = {
  items: SyncRun[];
};

export type ItemListPayload = {
  items: Item[];
  page?: ListPage;
};

export type ItemDetailPayload = {
  item: ItemDetail;
};

export type ItemReextractPayload = ReaderItemReextractPayload<ItemDetail>;

export type DigestPreviewPayload = {
  preview: DigestPreview;
};

export type DigestHistoryListPayload = {
  items: DigestHistory[];
  page?: ListPage;
};

export type DigestHistoryPayload = {
  digest: DigestHistory;
};

export type DeliverySettingsPayload = {
  settings: DeliverySettings;
};

export type AISettingsPayload = {
  settings: AISettings;
};

export type AISettingsPreflightPayload = AISettingsPreflight;

export type DeliverySettingsPreflightPayload = {
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

export type DeliveryPreflightPayload = {
  preflight: DeliveryPreflight;
};

export type DeliveryDispatchPayload = {
  preflight: DeliveryPreflight;
  run: {
    id: string;
    status: "pending" | "running" | "partial_success" | "failed" | "canceled" | "completed";
  };
  log: DeliveryLog;
};

export type DeliveryLogListPayload = {
  items: DeliveryLog[];
  page?: ListPage;
};

export type ItemStatePatch = Partial<Pick<Item, "is_read" | "is_favorite" | "is_archived" | "digest_candidate">> & {
  library_action?: "save" | "unsave" | "archive" | "restore";
};

export type ItemMutationPayload = {
  item: Item;
};

export type WorkspaceProfilePayload = {
  profile: WorkspaceProfile;
};

export type WorkspaceBriefingPayload = {
  briefing: WorkspaceBriefing;
};

export type WorkspaceRankingPayload = {
  generated_at: string;
  items: WorkspaceRankingItem[];
};

export type WorkspaceAnnotationListPayload = {
  items: WorkspaceAnnotation[];
};

export type WorkspaceAnnotationMutationPayload = {
  annotation: WorkspaceAnnotation;
};

export type WorkspaceTagListPayload = {
  items: WorkspaceTag[];
};

export type WorkspaceItemTagPayload = {
  item_id: string;
  tags: WorkspaceTag[];
};

export type WorkspaceCollectionListPayload = {
  items: WorkspaceCollection[];
};

export type WorkspaceCollectionMutationPayload = {
  collection: WorkspaceCollection;
};

export type WorkspaceSavedSearchListPayload = {
  items: WorkspaceSavedSearch[];
};

export type WorkspaceSourceHealthPayload = {
  items: WorkspaceSourceHealthEntry[];
};

export type WorkspaceSourceGroupListPayload = {
  items: WorkspaceSourceGroup[];
};

export type WorkspaceSourceGroupMutationPayload = {
  group: WorkspaceSourceGroup;
};

export type WorkspaceChannelControlPayload = {
  control: WorkspaceSourceHealthEntry["control"];
};

export type WorkspaceStoryClusterPayload = {
  items: WorkspaceStoryCluster[];
};

export type WorkspaceCapturePayload = {
  item: WorkspaceItemCard;
};

export type WorkspaceContinuityItem = WorkspaceItemCard & {
  is_archived: boolean;
};

export type WorkspaceItemTagAssignment = {
  item_id: string;
  tag_id: string;
  tag_name: string;
};

export type WorkspaceCollectionItemAssignment = {
  collection_id: string;
  item_id: string;
};

export type WorkspaceExportPayload = {
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

export type WorkspaceContinuityImportPayload = {
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

export type WorkspaceOpmlImportPayload = {
  imported_count: number;
  duplicate_count: number;
  channels: string[];
};

export type FeedbackState =
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

export type ArticleKindleFeedbackState = FeedbackState & {
  itemId: string;
};

export type ItemSortMode = ReaderItemSortMode;
export type ViewDensity = "comfortable" | "compact";
export type ReaderWidthMode = ReaderDisplayWidthMode;
export type ReaderTextMode = ReaderDisplayTextMode;
export type ReaderImageMode = ReaderDisplayImageMode;
export type RecallWindow = ReaderRecallWindow;
export type FeedFilter = ReaderFeedFilter;
export type ReadSurfaceMode = ReaderReadSurfaceMode;

export type ReaderCommandGroup = {
  title: string;
  items: Array<{
    keys: string;
    label: string;
    note: string;
  }>;
};

export type UndoOperation = {
  item: Item;
  patch: ItemStatePatch;
};

export type UndoEntry = {
  id: string;
  label: string;
  operations: UndoOperation[];
};
