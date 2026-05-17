# Kindle magazine model

Linear anchor: `VAT-255`

This document defines the functional model for RSSmaster magazine issues. It keeps the current V1 implementation honest while leaving a clear migration path for a richer Kindle Magazine product.

## Product intent

The magazine is a concrete issue archive, not another feed queue.

A user should see and understand:

- a list of issues such as `Wydanie 1/2026`
- the opened issue title, date, status, artifact, and article count
- the exact article snapshot included in that issue
- sections grouped by source first, then category when source metadata is missing
- issue-level delivery actions for preflight, dry-run, and send

## V1 implementation model

V1 is digest-backed. It uses `digest_history` as the source of truth and projects those rows into magazine issues in the frontend.

| Magazine concept | V1 source |
| --- | --- |
| issue id | `digest_history.id` |
| issue status | `digest_history.status` |
| issue title | `digest_history.title` |
| issue date | `generated_at`, then `sent_at`, then `created_at` |
| issue period | `period_start`, `period_end` |
| article count | `article_count` |
| article snapshot | `selection_snapshot_json` |
| category summary | `category_summary_json` |
| Kindle-ready artifact | `artifact_path`, `artifact_sha256` |
| delivery evidence | `delivery_logs` filtered by `digest_id` |
| build run evidence | `job_runs` linked through `job_run_id` |

This lets `/magazines` behave as a magazine archive without adding a new table before the issue model needs independent lifecycle fields.

## V1 schedule settings

Magazine schedule and generation preferences are stored in `settings.key = "magazine_profile"` and exposed through:

- `GET /api/v1/settings/magazine`
- `PATCH /api/v1/settings/magazine`
- `POST /api/v1/settings/magazine/preflight`

The V1 profile contains `frequency`, `timezone`, `time_of_day`, `day_of_week`, `article_limit`, `source_scope`, `output_format`, and `kindle_delivery_enabled`.

These settings are readiness and operator evidence for magazine generation. They do not create a background daemon by themselves; due-run detection and actual scheduler orchestration are tracked separately.

The `/magazines` screen must expose this profile as a first-class panel named `Harmonogram wydań`. Users should be able to save the profile and run schedule preflight from the magazine archive without switching to generic settings. This keeps the product surface issue-first while making the next issue workflow explicit.

## Issue numbering

V1 issue numbers are deterministic UI labels.

- Group issues by UTC year derived from issue date.
- Sort issues in each year by date ascending, then id ascending.
- Assign sequence numbers starting at `1`.
- Render labels as `Wydanie N/YYYY`.
- The newest issue in a year therefore has the highest number.

This policy avoids unstable labels when the UI receives history rows ordered newest-first.

## Article grouping

The opened issue groups articles from `selection_snapshot_json`.

Grouping order:

1. Use `channel_title` and `channel_id` when present.
2. Fall back to `category`.
3. Use `Bez kategorii` only when neither source nor category is useful.

Each article row should preserve:

- original position in the issue
- local `magazine_score` and short `ranking_reason` when produced by the digest selector
- title
- source URL
- channel/source label
- category
- author when available
- excerpt or saved reading content
- word count when available

## V1 generation behavior

V1 generation reuses the digest build path:

1. User marks articles as digest candidates or selects explicit items.
2. Backend oversamples persisted candidates and applies deterministic local ranking: unread/favorite state, digest-candidate state, readability/word count, title quality, relative freshness, deduplication, and source diversity.
3. Backend builds a digest through `/api/v1/digests/build`.
4. Backend writes one `job_runs` row with `job_type='digest'`.
5. Backend writes one `digest_history` row with immutable selection snapshot.
6. Backend writes the EPUB artifact and SHA-256. The V1 EPUB uses a conservative Kindle-friendly package: uncompressed first `mimetype`, OPF/NCX metadata, article-aware table of contents, category sections, per-article anchors, and no JavaScript.
7. `/magazines` lists the resulting row as a concrete issue.

The generated issue must remain readable even if feed source metadata or current item state changes later.

## Delivery behavior

Issue delivery reuses the existing delivery surface:

- `POST /api/v1/delivery/preflight`
- `POST /api/v1/delivery/send`
- `GET /api/v1/delivery/logs?digest_id=<issue_id>`

Delivery actions must operate on the opened issue, not the visible reader queue.

Automated evidence currently covers preflight and dry-run. Live SMTP and Kindle inbox acceptance remain manual evidence.

## V2 durable model

Add dedicated magazine tables only when the product needs lifecycle semantics that cannot be represented by `digest_history`.

Recommended V2 entities:

| Entity | Responsibility |
| --- | --- |
| `magazine_configs` | schedule, timezone, enabled state, source scope, section policy |
| `magazine_issues` | durable issue number, year, title, period, status, artifact links |
| `magazine_sections` | ordered issue sections and editorial labels |
| `magazine_issue_articles` | immutable article membership, order, source/category snapshot |
| `magazine_runs` | optional richer run metadata if `job_runs` becomes too generic |

V2 migration rule:

- Do not delete or reinterpret historical `digest_history`.
- Backfill `magazine_issues` from digest rows only when labels/statuses must become durable.
- Keep `digest_history` as artifact and packaging history unless a later ADR replaces it.

## Verification

Relevant automated checks:

- `npm run check:magazines`
- `npm run check:archive`
- `npm run check:orchestration`
- `python scripts/check_api.py`

`npm run check:archive` emits a `quality_report` in `output/digest-archive-check.json`. The report validates candidate count, deduplicated candidates, selected source diversity, persisted archive metadata, delivery artifact inspectability, and EPUB structure.

Known manual gaps:

- live SMTP send
- Kindle inbox acceptance and rendering
- spoken screen-reader sign-off for the magazine archive

## Non-goals for V1

- no hosted scheduler
- no object storage
- no AI editorial scoring required
- no separate magazine database tables
- no live delivery in automated tests
