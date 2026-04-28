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
- Important fields: `dedupe_key`, `guid`, `normalized_source_url`, `raw_html`, `cleaned_html`
- Key guarantee: repeated syncs can deduplicate safely while preserving readable content

### `settings`

Stores mutable runtime configuration that belongs in app state rather than static files.

- Needed for: user-facing preferences, safe runtime configuration snapshots
- Important fields: `key`, `value_json`
- Key guarantee: settings stay extensible without premature table sprawl

### `job_runs`

Stores lifecycle and observability data for sync, extract, digest, and delivery jobs.

- Needed for: run history, retries, failure analysis, progress UI
- Important fields: `job_type`, `status`, `scope_json`, `error_message`, `retry_count`
- Key guarantee: every major background workflow is reconstructable from persisted state

### `digest_history`

Stores digest build history and the snapshot of selected content.

- Needed for: digest audit trail, resend flows, EPUB artifact lookup
- Important fields: `selection_snapshot_json`, `article_count`, `artifact_path`, `artifact_sha256`
- Key guarantee: a generated digest can be traced back to the exact article selection used

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

- Schema version is tracked in both `schema_migrations` and SQLite `user_version`
- `scripts/init_db.py` is the entry point for initializing the local database
- Later migrations should be additive and versioned rather than replacing this file in place

## Auth smoke isolation

- `npm run check:auth` creates temporary auth databases only under `output/playwright/auth-smoke/`.
- The smoke overrides `RSSMASTER_DATABASE_PATH`, `RSSMASTER_ACCOUNTS_DATABASE_PATH`, and `RSSMASTER_ACCOUNTS_WORKSPACE_DIR`.
- The smoke must not read from or write to real operator data under `data/`.
