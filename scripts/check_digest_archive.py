from __future__ import annotations

import hashlib
import json
import sys
import tempfile
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile

from runtime_helpers import ROOT_DIR, reexec_with_venv

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

from app.db.initializer import connect, ensure_database  # noqa: E402
from app.delivery.repository import DeliveryRepository  # noqa: E402
from app.delivery.service import inspect_artifact  # noqa: E402
from app.digests.repository import DigestRepository  # noqa: E402
from app.digests.service import DigestService  # noqa: E402

OUTPUT_PATH = ROOT_DIR / "output" / "digest-archive-check.json"
EXPECTED_EPUB_MEMBERS = {
    "mimetype",
    "META-INF/container.xml",
    "OEBPS/content.opf",
    "OEBPS/toc.ncx",
    "OEBPS/styles.css",
    "OEBPS/intro.xhtml",
}


def seed_workspace(database_path: Path) -> None:
    ensure_database(database_path)
    with connect(database_path) as connection:
        channels = [
            (
                "chn_archive_smoke_a",
                "Archive Smoke Feed A",
                "https://example.com/a.xml",
                "testing",
            ),
            (
                "chn_archive_smoke_b",
                "Archive Smoke Feed B",
                "https://example.com/b.xml",
                "markets",
            ),
        ]
        for channel_id, title, feed_url, category in channels:
            connection.execute(
                """
                INSERT INTO channels (
                    id,
                    title,
                    site_url,
                    feed_url,
                    normalized_feed_url,
                    category
                )
                VALUES (?, ?, 'https://example.com', ?, ?, ?)
                """,
                [channel_id, title, feed_url, feed_url, category],
            )

        items = [
            {
                "channel_id": "chn_archive_smoke_a",
                "content_hash": "hash-archive-smoke-1",
                "dedupe_key": "archive-smoke-1",
                "id": "itm_archive_1",
                "published_at": "2026-05-01T08:00:00Z",
                "title": "Archive smoke article 1",
            },
            {
                "channel_id": "chn_archive_smoke_a",
                "content_hash": "hash-archive-duplicate",
                "dedupe_key": "archive-duplicate-a",
                "id": "itm_archive_2",
                "published_at": "2026-05-02T08:00:00Z",
                "title": "Archive smoke duplicate A",
            },
            {
                "channel_id": "chn_archive_smoke_a",
                "content_hash": "hash-archive-duplicate",
                "dedupe_key": "archive-duplicate-b",
                "id": "itm_archive_3",
                "published_at": "2026-05-02T09:00:00Z",
                "title": "Archive smoke duplicate B",
            },
            {
                "channel_id": "chn_archive_smoke_b",
                "content_hash": "hash-archive-smoke-4",
                "dedupe_key": "archive-smoke-4",
                "id": "itm_archive_4",
                "published_at": "2026-05-03T08:00:00Z",
                "title": "Archive smoke article 4",
            },
        ]
        for item in items:
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
                    cleaned_html,
                    published_at,
                    extraction_status,
                    digest_candidate,
                    dedupe_key,
                    content_hash
                )
                VALUES (?, ?, ?, ?, ?, ?, 'RSSmaster', ?, ?, ?, 'completed', 1, ?, ?)
                """,
                [
                    item["id"],
                    item["channel_id"],
                    f"guid-{item['id']}",
                    f"https://example.com/articles/{item['id']}",
                    f"https://example.com/articles/{item['id']}",
                    item["title"],
                    f"Excerpt for {item['title']}",
                    f"<p>Readable archive body for {item['title']}.</p>",
                    item["published_at"],
                    item["dedupe_key"],
                    item["content_hash"],
                ],
            )
        connection.commit()


def build_report(database_path: Path, artifact_root: Path) -> dict[str, object]:
    seed_workspace(database_path)
    digest_repository = DigestRepository(database_path)
    digest_service = DigestService(
        digest_repository,
        artifact_root=artifact_root,
        digest_max_items=10,
    )
    selection_kwargs = {
        "item_ids": None,
        "category": None,
        "title": "Archive Smoke Edition",
        "period_start": None,
        "period_end": None,
        "limit": 10,
        "include_read": True,
        "favorites_only": False,
        "digest_candidates_only": True,
    }
    preview = digest_service.preview_digest(**selection_kwargs)
    digest = digest_service.build_digest(
        **selection_kwargs,
    )

    failures: list[str] = []
    digest_id = str(digest["id"])
    artifact = digest.get("artifact") if isinstance(digest.get("artifact"), dict) else {}
    artifact_path = Path(str(artifact.get("path"))) if artifact.get("path") else None
    artifact_exists = artifact_path is not None and artifact_path.exists() and artifact_path.is_file()
    artifact_bytes = artifact_path.stat().st_size if artifact_exists and artifact_path is not None else 0
    artifact_sha256 = artifact.get("sha256")
    calculated_sha256 = hashlib.sha256(artifact_path.read_bytes()).hexdigest() if artifact_exists and artifact_path is not None else None

    if digest.get("status") != "completed":
        failures.append(f"digest_not_completed: {digest.get('status')}")
    if digest.get("article_count") != 3:
        failures.append(f"unexpected_article_count: {digest.get('article_count')}")
    if not artifact_exists:
        failures.append("artifact_missing")
    if artifact_path is not None and artifact_path.parent.resolve() != artifact_root.resolve():
        failures.append(f"artifact_outside_archive_root: {artifact_path}")
    if artifact_path is not None and artifact_path.suffix.lower() != ".epub":
        failures.append(f"artifact_not_epub: {artifact_path}")
    if not artifact_sha256 or artifact_sha256 != calculated_sha256:
        failures.append("artifact_sha256_mismatch")
    if artifact_bytes <= 0:
        failures.append("artifact_empty")
    epub_quality = inspect_epub_quality(artifact_path) if artifact_exists and artifact_path is not None else None
    if epub_quality is None:
        failures.append("epub_quality_not_inspected")
    else:
        failures.extend(str(failure) for failure in epub_quality["failures"])

    history = digest_repository.list_digest_history(limit=5)
    history_ids = [str(entry["id"]) for entry in history]
    if digest_id not in history_ids:
        failures.append("digest_missing_from_history")
    history_entry = next((entry for entry in history if str(entry["id"]) == digest_id), None)
    if history_entry is None or history_entry.get("artifact", {}).get("size_bytes") != artifact_bytes:
        failures.append("history_artifact_size_missing")
    stats = preview.get("stats") if isinstance(preview.get("stats"), dict) else {}
    selection_snapshot = digest.get("selection_snapshot") if isinstance(digest.get("selection_snapshot"), list) else []
    selected_sources = {
        str(item.get("channel_title"))
        for item in selection_snapshot
        if isinstance(item, dict) and item.get("channel_title")
    }
    quality_report = {
        "article_count": digest.get("article_count"),
        "candidate_count": stats.get("candidate_count"),
        "deduplicated_count": stats.get("deduplicated_count"),
        "source_count": stats.get("source_count"),
        "selected_sources": sorted(selected_sources),
    }
    if quality_report["candidate_count"] != 4:
        failures.append(f"quality_candidate_count_missing: {quality_report['candidate_count']}")
    if quality_report["deduplicated_count"] != 1:
        failures.append(f"quality_deduplicated_count_missing: {quality_report['deduplicated_count']}")
    if quality_report["source_count"] != 2 or len(selected_sources) != 2:
        failures.append(f"quality_source_diversity_missing: {quality_report}")

    delivery_digest = DeliveryRepository(database_path).get_digest(digest_id)
    if delivery_digest is None:
        failures.append("delivery_digest_missing")
        delivery_artifact = None
    else:
        delivery_artifact = inspect_artifact(delivery_digest)
        if not delivery_artifact["artifact_exists"]:
            failures.append("delivery_artifact_not_ready")
        if delivery_artifact["artifact_sha256"] != calculated_sha256:
            failures.append("delivery_artifact_sha256_mismatch")

    with connect(database_path) as connection:
        digest_history_count = int(connection.execute("SELECT COUNT(*) AS total FROM digest_history").fetchone()["total"])
        job_run_count = int(connection.execute("SELECT COUNT(*) AS total FROM job_runs WHERE job_type = 'digest'").fetchone()["total"])

    if digest_history_count != 1:
        failures.append(f"unexpected_digest_history_count: {digest_history_count}")
    if job_run_count != 1:
        failures.append(f"unexpected_digest_job_run_count: {job_run_count}")

    return {
        "status": "passed" if not failures else "failed",
        "database_path": str(database_path),
        "artifact_root": str(artifact_root),
        "digest_id": digest_id,
        "artifact": {
            "path": str(artifact_path) if artifact_path is not None else None,
            "exists": artifact_exists,
            "size_bytes": artifact_bytes,
            "sha256": artifact_sha256,
            "calculated_sha256": calculated_sha256,
        },
        "delivery_artifact": delivery_artifact,
        "epub_quality": epub_quality,
        "quality_report": quality_report,
        "history_count": digest_history_count,
        "digest_job_run_count": job_run_count,
        "failures": failures,
        "output_path": str(OUTPUT_PATH),
    }


def inspect_epub_quality(artifact_path: Path) -> dict[str, object]:
    failures: list[str] = []
    with ZipFile(artifact_path) as archive:
        names = archive.namelist()
        missing_members = sorted(EXPECTED_EPUB_MEMBERS - set(names))
        if missing_members:
            failures.append(f"epub_missing_members: {missing_members}")
        if not names or names[0] != "mimetype":
            failures.append("epub_mimetype_not_first")
        elif archive.getinfo("mimetype").compress_type != ZIP_STORED:
            failures.append("epub_mimetype_is_compressed")

        toc = archive.read("OEBPS/toc.ncx").decode("utf-8") if "OEBPS/toc.ncx" in names else ""
        intro = archive.read("OEBPS/intro.xhtml").decode("utf-8") if "OEBPS/intro.xhtml" in names else ""
        chapters = [
            archive.read(name).decode("utf-8")
            for name in names
            if name.startswith("OEBPS/cat-") and name.endswith(".xhtml")
        ]

    if '<meta name="dtb:depth" content="2"/>' not in toc:
        failures.append("epub_toc_depth_not_article_aware")
    if "Archive smoke" not in toc or "#article-" not in toc:
        failures.append("epub_toc_missing_article_anchor")
    if "#article-" not in intro:
        failures.append("epub_intro_missing_nested_article_link")
    if not any('id="article-' in chapter for chapter in chapters):
        failures.append("epub_chapter_missing_article_anchors")
    if any("<script" in chapter.lower() for chapter in chapters):
        failures.append("epub_contains_script")

    return {
        "member_count": len(names),
        "chapter_count": len(chapters),
        "has_mimetype_first": bool(names and names[0] == "mimetype"),
        "toc_has_article_depth": '<meta name="dtb:depth" content="2"/>' in toc,
        "failures": failures,
    }


def main() -> int:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="rssmaster-digest-archive-", ignore_cleanup_errors=True) as tempdir:
        temp_root = Path(tempdir)
        report = build_report(
            database_path=temp_root / "rssmaster-archive-check.db",
            artifact_root=temp_root / "digests",
        )

    OUTPUT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
