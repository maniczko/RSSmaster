# Capture From Outside-App Test Plan

This runbook is the fastest repeatable verification path for RSSmaster's read-later capture flow when the article starts outside the main app shell.

## Goal

Prove that RSSmaster can:

1. open `/capture` with a prefilled URL, title, and note
2. expose a working bookmarklet entry point for browser-based capture
3. keep the manifest share target pointed at `/capture`
4. save the captured article into the saved reader flow
5. preserve the capture note as an item-level note annotation
6. avoid browser console and page-level runtime errors during the capture flow

## Automated path

Run these commands from the repo root:

```powershell
npm run test:unit:web
python scripts/test_api_unit.py
```

If you already have a healthy runtime, run:

```powershell
npm run check:capture
```

If your healthy runtime is on fallback ports, point the smoke at that runtime explicitly:

```powershell
cmd /c "set RSSMASTER_WEB_URL=http://127.0.0.1:3000&& set RSSMASTER_API_URL=http://127.0.0.1:8100&& npm run check:capture"
```

`check:capture` writes evidence to:

- `output/playwright/capture-smoke.json`
- `output/playwright/capture-smoke.png`

## What `npm run check:capture` proves

- `/capture` accepts prefilled `url`, `title`, and `note`
- the bookmarklet link is ready with a `javascript:` payload pointed at `/capture`
- `manifest.webmanifest` still declares `/capture` as the share target
- the capture POST succeeds against a live article fixture
- the saved-reader handoff works after capture
- the note survives as a real item-level annotation
- the browser flow completes without `consoleErrors` or `pageErrors`

## Manual QA scenarios

When the change touches capture UX, also manually verify:

1. Open `/capture`.
2. Paste a real article URL and optional note.
3. Save the article.
4. Open the saved reader route from the capture success card and confirm it lands directly in the article surface, not only in the browse list.
5. Open `Notatki i tagi` and confirm the capture note is visible.
6. Drag the bookmarklet to the bookmarks bar and confirm it opens `/capture` with the current page URL.
7. If the app is installed as a PWA, test the system share target from the browser or phone.

## Known gaps

- Spoken screen-reader sign-off for this flow is still manual.
- The automated smoke uses a deterministic local article fixture, not every publisher-specific HTML variant on the web.
- Canonical cold boot is still a separate runtime gate; `check:capture` assumes a healthy runtime already exists.
