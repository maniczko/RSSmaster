from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

from runtime_helpers import ROOT_DIR, reexec_with_venv

SCRIPT_PATH = Path(__file__).resolve()
reexec_with_venv(SCRIPT_PATH)

sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

from app.config import get_settings  # noqa: E402
from app.db.initializer import connect  # noqa: E402
from app.extract.models import ExtractionCandidate  # noqa: E402
from app.extract.repository import ExtractionRepository  # noqa: E402
from app.extract.service import ExtractionService  # noqa: E402

DEFAULT_MANIFEST_PATH = ROOT_DIR / "output" / "playwright" / "reader-real-queue-manifest.json"
DEFAULT_REPORT_PATH = ROOT_DIR / "output" / "playwright" / "reextract-items-report.json"
DEFAULT_FORBIDDEN_TEXT_FRAGMENTS = [
    "Loading the Elevenlabs Text to Speech AudioNative Player",
    "AudioNative Player",
    "Elevenlabs",
    "Przeczytaj",
    "Powiazane artykuly",
    "Powiązane artykuły",
    "Przeczytaj takze",
    "Przeczytaj także",
    "Zobacz rowniez",
    "Zobacz również",
    "Kup premium",
    "Subskrybuj premium",
    "Oferta partnerska",
    "Dźwięk został wygenerowany automatycznie i może zawierać błędy",
    "Źródło zdjęć:",
]
IMAGE_SRC_RE = __import__("re").compile(r"""(?is)<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Kontrolowana re-ekstrakcja wskazanych itemow z manifestu sampled real-queue.",
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--dry-run", action="store_true", help="Policz nowe wyniki bez zapisu do bazy.")
    parser.add_argument("--write", action="store_true", help="Zapisz nowe cleaned_html/content_text do bazy.")
    args = parser.parse_args()
    if args.dry_run and args.write:
        parser.error("Choose either --dry-run or --write, not both.")
    if not args.dry_run and not args.write:
        args.dry_run = True
    return args


def normalize_text(value: str | None) -> str:
    return " ".join((value or "").split())


def count_words_from_html(html: str | None) -> int:
    text = __import__("re").sub(r"<[^>]+>", " ", html or "")
    return len([part for part in text.split() if part.strip()])


def extract_image_sources(html: str | None) -> list[str]:
    return [match[0] or match[1] or match[2] for match in IMAGE_SRC_RE.findall(html or "")]


def match_forbidden_fragments(value: str | None, fragments: list[str]) -> list[str]:
    haystack = normalize_text(value).casefold()
    return [fragment for fragment in fragments if normalize_text(fragment).casefold() in haystack]


def match_forbidden_urls(urls: list[str], fragments: list[str]) -> list[str]:
    lowered = [url.casefold() for url in urls]
    return [fragment for fragment in fragments if any(fragment.casefold() in url for url in lowered)]


def load_manifest(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        raise FileNotFoundError(f"Manifest not found: {path}")

    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("items") or payload.get("entries") or []
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"Manifest {path} does not contain any items.")

    normalized: list[dict[str, object]] = []
    for index, raw_entry in enumerate(entries, start=1):
        entry = {"itemId": raw_entry} if isinstance(raw_entry, str) else dict(raw_entry or {})
        item_id = entry.get("itemId") or entry.get("id") or entry.get("item_id")
        if not item_id:
            raise ValueError(f"Manifest entry {index} is missing itemId.")
        min_word_count = entry.get("minWordCountApprox")
        normalized.append(
            {
                "index": index,
                "itemId": str(item_id),
                "label": entry.get("label"),
                "class": entry.get("class") or entry.get("kind") or "sample",
                "requireImage": bool(entry.get("requireImage")),
                "forbiddenTextFragments": list(entry.get("forbiddenTextFragments") or DEFAULT_FORBIDDEN_TEXT_FRAGMENTS),
                "forbiddenUrlFragments": list(entry.get("forbiddenUrlFragments") or []),
                "minWordCountApprox": int(min_word_count) if isinstance(min_word_count, (int, float)) else 40,
            }
        )
    return normalized


def fetch_manifest_rows(database_path: Path, item_ids: list[str]) -> dict[str, dict[str, object]]:
    placeholders = ", ".join("?" for _ in item_ids)
    with connect(database_path) as connection:
        rows = connection.execute(
            f"""
            SELECT
                id,
                channel_id,
                dedupe_key,
                source_url,
                title,
                excerpt,
                raw_html,
                cleaned_html,
                content_text,
                extraction_status
            FROM items
            WHERE id IN ({placeholders})
            """,
            item_ids,
        ).fetchall()

    return {str(row["id"]): dict(row) for row in rows}


def summarize_payload(
    *,
    cleaned_html: str | None,
    content_text: str | None,
    extraction_status: str | None,
    forbidden_text_fragments: list[str],
    forbidden_url_fragments: list[str],
) -> dict[str, object]:
    image_sources = extract_image_sources(cleaned_html)
    return {
        "extractionStatus": extraction_status,
        "hasCleanedContent": bool(cleaned_html),
        "cleanedHtmlWordCountApprox": count_words_from_html(cleaned_html),
        "imageCount": len(image_sources),
        "forbiddenTextFragmentsFound": sorted(
            set(
                match_forbidden_fragments(cleaned_html, forbidden_text_fragments)
                + match_forbidden_fragments(content_text, forbidden_text_fragments)
            )
        ),
        "forbiddenUrlFragmentsFound": sorted(set(match_forbidden_urls(image_sources, forbidden_url_fragments))),
        "contentPreview": normalize_text(content_text)[:280],
    }


def main() -> int:
    args = parse_args()
    settings = get_settings()
    manifest_entries = load_manifest(args.manifest)
    item_ids = [str(entry["itemId"]) for entry in manifest_entries]
    rows_by_id = fetch_manifest_rows(settings.database_file, item_ids)
    missing_ids = [item_id for item_id in item_ids if item_id not in rows_by_id]
    if missing_ids:
        raise SystemExit(f"Missing item ids in database: {missing_ids}")

    repository = ExtractionRepository(settings.database_file)
    service = ExtractionService(settings, repository)

    report: dict[str, object] = {
        "mode": "write" if args.write else "dry-run",
        "manifest": str(args.manifest),
        "database_path": str(settings.database_file),
        "items": [],
        "stoppedEarly": False,
    }

    with httpx.Client(
        follow_redirects=True,
        headers={"User-Agent": "rssmaster/0.1.0 (+local-first extract reprocess)"},
        timeout=settings.fetch_timeout_seconds,
    ) as client:
        for entry in manifest_entries:
            item_id = str(entry["itemId"])
            row = rows_by_id[item_id]
            candidate = ExtractionCandidate(
                id=item_id,
                channel_id=str(row["channel_id"]),
                dedupe_key=str(row["dedupe_key"]),
                source_url=str(row["source_url"]),
                title=str(row["title"]),
                excerpt=row["excerpt"],
                raw_html=row["raw_html"],
            )

            before_audit = summarize_payload(
                cleaned_html=row["cleaned_html"],
                content_text=row["content_text"],
                extraction_status=row["extraction_status"],
                forbidden_text_fragments=entry["forbiddenTextFragments"],
                forbidden_url_fragments=entry["forbiddenUrlFragments"],
            )
            result = service._extract_candidate(client=client, candidate=candidate)
            after_audit = summarize_payload(
                cleaned_html=result.cleaned_html,
                content_text=result.content_text,
                extraction_status=result.extraction_status,
                forbidden_text_fragments=entry["forbiddenTextFragments"],
                forbidden_url_fragments=entry["forbiddenUrlFragments"],
            )

            stop_reasons: list[str] = []
            if result.extraction_status != "completed":
                stop_reasons.append(f"extractionStatus={result.extraction_status}")
            if not result.cleaned_html:
                stop_reasons.append("hasCleanedContent=false")
            if after_audit["forbiddenTextFragmentsFound"]:
                stop_reasons.append(
                    f"forbiddenTextFragmentsFound={','.join(after_audit['forbiddenTextFragmentsFound'])}"
                )
            if after_audit["forbiddenUrlFragmentsFound"]:
                stop_reasons.append(
                    f"forbiddenUrlFragmentsFound={','.join(after_audit['forbiddenUrlFragmentsFound'])}"
                )
            if after_audit["cleanedHtmlWordCountApprox"] < entry["minWordCountApprox"]:
                stop_reasons.append(
                    f"cleanedHtmlWordCountApprox={after_audit['cleanedHtmlWordCountApprox']} < {entry['minWordCountApprox']}"
                )
            if entry["requireImage"] and after_audit["imageCount"] == 0:
                stop_reasons.append("required image missing after re-extraction")

            report["items"].append(
                {
                    "itemId": item_id,
                    "label": entry["label"],
                    "class": entry["class"],
                    "requireImage": entry["requireImage"],
                    "minWordCountApprox": entry["minWordCountApprox"],
                    "sourceUrl": row["source_url"],
                    "beforeAudit": before_audit,
                    "afterAudit": after_audit,
                    "stopReasons": stop_reasons,
                    "writeApplied": False,
                }
            )

            if stop_reasons:
                report["stoppedEarly"] = True
                break

            if args.write:
                repository.mark_running(item_id)
                repository.persist_result(item_id, result=result)
                report["items"][-1]["writeApplied"] = True

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    if report["stoppedEarly"]:
        print(f"[reextract_items] STOP: see {args.report}")
        return 1

    print(f"[reextract_items] PASS: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
