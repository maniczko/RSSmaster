import type { SourceHealthCardModel } from "./editorial-support";

export type WorkspaceSourceHealthEntry = {
  channel_id: string;
  title: string;
  feed_url: string;
  category: string | null;
  state: string;
  unread_count: number;
  health_status: "healthy" | "warning" | "error" | "unknown";
  health_summary: string;
  health_indicators?: string[];
  health_stale?: boolean;
  health_noisy?: boolean;
  last_fetch_at?: string | null;
  last_successful_fetch_at?: string | null;
  last_error_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  consecutive_failures?: number;
  items_last_24h?: number;
  items_last_7d?: number;
  total_items?: number;
  latest_item_at?: string | null;
  readable_items_7d?: number;
  local_readable_items_7d?: number;
  excerpt_fallback_items_7d?: number;
  source_only_items_7d?: number;
  extraction_failed_items_7d?: number;
  reading_readiness?: "ready" | "degraded" | "blocked" | "unknown";
  reading_summary?: string;
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

export function mapSourceHealthCard(entry: WorkspaceSourceHealthEntry): SourceHealthCardModel {
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
      indicators: [
        ...(entry.health_indicators ?? []),
        entry.control.tier,
        entry.group_name ?? "bez grupy",
      ].filter(Boolean),
      stale: entry.health_stale,
      noisy: entry.health_noisy,
      lastFetchAt: entry.last_fetch_at,
      lastSuccessfulFetchAt: entry.last_successful_fetch_at,
      lastErrorAt: entry.last_error_at,
      lastErrorCode: entry.last_error_code,
      lastErrorMessage: entry.last_error_message,
      consecutiveFailures: entry.consecutive_failures,
      itemsLast24h: entry.items_last_24h,
      itemsLast7d: entry.items_last_7d,
      totalItems: entry.total_items,
      latestItemAt: entry.latest_item_at,
      readableItems7d: entry.readable_items_7d,
      localReadableItems7d: entry.local_readable_items_7d,
      excerptFallbackItems7d: entry.excerpt_fallback_items_7d,
      sourceOnlyItems7d: entry.source_only_items_7d,
      extractionFailedItems7d: entry.extraction_failed_items_7d,
      readingReadiness: entry.reading_readiness ?? "unknown",
      readingSummary: entry.reading_summary,
    },
  };
}
