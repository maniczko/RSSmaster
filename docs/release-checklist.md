# Release checklist

This checklist is the implementation-near gate for calling the local RSSmaster runtime release-ready.

## 1. Interpret the green status correctly

Use these three evidence levels deliberately:

- `contract green`
  - command: `npm run check:contract`
  - proves: the in-process API contract and the core happy path covered by `scripts/check_api.py`
  - does not prove: that a live web/API runtime is healthy on `127.0.0.1:3000` and `127.0.0.1:8000`
- `fallback runtime green`
  - commands: `npm run qa:sources`, `npm run qa:reader`, `npm run qa:app`
  - proves: browser and runtime flows against a healthy local runtime, even if the harness had to reuse fallback ports like `3100/8100`
  - does not prove: a clean boot on the canonical default ports
- `canonical cold boot green`
  - command: `npm run qa:sources -- --cold-start`
  - proves: a real clean start on `127.0.0.1:3000` and `127.0.0.1:8000`
  - cleanup behavior: safely stops recognized RSSmaster runtimes from this repo on canonical and fallback ports before booting
  - does not prove: manual screen-reader sign-off or external delivery systems

## 2. Runtime boot truth

- Run `npm run check:ports`.
- Review `output/playwright/runtime-port-audit.json`.
- If you need a clean-start proof, run `npm run qa:sources -- --cold-start` instead of hand-starting the runtimes.
- If you need a manual boot check, run `npm run dev`.
- Confirm `http://127.0.0.1:3000/api/health` returns `status: ok`.
- Confirm `http://127.0.0.1:8000/health` returns `status: ok`.
- Confirm `http://127.0.0.1:8000/diagnostics/startup` reports `database_ready: true`.
- Confirm `python scripts/check_health.py` passes on the target runtime you are claiming is healthy.

## 3. Command matrix

| Command | Proves | Does not prove | Evidence |
| --- | --- | --- | --- |
| `npm run check:contract` | in-process contract smoke for feed add, sync, extraction, item mutation, digest, and delivery dry-run semantics | healthy live runtime, browser state, canonical ports | console output only |
| `python scripts/check_health.py` | live health and startup diagnostics for the runtime it is pointed at | the full product happy path | console output only |
| `npm run check:ports` | default port truth on `3000/8000`: free, healthy RSSmaster, stale RSSmaster, blocked non-RSSmaster, refused, timeout | browser UX, business flows, fallback runtime behavior | `output/playwright/runtime-port-audit.json` |
| `npm run check:capture` | browser smoke for the outside-app capture flow: `/capture` prefills, manifest share target, bookmarklet readiness, save success, saved-reader handoff, and note persistence | canonical cold boot, every publisher-specific article shape, spoken screen-reader behavior | `output/playwright/capture-smoke.json`, `output/playwright/capture-smoke.png` |
| `npm run check:continuity` | browser smoke for the manual continuity bundle flow: export from `/sources` backoffice, reader-context capture, bundle import, restored saved-reader route, restored local scroll progress, and replay of bundle-carried notes/tags/collections/saved searches | canonical cold boot, automatic multi-device transport, spoken screen-reader behavior | `output/playwright/continuity-smoke.json`, `output/playwright/continuity-smoke.png` |
| `npm run check:layout` | browser sweep of the main app shell on desktop/tablet/mobile with screenshots, overflow checks, primary-nav clickthrough, and representative state captures | screen-reader spoken behavior, canonical cold boot, every possible content state | `output/playwright/layout-qa.json`, `output/playwright/page-audit-*.png`, `output/playwright/page-audit-*-sidebar-collapsed.png`, `output/playwright/page-audit-*-menu-open.png` |
| `npm run qa:sources` | fallback-runtime `/sources` flow with unit/build/contract/health/browser smoke | canonical clean boot | `output/playwright/sources-qa.json`, `output/playwright/sources-a11y-smoke.json` |
| `npm run qa:sources -- --cold-start` | canonical clean boot plus `/sources` gate on `3000/8000` | reader sign-off, external delivery | `output/playwright/sources-cold-boot.json`, `output/playwright/sources-a11y-smoke.json` |
| `npm run qa:reader` | fallback-runtime reader gate with unit/build/health/browser smoke | canonical clean boot, manual screen-reader sign-off | `output/playwright/reader-qa.json`, `output/playwright/reader-rich-smoke.json` |
| `npm run check:reader:real-queue -- --phase before` | sampled real-queue audit of the current operator-local manifest before backfill | automatic cleanup by itself, canonical cold boot, full publisher coverage | `output/playwright/inbox-article-audit-before.json`, `output/playwright/reader-real-queue-manifest.json` |
| `python scripts/reextract_items.py --manifest output/playwright/reader-real-queue-manifest.json --write` | sampled, stop-on-failure re-extraction for the operator-local manifest | mass reprocessing, canonical cold boot, browser proof | `output/playwright/reextract-items-report.json` |
| `npm run check:reader:real-queue -- --phase after` | sampled real-queue audit after backfill, including per-item forbidden fragment, forbidden URL, image, and word-count invariants | canonical clean boot, full publisher coverage | `output/playwright/inbox-article-audit-after.json`, `output/playwright/inbox-article-audit-after-*.png` |
| `npm run qa:app` | aggregated contract + `/sources` + reader + capture confidence with one summary | canonical clean boot by itself | `output/playwright/app-qa.json` |

## 4. Automated verification

- Run `npm run build`.
- Run `npm run check:contract`.
- Run `python scripts/check_health.py` on the runtime you are claiming is healthy.
- Run `npm run check:layout` when the change touches shell layout, spacing, button rhythm, or responsive polish.
  - review both the route sweep screenshots and the representative state screenshots
- Run `npm run check:capture` when the change touches `/capture`, outside-app read-later handoff, bookmarklet entry, or manifest share-target behavior.
- Run `npm run check:continuity` when the change touches portability, continuity bundle export/import, reader route restore, or manual cross-device handoff.
- Run `npm run qa:sources` when the change touches `/sources`, source onboarding, keyboard ergonomics, or preview race handling.
- Run `npm run qa:reader` when the change touches extraction, article capture, cleaned reading, or reader HTML rendering.
- Run `npm run check:reader:real-queue -- --phase before`, then `python scripts/reextract_items.py --manifest output/playwright/reader-real-queue-manifest.json --write`, then `npm run check:reader:real-queue -- --phase after` when the change touches extraction cleanup, publisher-specific reader noise, or sampled backfill rollout.
- Run `npm run qa:app` when you want a single aggregated report for cross-app release confidence.
- Treat any failure in `scripts/check_api.py`, `check:capture`, `qa:sources`, `qa:reader`, or `qa:app` as a release blocker for the covered flow.
- Treat any failure in `check:reader:real-queue -- --phase after` or any stop condition in `scripts/reextract_items.py` as a rollout blocker for sampled backfill.

Current automated coverage:

- channel add flow with direct feed validation and homepage autodiscovery
- `/sources` website flow smoke for keyboard reachability, live announcements, stale preview guards, calm expected preview failures, multiple candidates, and backoffice focus continuity
- `/sources` observe flow, already-followed state, and baseline tablet/mobile render smoke
- sync run creation, partial failure handling, rerun recovery, and deduplication
- extraction from real article pages into `cleaned_html` and `content_text`
- outside-app capture with prefilled `/capture`, manifest share target, bookmarklet readiness, saved-reader handoff, and persisted capture notes
- manual continuity bundle export/import with restored saved-reader route, restored local scroll progress, and replay of bundle-carried notes/tags/collections/saved searches
- cleaned reader rendering with article images, captions, quotes, lists, headings, and absolutized links
- sampled real-queue reader audits with manifest-level `forbiddenTextFragments`, `forbiddenUrlFragments`, `requireImage`, and `minWordCountApprox`
- cleaned reader toolbar keyboard reachability for the back action and notes toggle
- item detail plus list filters for channel, category, state, digest candidate, metadata search, and time windows
- read, save, unsave, archive-history, and baseline page-envelope verification for the current filter-based library model
- digest preview/build/history
- delivery settings save and preflight
- delivery preflight and dry-run dispatch with persisted logs
- schema integrity for `channels`, `items`, `settings`, `job_runs`, `digest_history`, and `delivery_logs`
- app-level aggregation of contract green plus fallback runtime green through `npm run qa:app`

## 5. Manual operator smoke

- Open `http://127.0.0.1:3000/` or the fallback runtime URL if that is the environment under test.
- If the runtime already has local accounts enabled, verify login before judging the library state.
- If you are claiming continuity with a pre-auth library, create the first account and confirm it claims the existing workspace instead of starting empty.
- Add at least one feed from the UI.
- Trigger a manual sync.
- Confirm the reader list shows imported items.
- Toggle `read`, `favorite`, and digest selection from the UI.
- Confirm counts and channel state reconcile after changes.
- If accessibility is in scope, run `docs/runbooks/a11y-screen-reader-signoff.md`, fill `docs/templates/a11y-screen-reader-evidence-template.md`, and save the completed notes under `output/playwright/a11y-screen-reader-signoff-YYYY-MM-DD.md`.

## 6. Data integrity checks

- `items.cleaned_html` should be populated for feeds whose article pages are reachable and readable.
- `items.extraction_status` should not stay stuck at `running`.
- `job_runs` should show the latest sync history with terminal states.
- `channels.unread_count` should reconcile with item read state after mutations.

## 7. Blocking gaps before full MVP release

These are still release blockers for the full PRD loop, even if the current automated suite is green:

- real SMTP send path is implemented but not covered by automated checks against a live mail server
- no automated proof exists yet for a real Kindle inbox accepting and rendering the sent EPUB
- manual screen-reader sign-off in NVDA or Narrator fallback on Windows, plus optional VoiceOver parity, is still separate from browser automation
- `npm run qa:app` proves contract green plus fallback runtime green, but canonical cold boot still requires `npm run qa:sources -- --cold-start`

Interpretation:

- current runtime can be called release-ready for local ingest, extraction, reader triage, digest packaging, and delivery dry-runs when contract green and the relevant runtime/browser gates are green
- current runtime still needs live SMTP and Kindle acceptance proof before being called fully release-ready for the PRD's final send promise
