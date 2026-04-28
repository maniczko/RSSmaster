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
10. If you want one aggregated report for the app slice covered today, run `npm run qa:app`.
11. Open `http://127.0.0.1:3000/` or the fallback runtime URL under test.
12. Add a test feed from the UI and trigger a manual sync.
13. Confirm imported items appear and can be triaged.
14. Use the digest section to preview and build an EPUB.
15. Use the delivery section to save SMTP/Kindle settings and run a dry-run send.

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
  - does not replace `npm run qa:sources -- --cold-start`
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

## Known non-covered areas

This runbook still stops short of a true external send guarantee:

- real SMTP server acceptance with current credentials
- Kindle inbox acceptance and EPUB rendering on Amazon's side
- browser-automated verification of the full keyboard-first reader shell outside the current focused reader smoke
- manual screen-reader sign-off, which still lives in `docs/runbooks/a11y-screen-reader-signoff.md`

Use `docs/release-checklist.md` as the source of truth for final release gating.
