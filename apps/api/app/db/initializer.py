from __future__ import annotations

import sqlite3
from contextvars import ContextVar, Token
from pathlib import Path

SCHEMA_VERSION = 1
SCHEMA_NAME = "rssmaster_schema_v1"
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


def push_database_path_override(database_path: Path) -> Token[str | None]:
    return _database_path_override.set(str(database_path.resolve()))


def pop_database_path_override(token: Token[str | None]) -> None:
    _database_path_override.reset(token)


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


def ensure_database(database_path: Path) -> dict[str, object]:
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with connect(database_path) as connection:
        schema_sql = SCHEMA_FILE.read_text(encoding="utf-8")
        connection.executescript(schema_sql)
        connection.execute(
            """
            INSERT OR IGNORE INTO schema_migrations (version, name)
            VALUES (?, ?)
            """,
            (SCHEMA_VERSION, SCHEMA_NAME),
        )
        connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION};")
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
        "missing_tables": missing_tables,
        "schema_version": SCHEMA_VERSION,
        "table_count": len(tables),
        "tables": sorted(tables),
    }
