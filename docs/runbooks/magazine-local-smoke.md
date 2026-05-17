# Magazine local smoke runbook

Use this runbook when changing Kindle magazine generation, issue archive UI, EPUB output, delivery dry-run, or schedule settings.

## Scope

This is a local-first smoke. It verifies that RSSmaster can build and inspect a magazine issue without touching the operator's real library.

It does not verify live SMTP send, Kindle inbox acceptance, hosted scheduler uptime, or screen-reader spoken output.

## User flow

1. Open `/magazines`.
2. Confirm the page is issue-first: `Biblioteka wydań`, `Otwarte wydanie`, and concrete labels such as `Wydanie 1/2026`.
3. Open an issue and confirm it shows article groups by source/category.
4. Use `Czytaj przed wysyłką` and confirm the article preview is readable before delivery.
5. Run issue preflight and confirm the delivery status is visible.
6. Open `Harmonogram wydań`, update schedule settings if needed, and run schedule preflight.
7. Use `Zbuduj następne wydanie` only in an isolated runtime unless the user explicitly approves mutating the real library.

## Automated checks

Run these from the repo root:

```powershell
npm run check:magazines
npm run check:archive
npm run check:orchestration
python scripts/check_api.py
```

Expected evidence:

- `output/playwright/magazines-smoke.json` confirms issue archive, active issue, deep link, read-before-send, delivery preflight, schedule settings preflight, and no overflow on desktop/tablet/mobile widths.
- `output/digest-archive-check.json` confirms the generated EPUB artifact, SHA-256, source diversity, deduplication, delivery artifact inspectability, and EPUB structure.
- `output/job-orchestration-check.json` confirms scheduled sync partial-failure visibility, digest build, delivery dry-run, and persisted job trail.

## Quality checklist

- The issue label is stable and concrete, e.g. `Wydanie N/YYYY`.
- The issue contains an immutable article snapshot.
- The generated EPUB has `mimetype` first and uncompressed.
- The EPUB has OPF, NCX, intro, stylesheet, category chapters, and article anchors.
- A failing feed is visible as a partial sync error and does not block issue generation from healthy feeds.
- Delivery dry-run persists a `delivery_logs` row.
- No automated smoke mutates the real operator database.

## Known limitations

- V1 uses `digest_history` as the issue archive; dedicated `magazine_issues` tables are a V2 option.
- Schedule settings are persisted and preflighted, but do not start a hosted scheduler daemon by themselves.
- Live SMTP and Kindle acceptance require a manual evidence pass with real credentials.
- Spoken screen-reader sign-off is tracked separately.
