CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    site_url TEXT,
    feed_url TEXT NOT NULL,
    normalized_feed_url TEXT NOT NULL,
    description TEXT,
    language TEXT,
    category TEXT,
    state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'inactive', 'archived')),
    etag TEXT,
    last_modified TEXT,
    last_fetch_at TEXT,
    last_successful_fetch_at TEXT,
    last_error_code TEXT,
    last_error_message TEXT,
    last_error_at TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_normalized_feed_url_unique
    ON channels (normalized_feed_url);

CREATE INDEX IF NOT EXISTS idx_channels_state
    ON channels (state);

CREATE INDEX IF NOT EXISTS idx_channels_category
    ON channels (category);

CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
    guid TEXT,
    source_url TEXT NOT NULL,
    normalized_source_url TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    excerpt TEXT,
    raw_html TEXT,
    cleaned_html TEXT,
    content_text TEXT,
    published_at TEXT,
    discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    raw_fetched_at TEXT,
    cleaned_at TEXT,
    extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        extraction_status IN ('pending', 'running', 'completed', 'failed', 'skipped')
    ),
    extraction_error TEXT,
    is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    read_at TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    favorited_at TEXT,
    archived_at TEXT,
    digest_candidate INTEGER NOT NULL DEFAULT 1 CHECK (digest_candidate IN (0, 1)),
    dedupe_key TEXT NOT NULL,
    content_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_dedupe_key_unique
    ON items (dedupe_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_channel_guid_unique
    ON items (channel_id, guid)
    WHERE guid IS NOT NULL AND guid != '';

CREATE INDEX IF NOT EXISTS idx_items_channel_id
    ON items (channel_id);

CREATE INDEX IF NOT EXISTS idx_items_published_at
    ON items (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_items_is_read
    ON items (is_read);

CREATE INDEX IF NOT EXISTS idx_items_is_favorite
    ON items (is_favorite);

CREATE INDEX IF NOT EXISTS idx_items_digest_candidate
    ON items (digest_candidate);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    description TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_runs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL CHECK (job_type IN ('sync', 'extract', 'digest', 'delivery')),
    trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('manual', 'scheduled', 'system')),
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'partial_success', 'failed', 'canceled', 'completed')
    ),
    parent_run_id TEXT REFERENCES job_runs(id) ON DELETE SET NULL,
    scope_json TEXT NOT NULL DEFAULT '{}',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER,
    total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
    success_count INTEGER NOT NULL DEFAULT 0 CHECK (success_count >= 0),
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    error_code TEXT,
    error_message TEXT,
    error_details_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_runs_type_status
    ON job_runs (job_type, status);

CREATE INDEX IF NOT EXISTS idx_job_runs_created_at
    ON job_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS digest_history (
    id TEXT PRIMARY KEY,
    job_run_id TEXT REFERENCES job_runs(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'building', 'completed', 'failed', 'sent', 'archived')),
    title TEXT NOT NULL,
    period_start TEXT,
    period_end TEXT,
    article_count INTEGER NOT NULL DEFAULT 0 CHECK (article_count >= 0),
    selection_snapshot_json TEXT NOT NULL DEFAULT '[]',
    category_summary_json TEXT NOT NULL DEFAULT '[]',
    artifact_path TEXT,
    artifact_sha256 TEXT,
    generated_at TEXT,
    sent_at TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_digest_history_status
    ON digest_history (status);

CREATE INDEX IF NOT EXISTS idx_digest_history_created_at
    ON digest_history (created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_logs (
    id TEXT PRIMARY KEY,
    job_run_id TEXT REFERENCES job_runs(id) ON DELETE SET NULL,
    digest_id TEXT REFERENCES digest_history(id) ON DELETE SET NULL,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('kindle', 'smtp', 'download')),
    recipient TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    provider_message_id TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    sent_at TEXT,
    error_code TEXT,
    error_message TEXT,
    error_details_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_digest_id
    ON delivery_logs (digest_id);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_status
    ON delivery_logs (status);

CREATE TABLE IF NOT EXISTS reader_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    candidate_window_hours INTEGER NOT NULL DEFAULT 72 CHECK (candidate_window_hours > 0),
    default_source_cap INTEGER NOT NULL DEFAULT 30 CHECK (default_source_cap > 0),
    priority_source_cap INTEGER NOT NULL DEFAULT 45 CHECK (priority_source_cap > 0),
    emergency_source_cap INTEGER NOT NULL DEFAULT 100 CHECK (emergency_source_cap > 0),
    daily_reading_goal INTEGER NOT NULL DEFAULT 12 CHECK (daily_reading_goal > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profile_interests (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES reader_profiles(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    normalized_topic TEXT,
    kind TEXT NOT NULL DEFAULT 'topic' CHECK (kind IN ('topic', 'source')),
    weight INTEGER NOT NULL DEFAULT 1 CHECK (weight IN (-1, 0, 1, 2)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_interests_unique
    ON profile_interests (profile_id, kind, label);

CREATE TABLE IF NOT EXISTS source_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_groups_name_unique
    ON source_groups (name);

CREATE TABLE IF NOT EXISTS channel_controls (
    channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES source_groups(id) ON DELETE SET NULL,
    tier TEXT NOT NULL DEFAULT 'default' CHECK (tier IN ('priority', 'default', 'muted')),
    custom_source_cap INTEGER CHECK (custom_source_cap IS NULL OR custom_source_cap > 0),
    paused_until TEXT,
    snoozed_until TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_channel_controls_group_id
    ON channel_controls (group_id);

CREATE TABLE IF NOT EXISTS story_clusters (
    id TEXT PRIMARY KEY,
    cluster_key TEXT NOT NULL,
    headline TEXT NOT NULL,
    primary_item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
    item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    category TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_clusters_cluster_key_unique
    ON story_clusters (cluster_key);

CREATE TABLE IF NOT EXISTS story_cluster_items (
    cluster_id TEXT NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    rank_index INTEGER NOT NULL DEFAULT 0 CHECK (rank_index >= 0),
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (cluster_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_story_cluster_items_item_id
    ON story_cluster_items (item_id);

CREATE TABLE IF NOT EXISTS ranking_state (
    item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    candidate_status TEXT NOT NULL CHECK (candidate_status IN ('eligible', 'excluded', 'suppressed')),
    candidate_reason TEXT,
    source_window_hours INTEGER NOT NULL DEFAULT 72 CHECK (source_window_hours > 0),
    source_cap INTEGER NOT NULL DEFAULT 30 CHECK (source_cap > 0),
    final_score REAL NOT NULL DEFAULT 0,
    score_breakdown_json TEXT NOT NULL DEFAULT '{}',
    ranked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ranking_state_status_score
    ON ranking_state (candidate_status, final_score DESC, ranked_at DESC);

CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('highlight', 'note')),
    quote_text TEXT,
    note_text TEXT,
    color TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_annotations_item_id
    ON annotations (item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_unique
    ON tags (name);

CREATE TABLE IF NOT EXISTS item_tags (
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id
    ON item_tags (tag_id);

CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_name_unique
    ON collections (name);

CREATE TABLE IF NOT EXISTS collection_items (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_item_id
    ON collection_items (item_id);

CREATE TABLE IF NOT EXISTS saved_searches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    query TEXT NOT NULL,
    default_view TEXT NOT NULL DEFAULT 'inbox' CHECK (default_view IN ('inbox', 'saved', 'digest', 'archive')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_searches_name_unique
    ON saved_searches (name);

CREATE TRIGGER IF NOT EXISTS trg_channels_updated_at
AFTER UPDATE ON channels
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE channels
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_items_updated_at
AFTER UPDATE ON items
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE items
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_settings_updated_at
AFTER UPDATE ON settings
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE settings
    SET updated_at = CURRENT_TIMESTAMP
    WHERE key = NEW.key;
END;

CREATE TRIGGER IF NOT EXISTS trg_job_runs_updated_at
AFTER UPDATE ON job_runs
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE job_runs
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_digest_history_updated_at
AFTER UPDATE ON digest_history
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE digest_history
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_delivery_logs_updated_at
AFTER UPDATE ON delivery_logs
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE delivery_logs
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_reader_profiles_updated_at
AFTER UPDATE ON reader_profiles
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE reader_profiles
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_profile_interests_updated_at
AFTER UPDATE ON profile_interests
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE profile_interests
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_source_groups_updated_at
AFTER UPDATE ON source_groups
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE source_groups
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_channel_controls_updated_at
AFTER UPDATE ON channel_controls
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE channel_controls
    SET updated_at = CURRENT_TIMESTAMP
    WHERE channel_id = NEW.channel_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_story_clusters_updated_at
AFTER UPDATE ON story_clusters
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE story_clusters
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_annotations_updated_at
AFTER UPDATE ON annotations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE annotations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tags_updated_at
AFTER UPDATE ON tags
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE tags
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_collections_updated_at
AFTER UPDATE ON collections
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE collections
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_saved_searches_updated_at
AFTER UPDATE ON saved_searches
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE saved_searches
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
