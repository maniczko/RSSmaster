from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from contextvars import ContextVar, Token
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator

SCHEMA_VERSION = 2
SCHEMA_NAME = "rssmaster_schema_v2"
SCHEMA_FILE = Path(__file__).with_name("schema.sql")
REQUIRED_TABLES = {
    "annotations",
    "channel_controls",
    "collection_items",
    "collections",
    "channels",
    "delivery_logs",
    "digest_history",
    "items",
    "job_runs",
    "item_tags",
    "profile_interests",
    "ranking_state",
    "reader_feedback",
    "reader_profiles",
    "saved_searches",
    "schema_migrations",
    "settings",
    "source_groups",
    "story_cluster_items",
    "story_clusters",
    "tags",
}

_database_path_override: ContextVar[str | None] = ContextVar("rssmaster_database_path_override", default=None)


@dataclass(frozen=True)
class SchemaMigration:
    version: int
    name: str
    apply: Callable[[sqlite3.Connection], None]


def apply_schema_v1(connection: sqlite3.Connection) -> None:
    connection.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))


def apply_schema_v2(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS reader_feedback (
            id TEXT PRIMARY KEY,
            item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
            source_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
            action TEXT NOT NULL CHECK (
                action IN ('more_like_this', 'less_like_this', 'hide_topic', 'mute_source', 'important')
            ),
            topic TEXT,
            reason TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_reader_feedback_action_topic
            ON reader_feedback (action, topic);

        CREATE INDEX IF NOT EXISTS idx_reader_feedback_source_id
            ON reader_feedback (source_id);

        CREATE INDEX IF NOT EXISTS idx_reader_feedback_item_id
            ON reader_feedback (item_id);
        """
    )


MIGRATIONS: tuple[SchemaMigration, ...] = (
    SchemaMigration(version=1, name="rssmaster_schema_v1", apply=apply_schema_v1),
    SchemaMigration(version=2, name="rssmaster_schema_v2", apply=apply_schema_v2),
)


def push_database_path_override(database_path: Path) -> Token[str | None]:
    return _database_path_override.set(str(database_path.resolve()))


def pop_database_path_override(token: Token[str | None]) -> None:
    _database_path_override.reset(token)


@contextmanager
def database_path_override(database_path: Path) -> Iterator[None]:
    token = push_database_path_override(database_path)
    try:
        yield
    finally:
        pop_database_path_override(token)


def resolve_database_path(database_path: Path) -> Path:
    override = _database_path_override.get()
    if override:
        return Path(override)
    return database_path


def connect(database_path: Path) -> sqlite3.Connection:
    resolved_path = resolve_database_path(database_path)
    connection = sqlite3.connect(resolved_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    connection.execute("PRAGMA journal_mode = WAL;")
    connection.execute("PRAGMA synchronous = NORMAL;")
    return connection


def ensure_migration_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def read_user_version(connection: sqlite3.Connection) -> int:
    return int(connection.execute("PRAGMA user_version").fetchone()[0])


def read_applied_migrations(connection: sqlite3.Connection) -> list[dict[str, object]]:
    ensure_migration_table(connection)
    rows = connection.execute(
        """
        SELECT version, name, applied_at
        FROM schema_migrations
        ORDER BY version
        """
    ).fetchall()
    return [
        {
            "version": int(row["version"]),
            "name": str(row["name"]),
            "applied_at": row["applied_at"],
        }
        for row in rows
    ]


def apply_pending_migrations(connection: sqlite3.Connection) -> dict[str, object]:
    ensure_migration_table(connection)
    before_user_version = read_user_version(connection)
    applied_before = read_applied_migrations(connection)
    applied_versions = {int(row["version"]) for row in applied_before}
    applied_this_run: list[dict[str, object]] = []

    for migration in MIGRATIONS:
        if migration.version in applied_versions:
            continue
        migration.apply(connection)
        ensure_migration_table(connection)
        connection.execute(
            """
            INSERT OR IGNORE INTO schema_migrations (version, name)
            VALUES (?, ?)
            """,
            (migration.version, migration.name),
        )
        applied_this_run.append({"version": migration.version, "name": migration.name})
        applied_versions.add(migration.version)

    latest_version = max(migration.version for migration in MIGRATIONS)
    connection.execute(f"PRAGMA user_version = {latest_version};")
    applied_after = read_applied_migrations(connection)
    applied_after_versions = {int(row["version"]) for row in applied_after}
    pending_versions = [
        migration.version
        for migration in MIGRATIONS
        if migration.version not in applied_after_versions
    ]
    after_user_version = read_user_version(connection)
    return {
        "applied": applied_after,
        "applied_this_run": applied_this_run,
        "before_user_version": before_user_version,
        "current_version": after_user_version,
        "latest_version": latest_version,
        "pending_versions": pending_versions,
        "status": "ready" if not pending_versions and after_user_version == latest_version else "needs_migration",
    }


def ensure_database(database_path: Path) -> dict[str, object]:
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with connect(database_path) as connection:
        migration_status = apply_pending_migrations(connection)
        connection.commit()

        rows = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
            """
        ).fetchall()

    tables = {row["name"] for row in rows}
    missing_tables = sorted(REQUIRED_TABLES - tables)
    if missing_tables:
        raise RuntimeError(f"SQLite schema initialization is incomplete. Missing tables: {missing_tables}")

    return {
        "database_path": str(database_path),
        "migration_status": migration_status,
        "missing_tables": missing_tables,
        "schema_version": SCHEMA_VERSION,
        "table_count": len(tables),
        "tables": sorted(tables),
    }
