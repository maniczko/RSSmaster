# Continuity test plan

Use this runbook when a change touches manual portability, continuity bundle export/import, or reader restore semantics between RSSmaster instances.

## Goal

Prove that RSSmaster can export a portable continuity bundle, then restore the saved-reader context on another healthy local runtime without relying on opaque item ids.

## Command

```powershell
npm run check:continuity
```

If your healthy runtime uses fallback ports, pass them explicitly:

```powershell
$env:RSSMASTER_WEB_URL="http://127.0.0.1:3000"
$env:RSSMASTER_API_URL="http://127.0.0.1:8100"
npm run check:continuity
```

## What the smoke proves

- a captured article can become the active saved-reader item
- export from `/sources` backoffice still preserves the active reader route instead of downgrading to the current sources section
- the exported bundle contains local reader progress keyed by source URL
- after clearing local continuity, bundle import restores:
  - saved-reader route
  - saved/digest/archive library-state booleans
  - notes/highlights, item tags, collections, and saved searches carried by the bundle
  - local reader continuity in `localStorage`
  - reader scroll progress inside the article surface

## What the smoke does not prove

- automatic multi-device sync transport
- conflict resolution between concurrent devices
- spoken screen-reader sign-off

## Evidence

- JSON summary: `output/playwright/continuity-smoke.json`
- Screenshot: `output/playwright/continuity-smoke.png`

Expected green fields:

- `exportDownloaded`
- `bundleMarkedReadSection`
- `bundleCapturedActiveArticle`
- `bundleCapturedProgress`
- `restoredLibraryState`
- `restoredRoute`
- `restoredReaderScroll`
- `restoredLocalContinuity`
- `restoredLocalProgress`
- `restoredAnnotationCount>=1`
- `restoredTagAssignmentCount>=1`
- `restoredCollectionCount>=1`
- `restoredCollectionItemCount>=1`
- `restoredSavedSearchCount>=1`
- `consoleErrors=[]`
- `pageErrors=[]`
