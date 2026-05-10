# Storage schema

rssmaster now uses a local account control database plus one SQLite workspace per local account. The goal stays the same: every critical workflow state should be reconstructable from durable SQLite state instead of ad hoc browser files.

## Database layout

- `data/rssmaster.db`
  - the legacy pre-auth shared workspace
  - the first local account may claim this database by cloning it into its own account workspace
- `data/rssmaster_accounts.db`
  - local account identities, password hashes, and revocable sessions
- `data/accounts/*.db`
  - per-account workspaces for channels, items, settings, digests, delivery logs, notes, tags, and collections
  - generated digest artifacts are written next to the owning account workspace under `data/accounts/<workspace-stem>/digests/`
  - background sync/extract jobs must use the captured account workspace path rather than the legacy default database

## Tables

### `accounts`

Stores local operator identities in `data/rssmaster_accounts.db` by default.

- Needed for: local auth, first-account workspace claim, account-scoped workspace routing
- Important fields: `normalized_username`, `password_hash`, `workspace_database_path`, `last_login_at`
- Key guarantee: passwords are stored as derived hashes, and each account points at exactly one local workspace database

### `sessions`

Stores revocable login sessions in the local account control database.

- Needed for: cookie-backed local sessions and logout
- Important fields: `account_id`, `token_hash`, `expires_at`, `revoked_at`
- Key guarantee: raw session tokens stay in the browser cookie only; SQLite stores token hashes and revocation state

### `channels`

Stores subscribed sources and operational feed metadata.

- Needed for: channel add, channel management, sync targeting
- Important fields: `normalized_feed_url`, `state`, `last_fetch_at`, `last_error_message`
- Key guarantee: a feed can be disabled or archived without losing historical articles

### `items`

Stores incoming articles, reading state, extraction artifacts, and digest eligibility.

- Needed for: article list views, read/favorite state, extraction, digest selection
- Important fields: `dedupe_key`, `guid`, `normalized_source_url`, `raw_html`, `cleaned_html`, `content_text`, `excerpt`, `extraction_status`, `extraction_error`
- Key guarantee: repeated syncs can deduplicate safely while preserving readable content

`reader_status` in the API is not persisted as a column. It is a projection from the fields above:

- completed `cleaned_html` becomes the full local reading mode
- `content_text` becomes a text fallback
- `excerpt` becomes a degraded summary fallback
- missing local content becomes source-only or loading depending on `extraction_status`
- detail responses may expose a sanitized `extraction_error` as `diagnostic_reason`
- item-level `POST /api/v1/items/{item_id}/reextract` rewrites only the existing extraction artifact columns for that one item when called with `mode: write`; `mode: dry_run` performs no storage mutation

### `ranking_state`

Stores the latest explainable recommendation snapshot for the reader.

- Needed for: `Dla mnie`, Discover recommendations, briefing, story grouping, and hidden-row explanations
- Important fields: `candidate_status`, `candidate_reason`, `final_score`, `score_breakdown_json`
- Key guarantee: low-signal and feedback-suppressed items stay inspectable without appearing in the default reading queue

### `reader_feedback`

Stores explicit reader actions used to tune the ranking model.

- Needed for: `Mniej takich`, `Wiecej takich`, `Ukryj temat`, `Wycisz zrodlo`, and `To jest wazne`
- Important fields: `item_id`, `source_id`, `action`, `topic`, `reason`
- Key guarantee: feedback changes ranking visibility only; it does not mutate read/archive/library state

### `settings`

Stores mutable runtime configuration that belongs in app state rather than static files.

- Needed for: user-facing preferences, safe runtime configuration snapshots
- Important fields: `key`, `value_json`
- Known keys: `delivery_profile`, `ai_profile`
- `ai_profile` stores OpenAI readiness fields (`enabled`, `provider`, `chat_model`, `embedding_model`) and may store a local `openai_api_key`; API responses must redact that secret and `.env` remains the fallback source.
- Key guarantee: settings stay extensible without premature table sprawl

### `job_runs`

Stores lifecycle and observability data for sync, extract, digest, and delivery jobs.

- Needed for: run history, retries, failure analysis, progress UI
- Important fields: `job_type`, `status`, `scope_json`, `error_message`, `retry_count`
- Key guarantee: every major background workflow is reconstructable from persisted state
- Account boundary: background jobs persist `job_runs` only in the workspace captured when the run was created

### `digest_history`

Stores digest build history and the snapshot of selected content.

- Needed for: digest audit trail, resend flows, EPUB artifact lookup
- Important fields: `selection_snapshot_json`, `article_count`, `artifact_path`, `artifact_sha256`
- Key guarantee: a generated digest can be traced back to the exact article selection used
- Account boundary: `artifact_path` points at the owning workspace's `digests/` folder, not the legacy shared `data/digests/` folder

### `delivery_logs`

Stores send attempts and outcomes for Kindle or other delivery targets.

- Needed for: send history, delivery troubleshooting, resend decision-making
- Important fields: `digest_id`, `target_kind`, `status`, `provider_message_id`, `error_message`
- Key guarantee: delivery outcomes are visible even when a send fails after digest generation

## Constraints and indexing strategy

- Channels are unique by `normalized_feed_url`
- Items are unique by `dedupe_key`
- Items also enforce `channel_id + guid` uniqueness when a GUID exists
- Query-heavy fields are indexed: `published_at`, `is_read`, `is_favorite`, `channel_id`, digest and delivery status
- Foreign keys are enabled so channel, digest, and job relationships stay coherent

## Migration strategy

- The migration registry lives in `apps/api/app/db/initializer.py`.
- Schema version is tracked in both `schema_migrations` and SQLite `PRAGMA user_version`.
- Version 1 is the baseline migration and replays `apps/api/app/db/schema.sql` idempotently with `CREATE TABLE IF NOT EXISTS`.
- `ensure_database()` creates the migration table first, applies pending migrations, records applied versions, sets `user_version`, validates required tables, and returns `migration_status` for startup diagnostics.
- `scripts/init_db.py` is the entry point for initializing the local database.
- Later schema changes should add a new versioned migration instead of rewriting the V1 baseline in place.
- If startup reports missing required tables or `migration_status.status` is not `ready`, back up the affected `data/*.db` or account workspace DB before retrying initialization; then inspect `schema_migrations`, `PRAGMA user_version`, and `/diagnostics/startup` to decide whether to rerun initialization or restore from backup.

## Auth smoke isolation

- `npm run check:auth` creates temporary auth databases only under `output/playwright/auth-smoke/`.
- The smoke overrides `RSSMASTER_DATABASE_PATH`, `RSSMASTER_ACCOUNTS_DATABASE_PATH`, and `RSSMASTER_ACCOUNTS_WORKSPACE_DIR`.
- The smoke must not read from or write to real operator data under `data/`.

## Feed reading smoke isolation

- `npm run check:feed-reading` creates temporary workspace and account paths only under `output/playwright/feed-reading/`.
- The smoke adds fixture feeds, syncs them, checks `reader_status` and source reading readiness, and verifies the browser empty-state/action copy.
- The source-health reading fields are projections from existing `items` rows and channel health metadata; there is no new table or migration for V1.
- `readable_items_7d` intentionally remains broad for compatibility: it includes local text and excerpt fallback.
- `local_readable_items_7d`, `excerpt_fallback_items_7d`, and `source_only_items_7d` split that broad count into full local reading, summary-only fallback, and source-required buckets.
- `reading_readiness` uses the split fields: excerpt-only feeds are `degraded`, not `ready`.
