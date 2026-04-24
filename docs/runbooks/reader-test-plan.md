# Reader Rich HTML Test Plan

This runbook is the fastest repeatable verification path for the cleaned in-app reading surface after extraction or reader UI changes.

## Goal

Prove that RSSmaster can:

1. capture or extract article HTML into `cleaned_html`
2. preserve meaningful formatting instead of flattening everything to plain paragraphs
3. render article media safely inside the reader shell
4. keep reader-safe typography, lists, quotes, and links
5. avoid browser console and page-level runtime errors during the reading flow

## Automated path

Run these commands from the repo root:

```powershell
npm run test:unit:web
python scripts/test_api_unit.py
python scripts/check_api.py
```

If you already have a healthy runtime, run:

```powershell
npm run check:reader
```

If you want the sampled real-queue audit for the current operator-local manifest, run:

```powershell
cmd /c "set RSSMASTER_WEB_URL=http://127.0.0.1:3000&& set RSSMASTER_API_URL=http://127.0.0.1:8100&& npm run check:reader:real-queue -- --phase before"
python scripts/reextract_items.py --manifest output/playwright/reader-real-queue-manifest.json --write
cmd /c "set RSSMASTER_WEB_URL=http://127.0.0.1:3000&& set RSSMASTER_API_URL=http://127.0.0.1:8100&& npm run check:reader:real-queue -- --phase after"
```

If you want the full operator-grade reader gate in one command, run:

```powershell
npm run qa:reader
```

`npm run qa:reader` gives `fallback runtime green`, not `canonical cold boot green`.
If you need a single aggregated report for contract plus browser/runtime confidence, run `npm run qa:app`.

## Evidence split

Keep automation evidence and manual AT sign-off separate:

1. Automation evidence proves the reader flow, extraction behavior, and browser/runtime smoke.
2. Manual spoken AT sign-off proves the flow is understandable to a real screen reader user.
3. Canonical cold boot is a separate runtime gate and must not be implied by reader QA evidence.

The automation path is the source of truth for browser/runtime confidence.
The manual sign-off path is the source of truth for spoken accessibility review.

If your local runtime is using fallback ports, point the smoke at that runtime explicitly:

```powershell
cmd /c "set RSSMASTER_WEB_URL=http://127.0.0.1:3100&& set RSSMASTER_API_URL=http://127.0.0.1:8100&& npm run check:reader"
```

The browser smoke writes evidence to:

- `output/playwright/reader-rich-smoke.json`
- `output/playwright/reader-rich-smoke.png`
- `output/playwright/inbox-article-audit-before.json`
- `output/playwright/inbox-article-audit-after.json`
- `output/playwright/inbox-article-audit-after-*.png`

The full reader QA runner writes:

- `output/playwright/reader-qa.json`
- `output/playwright/reextract-items-report.json`

The sampled real-queue manifest is intentionally operator-local and lives at:

- `output/playwright/reader-real-queue-manifest.json`

`reader-rich-smoke.json` zawiera teraz rowniez fokus-trail, selektywne semantic summaries dla shella artykulu i samego cleaned prose oraz wynik korpusu obejmujacego:

- text-only
- hero image
- multi-image
- srcset / lazy-load
- noscript fallback
- malformed / noisy HTML
- metadata hero fallback + publisher noise stripping

Evidence tiers:

1. `unit_green` - `apps/web/app/lib/reader-html.test.ts`
2. `browser_smoke_green` - `output/playwright/reader-rich-smoke.json`
3. `manual_screen_reader_signoff` - osobny, reczny pass wg `docs/runbooks/a11y-screen-reader-signoff.md`

## What `npm run check:reader` proves

- the API can capture a live article fixture into the workspace
- `cleaned_html` survives with image, figure, caption, list, quote, and heading structure
- relative article links are absolutized against the captured article URL
- the saved reader can open the newly captured item and switch into cleaned reading mode
- keyboard navigation can reach the reader back action and notes toggle
- the reading surface renders without browser `consoleErrors` or `pageErrors`

## Unit coverage

The current reader-specific automated coverage lives in:

- `apps/api/tests/test_extract_service.py`
- `apps/web/app/lib/reader-html.test.ts`
- `scripts/check_api.py`
- `scripts/check_reader_real_queue_ui.mjs`

Those tests cover:

- preservation of rich markup during extraction
- absolutization of relative `href` and `src`
- retention of `figure`, `img`, `figcaption`, lists, and blockquotes
- fallback hero image injection from publisher metadata when the article fragment loses its header media
- stripping publisher audio-widget placeholder noise before it leaks into `cleaned_html`, `content_text`, or `excerpt`
- stripping high-confidence related-content, decorative theme media, and promo/widget noise while preserving editorial prose and media
- reader-side enhancement hooks for tables, code blocks, links, and inline highlights
- corpus coverage for text-only, hero image, multi-image, srcset/lazy-load, noscript fallback, malformed/noisy HTML, metadata hero fallback with publisher noise stripping, and the combined premium-cleanup stack
- sampled real-queue audits that enforce per-item `forbiddenTextFragments`, `forbiddenUrlFragments`, `requireImage`, and `minWordCountApprox`

## Manual QA scenarios

When the change affects real article rendering, also manually verify:

1. Open `/read/saved` or `/read/inbox`.
2. Open an item that contains at least one article image.
3. Confirm the image renders inline and does not overflow the reading surface.
4. Confirm `figcaption`, list indentation, blockquotes, and inline links look intentional.
5. Confirm toggling read/save/digest state does not collapse the reading surface.
6. Refresh the page and confirm the selected item and cleaned view still load sensibly.

## Known gaps

- NVDA-first spoken sign-off is still manual; Narrator is the fallback when NVDA is unavailable.
- Corpus smoke covers several representative article classes, but still does not guarantee every publisher-specific HTML variant on the open web.
- If the runtime is not on the default ports, you must point `check:reader` to the active web/API URLs.
- `check:reader:real-queue` is only as good as the current `output/playwright/reader-real-queue-manifest.json`; keep that sample stratified and intentionally small.
- `scripts/reextract_items.py` performs sampled backfill only; it is not a mass reprocessing tool for the whole database.

For the manual accessibility gate, use `docs/runbooks/a11y-screen-reader-signoff.md` and record the spoken pass in `docs/templates/a11y-screen-reader-evidence-template.md`.
