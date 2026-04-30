# RSSmaster code ownership map

Linear anchor: RSSmaster 9/10 product hardening.

This document is the repo-local ownership contract for cleaning up RSSmaster. It prevents future refactors from moving complexity around without naming the owner, boundary, verification gate, and expected quality score.

Machine-readable source: `docs/code-ownership.json`.

## Baseline

- Current architecture/code ownership score: **5/10**.
- Target after the cleanup program: **9/10**.
- Main reason for the current score: `channel-lab.tsx` and `workspace/service.py` still own too many workflows.
- Required direction: each mechanism gets one canonical owner; compatibility facades can aggregate but must not become domain owners.

## Ownership rules

1. A domain owner owns behavior, persistence semantics, tests, and docs for that mechanism.
2. A facade may compose domain outputs for UI convenience, but it must delegate mutations and business rules.
3. A browser-facing flow must have a unit/API gate and a browser smoke gate before it is considered stable.
4. A refactor is not complete if it reduces line count but leaves ownership ambiguous.
5. New stable routes, schemas, or operator workflows must update this map or explain why no owner changed.

## Mechanism owners

| Mechanism | Canonical owner | Current | Target | Boundary |
| --- | --- | ---: | ---: | --- |
| `auth` | `apps/api/app/auth` | 7.0 | 9.0 | Local accounts, cookies, sessions, account workspace resolution. |
| `reader` | `apps/web/app/features/reader` | 5.0 | 9.0 | Queue, article surface, triage, continuity, reading quality, empty states. |
| `sources` | `apps/api/app/channels` + `apps/api/app/source_management` | 6.0 | 9.0 | Feed onboarding, autodiscovery, OPML, source controls, source health. |
| `library` | `apps/api/app/library` | 5.0 | 9.0 | Tags, collections, saved searches, library retrieval surfaces. |
| `annotations` | `apps/api/app/annotations` | 6.0 | 9.0 | Highlights, notes, annotation hub, knowledge capture. |
| `digest` | `apps/api/app/digests` + `apps/api/app/delivery` | 7.0 | 9.0 | Persisted candidates, preview/build/history, preflight/logs. |
| `capture` | Capture UI + capture API adapter | 6.0 | 9.0 | URL capture, note handoff, saved-reader recovery. |
| `ranking_stories` | `apps/api/app/ranking` + `apps/api/app/stories` | 6.0 | 8.5 | Ranking pipeline, story clusters, briefing signals. |
| `workspace_facade` | `apps/api/app/workspace` | 4.0 | 8.5 | Compatibility and UI aggregation only. |
| `storage_migrations` | `apps/api/app/db` | 7.0 | 9.0 | SQLite schema, migrations, startup readiness. |
| `qa_harness` | `scripts` + release docs | 6.0 | 9.0 | Release gates, browser smokes, perf, artifacts. |

## Refactor sequence

1. Stabilize with `npm run build`, `npm run test:unit`, `python scripts/check_api.py`, and `python scripts/check_health.py`.
2. Extract typed web API client and reader state from `channel-lab.tsx`.
3. Move source preview/add/sync orchestration behind the `sources` owner.
4. Convert `workspace` into a thin delegation layer.
5. Consolidate duplicate library storage paths.
6. Split QA harnesses into route manifest validation plus focused smoke sections.

## Verification

- Ownership map integrity: `npm run check:ownership`.
- Fast implementation gate: `npm run build`, `npm run test:unit`, `python scripts/check_api.py`, `python scripts/check_health.py`.
- User-facing reader/source changes: add `npm run check:reader`, `npm run check:reader:interaction`, and `npm run check:sources`.
- Release confidence: `npm run check`, `npm run health`, `npm run release:evidence`.

## Review cadence

Re-score this map after every cleanup phase. A score can improve only when ownership becomes clearer and the verification gate proves parity; line-count reduction alone is not enough.
