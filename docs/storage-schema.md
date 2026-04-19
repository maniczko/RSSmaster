# Storage schema

rssmaster uses a single local SQLite schema for the MVP runtime. The goal of schema v1 is to keep every critical workflow state in the database so ingest, reading, digest generation, and delivery can be reconstructed without relying on ad hoc files.

## Tables

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

