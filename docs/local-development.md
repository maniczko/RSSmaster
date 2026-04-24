# Local development

## Prerequisites

- Node.js 24+
- npm 11+
- Python 3.14+

## Clean-room setup

1. Clone or copy the repository to a local directory.
2. Run `npm run bootstrap`.
3. Review `.env` and adjust only the values that differ from local defaults.
4. Run `npm run dev`.

The bootstrap script creates `.venv` automatically and installs backend requirements into it.

## Expected ports

- Frontend: `127.0.0.1:3000`
- Backend: `127.0.0.1:8000`

## Local accounts and workspace claim

- Local accounts are optional until the first account is created.
- The first created account can claim the current shared workspace by cloning `data/rssmaster.db` into a per-account database under `data/accounts/`.
- In the open no-account mode, the UI entrypoint for that flow lives under `Ustawienia -> Sesja operatora -> Utworz pierwsze konto`.
- The accounts control database lives at `data/rssmaster_accounts.db` by default.
- Relevant overrides:
  - `RSSMASTER_ACCOUNTS_DATABASE_PATH`
  - `RSSMASTER_ACCOUNTS_WORKSPACE_DIR`
  - `RSSMASTER_ACCOUNTS_COOKIE_NAME`
  - `RSSMASTER_ACCOUNTS_SESSION_DAYS`

## Diagnostics

- `GET /api/health` exposes frontend runtime health.
- `GET /api/diagnostics/startup` exposes frontend configuration diagnostics.
- `GET /health` exposes backend runtime health.
- `GET /diagnostics/startup` exposes backend configuration, route, and startup metadata.
- `python scripts/check_health.py` checks both health and startup diagnostics on the default local ports.
- `python scripts/check_api.py` is an in-process contract smoke. It does not prove a healthy live runtime on `3000/8000`.
- `npm run check:ports` audits the canonical local ports and records whether they are free, healthy RSSmaster listeners, stale RSSmaster listeners, blocked by another process, or stuck in a refusing/timeout state.

## Verification levels

- `contract green`
  - command: `npm run check:contract`
  - proves: backend contract and core workflow semantics in-process
  - does not prove: a live runtime on `127.0.0.1:3000` and `127.0.0.1:8000`
- `fallback runtime green`
  - commands: `npm run qa:sources`, `npm run qa:reader`, `npm run qa:app`
  - proves: browser and runtime flows against a healthy local runtime, even if fallback ports are used
  - does not prove: a clean boot on the canonical default ports
- `canonical cold boot green`
  - command: `npm run qa:sources -- --cold-start`
  - proves: a clean boot on `127.0.0.1:3000` and `127.0.0.1:8000`
  - cleanup behavior: safely stops recognized RSSmaster runtimes from this repo on canonical and fallback ports before booting
  - does not prove: screen-reader sign-off or external systems such as live SMTP/Kindle acceptance

## Fast QA paths

- Run `npm run check:ports` first when you suspect a stale or foreign process is blocking `3000` or `8000`.
- Run `npm run check:contract` when you want to prove the API contract and core happy-path semantics without relying on a live runtime.
- Run `npm run qa:sources -- --cold-start` to prove a clean boot on the default local ports (`127.0.0.1:3000` and `127.0.0.1:8000`) and then run API smoke, health smoke, and browser smoke in one pass.
- The cold-start harness stops only recognized RSSmaster runtimes from this repo on canonical and fallback ports such as `3000/3100` and `8000/8100`; if another process owns a default port, it fails instead of switching to a fallback port.
- `npm run qa:sources` without `--cold-start` is the fallback-runtime gate for `/sources`; it can reuse a healthy runtime on fallback ports if the default ports are blocked.
- Run `npm run check:capture` after changes to `/capture`, bookmarklet/share-target behavior, or outside-app read-later handoff.
- Run `npm run check:continuity` after changes to workspace portability, saved-reader restore, reader continuity, or manual cross-device handoff.
- Run `npm run check:reader` after extraction or reader UI changes to verify rich `cleaned_html` rendering with images, captions, lists, quotes, and absolutized links.
- Run `npm run check:reader:real-queue -- --phase before`, then `python scripts/reextract_items.py --manifest output/playwright/reader-real-queue-manifest.json --write`, then `npm run check:reader:real-queue -- --phase after` when the change touches publisher-specific extraction cleanup or sampled reader backfill.
- Run `npm run check:layout` after shell, spacing, responsive, or button/layout polish changes to sweep the main app pages in a real browser and capture screenshots.
- Run `npm run qa:reader` when you want the full fallback-runtime gate for the reader: unit tests, build, runtime health, and browser smoke in one pass.
- Run `npm run qa:app` when you want one aggregated report for contract smoke plus the `/sources` and reader gates.
- If your healthy runtime is on fallback ports, pass `RSSMASTER_WEB_URL` and `RSSMASTER_API_URL` to `npm run check:reader`.
- Run `python scripts/run_sources_qa.py --keep-running` if you want the verifier to leave the local runtime up for manual browser checks afterward.
- Run `docs/runbooks/a11y-screen-reader-signoff.md` after browser automation if the change needs manual NVDA or VoiceOver sign-off.
- The fallback `/sources` harness writes its summary to `output/playwright/sources-qa.json`.
- The cold-start harness writes canonical boot evidence to `output/playwright/sources-cold-boot.json`.
- The browser smoke evidence lives in `output/playwright/sources-a11y-smoke.json`.
- The capture browser smoke writes evidence to `output/playwright/capture-smoke.json` and `output/playwright/capture-smoke.png`.
- The continuity browser smoke writes evidence to `output/playwright/continuity-smoke.json` and `output/playwright/continuity-smoke.png`.
- The reader browser smoke writes evidence to `output/playwright/reader-rich-smoke.json` and `output/playwright/reader-rich-smoke.png`.
- The sampled real-queue reader audit writes `output/playwright/inbox-article-audit-before.json`, `output/playwright/inbox-article-audit-after.json`, and per-item screenshots once the manifest-driven rollout is executed.
- The sampled re-extraction runner writes its stop-on-failure summary to `output/playwright/reextract-items-report.json`.
- The layout browser sweep writes evidence to `output/playwright/layout-qa.json` plus `page-audit-*.png` screenshots.
- The reader QA harness writes its summary to `output/playwright/reader-qa.json`.
- The port audit writes its summary to `output/playwright/runtime-port-audit.json`.
- The app-level aggregator writes its summary to `output/playwright/app-qa.json`.

## Common recovery steps

- Re-run `npm run bootstrap` after dependency changes.
- Delete `.venv` and run `npm run bootstrap:api` if Python dependencies drift.
- Delete `apps/web/.next` if the frontend cache gets stale.
- Check `.env` first when ports or URLs do not match the expected local runtime.
- If `npm run health` times out on `http://127.0.0.1:8000/health`, run `npm run check:ports` before blaming the API code. Treat `blocked_non_rssmaster`, `stale_rssmaster`, `refused`, and `timeout` as different operator actions.
- When a change touches `/sources`, run `npm run check:sources` after the normal build/unit checks to cover keyboard reachability, preview race guards, calm expected preview failures, multiple candidates, and backoffice focus continuity.
- When a change touches `/capture`, manifest share-target behavior, bookmarklet capture, or outside-app read-later handoff, run `npm run check:capture` after the normal build/unit checks.
- When a change touches continuity bundles, manual portability, or reader session restore across runtimes, run `npm run check:continuity` after the normal build/unit checks.
- When a change touches extraction, capture, or in-app reading, run `npm run check:reader` after the normal build/unit checks.
- When a change touches shell layout, spacing, responsive behavior, or page-level visual polish, run `npm run check:layout` after the normal build/unit checks.
- When a change touches extraction, capture, or in-app reading and you want a single regression gate, run `npm run qa:reader`.
- If `127.0.0.1:3000` refuses the connection during `/sources` work, prefer `npm run check:ports` first, then either `npm run qa:sources -- --cold-start` for canonical proof or `python scripts/run_sources_qa.py --keep-running` for a fallback-runtime session.
