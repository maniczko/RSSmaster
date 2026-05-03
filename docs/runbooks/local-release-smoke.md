# Local release smoke

This runbook is the fastest path to verify the local rssmaster runtime after a meaningful backend or UI change.

## Goal

Prove that the currently implemented product loop still works:

1. discover or accept a feed
2. sync entries
3. extract readable article content
4. surface items in the reader shell
5. mutate read, favorite, and digest-candidate state safely
6. build a local digest artifact
7. run delivery preflight or dry-run dispatch

## Fast path

1. Run `npm run bootstrap`.
2. Run `npm run check:ports`.
3. Run `npm run dev` if you want a manual runtime session, or let the QA harnesses boot their own runtimes.
4. Run `npm run check`.
5. If the change touched `/sources`, run `npm run qa:sources` or follow `docs/runbooks/sources-test-plan.md`.
6. If the change touched local auth, account-scoped storage, login/logout, or protected API guards, run `npm run check:auth`.
7. If the change touched `/capture`, bookmarklet/share-target behavior, or outside-app read-later handoff, run `npm run check:capture` or follow `docs/runbooks/capture-test-plan.md`.
8. If the change touched continuity bundles, manual portability, or saved-reader restore, run `npm run check:continuity` or follow `docs/runbooks/continuity-test-plan.md`.
9. If the change touched extraction, capture, or in-app reading, run `npm run qa:reader` or follow `docs/runbooks/reader-test-plan.md`.
10. If the change touched digest candidate selection or EPUB build from `/digest`, run `npm run check:digest`.
11. If you want one aggregated report for the app slice covered today, run `npm run qa:app`.
12. If you need one timestamped 9/10 release evidence bundle, run `npm run release:evidence`.
13. Open `http://127.0.0.1:3000/` or the fallback runtime URL under test.
14. Add a test feed from the UI and trigger a manual sync.
15. Confirm imported items appear and can be triaged.
16. Use the digest section to preview and build an EPUB.
17. Use the delivery section to save SMTP/Kindle settings and run a dry-run send.
18. Open an article and confirm the `Wyślij na Kindle` action is visible; without delivery settings it should show configuration guidance instead of creating a send attempt.
19. For a real external send, follow `docs/runbooks/live-delivery-signoff.md` and store completed evidence under ignored `output/live-delivery/`.

## What the commands mean

- `npm run check:contract`
  - proves the core happy path in-process through `scripts/check_api.py`
  - does not prove a healthy live runtime on `3000/8000`
- `npm run qa:sources`
  - proves the `/sources` flow against a healthy local runtime, including fallback ports when needed
  - does not prove a canonical cold boot
- `npm run qa:reader`
  - proves the cleaned reader flow against a healthy local runtime, including fallback ports when needed
  - does not prove a canonical cold boot
- `npm run check:auth`
  - proves the local auth MVP flow against an isolated runtime: no-account first registration, protected app open, logout, login, invalid password feedback, and 401 auth-required guard
  - writes all auth control DBs and per-account workspace DBs under `output/playwright/auth-smoke/`
  - does not prove canonical cold boot, multi-account migration, password manager integration, or long-lived session expiry
- `npm run check:capture`
  - proves the outside-app capture flow against a healthy local runtime, including prefilled `/capture`, bookmarklet readiness, manifest share target, saved-reader handoff, and note persistence
  - does not prove a canonical cold boot
- `npm run check:continuity`
  - proves the manual continuity bundle flow against a healthy local runtime, including export from `/sources` backoffice, restored reader route, and restored local reading progress
  - does not prove a canonical cold boot or automatic multi-device sync
- `npm run qa:app`
  - aggregates contract green plus the `/sources`, reader, capture, and continuity gates into one summary
  - writes per-flow timeout metadata and artifact freshness to `output/playwright/app-qa.json`
  - treats a harness timeout as `status: timeout`, separate from a product/gate failure
  - does not replace `npm run qa:sources -- --cold-start`
- `npm run check:layout`
  - verifies desktop/tablet/mobile layout, one clear `h1` per main route, main/header/nav landmarks, skip-link wiring, primary navigation clickthrough, and a short keyboard Tab reachability probe
  - records raw console noise and blocking console errors separately in `output/playwright/layout-qa.json`
  - still requires manual screen-reader spoken sign-off for release-grade accessibility claims
- `npm run check:digest`
  - starts an isolated runtime, creates a fixture feed, marks one persisted digest candidate, opens `/digest` with an active search filter, previews, builds EPUB, and verifies digest history
  - writes `output/playwright/digest-smoke/digest-smoke.json` and `output/playwright/digest-smoke/digest-smoke.png`
  - does not prove live SMTP/Kindle acceptance
- `npm run release:evidence`
  - runs the 9/10 confidence bundle: ports, health, build, unit tests, API contract, auth-aware browser checks, perf checks, stale artifact review, and known unverified external checks
  - writes timestamped JSON and Markdown under `output/release-evidence/`
  - supports `-- --reuse-fresh` when the relevant component gates were just run and you only need a fresh summary wrapper
- `npm run check:perf:browser` and `npm run check:perf:workspace`
  - default to isolated, logged-in local accounts so performance evidence stays auth-aware without mutating the operator library
  - record cold and warm browser route-ready p95/p99 plus authenticated workspace API p95/p99
  - append historical trend lines under `output/playwright/perf-history/`
- `npm run qa:sources -- --cold-start`
  - is the canonical local boot proof for `127.0.0.1:3000` and `127.0.0.1:8000`
  - safely stops recognized RSSmaster runtimes from this repo on canonical and fallback ports before booting
  - fails deliberately when another process blocks a default port

## What `npm run check` proves today

- feed discovery works for direct URLs, homepage metadata, and heuristic fallback
- sync runs persist, recover from partial failure, and deduplicate repeated entries
- extraction fetches source article pages and writes cleaned content into SQLite
- reader browser smoke proves cleaned HTML can render with rich formatting and article media
- reader QA proves runtime health plus basic keyboard reachability for the cleaned reader toolbar
- item API supports detail reads, search, category/channel filters, unread/saved baseline library views, and time-window filters
- saved, unsaved, read, and archived-history flows reconcile correctly on the current filter-based library model
- list responses keep returning a stable page envelope so cursor pagination can land without rewriting the smoke harness from scratch
- local auth has a covered MVP browser path without touching real operator data under `data/`
- settings, digest, and delivery endpoints persist state and logs
- dry-run delivery proves the end-to-end local loop without needing a live SMTP server

## If `npm run check` fails

### Feed discovery failures

- Check `http://127.0.0.1:8000/diagnostics/startup`.
- Confirm the API process started with the expected `.env`.
- Verify no local port conflict is shadowing the FastAPI process.

### Sync failures

- Inspect the latest rows in `job_runs`.
- Look at `channels.last_error_code` and `channels.last_error_message`.
- Re-run with a direct feed URL first to separate discovery failures from ingestion failures.

### Extraction failures

- Inspect `items.extraction_status` and `items.extraction_error`.
- Confirm the source article URL is reachable and returns `text/html`.
- Confirm the article body is long enough to survive the bounded cleaner.

### UI looks empty after a healthy API

- Confirm `http://127.0.0.1:3000/api/health` returns `status: ok`.
- Confirm the homepage is talking to `http://127.0.0.1:8000`.
- Refresh after a completed sync because item state is only visible once backend persistence succeeds.

### Aggregate QA looks green but evidence is suspect

- Open `output/playwright/app-qa.json`.
- Confirm `overall_status` is `passed`.
- Confirm every `flows.*.status` is `passed`, not `timeout`.
- Confirm `artifact_freshness.all_required_fresh` is `true`.
- If a flow timed out, use its `next_diagnostic_command` and rerun that component gate directly before judging the product.

## Known non-covered areas

This runbook still stops short of a true external send guarantee:

- real SMTP server acceptance with current credentials
- Kindle inbox acceptance and EPUB rendering on Amazon's side
- browser-automated verification of the full keyboard-first reader shell outside the current focused reader smoke
- manual screen-reader sign-off, which still lives in `docs/runbooks/a11y-screen-reader-signoff.md`

Use `docs/runbooks/live-delivery-signoff.md` and `docs/runbooks/live-delivery-evidence-template.md` for the manual SMTP/Kindle evidence path.

Use `docs/release-checklist.md` as the source of truth for final release gating.
