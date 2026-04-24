# RSSmaster Project Audit - 2026-04-23

## Executive Summary

This audit consolidates fresh runtime checks, current QA artifacts, repo inspection, and parallel reviewer findings into one evidence-based project snapshot.

Current headline state:

| Signal | Status | Evidence |
| --- | --- | --- |
| API contract confidence | Green | `npm run check:contract`, `python scripts/check_api.py`, `output/playwright/app-qa.json` |
| Reader and source feature slices | Green in isolation | `npm run qa:reader`, `npm run qa:sources`, `output/playwright/reader-qa.json`, `output/playwright/sources-qa.json` |
| Extraction cleanup slice | Green on sampled real queue | `output/playwright/inbox-article-audit-after.json`, `output/playwright/reextract-items-report.json` |
| Canonical cold boot proof | Partially green | `npm run qa:sources -- --cold-start` passed and wrote `output/playwright/sources-cold-boot.json` |
| Full app release bundle | Not green | `npm run qa:app` failed; latest `output/playwright/app-qa.json` has `fallback_runtime_green=false` |
| Manual accessibility sign-off | Not done | `VAT-135`, release checklist, screen-reader evidence remains pending |
| Live multi-device sync | Not implemented | `VAT-97`, continuity roadmap still describes manual portability rather than live sync |

The strongest parts of RSSmaster today are:

- local-first reader and source-management fundamentals
- contract-driven backend and rich regression harnesses
- strong sampled extraction cleanup and in-app reading fidelity
- good continuity foundations inside a single device and a manual portability bundle

The weakest parts today are:

- app-level QA orchestration stability
- clear release-truth around canonical vs fallback runtime
- drift between docs and the actual knowledge/persistence model
- incomplete accessibility closure and incomplete live sync semantics

## Strengths Worth Preserving

| Area | Status | Severity | Confidence | Owner surface | Evidence | Recommended next step |
| --- | --- | --- | --- | --- | --- | --- |
| Contract and envelope discipline | dziala dobrze | P3 | verified | `api` | `python scripts/check_api.py` passed; `output/playwright/app-qa.json` has `contract_green=true` | Keep `check:contract` as the non-negotiable backend release gate. |
| Source onboarding and operator workflow | dziala dobrze | P3 | verified | `web` | `npm run qa:sources` passed; `output/playwright/sources-qa.json`; `/sources` a11y snapshots and screenshots | Use `/sources` as the benchmark surface for CTA hierarchy, empty states, and operator guidance. |
| Reader feature slice | dziala dobrze | P3 | verified | `web` | `npm run qa:reader` passed; `output/playwright/reader-qa.json`; `output/playwright/reader-rich-smoke.json` | Preserve current continuity, keyboard-first behavior, and cleaned reader shell while polishing weaker screens. |
| Extraction cleanup on sampled real content | dziala dobrze | P2 | verified | `extraction` | `output/playwright/inbox-article-audit-after.json` shows `auditedCount=7`, `withNoise=0`, `withImages=7`; `output/playwright/reextract-items-report.json` shows no stop reasons | Keep sampled real-queue backfill as the release gate for extraction changes. |
| Manual portability bundle plus knowledge replay | dziala dobrze | P2 | verified | `api` | previous continuity contract and code plus `output/playwright/app-qa.json` coverage map; continuity roadmap describes manual portability | Keep this described as manual portability, not live sync. |
| Runtime diagnostics and port audit tooling | dziala dobrze | P3 | verified | `QA` | `python scripts/check_runtime_ports.py`; `output/playwright/runtime-port-audit.json`; startup diagnostics payloads in QA artifacts | Continue using startup diagnostics and port audit as first-line triage tools. |
| Mobile/tablet layout sanity on audited routes | dziala dobrze | P3 | verified | `web` | existing `output/playwright/layout-browser-breakpoints.json` and page audit screenshots | Keep `check:layout` in the UI safety net once runtime orchestration is stabilized. |

## Improvement Opportunities

| Area | Status | Severity | Confidence | Owner surface | Evidence | Recommended next step |
| --- | --- | --- | --- | --- | --- | --- |
| Read-surface empty states and top-level view differentiation | mogloby dzialac lepiej | P2 | verified | `web` | `page-audit-read-inbox-desktop.png`, `page-audit-read-continue-desktop.png`, `page-audit-read-saved-desktop.png`, `page-audit-read-archive-desktop.png` | Give each `/read/*` surface a stronger purpose-specific empty state, CTA ladder, and copy hierarchy. |
| `/discover` productization | mogloby dzialac lepiej | P2 | verified | `web` | `page-audit-discover-desktop.png`, current shell composition in `apps/web/app/channel-lab.tsx` | Make ranking/story surfaces feel like decision tools rather than a neutral workbench. |
| Keyboard discoverability and app-wide skip affordances | mogloby dzialac lepiej | P2 | strong inference | `web` | keyboard handlers exist in `apps/web/app/channel-lab.tsx`, but skip-link affordances are strongest on `/sources`, not system-wide | Add a consistent shortcut-help entry point and a global skip-to-main/primary-action path. |
| Reader content condensation | mogloby dzialac lepiej | P2 | verified | `extraction` | sampled queue still starts some excerpts with category/meta chrome; real `XYZ` cases keep some wrapper noise and duplicate quote prose | Add a thin condensation pass for meta-first excerpts, empty wrappers, and quote-aware `content_text` dedupe. |
| Documentation drift around annotations and persistence | mogloby dzialac lepiej | P2 | verified | `docs` | `docs/prd.md` still frames annotations as a non-goal, while the repo ships notes/annotations; `docs/storage-schema.md` lags behind actual tables | Update PRD/storage docs so they describe the current local knowledge workflow and actual durable tables. |
| Real-queue sampling policy | mogloby dzialac lepiej | P3 | verified | `docs` / `QA` | runbooks describe sampled backfill, but do not clearly define how to choose the next manifest batch | Document the operator policy for picking the next 5-8 representative real articles. |
| Startup truth clarity | mogloby dzialac lepiej | P2 | verified | `docs` / `QA` | startup diagnostics expose canonical config values; fallback runtime can still be healthy on alternate ports | Make docs and diagnostics more explicit about canonical config vs effective runtime endpoint. |

## Broken Or Incomplete Items

| Area | Status | Severity | Confidence | Owner surface | Evidence | Backlog mapping | Recommended next step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full app release bundle is unstable | nie dziala / nie jest domkniete | P1 | verified | `QA` | `npm run qa:app` failed; latest `output/playwright/app-qa.json` shows `fallback_runtime_green=false`, `capture_smoke.status=failed`, `continuity_smoke.status=failed` with `TypeError: fetch failed` | Existing umbrella: `VAT-97` is the closest continuity/release-quality container | Audit `scripts/run_app_qa.py`, `scripts/run_sources_qa.py`, and `scripts/run_reader_qa.py` together; preserve a shared runtime or avoid tearing it down before `check:capture` and `check:continuity`. |
| Continuity QA is not stable enough to be a release truth source | nie dziala / nie jest domkniete | P1 | verified | `QA` / `web` | standalone `check:continuity` failed twice in this audit, first on stored progress timeout and then on startup `fetch failed`; `output/playwright/continuity-smoke.json` now records a failed startup step | Existing umbrella: `VAT-97` | Separate runtime dependency failures from continuity logic failures and stabilize the check before using it as release truth. |
| Manual screen-reader sign-off is still missing | nie dziala / nie jest domkniete | P1 | verified | `docs` / `QA` | release checklist and prior evidence still mark manual sign-off as pending | Existing blocker: `VAT-135` | Complete the real Narrator/NVDA spoken pass on `/sources` and `/read/saved`. |
| Live multi-device sync does not exist | nie dziala / nie jest domkniete | P1 | verified | `api` / `product` | continuity roadmap still describes manual portability, not live transport or conflict handling | Existing umbrella: `VAT-97` | Keep current shipped scope labeled as manual portability; do not over-claim cross-device sync. |
| Persistence model is split across `workspace`, `library`, and `annotations` tracks | nie dziala / nie jest domkniete | P1 | verified | `api` / `docs` | current API and schema expose `workspace/*`, `library/*`, `annotations/*`, `library_*`, `highlight_*`, and legacy/shared tables without one clear canonical model | Not cleanly tracked; should be reviewed before creating a new issue | Decide on one canonical knowledge persistence model and then align contract docs, continuity payloads, and smoke coverage to it. |
| Contract docs do not fully cover live `library/*` and `annotations/*` surfaces | nie dziala / nie jest domkniete | P2 | verified | `docs` / `api` | `docs/api-contract.md` is still strongest on `workspace/*`; live routes in startup diagnostics include `library/*` and `annotations/*` | Documentation/contract debt; likely no new ticket if rolled into the persistence-model cleanup | Either document these routes as first-class contract surfaces or explicitly mark them as internal/non-canonical. |
| Canonical cold boot is proven only for the sources slice, not the whole app bundle | nie dziala / nie jest domkniete | P2 | verified | `QA` | `npm run qa:sources -- --cold-start` passed and wrote `output/playwright/sources-cold-boot.json`, but `qa:app` does not encode cold-start proof and still fails later in the bundle | Release evidence gap, not a separate product feature | Keep cold-start proof separate and avoid conflating one green slice with full release confidence. |

## Evidence Snapshot

### Commands run in this audit

- `npm run build`
- `python scripts/check_api.py`
- `python scripts/check_health.py`
- `python scripts/test_api_unit.py`
- `npm run test:unit`
- `npm run health`
- `cmd /c "set RSSMASTER_WEB_URL=http://127.0.0.1:3000&& set RSSMASTER_API_URL=http://127.0.0.1:8100&& npm run check:capture"`
- `cmd /c "set RSSMASTER_WEB_URL=http://127.0.0.1:3000&& set RSSMASTER_API_URL=http://127.0.0.1:8100&& npm run check:sources"`
- `cmd /c "set RSSMASTER_WEB_URL=http://127.0.0.1:3000&& set RSSMASTER_API_URL=http://127.0.0.1:8100&& npm run check:reader"`
- `cmd /c "set RSSMASTER_WEB_URL=http://127.0.0.1:3000&& set RSSMASTER_API_URL=http://127.0.0.1:8100&& npm run check:reader:real-queue"`
- `cmd /c "set RSSMASTER_WEB_URL=http://127.0.0.1:3000&& set RSSMASTER_API_URL=http://127.0.0.1:8100&& npm run check:continuity"` twice
- `npm run qa:reader`
- `npm run qa:sources`
- `npm run qa:app`
- `npm run qa:sources -- --cold-start`

### Key artifacts used

- `output/playwright/app-qa.json`
- `output/playwright/sources-qa.json`
- `output/playwright/sources-cold-boot.json`
- `output/playwright/reader-qa.json`
- `output/playwright/reader-rich-smoke.json`
- `output/playwright/capture-smoke.json`
- `output/playwright/continuity-smoke.json`
- `output/playwright/inbox-article-audit-after.json`
- `output/playwright/reextract-items-report.json`
- `output/playwright/runtime-port-audit.json`

## Audit Conclusion

RSSmaster is strong where it matters most for a local-first reader:

- source onboarding
- cleaned in-app reading
- sampled extraction cleanup
- contract-driven backend behavior
- diagnostics and recovery tooling

RSSmaster is not yet honestly release-complete because the project still has four meaningful closure gaps:

1. the full app QA bundle is unstable
2. continuity QA is not trustworthy enough yet
3. accessibility sign-off is still manual and still pending
4. live sync remains a roadmap item, not a shipped capability

If the goal is an honest product statement today, the right claim is:

> RSSmaster has a strong local-first reader core with green source and reader slices, green sampled extraction cleanup, and a solid contract layer, but it still needs QA-bundle stabilization, final accessibility sign-off, and clearer knowledge-model convergence before it can be called fully release-ready.
