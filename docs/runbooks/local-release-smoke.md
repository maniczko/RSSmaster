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
2. Run `npm run dev`.
3. In a second shell, run `npm run check`.
4. Open `http://127.0.0.1:3000/`.
5. Add a test feed from the UI and trigger a manual sync.
6. Confirm imported items appear and can be triaged.
7. Use the digest section to preview and build an EPUB.
8. Use the delivery section to save SMTP/Kindle settings and run a dry-run send.

## What `npm run check` proves today

- feed discovery works for direct URLs, homepage metadata, and heuristic fallback
- sync runs persist, recover from partial failure, and deduplicate repeated entries
- extraction fetches source article pages and writes cleaned content into SQLite
- item API supports detail reads, search, category/channel filters, unread/saved baseline library views, and time-window filters
- saved, unsaved, read, and archived-history flows reconcile correctly on the current filter-based library model
- list responses keep returning a stable page envelope so cursor pagination can land without rewriting the smoke harness from scratch
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
- browser-automated verification of the keyboard-first reader shell

Use `docs/release-checklist.md` as the source of truth for final release gating.
