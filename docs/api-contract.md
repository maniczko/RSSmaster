# API contract

This document is the canonical contract between the Next.js frontend and the FastAPI backend for the rssmaster MVP. It defines the API surface before full feature implementation so web and backend work can move independently.

## Conventions

- Base path: `/api/v1`
- Content type: `application/json`
- Timestamps: ISO 8601 UTC strings
- IDs: opaque strings
- Pagination: cursor-based for lists
- Default sort for article lists: `published_at desc`, then `id desc`

## Route manifest

The exact FastAPI route inventory lives in `docs/api-route-manifest.json` and is validated by `python scripts/check_api.py` against the live `app.routes` surface. Any new route must be added there with method, path, surface, and stability before the contract check can pass.

Stability values:

- `stable`: canonical product contract used by the current RSSmaster UI or supported operator workflow.
- `experimental`: backend-supported module surface that may still evolve; document intentionally before relying on it from core UI.
- `compatibility`: backward-compatible alias or older surface kept for existing callers.
- `diagnostic`: runtime health/startup endpoint for local operations.
- `internal`: generated FastAPI/OpenAPI documentation endpoint, not a product API.

Canonical `/api/v1` product surfaces are `auth`, `channels`, `items`, `sync`, `digests`, `delivery`, `settings`, and `workspace`. Current module/experimental surfaces are `annotations`, `library`, `profiles`, `ranking`, and `source-management`.

## Error envelope

All non-2xx responses return the same shape:

```json
{
  "error": {
    "code": "channel_not_found",
    "message": "Channel was not found.",
    "details": {
      "channel_id": "chn_123"
    },
    "retryable": false,
    "request_id": "req_123"
  }
}
```

## Status mapping

- `400` validation failed or request shape is invalid
- `401` authenticated local session is required for `/api/v1/*` once at least one local account exists
- `404` requested resource does not exist
- `409` state conflict or duplicate action
- `422` feed discovery or content validation failed semantically
- `500` unexpected server failure
- `503` dependency or runtime precondition is not available yet, including preview transport failures while fetching an input URL

## Local authentication

- Authentication is local-only and cookie-based.
- Before any local account exists, the runtime remains open for the legacy single-workspace flow.
- After the first local account is created, `/api/v1/*` requires a valid local session except `/api/v1/auth/*`.
- Browser `OPTIONS` preflight requests remain unauthenticated so cookie-backed cross-origin localhost calls can reach the real guarded request.
- Health and startup diagnostics stay unauthenticated.

### `GET /api/v1/auth/session`

Response:

```json
{
  "has_accounts": true,
  "auth_required": true,
  "session": {
    "account": {
      "id": "acct_123",
      "username": "mateusz",
      "display_name": "Mateusz",
      "created_at": "2026-04-24T09:00:00Z",
      "last_login_at": "2026-04-24T09:05:00Z"
    }
  }
}
```

### `POST /api/v1/auth/register`

Request:

```json
{
  "username": "mateusz",
  "display_name": "Mateusz",
  "password": "supersekret123",
  "claim_legacy_workspace": true
}
```

Rules:

- the first account may set `claim_legacy_workspace = true` to copy the pre-auth shared library into its own workspace database
- later accounts should use their own isolated workspace database
- success response uses the same shape as `GET /api/v1/auth/session` and also sets the session cookie

### `POST /api/v1/auth/login`

Request:

```json
{
  "username": "mateusz",
  "password": "supersekret123"
}
```

Success response uses the same shape as `GET /api/v1/auth/session` and also sets the session cookie.

### `POST /api/v1/auth/logout`

- revokes the current local session cookie
- returns the same session envelope with `session: null`

## Shared list envelope

```json
{
  "items": [],
  "page": {
    "next_cursor": null,
    "has_more": false,
    "limit": 50
  }
}
```

## Channels

### Channel shape

```json
{
  "id": "chn_123",
  "title": "Example Feed",
  "site_url": "https://example.com",
  "feed_url": "https://example.com/feed.xml",
  "category": "engineering",
  "state": "active",
  "last_fetch_at": "2026-04-17T18:00:00Z",
  "last_error": null,
  "unread_count": 42,
  "created_at": "2026-04-17T17:00:00Z",
  "updated_at": "2026-04-17T18:00:00Z"
}
```

### `GET /api/v1/channels`

Query params:

- `state`: `active | inactive | archived`
- `category`
- `cursor`
- `limit`

Response: shared list envelope of channel objects.

### `POST /api/v1/channels`

Request:

```json
{
  "input_url": "https://example.com",
  "category": "engineering"
}
```

Rules:

- `input_url` may be a direct feed URL or a homepage URL.
- Backend decides whether direct validation or autodiscovery is needed.
- Ambiguous autodiscovery returns `422` with candidate feeds in `error.details.candidates`.
- Preview-related discovery failures stay `422` and use `error.details.preview_failure_kind = "discovery"`.
- Network or transport failures while fetching the source return `503` with `error.code = "source_unreachable"` and `error.details.preview_failure_kind = "transport"`.

Success response:

```json
{
  "channel": {
    "id": "chn_123",
    "title": "Example Feed",
    "site_url": "https://example.com",
    "feed_url": "https://example.com/feed.xml",
    "category": "engineering",
    "state": "active",
    "last_fetch_at": null,
    "last_error": null,
    "unread_count": 0,
    "created_at": "2026-04-17T17:00:00Z",
    "updated_at": "2026-04-17T17:00:00Z"
  },
  "discovery": {
    "mode": "head_metadata",
    "resolved_feed_url": "https://example.com/feed.xml"
  }
}
```

### `POST /api/v1/channels/preview`

Request:

```json
{
  "input_url": "https://example.com"
}
```

## Source Management

`source-management` is the canonical experimental surface for the premium source onboarding flow. The legacy `/api/v1/channels` routes remain compatible, but new UI work should prefer this surface for create, restore, source-level sync, grouping, and OPML workflows.

### `POST /api/v1/source-management/sources`

Request:

```json
{
  "input_url": "https://example.com",
  "feed_url": "https://example.com/feed.xml",
  "category": "biznes",
  "folder": {
    "name": "Rynki"
  },
  "bundles": [
    {
      "name": "Poranny przegląd"
    }
  ],
  "initial_sync": "none",
  "on_duplicate": "return_existing"
}
```

Rules:

- At least one of `input_url` or `feed_url` is required. Direct `feed_url` is preferred after preview when the user picked a candidate.
- `initial_sync` is `none | enqueue`. If `enqueue` is used for an archived duplicate returned without reactivation, no sync run is created.
- `on_duplicate` is `return_existing | reactivate | error`.
- `return_existing` returns an existing source without mutating its state unless a category was explicitly provided.
- `reactivate` restores inactive or archived duplicates to `active`.

Response:

```json
{
  "status": "created",
  "source": {
    "id": "chn_123",
    "title": "Example Feed",
    "site_url": "https://example.com",
    "feed_url": "https://example.com/feed.xml",
    "state": "active",
    "unread_count": 0,
    "health": {},
    "controls": {},
    "groups": {}
  },
  "discovery": {
    "mode": "head_metadata",
    "resolved_feed_url": "https://example.com/feed.xml",
    "candidates": [
      "https://example.com/feed.xml"
    ]
  },
  "initial_sync_run": null
}
```

### `POST /api/v1/source-management/sources/{channel_id}/sync`

Creates a manual sync run scoped to one source and executes it in the background.

Response:

```json
{
  "source": {
    "id": "chn_123",
    "title": "Example Feed"
  },
  "run": {
    "id": "job_123",
    "job_type": "sync",
    "status": "pending",
    "channels_total": 1
  }
}
```

### `POST /api/v1/source-management/sources/{channel_id}/restore`

Restores an archived source to `active` and returns the source read model. Active or inactive sources are returned without destructive changes.

### `POST /api/v1/source-management/opml/import/preview`

Returns a dry-run summary for OPML import: new feeds, duplicates, invalid entries, folders, and warnings. Use this before committing a migration-style import.

Rules:

- Request shape is intentionally minimal and matches the Website add-flow input.
- `input_url` may be a homepage or a direct feed URL.
- Response is additive preview data only; it does not create or mutate a channel.
- `sample_items` contains up to 3 recent feed entries when the parsed RSS/Atom preview exposes them.
- `estimated_items_per_week` is best-effort and may be `null` when the feed exposes fewer than 2 reliable timestamps.
- Expected preview discovery failures return `422` with `error.details.preview_failure_kind = "discovery"`.
- Transport failures return `503` with `error.code = "source_unreachable"` and `error.details.preview_failure_kind = "transport"`.

Success response:

```json
{
  "status": "ready",
  "input_url": "https://example.com/",
  "discovery": {
    "mode": "head_metadata",
    "resolved_feed_url": "https://example.com/feed.xml",
    "candidates": [
      "https://example.com/feed.xml"
    ]
  },
  "feed": {
    "feed_url": "https://example.com/feed.xml",
    "title": "Example Feed",
    "site_url": "https://example.com",
    "description": "Latest updates from Example.",
    "language": "pl",
    "estimated_items_per_week": 4,
    "sample_items": [
      {
        "title": "Recent entry title",
        "url": "https://example.com/posts/recent-entry",
        "published_at": "2026-04-20T08:00:00Z",
        "image_url": "https://example.com/images/recent-entry.jpg"
      }
    ],
    "already_subscribed": false,
    "existing_channel_id": null
  },
  "candidates": [
    {
      "feed_url": "https://example.com/feed.xml",
      "title": "Example Feed",
      "site_url": "https://example.com",
      "description": "Latest updates from Example.",
      "language": "pl",
      "estimated_items_per_week": 4,
      "sample_items": [
        {
          "title": "Recent entry title",
          "url": "https://example.com/posts/recent-entry",
          "published_at": "2026-04-20T08:00:00Z",
          "image_url": "https://example.com/images/recent-entry.jpg"
        }
      ],
      "already_subscribed": false,
      "existing_channel_id": null
    }
  ],
  "existing_channel": null
}
```

Notes:

- `status` may be `ready`, `already_subscribed`, or `multiple_candidates`.
- `feed` is `null` when discovery returns `multiple_candidates`.
- UI should use `sample_items` for lightweight result previews and `estimated_items_per_week` only as an honest local cadence hint, not as a popularity proxy.

### `PATCH /api/v1/channels/{channel_id}`

Request:

```json
{
  "category": "research",
  "state": "inactive"
}
```

Rules:

- Category and state updates are partial.
- `state` transitions must preserve historical items.
- `archived` means hidden from primary active views, not hard-deleted data loss.

### `DELETE /api/v1/channels/{channel_id}`

Behavior:

- Performs archive/remove behavior, not hard delete.
- Response returns the archived channel state so the UI can reconcile counts.

## Items

### Item shape

```json
{
  "id": "itm_123",
  "channel_id": "chn_123",
  "title": "Article title",
  "author": "Author Name",
  "source_url": "https://example.com/article",
  "excerpt": "Short article summary.",
  "published_at": "2026-04-17T10:00:00Z",
  "is_read": false,
  "is_favorite": false,
  "digest_candidate": true,
  "extraction_status": "completed",
  "has_cleaned_content": true,
  "has_raw_content": true,
  "reader_status": {
    "mode": "cleaned",
    "quality": "ready",
    "label": "Pełny tekst",
    "summary": "Oczyszczony widok jest gotowy do czytania w aplikacji.",
    "primary_action": "read_in_app",
    "diagnostic_reason": null
  },
  "channel": {
    "id": "chn_123",
    "title": "Example Feed",
    "category": "engineering",
    "feed_url": "https://example.com/feed.xml",
    "site_url": "https://example.com",
    "state": "active"
  },
  "digest": {
    "is_candidate": true,
    "status": "ready",
    "reason": "Item is selected and already has cleaned content ready for digest build."
  }
}
```

`reader_status` is additive and is derived from existing item columns, not from a separate table.

- `mode`: `cleaned`, `text_fallback`, `excerpt`, or `source_only`.
- `quality`: `ready`, `degraded`, `blocked`, or `loading`.
- `label`: short UI label such as `Pełny tekst`, `Tekst z feedu`, `Tylko skrót`, or `Źródło`.
- `summary`: user-facing explanation of what can be read locally and why.
- `primary_action`: `read_in_app`, `open_source`, `wait_for_sync`, or `inspect_source`.
- `diagnostic_reason`: present on the model and normally `null` in list responses; detail responses may include a sanitized extraction reason. It must not expose raw stack traces.

### `GET /api/v1/items`

Query params:

- `cursor`
- `limit`
- `sort`
  - allowed values: `newest`, `oldest`
- `channel_id`
  - accepts a single channel id or a comma-separated list
- `category`
  - accepts a single category or a comma-separated list
- `is_read`
- `is_favorite`
- `digest_candidate`
- `search`
- `published_after`
- `published_before`

Response: shared list envelope of item objects.

### `PATCH /api/v1/items/{item_id}/state`

Request:

```json
{
  "is_read": true,
  "is_favorite": true,
  "digest_candidate": false
}
```

Response:

```json
{
  "item": {
    "id": "itm_123",
    "is_read": true,
    "is_favorite": true,
    "digest_candidate": false
  }
}
```

### `POST /api/v1/items/{item_id}/reextract`

Runs a bounded, user-initiated re-extraction for one article. This is the safe runtime alternative to a feed-wide backfill: it never edits other items and defaults to preview-only mode.

Request:

```json
{
  "mode": "dry_run"
}
```

Rules:

- `mode` is `dry_run` or `write`; omitted mode is `dry_run`.
- `dry_run` fetches and classifies the new extraction result without writing to SQLite.
- `write` persists the new extraction result for the selected item only.
- `stop_reasons` are diagnostics/warnings for the attempted result, not raw stack traces.
- The endpoint returns the current `item`; in `dry_run` it is unchanged, in `write` it is reloaded after persistence.

Response:

```json
{
  "item_id": "itm_123",
  "mode": "write",
  "write_applied": true,
  "before": {
    "extraction_status": "failed",
    "reader_status": {
      "mode": "excerpt",
      "quality": "degraded",
      "label": "Tylko skrót",
      "summary": "Pełny tekst nie jest gotowy, ale skrót z feedu można przeczytać w aplikacji.",
      "primary_action": "read_in_app",
      "diagnostic_reason": "Source article returned HTTP 500."
    },
    "has_cleaned_content": false,
    "has_content_text": false,
    "has_excerpt": true,
    "cleaned_html_word_count_approx": 0,
    "content_preview": "Short article summary.",
    "diagnostic_reason": "Source article returned HTTP 500."
  },
  "after": {
    "extraction_status": "completed",
    "reader_status": {
      "mode": "cleaned",
      "quality": "ready",
      "label": "Pełny tekst",
      "summary": "Oczyszczony widok jest gotowy do czytania w aplikacji.",
      "primary_action": "read_in_app",
      "diagnostic_reason": null
    },
    "has_cleaned_content": true,
    "has_content_text": true,
    "has_excerpt": true,
    "cleaned_html_word_count_approx": 420,
    "content_preview": "Clean article preview.",
    "diagnostic_reason": null
  },
  "stop_reasons": [],
  "item": {
    "id": "itm_123"
  }
}
```

## Sync

### `GET /api/v1/sync/runs`

Returns recent sync runs ordered by newest first.

Each run includes:

- `status`
- `channels_total`
- `channels_succeeded`
- `channels_failed`
- `items_seen`
- `items_created`
- `items_skipped`
- `error_message`
- `errors`

### `POST /api/v1/sync/runs`

Request:

```json
{
  "channel_ids": ["chn_123", "chn_456"],
  "mode": "manual",
  "trigger_kind": "manual"
}
```

Rules:

- `mode` currently supports `manual` and `scheduled`.
- `trigger_kind` is optional; if omitted, the backend resolves `manual -> manual` and `scheduled -> scheduled`.
- Scheduled runs default to active channels.
- Manual runs with explicit `channel_ids` may target inactive channels for recovery or operator-driven reruns.

Response:

```json
{
  "run": {
    "id": "run_123",
    "status": "pending",
    "job_type": "sync",
    "trigger_kind": "manual",
    "scope": {
      "channel_ids": ["chn_123", "chn_456"]
    },
    "channels_total": 2,
    "channels_succeeded": 0,
    "channels_failed": 0,
    "items_seen": 0,
    "items_created": 0,
    "items_skipped": 0,
    "errors": [],
    "created_at": "2026-04-17T17:00:00Z"
  }
}
```

Implementation note:

- the current local runtime returns `202 Accepted` and performs the sync work in a background task after the run row is persisted
- when local accounts are enabled, the background task uses the workspace database path captured at run creation time; it must not fall back to the legacy shared database after request middleware exits
- repeated polls should converge on `completed`, `partial_success`, or `failed`

### `GET /api/v1/sync/runs/{run_id}`

Response includes:

- `status`: `pending | running | partial_success | failed | canceled | completed`
- `started_at`
- `completed_at`
- `channels_total`
- `channels_succeeded`
- `channels_failed`
- `items_seen`
- `items_created`
- `items_skipped`
- `errors`

## Digests

### `POST /api/v1/digests/preview`

Request:

```json
{
  "digest_candidates_only": true,
  "include_read": true,
  "favorites_only": false,
  "limit": 25,
  "title": "rssmaster digest 2026-04-28"
}
```

When `item_ids` is omitted, the backend selects persisted `items.digest_candidate = true` rows. This is the canonical UI path for `/digest`: reader route, search, sort, and visible queue state must not change the digest candidate set. The selection is still capped by the configured digest item limit.

Explicit `item_ids` remain supported for tests and future bulk-selection flows. Explicit mode ignores digest-candidate filtering and returns `selection_mode = "explicit"`.

Response includes:

- `title`
- `selection_mode`
- `stats.article_count`
- `stats.word_count`
- `stats.estimated_read_minutes`
- `selection_snapshot`
- `category_summary`

### `POST /api/v1/digests/build`

Request:

```json
{
  "digest_candidates_only": true,
  "include_read": true,
  "favorites_only": false,
  "limit": 25,
  "title": "rssmaster digest 2026-04-28"
}
```

Build uses the same persisted-candidate semantics as preview when `item_ids` is omitted. The persisted `selection_snapshot` in history is the auditable source of truth for which articles were packaged.

Response returns the persisted digest history row:

```json
{
  "digest": {
    "id": "dgt_123",
    "status": "completed",
    "title": "Daily Digest",
    "article_count": 2,
    "artifact": {
      "path": "C:/.../data/accounts/mateusz-abc123/digests/dgt_123.epub",
      "sha256": "abc123"
    }
  }
}
```

For local accounts, digest artifacts are stored under a directory derived from the owning workspace database. The legacy pre-auth workspace keeps the older `data/digests/` artifact root for compatibility.

### `GET /api/v1/digests/history`

Returns historical digest runs ordered by most recent first.

### `GET /api/v1/digests/{digest_id}`

Returns one persisted digest history entry and its artifact metadata.

## Delivery

### `POST /api/v1/delivery/preflight`

Request:

```json
{
  "digest_id": "dgt_123",
  "target_kind": "kindle"
}
```

Response includes:

- `status`
- `can_send`
- `artifact`
- `checks`

### `POST /api/v1/delivery/send`

Request:

```json
{
  "digest_id": "dgt_123",
  "target_kind": "kindle",
  "mode": "dry_run"
}
```

Response includes:

- `run`
- `log`
- `preflight`

The article-level `Wyślij na Kindle` reader action does not introduce a separate public endpoint. It builds a single-item digest through `POST /api/v1/digests/build` with explicit `item_ids`, then dispatches that generated EPUB through this delivery endpoint with `target_kind: "kindle"` and `mode: "send"`.

### `GET /api/v1/delivery/logs`

Returns persisted delivery log rows, optionally filtered by `digest_id`.

## Workspace

### `GET /api/v1/workspace/ranking`

Query params:

- `limit`: number of rows to return.
- `mode`: `for_you | latest | all | hidden`; default is `for_you`.
- `min_score`: optional quality floor; `for_you` defaults to the backend quality threshold when omitted.
- `include_hidden`: include rows whose ranking explanation marks them as hidden.
- `explain`: when false, clears matched signal lists from the response.

Rules:

- `for_you` is the default reader recommendation queue and must only return visible high-signal rows.
- Low-signal repetitive headlines, for example FX/rate templates, are hidden unless explicitly boosted by a topic signal.
- `all` and `latest` are escape hatches for auditing the library; they do not redefine the `for_you` quality promise.
- Each row exposes `visibility`, `visibility_reason`, `quality_flags`, matched positive/negative signals, and the existing score breakdown.

### `POST /api/v1/workspace/feedback`

Request:

```json
{
  "item_id": "itm_123",
  "action": "less_like_this",
  "topic": "energia",
  "source_id": "chn_123",
  "reason": "reader_action"
}
```

Rules:

- `action` is one of `more_like_this`, `less_like_this`, `hide_topic`, `mute_source`, or `important`.
- `topic` is optional; if omitted, the backend derives a stable topic from the item, with FX/rate templates grouped as `kurs walut`.
- `mute_source` also updates the source control tier to `muted`.
- Feedback affects ranking only; it does not mark articles read, archive them, or delete them.

### `GET /api/v1/workspace/source-health`

Returns source operational health plus a separate reading-readiness axis. `health_status` remains the sync/source-health axis; `reading_readiness` must not be used to reinterpret it.

Response:

```json
{
  "items": [
    {
      "channel_id": "chn_123",
      "title": "Example Feed",
      "feed_url": "https://example.com/feed.xml",
      "category": "engineering",
      "state": "active",
      "unread_count": 3,
      "health_status": "healthy",
      "health_summary": "Last successful sync 2026-04-28T08:00:00Z.",
      "health_indicators": [],
      "health_stale": false,
      "health_noisy": false,
      "last_fetch_at": "2026-04-28T08:00:00Z",
      "last_successful_fetch_at": "2026-04-28T08:00:00Z",
      "last_error_at": null,
      "last_error_code": null,
      "last_error_message": null,
      "consecutive_failures": 0,
      "items_last_24h": 1,
      "items_last_7d": 4,
      "total_items": 20,
      "latest_item_at": "2026-04-28T08:00:00Z",
      "readable_items_7d": 4,
      "local_readable_items_7d": 4,
      "excerpt_fallback_items_7d": 0,
      "source_only_items_7d": 0,
      "extraction_failed_items_7d": 0,
      "reading_readiness": "ready",
      "reading_summary": "4 artykuły z lokalnym tekstem z ostatnich 7 dni.",
      "group_name": null,
      "control": {
        "channel_id": "chn_123",
        "group_id": null,
        "tier": "default",
        "custom_source_cap": null,
        "paused_until": null,
        "snoozed_until": null,
        "notes": null,
        "group_name": null
      }
    }
  ]
}
```

Rules:

- `reading_readiness` is one of `ready`, `degraded`, `blocked`, or `unknown`.
- `readable_items_7d` is kept for compatibility and counts recent items that can open some local reading surface: cleaned HTML, content text, or feed excerpt.
- `local_readable_items_7d` counts recent items with local article text: cleaned HTML or `content_text`.
- `excerpt_fallback_items_7d` counts recent items where the only local reading surface is `excerpt`.
- `source_only_items_7d` counts recent items without cleaned HTML, content text, or excerpt; these require opening the source URL.
- `extraction_failed_items_7d` counts recent items whose extraction ended as `failed`.
- `reading_readiness = ready` requires at least one `local_readable_items_7d` item and no excerpt-only, source-only, or failed-extraction items in the same 7-day window.
- Excerpt-only feeds are `degraded`, not `ready`, even when `readable_items_7d` is greater than zero.
- These fields are projections from `items` and `channels`; no migration is required.

### `POST /api/v1/workspace/capture`

Request:

```json
{
  "url": "https://example.com/article",
  "title": "Optional override title",
  "note": "Optional operator note"
}
```

Rules:

- `url` is required.
- Only `http` and `https` URLs are accepted.
- The backend fetches the source URL, derives readable content, and stores the item in the captured/saved library flow.
- Duplicate captures reconcile on normalized source URL instead of creating endless copies.
- If `note` is present, RSSmaster persists it as an item-level note annotation so the reason for saving the article survives the jump into the reader.

Response:

```json
{
  "item": {
    "id": "itm_123",
    "title": "Article title",
    "source_url": "https://example.com/article",
    "is_favorite": true,
    "digest_candidate": true
  }
}
```

### `GET /api/v1/workspace/export`

Returns the portable workspace export used as the base for a continuity bundle.

Response shape:

```json
{
  "exported_at": "2026-04-22T12:00:00Z",
  "profile": {},
  "sources_opml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><opml version=\"2.0\"></opml>",
  "annotations": [],
  "tags": [],
  "collections": [],
  "saved_searches": [],
  "saved_items": [],
  "continuity_items": [
    {
      "id": "itm_123",
      "source_url": "https://example.com/article",
      "is_read": false,
      "is_favorite": true,
      "digest_candidate": true,
      "is_archived": false
    }
  ],
  "item_tags": [],
  "collection_items": []
}
```

Rules:

- The export is backend-only state. The browser continuity bundle augments it with local reader continuity and progress before download.
- `continuity_items` is the portable library-state slice used for cross-device restore.
- `annotations`, `tags`, `collections`, `saved_searches`, `item_tags`, and `collection_items` are exported as the manual portability layer for reader knowledge capture.

### `POST /api/v1/workspace/continuity/import`

Restores the portable continuity slice against the current local runtime.

Request:

```json
{
  "sources_opml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><opml version=\"2.0\"></opml>",
  "continuity_items": [
    {
      "item_id": "itm_remote_123",
      "source_url": "https://example.com/article",
      "is_read": false,
      "is_favorite": true,
      "digest_candidate": true,
      "is_archived": false
    }
  ],
  "annotations": [],
  "tags": [],
  "collections": [],
  "saved_searches": [],
  "item_tags": [],
  "collection_items": []
}
```

Rules:

- `sources_opml` is optional. When present, RSSmaster imports missing feeds before matching library state.
- Matching happens by `normalized_source_url`, not by opaque item id. Optional exported `item_id` values are used only to map annotation/tag/collection payloads back onto the matched source URL.
- The current continuity import restores feed presence plus library-state booleans: `is_read`, `is_favorite`, `digest_candidate`, and `is_archived`.
- When the bundle includes exported reader knowledge, the same import also replays:
  - notes and highlights onto the primary matched local item for a given `normalized_source_url`
  - tag assignments onto the primary matched local item
  - collection definitions and collection memberships for matched items
  - saved searches
- Replay is additive and idempotent for repeated imports of the same bundle; it does not yet define cross-device conflict resolution.
- Reader route, local view preferences, and scroll progress are restored in the browser from the downloaded continuity bundle after this endpoint returns its match map.

Response:

```json
{
  "imported_source_count": 1,
  "duplicate_source_count": 0,
  "matched_item_count": 1,
  "unmatched_item_count": 0,
  "restored_read_count": 0,
  "restored_saved_count": 1,
  "restored_digest_count": 1,
  "restored_archive_count": 0,
  "restored_annotation_count": 2,
  "restored_tag_assignment_count": 1,
  "restored_collection_count": 1,
  "restored_collection_item_count": 1,
  "restored_saved_search_count": 1,
  "matched_items": [
    {
      "source_url": "https://example.com/article",
      "item_id": "itm_local_123",
      "title": "Article title",
      "matched_by": "normalized_source_url"
    }
  ],
  "unmatched_source_urls": []
}
```

## Settings

### `GET /api/v1/settings/ai`

Returns safe AI configuration with the OpenAI key redacted. V1 only stores readiness for future AI features; it does not run prompts or embeddings in the reader.

```json
{
  "settings": {
    "enabled": true,
    "provider": "openai",
    "chat_model": "gpt-5.2",
    "embedding_model": "text-embedding-3-small",
    "openai_api_key": {
      "configured": true,
      "redacted_value": "********"
    },
    "ready": true,
    "updated_at": "2026-05-05T12:00:00Z",
    "updated_by": "user",
    "issues": []
  }
}
```

### `PATCH /api/v1/settings/ai`

Request:

```json
{
  "enabled": true,
  "provider": "openai",
  "chat_model": "gpt-5.2",
  "embedding_model": "text-embedding-3-small",
  "openai_api_key": "sk-..."
}
```

Rules:

- `provider` is currently fixed to `openai`.
- `openai_api_key` is write-only; responses must only return `{ "configured": true, "redacted_value": "********" }`.
- Omitting `openai_api_key` keeps the current secret. Sending `null` clears the locally stored key and falls back to `RSSMASTER_OPENAI_API_KEY` when present.
- `.env` values are the fallback; the local `settings.key = "ai_profile"` row wins when a field is stored there.

### `POST /api/v1/settings/ai/preflight`

Runs a low-cost OpenAI Models API check for the configured chat and embedding model IDs. It must not generate text, create embeddings, or expose the raw key in error messages.

Response:

```json
{
  "status": "ready",
  "can_use_ai": true,
  "checks": [
    {
      "name": "chat_model_access",
      "status": "passed",
      "message": "OpenAI potwierdziło dostęp do modelu gpt-5.2."
    }
  ]
}
```

### `GET /api/v1/settings/delivery`

Returns safe, user-facing delivery settings with redacted secret state:

```json
{
  "settings": {
    "smtp_host": "smtp.example.com",
    "smtp_port": 587,
    "smtp_username": "reader@example.com",
    "smtp_password": {
      "configured": true,
      "redacted_value": "********"
    },
    "smtp_from": "reader@example.com",
    "kindle_email": "name@kindle.com",
    "smtp_ready": true
  }
}
```

### `PATCH /api/v1/settings/delivery`

Request:

```json
{
  "smtp_host": "smtp.example.com",
  "smtp_port": 587,
  "smtp_username": "reader@example.com",
  "smtp_password": "secret",
  "smtp_from": "reader@example.com",
  "kindle_email": "name@kindle.com"
}
```

Rules:

- Secret values should be write-only in the UI.
- API may return redacted settings after save.

### `POST /api/v1/settings/delivery/preflight`

Runs local configuration validation and optional SMTP connection probe before dispatch.

## Optimistic UI rules

- `PATCH /items/{id}/state` may update the UI optimistically for `is_read` and `is_favorite`.
- If a read or favorite mutation fails, the UI must revert the optimistic state and surface the backend error message.
- Channel creation, channel archival, sync, digest generation, and delivery must wait for confirmed backend responses before changing durable UI state.
- Background jobs should show `pending` immediately after accepted creation, then poll for confirmed state transitions.

## Pagination and filtering rules

- Default `limit` is `50`, max `200`.
- `next_cursor` is opaque and must be passed back unchanged.
- Filters are additive, not mutually exclusive.
- Search applies to title, author, excerpt, cleaned body text, feed title, and normalized source metadata.
- `sort` defaults to `newest`.
- `published_after` and `published_before` must be valid ISO 8601 timestamps.
- Empty list responses still return the shared list envelope with `items: []`.

## Current implementation note

Today the runtime already exposes health and startup diagnostics outside this contract:

- `GET /health`
- `GET /diagnostics/startup`
- `GET /api/health`
- `GET /api/diagnostics/startup`

These are operational endpoints for local runtime verification, not part of the future product API surface.

Implementation snapshot as of 2026-04-17:

- implemented now: channel CRUD-lite, direct feed validation, homepage autodiscovery, sync runs, inline extraction during sync, item list filters, digest preview/build/history, delivery settings, and delivery dry-run/send endpoints
- schema and runtime now persist: settings, digest history, delivery logs, and delivery job runs
- remaining release caveat: automated verification covers dry-run delivery; real SMTP send still depends on operator-provided credentials and reachable mail infrastructure
