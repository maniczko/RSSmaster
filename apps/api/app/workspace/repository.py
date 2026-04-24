from __future__ import annotations

from datetime import UTC, datetime
import json
from pathlib import Path
import sqlite3
from uuid import uuid4

from app.db.initializer import connect

PROFILE_ID = "profile_local"
CAPTURED_CHANNEL_FEED = "https://rssmaster.local/captured"


class WorkspaceRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def ensure_profile(self) -> dict[str, object]:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO reader_profiles (
                    id,
                    name,
                    candidate_window_hours,
                    default_source_cap,
                    priority_source_cap,
                    emergency_source_cap,
                    daily_reading_goal
                )
                VALUES (?, ?, 72, 30, 45, 100, 12)
                """,
                [PROFILE_ID, "Local operator"],
            )
            connection.commit()
            row = connection.execute(
                """
                SELECT
                    id,
                    name,
                    candidate_window_hours,
                    default_source_cap,
                    priority_source_cap,
                    emergency_source_cap,
                    daily_reading_goal
                FROM reader_profiles
                WHERE id = ?
                """,
                [PROFILE_ID],
            ).fetchone()
        if row is None:
            raise RuntimeError("Reader profile could not be initialized.")
        return dict(row)

    def list_interests(self) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    label,
                    normalized_topic,
                    kind,
                    weight
                FROM profile_interests
                WHERE profile_id = ?
                ORDER BY weight DESC, label COLLATE NOCASE ASC
                """,
                [PROFILE_ID],
            ).fetchall()
        return [dict(row) for row in rows]

    def list_preference_signal_rows(self, *, limit: int) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    i.id,
                    i.channel_id,
                    i.title,
                    i.excerpt,
                    substr(COALESCE(i.content_text, ''), 1, 1600) AS content_text,
                    i.is_favorite,
                    i.is_read,
                    i.digest_candidate,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    COALESCE((
                        SELECT COUNT(*)
                        FROM annotations a
                        WHERE a.item_id = i.id
                          AND a.archived_at IS NULL
                    ), 0) AS annotation_count,
                    COALESCE((
                        SELECT group_concat(t.name, '|')
                        FROM item_tags it
                        INNER JOIN tags t
                            ON t.id = it.tag_id
                        WHERE it.item_id = i.id
                    ), '') AS tag_names
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                WHERE i.archived_at IS NULL
                  AND c.state != 'archived'
                  AND (
                    i.is_favorite = 1
                    OR i.digest_candidate = 1
                    OR EXISTS(
                        SELECT 1
                        FROM annotations a
                        WHERE a.item_id = i.id
                          AND a.archived_at IS NULL
                    )
                    OR EXISTS(
                        SELECT 1
                        FROM item_tags it
                        WHERE it.item_id = i.id
                    )
                  )
                ORDER BY
                    i.is_favorite DESC,
                    annotation_count DESC,
                    datetime(COALESCE(i.published_at, i.discovered_at, i.ingested_at)) DESC,
                    i.id DESC
                LIMIT ?
                """,
                [max(1, limit)],
            ).fetchall()
        return [dict(row) for row in rows]

    def update_profile(self, *, assignments: dict[str, object], interests: list[dict[str, object]] | None) -> dict[str, object]:
        self.ensure_profile()
        with connect(self.database_path) as connection:
            if assignments:
                fragments = [f"{column} = ?" for column in assignments]
                connection.execute(
                    f"""
                    UPDATE reader_profiles
                    SET {", ".join(fragments)}
                    WHERE id = ?
                    """,
                    [*assignments.values(), PROFILE_ID],
                )
            if interests is not None:
                connection.execute("DELETE FROM profile_interests WHERE profile_id = ?", [PROFILE_ID])
                connection.executemany(
                    """
                    INSERT INTO profile_interests (
                        id,
                        profile_id,
                        label,
                        normalized_topic,
                        kind,
                        weight
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    [
                        [
                            f"int_{uuid4().hex[:12]}",
                            PROFILE_ID,
                            interest["label"],
                            interest.get("normalized_topic"),
                            interest["kind"],
                            interest["weight"],
                        ]
                        for interest in interests
                    ],
                )
            connection.commit()
        return self.ensure_profile()

    def list_candidate_rows(self, *, window_hours: int, limit: int) -> list[dict[str, object]]:
        window_clause = f"-{max(1, window_hours)} hours"
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    i.id,
                    i.channel_id,
                    i.title,
                    i.author,
                    i.source_url,
                    i.excerpt,
                    i.content_text,
                    i.cleaned_html,
                    i.published_at,
                    i.discovered_at,
                    i.ingested_at,
                    i.is_read,
                    i.is_favorite,
                    i.digest_candidate,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    c.feed_url AS channel_feed_url,
                    c.state AS channel_state,
                    c.consecutive_failures,
                    c.last_successful_fetch_at,
                    c.last_error_message,
                    cc.tier AS control_tier,
                    cc.custom_source_cap,
                    cc.paused_until,
                    cc.snoozed_until,
                    sg.name AS group_name,
                    (
                        SELECT COUNT(*)
                        FROM items source_items
                        WHERE source_items.channel_id = i.channel_id
                          AND datetime(COALESCE(source_items.published_at, source_items.discovered_at, source_items.ingested_at))
                              >= datetime('now', '-1 day')
                    ) AS channel_items_last_24h
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                LEFT JOIN channel_controls cc
                    ON cc.channel_id = i.channel_id
                LEFT JOIN source_groups sg
                    ON sg.id = cc.group_id
                WHERE i.archived_at IS NULL
                  AND c.state != 'archived'
                  AND datetime(COALESCE(i.published_at, i.discovered_at, i.ingested_at))
                      >= datetime('now', ?)
                ORDER BY datetime(COALESCE(i.published_at, i.discovered_at, i.ingested_at)) DESC, i.id DESC
                LIMIT ?
                """,
                [window_clause, max(1, limit)],
            ).fetchall()
        return [dict(row) for row in rows]

    def replace_story_clusters(self, clusters: list[dict[str, object]]) -> None:
        with connect(self.database_path) as connection:
            connection.execute("DELETE FROM story_cluster_items")
            connection.execute("DELETE FROM story_clusters")
            for cluster in clusters:
                connection.execute(
                    """
                    INSERT INTO story_clusters (
                        id,
                        cluster_key,
                        headline,
                        primary_item_id,
                        item_count,
                        category
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    [
                        cluster["id"],
                        cluster["cluster_key"],
                        cluster["headline"],
                        cluster["primary_item_id"],
                        cluster["item_count"],
                        cluster.get("category"),
                    ],
                )
                connection.executemany(
                    """
                    INSERT INTO story_cluster_items (
                        cluster_id,
                        item_id,
                        rank_index,
                        is_primary
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    [
                        [
                            cluster["id"],
                            item_id,
                            index,
                            1 if index == 0 else 0,
                        ]
                        for index, item_id in enumerate(cluster["item_ids"])
                    ],
                )
            connection.commit()

    def upsert_ranking_state(self, states: list[dict[str, object]]) -> None:
        with connect(self.database_path) as connection:
            connection.execute("DELETE FROM ranking_state")
            connection.executemany(
                """
                INSERT INTO ranking_state (
                    item_id,
                    candidate_status,
                    candidate_reason,
                    source_window_hours,
                    source_cap,
                    final_score,
                    score_breakdown_json,
                    ranked_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    [
                        state["item_id"],
                        state["candidate_status"],
                        state.get("candidate_reason"),
                        state["source_window_hours"],
                        state["source_cap"],
                        state["final_score"],
                        json.dumps(state["score_breakdown"], separators=(",", ":")),
                        state["ranked_at"],
                    ]
                    for state in states
                ],
            )
            connection.commit()

    def list_ranked_rows(self, *, limit: int) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    rs.item_id,
                    rs.candidate_status,
                    rs.candidate_reason,
                    rs.source_window_hours,
                    rs.source_cap,
                    rs.final_score,
                    rs.score_breakdown_json,
                    rs.ranked_at,
                    i.channel_id,
                    i.title,
                    i.author,
                    i.source_url,
                    i.excerpt,
                    i.published_at,
                    i.is_read,
                    i.is_favorite,
                    i.digest_candidate,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    c.feed_url AS channel_feed_url,
                    sc.id AS story_cluster_id,
                    COALESCE(sc.item_count, 1) AS story_cluster_size
                FROM ranking_state rs
                INNER JOIN items i
                    ON i.id = rs.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                LEFT JOIN story_cluster_items sci
                    ON sci.item_id = i.id
                LEFT JOIN story_clusters sc
                    ON sc.id = sci.cluster_id
                WHERE rs.candidate_status = 'eligible'
                ORDER BY rs.final_score DESC, datetime(COALESCE(i.published_at, i.discovered_at, i.ingested_at)) DESC
                LIMIT ?
                """,
                [max(1, limit)],
            ).fetchall()
        return [dict(row) for row in rows]

    def list_story_cluster_rows(self, *, limit: int) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            cluster_rows = connection.execute(
                """
                SELECT
                    sc.id,
                    sc.headline,
                    sc.item_count,
                    sc.category,
                    sci.item_id,
                    sci.rank_index,
                    i.channel_id,
                    i.title,
                    i.author,
                    i.source_url,
                    i.excerpt,
                    i.published_at,
                    i.is_read,
                    i.is_favorite,
                    i.digest_candidate,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    c.feed_url AS channel_feed_url
                FROM story_clusters sc
                INNER JOIN story_cluster_items sci
                    ON sci.cluster_id = sc.id
                INNER JOIN items i
                    ON i.id = sci.item_id
                INNER JOIN channels c
                    ON c.id = i.channel_id
                ORDER BY sc.item_count DESC, sc.updated_at DESC, sci.rank_index ASC
                LIMIT ?
                """,
                [max(1, limit * 6)],
            ).fetchall()
        return [dict(row) for row in cluster_rows]

    def list_annotations(self, *, item_id: str | None, search: str | None, limit: int) -> list[dict[str, object]]:
        clauses = ["archived_at IS NULL"]
        params: list[object] = []
        if item_id:
            clauses.append("item_id = ?")
            params.append(item_id)
        if search:
            pattern = f"%{search.lower()}%"
            clauses.append("(lower(COALESCE(quote_text, '')) LIKE ? OR lower(COALESCE(note_text, '')) LIKE ?)")
            params.extend([pattern, pattern])

        where_sql = " AND ".join(clauses)
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    id,
                    item_id,
                    kind,
                    quote_text,
                    note_text,
                    color,
                    created_at,
                    updated_at
                FROM annotations
                WHERE {where_sql}
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                [*params, max(1, limit)],
            ).fetchall()
        return [dict(row) for row in rows]

    def create_annotation(
        self,
        *,
        item_id: str,
        kind: str,
        quote_text: str | None,
        note_text: str | None,
        color: str | None,
    ) -> dict[str, object]:
        annotation_id = f"ant_{uuid4().hex[:12]}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO annotations (
                    id,
                    item_id,
                    kind,
                    quote_text,
                    note_text,
                    color
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [annotation_id, item_id, kind, quote_text, note_text, color],
            )
            connection.commit()
        return self.get_annotation(annotation_id)

    def ensure_item_note_annotation(self, *, item_id: str, note_text: str) -> dict[str, object]:
        normalized_note = note_text.strip()
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    id
                FROM annotations
                WHERE item_id = ?
                  AND kind = 'note'
                  AND archived_at IS NULL
                  AND note_text = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                [item_id, normalized_note],
            ).fetchone()

        if row is not None:
            return self.get_annotation(str(row["id"]))

        return self.create_annotation(
            item_id=item_id,
            kind="note",
            quote_text=None,
            note_text=normalized_note,
            color=None,
        )

    def ensure_annotation_replay(
        self,
        *,
        item_id: str,
        kind: str,
        quote_text: str | None,
        note_text: str | None,
        color: str | None,
    ) -> dict[str, object]:
        normalized_quote = quote_text.strip() if isinstance(quote_text, str) and quote_text.strip() else None
        normalized_note = note_text.strip() if isinstance(note_text, str) and note_text.strip() else None
        normalized_color = color.strip() if isinstance(color, str) and color.strip() else None

        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    id
                FROM annotations
                WHERE item_id = ?
                  AND kind = ?
                  AND archived_at IS NULL
                  AND COALESCE(quote_text, '') = COALESCE(?, '')
                  AND COALESCE(note_text, '') = COALESCE(?, '')
                  AND COALESCE(color, '') = COALESCE(?, '')
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                [item_id, kind, normalized_quote, normalized_note, normalized_color],
            ).fetchone()

        if row is not None:
            return self.get_annotation(str(row["id"]))

        return self.create_annotation(
            item_id=item_id,
            kind=kind,
            quote_text=normalized_quote,
            note_text=normalized_note,
            color=normalized_color,
        )

    def get_annotation(self, annotation_id: str) -> dict[str, object]:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    item_id,
                    kind,
                    quote_text,
                    note_text,
                    color,
                    created_at,
                    updated_at
                FROM annotations
                WHERE id = ?
                """,
                [annotation_id],
            ).fetchone()
        if row is None:
            raise RuntimeError("Annotation was not found.")
        return dict(row)

    def update_annotation(self, annotation_id: str, *, note_text: str | None, color: str | None, archived: bool | None) -> dict[str, object]:
        assignments: list[str] = []
        params: list[object] = []
        if note_text is not None:
            assignments.append("note_text = ?")
            params.append(note_text)
        if color is not None:
            assignments.append("color = ?")
            params.append(color)
        if archived is not None:
            assignments.append("archived_at = CURRENT_TIMESTAMP" if archived else "archived_at = NULL")
        if not assignments:
            return self.get_annotation(annotation_id)
        with connect(self.database_path) as connection:
            cursor = connection.execute(
                f"""
                UPDATE annotations
                SET {", ".join(assignments)}
                WHERE id = ?
                """,
                [*params, annotation_id],
            )
            connection.commit()
        if cursor.rowcount == 0:
            raise RuntimeError("Annotation was not found.")
        return self.get_annotation(annotation_id)

    def list_tags(self) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    t.id,
                    t.name,
                    t.color,
                    COUNT(it.item_id) AS item_count
                FROM tags t
                LEFT JOIN item_tags it
                    ON it.tag_id = t.id
                GROUP BY t.id, t.name, t.color
                ORDER BY t.name COLLATE NOCASE ASC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def create_tag(self, *, name: str, color: str | None) -> dict[str, object]:
        tag_id = f"tag_{uuid4().hex[:12]}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO tags (
                    id,
                    name,
                    color
                )
                VALUES (?, ?, ?)
                """,
                [tag_id, name, color],
            )
            connection.commit()
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    t.id,
                    t.name,
                    t.color,
                    COUNT(it.item_id) AS item_count
                FROM tags t
                LEFT JOIN item_tags it
                    ON it.tag_id = t.id
                WHERE lower(t.name) = lower(?)
                GROUP BY t.id, t.name, t.color
                """,
                [name],
            ).fetchone()
        if row is None:
            raise RuntimeError("Tag was not persisted.")
        return dict(row)

    def set_item_tags(self, *, item_id: str, tag_ids: list[str]) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            connection.execute("DELETE FROM item_tags WHERE item_id = ?", [item_id])
            connection.executemany(
                """
                INSERT INTO item_tags (
                    item_id,
                    tag_id
                )
                VALUES (?, ?)
                """,
                [[item_id, tag_id] for tag_id in tag_ids],
            )
            connection.commit()
        return self.list_item_tags(item_id)

    def add_item_tag(self, *, item_id: str, tag_id: str) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO item_tags (
                    item_id,
                    tag_id
                )
                VALUES (?, ?)
                """,
                [item_id, tag_id],
            )
            connection.commit()
        return self.list_item_tags(item_id)

    def list_item_tags(self, item_id: str) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    t.id,
                    t.name,
                    t.color,
                    COUNT(it2.item_id) AS item_count
                FROM item_tags it
                INNER JOIN tags t
                    ON t.id = it.tag_id
                LEFT JOIN item_tags it2
                    ON it2.tag_id = t.id
                WHERE it.item_id = ?
                GROUP BY t.id, t.name, t.color
                ORDER BY t.name COLLATE NOCASE ASC
                """,
                [item_id],
            ).fetchall()
        return [dict(row) for row in rows]

    def list_collections(self) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    c.id,
                    c.name,
                    c.description,
                    COUNT(ci.item_id) AS item_count
                FROM collections c
                LEFT JOIN collection_items ci
                    ON ci.collection_id = c.id
                GROUP BY c.id, c.name, c.description
                ORDER BY c.name COLLATE NOCASE ASC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def create_collection(self, *, name: str, description: str | None, item_id: str | None) -> dict[str, object]:
        collection_id = f"col_{uuid4().hex[:12]}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO collections (
                    id,
                    name,
                    description
                )
                VALUES (?, ?, ?)
                """,
                [collection_id, name, description],
            )
            if item_id:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO collection_items (
                        collection_id,
                        item_id
                    )
                    VALUES (?, ?)
                    """,
                    [collection_id, item_id],
                )
            connection.commit()
        return self.get_collection(collection_id)

    def ensure_collection(self, *, name: str, description: str | None) -> dict[str, object]:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    c.id,
                    c.name,
                    c.description,
                    COUNT(ci.item_id) AS item_count
                FROM collections c
                LEFT JOIN collection_items ci
                    ON ci.collection_id = c.id
                WHERE lower(c.name) = lower(?)
                GROUP BY c.id, c.name, c.description
                """,
                [name],
            ).fetchone()

        if row is not None:
            collection = dict(row)
            if description and not collection.get("description"):
                with connect(self.database_path) as connection:
                    connection.execute(
                        """
                        UPDATE collections
                        SET description = ?
                        WHERE id = ?
                        """,
                        [description, collection["id"]],
                    )
                    connection.commit()
                return self.get_collection(str(collection["id"]))
            return collection

        return self.create_collection(name=name, description=description, item_id=None)

    def add_collection_item(self, *, collection_id: str, item_id: str) -> dict[str, object]:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO collection_items (
                    collection_id,
                    item_id
                )
                VALUES (?, ?)
                """,
                [collection_id, item_id],
            )
            connection.commit()
        return self.get_collection(collection_id)

    def get_collection(self, collection_id: str) -> dict[str, object]:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    c.id,
                    c.name,
                    c.description,
                    COUNT(ci.item_id) AS item_count
                FROM collections c
                LEFT JOIN collection_items ci
                    ON ci.collection_id = c.id
                WHERE c.id = ?
                GROUP BY c.id, c.name, c.description
                """,
                [collection_id],
            ).fetchone()
        if row is None:
            raise RuntimeError("Collection was not found.")
        return dict(row)

    def list_saved_searches(self) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    name,
                    query,
                    default_view
                FROM saved_searches
                ORDER BY name COLLATE NOCASE ASC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def create_saved_search(self, *, name: str, query: str, default_view: str) -> dict[str, object]:
        saved_search_id = f"svw_{uuid4().hex[:12]}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO saved_searches (
                    id,
                    name,
                    query,
                    default_view
                )
                VALUES (?, ?, ?, ?)
                """,
                [saved_search_id, name, query, default_view],
            )
            connection.commit()
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    name,
                    query,
                    default_view
                FROM saved_searches
                WHERE id = ?
                """,
                [saved_search_id],
            ).fetchone()
        if row is None:
            raise RuntimeError("Saved search was not persisted.")
        return dict(row)

    def ensure_saved_search(self, *, name: str, query: str, default_view: str) -> dict[str, object]:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    name,
                    query,
                    default_view
                FROM saved_searches
                WHERE lower(name) = lower(?)
                  AND query = ?
                  AND default_view = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                [name, query, default_view],
            ).fetchone()

        if row is not None:
            return dict(row)

        return self.create_saved_search(name=name, query=query, default_view=default_view)

    def list_source_groups(self) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    sg.id,
                    sg.name,
                    sg.description,
                    sg.color,
                    COUNT(cc.channel_id) AS channel_count
                FROM source_groups sg
                LEFT JOIN channel_controls cc
                    ON cc.group_id = sg.id
                GROUP BY sg.id, sg.name, sg.description, sg.color
                ORDER BY sg.name COLLATE NOCASE ASC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def create_source_group(self, *, name: str, description: str | None, color: str | None) -> dict[str, object]:
        group_id = f"grp_{uuid4().hex[:12]}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO source_groups (
                    id,
                    name,
                    description,
                    color
                )
                VALUES (?, ?, ?, ?)
                """,
                [group_id, name, description, color],
            )
            connection.commit()
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT
                    sg.id,
                    sg.name,
                    sg.description,
                    sg.color,
                    COUNT(cc.channel_id) AS channel_count
                FROM source_groups sg
                LEFT JOIN channel_controls cc
                    ON cc.group_id = sg.id
                WHERE sg.id = ?
                GROUP BY sg.id, sg.name, sg.description, sg.color
                """,
                [group_id],
            ).fetchone()
        if row is None:
            raise RuntimeError("Source group was not created.")
        return dict(row)

    def list_channel_controls(self) -> dict[str, dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    cc.channel_id,
                    cc.group_id,
                    cc.tier,
                    cc.custom_source_cap,
                    cc.paused_until,
                    cc.snoozed_until,
                    cc.notes,
                    sg.name AS group_name
                FROM channel_controls cc
                LEFT JOIN source_groups sg
                    ON sg.id = cc.group_id
                """
            ).fetchall()
        return {str(row["channel_id"]): dict(row) for row in rows}

    def update_channel_control(
        self,
        channel_id: str,
        *,
        group_id: str | None,
        tier: str | None,
        custom_source_cap: int | None,
        paused_until: str | None,
        snoozed_until: str | None,
        notes: str | None,
    ) -> dict[str, object]:
        current = self.list_channel_controls().get(channel_id, {})
        payload = {
            "channel_id": channel_id,
            "group_id": group_id if group_id is not None else current.get("group_id"),
            "tier": tier if tier is not None else current.get("tier", "default"),
            "custom_source_cap": custom_source_cap if custom_source_cap is not None else current.get("custom_source_cap"),
            "paused_until": paused_until if paused_until is not None else current.get("paused_until"),
            "snoozed_until": snoozed_until if snoozed_until is not None else current.get("snoozed_until"),
            "notes": notes if notes is not None else current.get("notes"),
        }
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO channel_controls (
                    channel_id,
                    group_id,
                    tier,
                    custom_source_cap,
                    paused_until,
                    snoozed_until,
                    notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(channel_id) DO UPDATE SET
                    group_id = excluded.group_id,
                    tier = excluded.tier,
                    custom_source_cap = excluded.custom_source_cap,
                    paused_until = excluded.paused_until,
                    snoozed_until = excluded.snoozed_until,
                    notes = excluded.notes
                """,
                [
                    payload["channel_id"],
                    payload["group_id"],
                    payload["tier"],
                    payload["custom_source_cap"],
                    payload["paused_until"],
                    payload["snoozed_until"],
                    payload["notes"],
                ],
            )
            connection.commit()
        return self.list_channel_controls().get(channel_id, {"channel_id": channel_id, "tier": "default"})

    def list_channels_for_opml(self) -> list[dict[str, object]]:
        with connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    title,
                    site_url,
                    feed_url,
                    category
                FROM channels
                WHERE state != 'archived'
                ORDER BY title COLLATE NOCASE ASC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def ensure_capture_channel(self) -> str:
        with connect(self.database_path) as connection:
            row = connection.execute(
                """
                SELECT id
                FROM channels
                WHERE normalized_feed_url = ?
                """,
                [CAPTURED_CHANNEL_FEED],
            ).fetchone()
            if row is not None:
                return str(row["id"])
            channel_id = f"chn_{uuid4().hex[:12]}"
            connection.execute(
                """
                INSERT INTO channels (
                    id,
                    title,
                    site_url,
                    feed_url,
                    normalized_feed_url,
                    description,
                    language,
                    category
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    channel_id,
                    "Captured reads",
                    None,
                    CAPTURED_CHANNEL_FEED,
                    CAPTURED_CHANNEL_FEED,
                    "Read-later captures stored directly inside rssmaster.",
                    "en",
                    "capture",
                ],
            )
            connection.commit()
        return channel_id

    def insert_captured_item(
        self,
        *,
        channel_id: str,
        source_url: str,
        normalized_source_url: str,
        title: str,
        excerpt: str | None,
        raw_html: str | None,
        cleaned_html: str | None,
        content_text: str | None,
        note: str | None,
    ) -> str:
        item_id = f"itm_{uuid4().hex[:12]}"
        dedupe_key = f"capture::{normalized_source_url}"
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO items (
                    id,
                    channel_id,
                    guid,
                    source_url,
                    normalized_source_url,
                    title,
                    author,
                    excerpt,
                    raw_html,
                    cleaned_html,
                    content_text,
                    published_at,
                    raw_fetched_at,
                    cleaned_at,
                    extraction_status,
                    extraction_error,
                    is_read,
                    is_favorite,
                    archived_at,
                    digest_candidate,
                    dedupe_key,
                    content_hash
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, 0, 1, NULL, 1, ?, NULL)
                ON CONFLICT(dedupe_key) DO UPDATE SET
                    title = excluded.title,
                    excerpt = excluded.excerpt,
                    raw_html = excluded.raw_html,
                    cleaned_html = excluded.cleaned_html,
                    content_text = excluded.content_text,
                    extraction_status = excluded.extraction_status,
                    extraction_error = excluded.extraction_error,
                    is_favorite = 1,
                    favorited_at = COALESCE(items.favorited_at, CURRENT_TIMESTAMP),
                    digest_candidate = 1,
                    archived_at = NULL
                """,
                [
                    item_id,
                    channel_id,
                    dedupe_key,
                    source_url,
                    normalized_source_url,
                    title,
                    None,
                    excerpt or note,
                    raw_html,
                    cleaned_html,
                    content_text,
                    datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                    "completed" if content_text else "failed",
                    None if content_text else "Readable article content was not captured.",
                    dedupe_key,
                ],
            )
            connection.commit()
            row = connection.execute(
                """
                SELECT id
                FROM items
                WHERE dedupe_key = ?
                """,
                [dedupe_key],
            ).fetchone()
        if row is None:
            raise RuntimeError("Captured item could not be reloaded.")
        return str(row["id"])

    def list_export_rows(self) -> dict[str, object]:
        with connect(self.database_path) as connection:
            saved_items = connection.execute(
                """
                SELECT
                    i.id,
                    i.channel_id,
                    i.title,
                    i.author,
                    i.source_url,
                    i.excerpt,
                    i.published_at,
                    i.is_read,
                    i.is_favorite,
                    i.digest_candidate,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    c.feed_url AS channel_feed_url,
                    sc.id AS story_cluster_id,
                    COALESCE(sc.item_count, 1) AS story_cluster_size
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                LEFT JOIN story_cluster_items sci
                    ON sci.item_id = i.id
                LEFT JOIN story_clusters sc
                    ON sc.id = sci.cluster_id
                WHERE i.is_favorite = 1 AND i.archived_at IS NULL
                ORDER BY datetime(COALESCE(i.published_at, i.discovered_at, i.ingested_at)) DESC
                """
            ).fetchall()
            continuity_items = connection.execute(
                """
                SELECT
                    i.id,
                    i.channel_id,
                    i.title,
                    i.author,
                    i.source_url,
                    i.excerpt,
                    i.published_at,
                    i.is_read,
                    i.is_favorite,
                    i.archived_at,
                    i.digest_candidate,
                    c.title AS channel_title,
                    c.category AS channel_category,
                    c.feed_url AS channel_feed_url,
                    sc.id AS story_cluster_id,
                    COALESCE(sc.item_count, 1) AS story_cluster_size
                FROM items i
                INNER JOIN channels c
                    ON c.id = i.channel_id
                LEFT JOIN story_cluster_items sci
                    ON sci.item_id = i.id
                LEFT JOIN story_clusters sc
                    ON sc.id = sci.cluster_id
                WHERE (
                    i.is_favorite = 1
                    OR i.digest_candidate = 1
                    OR i.archived_at IS NOT NULL
                    OR i.is_read = 1
                    OR EXISTS(
                        SELECT 1
                        FROM annotations a
                        WHERE a.item_id = i.id
                    )
                    OR EXISTS(
                        SELECT 1
                        FROM item_tags it
                        WHERE it.item_id = i.id
                    )
                    OR EXISTS(
                        SELECT 1
                        FROM collection_items ci
                        WHERE ci.item_id = i.id
                    )
                )
                ORDER BY datetime(COALESCE(i.published_at, i.discovered_at, i.ingested_at)) DESC
                """
            ).fetchall()
            item_tags = connection.execute(
                """
                SELECT
                    it.item_id,
                    it.tag_id,
                    t.name AS tag_name
                FROM item_tags it
                INNER JOIN tags t
                    ON t.id = it.tag_id
                WHERE EXISTS(
                    SELECT 1
                    FROM items i
                    WHERE i.id = it.item_id
                      AND (
                        i.is_favorite = 1
                        OR i.digest_candidate = 1
                        OR i.archived_at IS NOT NULL
                        OR i.is_read = 1
                        OR EXISTS(
                            SELECT 1
                            FROM annotations a
                            WHERE a.item_id = i.id
                        )
                        OR EXISTS(
                            SELECT 1
                            FROM item_tags it2
                            WHERE it2.item_id = i.id
                        )
                        OR EXISTS(
                            SELECT 1
                            FROM collection_items ci
                            WHERE ci.item_id = i.id
                        )
                      )
                )
                ORDER BY lower(t.name), it.item_id
                """
            ).fetchall()
            collection_items = connection.execute(
                """
                SELECT
                    ci.collection_id,
                    ci.item_id
                FROM collection_items ci
                WHERE EXISTS(
                    SELECT 1
                    FROM items i
                    WHERE i.id = ci.item_id
                      AND (
                        i.is_favorite = 1
                        OR i.digest_candidate = 1
                        OR i.archived_at IS NOT NULL
                        OR i.is_read = 1
                        OR EXISTS(
                            SELECT 1
                            FROM annotations a
                            WHERE a.item_id = i.id
                        )
                        OR EXISTS(
                            SELECT 1
                            FROM item_tags it
                            WHERE it.item_id = i.id
                        )
                        OR EXISTS(
                            SELECT 1
                            FROM collection_items ci2
                            WHERE ci2.item_id = i.id
                        )
                      )
                )
                ORDER BY ci.collection_id, ci.item_id
                """
            ).fetchall()
        return {
            "annotations": self.list_annotations(item_id=None, search=None, limit=500),
            "tags": self.list_tags(),
            "collections": self.list_collections(),
            "saved_searches": self.list_saved_searches(),
            "saved_items": [dict(row) for row in saved_items],
            "continuity_items": [dict(row) for row in continuity_items],
            "item_tags": [dict(row) for row in item_tags],
            "collection_items": [dict(row) for row in collection_items],
        }

    def list_items_by_normalized_source_urls(self, normalized_source_urls: list[str]) -> list[dict[str, object]]:
        cleaned_urls = [url for url in normalized_source_urls if url]
        if not cleaned_urls:
            return []

        placeholders = ", ".join("?" for _ in cleaned_urls)
        with connect(self.database_path) as connection:
            rows = connection.execute(
                f"""
                SELECT
                    i.id,
                    i.title,
                    i.source_url,
                    i.normalized_source_url,
                    i.is_read,
                    i.is_favorite,
                    i.digest_candidate,
                    i.archived_at,
                    datetime(COALESCE(i.published_at, i.discovered_at, i.ingested_at)) AS sort_published_at
                FROM items i
                WHERE i.normalized_source_url IN ({placeholders})
                ORDER BY
                    i.normalized_source_url ASC,
                    i.is_favorite DESC,
                    CASE WHEN i.archived_at IS NULL THEN 0 ELSE 1 END ASC,
                    sort_published_at DESC,
                    i.id DESC
                """,
                cleaned_urls,
            ).fetchall()
        return [dict(row) for row in rows]


def parse_breakdown(payload: object) -> dict[str, object]:
    if not isinstance(payload, str) or not payload:
        return {}
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}
