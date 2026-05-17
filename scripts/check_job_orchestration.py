from __future__ import annotations

import json
import socket
import sys
import tempfile
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
OUTPUT_PATH = ROOT_DIR / "output" / "job-orchestration-check.json"
sys.path.insert(0, str(ROOT_DIR / "scripts"))

from runtime_helpers import reexec_with_venv  # noqa: E402


def _ensure_api_import_path() -> None:
    api_path = str(API_DIR)
    if api_path not in sys.path:
        sys.path.insert(0, api_path)


def _free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class FixtureServer:
    def __init__(self) -> None:
        self.port = _free_port()
        self.base_url = f"http://127.0.0.1:{self.port}"
        self._server = ThreadingHTTPServer(("127.0.0.1", self.port), self._handler())
        self._thread = Thread(target=self._server.serve_forever, daemon=True)

    def __enter__(self) -> "FixtureServer":
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)

    def _handler(self) -> type[BaseHTTPRequestHandler]:
        base_url = self.base_url

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: object) -> None:  # noqa: A002
                return

            def do_GET(self) -> None:  # noqa: N802
                if self.path == "/feed.xml":
                    self._send(
                        "application/rss+xml; charset=utf-8",
                        f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Orchestration Fixture</title>
    <link>{base_url}/</link>
    <description>Fixture feed for scheduled orchestration smoke.</description>
    <item>
      <title>Scheduled orchestration article</title>
      <link>{base_url}/article.html</link>
      <guid>orchestration-article-1</guid>
      <pubDate>Sun, 10 May 2026 09:00:00 GMT</pubDate>
      <description><![CDATA[Short feed excerpt used as a readable fallback.]]></description>
    </item>
  </channel>
</rss>
""",
                    )
                    return

                if self.path == "/article.html":
                    self._send(
                        "text/html; charset=utf-8",
                        """<!doctype html>
<html lang="en">
  <head><title>Scheduled orchestration article</title></head>
  <body>
    <main>
      <article>
        <h1>Scheduled orchestration article</h1>
        <p>This article verifies that scheduled sync, extraction, digest archive, and delivery dry-run can share one persisted job trail.</p>
      </article>
    </main>
  </body>
</html>
""",
                    )
                    return

                self.send_response(404)
                self.end_headers()

            def _send(self, content_type: str, body: str) -> None:
                payload = body.encode("utf-8")
                self.send_response(200)
                self.send_header("content-type", content_type)
                self.send_header("content-length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        return Handler


def _write_artifact(payload: dict[str, Any]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def _job_counts(database_path: Path) -> dict[str, dict[str, int]]:
    from app.db.initializer import connect

    with connect(database_path) as connection:
        rows = connection.execute(
            """
            SELECT job_type, status, COUNT(*) AS total
            FROM job_runs
            GROUP BY job_type, status
            ORDER BY job_type, status
            """
        ).fetchall()

    counts: dict[str, dict[str, int]] = {}
    for row in rows:
        counts.setdefault(str(row["job_type"]), {})[str(row["status"])] = int(row["total"])
    return counts


def _seed_channels(database_path: Path, *, feed_url: str, failing_feed_url: str) -> dict[str, str]:
    from app.channels.service import normalize_url
    from app.db.initializer import connect

    channels = {
        "healthy": {
            "category": "QA",
            "feed_url": feed_url,
            "id": "chn_orchestration_fixture",
            "title": "Orchestration Fixture",
        },
        "failing": {
            "category": "QA",
            "feed_url": failing_feed_url,
            "id": "chn_orchestration_failing_fixture",
            "title": "Orchestration Failing Fixture",
        },
    }
    with connect(database_path) as connection:
        for channel in channels.values():
            connection.execute(
                """
                INSERT INTO channels (
                    id,
                    title,
                    site_url,
                    feed_url,
                    normalized_feed_url,
                    category,
                    state
                )
                VALUES (?, ?, ?, ?, ?, ?, 'active')
                """,
                [
                    channel["id"],
                    channel["title"],
                    channel["feed_url"].rsplit("/", 1)[0],
                    channel["feed_url"],
                    normalize_url(channel["feed_url"]),
                    channel["category"],
                ],
            )
        connection.commit()
    return {key: str(channel["id"]) for key, channel in channels.items()}


def _seed_delivery_settings(database_path: Path) -> None:
    from app.settings.repository import DELIVERY_SETTINGS_DESCRIPTION, DELIVERY_SETTINGS_KEY, SettingsRepository

    SettingsRepository(database_path).upsert_setting(
        key=DELIVERY_SETTINGS_KEY,
        value={
            "smtp_host": "smtp.example.test",
            "smtp_port": 587,
            "smtp_username": "rssmaster@example.test",
            "smtp_password": "fixture-secret",
            "smtp_from": "rssmaster@example.test",
            "kindle_email": "kindle@example.test",
        },
        description=DELIVERY_SETTINGS_DESCRIPTION,
        updated_by="check_job_orchestration",
    )


def main() -> None:
    reexec_with_venv(Path(__file__).resolve())
    _ensure_api_import_path()

    from app.config import Settings
    from app.db.initializer import connect, ensure_database
    from app.delivery.models import SendDigestRequest
    from app.delivery.repository import DeliveryRepository
    from app.delivery.service import DeliveryService
    from app.digests.repository import DigestRepository
    from app.digests.service import DigestService
    from app.settings.repository import SettingsRepository
    from app.settings.service import SettingsService
    from app.sync.repository import SyncRepository
    from app.sync.service import SyncService

    failures: list[str] = []

    with tempfile.TemporaryDirectory(prefix="rssmaster-orchestration-", ignore_cleanup_errors=True) as temp_root_raw:
        temp_root = Path(temp_root_raw)
        database_path = temp_root / "workspace.db"
        artifact_root = temp_root / "digests"
        ensure_database(database_path)

        settings = Settings(
            database_path=str(database_path),
            fetch_timeout_seconds=5,
            digest_max_items=10,
        )

        with FixtureServer() as fixture:
            channel_ids = _seed_channels(
                database_path,
                feed_url=f"{fixture.base_url}/feed.xml",
                failing_feed_url=f"{fixture.base_url}/missing-feed.xml",
            )
            sync_service = SyncService(settings, SyncRepository(database_path))
            sync_run = sync_service.create_run(channel_ids=None, mode="scheduled", trigger_kind="system")
            sync_service.execute_run(str(sync_run["id"]))
            completed_sync = sync_service.get_run(str(sync_run["id"]))

            if completed_sync["status"] != "partial_success":
                failures.append(f"scheduled_sync_status:{completed_sync['status']}")
            if completed_sync["trigger_kind"] != "system":
                failures.append(f"scheduled_sync_trigger:{completed_sync['trigger_kind']}")
            if completed_sync["scope"].get("mode") != "scheduled":
                failures.append(f"scheduled_sync_scope_mode:{completed_sync['scope'].get('mode')}")
            if completed_sync["items_created"] != 1:
                failures.append(f"scheduled_sync_items_created:{completed_sync['items_created']}")
            if completed_sync["channels_succeeded"] != 1 or completed_sync["channels_failed"] != 1:
                failures.append(
                    f"scheduled_sync_channel_outcomes:succeeded={completed_sync['channels_succeeded']} failed={completed_sync['channels_failed']}"
                )
            if not completed_sync["errors"]:
                failures.append("scheduled_sync_errors_not_recorded")

        digest_service = DigestService(
            DigestRepository(database_path),
            artifact_root=artifact_root,
            digest_max_items=10,
        )
        digest = digest_service.build_digest(
            item_ids=None,
            category=None,
            title="Orchestration Fixture Digest",
            period_start=None,
            period_end=None,
            limit=10,
            include_read=True,
            favorites_only=False,
            digest_candidates_only=True,
        )
        digest_artifact = digest.get("artifact") if isinstance(digest.get("artifact"), dict) else {}
        artifact_path_raw = digest_artifact.get("path") if isinstance(digest_artifact, dict) else None
        artifact_path = Path(str(artifact_path_raw)) if artifact_path_raw else None
        if digest["status"] != "completed":
            failures.append(f"digest_status:{digest['status']}")
        if artifact_path is None or not artifact_path.exists():
            failures.append("digest_artifact_missing")
        if digest["article_count"] != 1:
            failures.append(f"digest_article_count:{digest['article_count']}")

        _seed_delivery_settings(database_path)
        settings_repository = SettingsRepository(database_path)
        delivery_service = DeliveryService(
            settings,
            DeliveryRepository(database_path),
            SettingsService(settings, settings_repository),
        )
        delivery = delivery_service.dispatch_digest(
            SendDigestRequest(
                digest_id=str(digest["id"]),
                target_kind="kindle",
                mode="dry_run",
                trigger_kind="scheduled",
                check_connection=False,
            )
        )
        delivery_run = delivery["run"]
        delivery_log = delivery["log"]
        if delivery_run["status"] != "completed":
            failures.append(f"delivery_run_status:{delivery_run['status']}")
        if delivery_run["trigger_kind"] != "scheduled":
            failures.append(f"delivery_trigger:{delivery_run['trigger_kind']}")
        if delivery_log["status"] != "skipped":
            failures.append(f"delivery_log_status:{delivery_log['status']}")

        with connect(database_path) as connection:
            item_count = int(connection.execute("SELECT COUNT(*) AS total FROM items").fetchone()["total"])
            job_count = int(connection.execute("SELECT COUNT(*) AS total FROM job_runs").fetchone()["total"])
            digest_count = int(connection.execute("SELECT COUNT(*) AS total FROM digest_history").fetchone()["total"])
            delivery_count = int(connection.execute("SELECT COUNT(*) AS total FROM delivery_logs").fetchone()["total"])
            synced_channel = connection.execute(
                "SELECT last_successful_fetch_at, consecutive_failures FROM channels WHERE id = ?",
                [channel_ids["healthy"]],
            ).fetchone()
            failing_channel = connection.execute(
                "SELECT last_error_code, last_error_message, consecutive_failures FROM channels WHERE id = ?",
                [channel_ids["failing"]],
            ).fetchone()
            job_rows = [
                dict(row)
                for row in connection.execute(
                    """
                    SELECT job_type, status, trigger_kind, total_count, success_count, failure_count, error_code, error_message
                    FROM job_runs
                    ORDER BY created_at ASC, id ASC
                    """
                ).fetchall()
            ]

        if item_count != 1:
            failures.append(f"item_count:{item_count}")
        if job_count != 3:
            failures.append(f"job_count:{job_count}")
        if digest_count != 1:
            failures.append(f"digest_count:{digest_count}")
        if delivery_count != 1:
            failures.append(f"delivery_count:{delivery_count}")
        if synced_channel is None or not synced_channel["last_successful_fetch_at"]:
            failures.append("channel_success_not_recorded")
        if synced_channel is not None and int(synced_channel["consecutive_failures"] or 0) != 0:
            failures.append(f"channel_consecutive_failures:{synced_channel['consecutive_failures']}")
        if failing_channel is None or not failing_channel["last_error_code"]:
            failures.append("failing_channel_error_not_recorded")
        if failing_channel is not None and int(failing_channel["consecutive_failures"] or 0) < 1:
            failures.append(f"failing_channel_consecutive_failures:{failing_channel['consecutive_failures']}")

        monitoring_report = {
            "feed_errors": completed_sync["errors"],
            "failing_channel": dict(failing_channel) if failing_channel is not None else None,
            "job_runs": job_rows,
            "pipeline_terminal_statuses": {
                "sync": completed_sync["status"],
                "digest": digest["status"],
                "delivery_run": delivery_run["status"],
                "delivery_log": delivery_log["status"],
            },
        }

        payload = {
            "status": "passed" if not failures else "failed",
            "checks": {
                "scheduled_sync": completed_sync,
                "digest": {
                    "id": digest["id"],
                    "status": digest["status"],
                    "article_count": digest["article_count"],
                    "artifact_exists": artifact_path.exists() if artifact_path is not None else False,
                    "artifact_suffix": artifact_path.suffix if artifact_path is not None else None,
                },
                "delivery": {
                    "run_status": delivery_run["status"],
                    "trigger_kind": delivery_run["trigger_kind"],
                    "log_status": delivery_log["status"],
                    "preflight_status": delivery["preflight"]["status"],
                },
                "job_counts": _job_counts(database_path),
                "row_counts": {
                    "items": item_count,
                    "job_runs": job_count,
                    "digest_history": digest_count,
                    "delivery_logs": delivery_count,
                },
                "monitoring_report": monitoring_report,
            },
            "failures": failures,
        }
        _write_artifact(payload)

    if failures:
        print(json.dumps(payload, indent=2, sort_keys=True))
        raise SystemExit(1)

    print(f"Job orchestration check passed. Artifact: {OUTPUT_PATH}")
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
