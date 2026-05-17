# rssmaster

Local-first RSS reading and digest workspace with a Next.js frontend, FastAPI backend, and SQLite-ready runtime defaults.

## Repository layout

```text
apps/
  api/     FastAPI backend and startup diagnostics
  web/     Next.js App Router frontend and web diagnostics
data/      Local SQLite database files
docs/      Architecture and local setup notes
scripts/   Bootstrap, dev, and health helper scripts
```

## Quick start

1. Install frontend and backend dependencies:

   ```powershell
   npm run bootstrap
   ```

2. Start both services:

   ```powershell
   npm run dev
   ```

3. Open the local runtime:

   - Web app: `http://127.0.0.1:3000`
   - Web health: `http://127.0.0.1:3000/api/health`
   - API health: `http://127.0.0.1:8000/health`
   - API startup diagnostics: `http://127.0.0.1:8000/diagnostics/startup`

## Local accounts

- RSSmaster now supports local accounts and login on one trusted machine.
- Until the first account is created, the app behaves like the earlier open local-first workspace.
- The first created account claims the current shared library by copying `data/rssmaster.db` into its own account database.
- Later accounts get separate SQLite workspaces under `data/accounts/`.
- Session cookies are local-only and are shared between the web app on `3000` and the API on `8000`.
- In the open mode without accounts, create the first account from `Ustawienia -> Sesja operatora -> Utworz pierwsze konto`.

## Useful commands

- `npm run bootstrap` installs Node dependencies, creates `.venv`, installs Python requirements, and seeds `.env` from `.env.example` when needed.
- `npm run dev` runs the FastAPI API and Next.js web app together.
- `npm run build` verifies the Next.js application builds successfully.
- `npm run check` builds the frontend, runs unit checks, and then runs `npm run check:contract`.
- `npm run check:contract` runs the in-process API contract smoke in `scripts/check_api.py`. It proves contract and core workflow semantics, not a healthy live runtime.
- `npm run check:storage` validates the SQLite schema, required tables, critical indexes, and digest/delivery columns in an isolated temporary database.
- `npm run check:archive` builds an isolated digest EPUB and verifies archive metadata, SHA-256, history lookup, and delivery artifact readiness.
- `npm run check:orchestration` runs an isolated scheduled workflow smoke: scheduled sync, digest build, and delivery dry-run with persisted `job_runs`.
- `npm run check:ports` audits the canonical local ports `127.0.0.1:3000` and `127.0.0.1:8000` and writes `output/playwright/runtime-port-audit.json`.
- `npm run check:capture` runs a browser smoke for the outside-app capture flow, including `/capture` prefills, bookmarklet readiness, manifest share target, and note persistence into the saved reader.
- `npm run check:continuity` runs a browser smoke for the manual continuity bundle flow, including export from `/sources` backoffice, reader-context capture, bundle import, and restored route/progress in the saved reader.
- `npm run qa:sources` runs the `/sources` QA plan end-to-end: unit tests, build, health, API smoke, and browser smoke with automatic local boot when needed.
- `npm run check:reader` runs a browser smoke for the cleaned reading surface, including article media, formatting, and link absolutization.
- `npm run check:reader:real-queue` audits an operator-local manifest of real queue items and writes sampled before/after evidence for extraction cleanup rollout.
- `npm run qa:reader` runs the cleaned reader QA plan end-to-end: web/API unit checks, build, runtime health, and browser smoke with automatic fallback-port discovery when needed.
- `npm run qa:app` aggregates `check:contract`, `qa:sources`, `qa:reader`, `check:capture`, and `check:continuity`, then writes a cross-app evidence summary to `output/playwright/app-qa.json`.
- `npm run db:init` creates the SQLite schema if it does not exist and prints schema metadata.
- `npm run health` pings the running local services and prints their health payloads.

## Verification levels

- `contract green`: `npm run check:contract`
  - proves the backend contract and core happy-path semantics in-process
  - does not prove that a live web/API runtime is healthy on `3000/8000`
- `fallback runtime green`: `npm run qa:sources`, `npm run qa:reader`, or `npm run qa:app`
  - proves the flows against a healthy local runtime, even if the harness had to reuse fallback ports such as `3100/8100`
  - does not prove a clean boot on the canonical default ports
- `canonical cold boot green`: `npm run qa:sources -- --cold-start`
  - proves a real clean start on `127.0.0.1:3000` and `127.0.0.1:8000`
  - safely stops recognized RSSmaster runtimes from this repo on canonical and fallback ports before booting
  - fails deliberately if an unknown or non-RSSmaster process still blocks a default port

## Local testing note

The homepage now includes a live channel intake panel, a manual sync launcher, a dense keyboard-first reader shell, digest preview/build controls, and SMTP/Kindle delivery settings with dry-run/send actions. You can test direct feed URLs, homepage autodiscovery, repeated sync deduplication, extraction-backed reading, digest packaging, and local delivery flow from the browser once `npm run dev` is running.

For `/sources` specifically, the quickest confidence path is `npm run qa:sources`, and the detailed scenario matrix lives in `docs/runbooks/sources-test-plan.md`.

For the cleaned reader specifically, use `npm run check:reader`, and see `docs/runbooks/reader-test-plan.md` for the detailed scenario matrix and evidence paths.
If you want the full operator-grade gate for the reader, use `npm run qa:reader`.
If you are rolling out extraction cleanup on sampled real articles, use `npm run check:reader:real-queue -- --phase before`, then `python scripts/reextract_items.py --manifest output/playwright/reader-real-queue-manifest.json --write`, then `npm run check:reader:real-queue -- --phase after`.

For outside-app capture specifically, use `npm run check:capture`, and see `docs/runbooks/capture-test-plan.md` for the detailed scenario matrix and evidence paths.

For manual portability and cross-device continuity specifically, use `npm run check:continuity`, and see `docs/runbooks/continuity-test-plan.md` for the exported bundle semantics, restore expectations, and evidence paths.

For cross-app operator confidence, use `npm run qa:app`.
For manual screen-reader sign-off, use `docs/runbooks/a11y-screen-reader-signoff.md` together with `docs/templates/a11y-screen-reader-evidence-template.md`, then save the filled notes under `output/playwright/a11y-screen-reader-signoff-YYYY-MM-DD.md`.

## Documentation

- `CONTRIBUTING.md` defines the standard contribution and agent handoff workflow.
- `docs/documentation-map.md` defines where requirements, execution, and technical decisions should live.
- `docs/agent-workflow.md` defines how Codex and other agents should move from Linear issues to verified code.
- `docs/quality-gates.md` maps change classes to required verification commands.
- `docs/rssmaster-domain-rules.md` defines local-first product invariants and backlog triage rules.
- `docs/magazine-model.md` defines the V1 digest-backed magazine issue model and the V2 migration path.
- `docs/ci-cd.md` explains the GitHub Actions quality gate and the current no-deployment status.
- `docs/observability.md` explains optional Sentry setup for web/API error monitoring.
- `docs/prd.md` defines the canonical MVP scope and user journey.
- `docs/local-development.md` explains clean-room setup and daily commands.
- `docs/architecture.md` describes the service boundaries for the MVP runtime.
- `docs/api-contract.md` defines the canonical frontend-backend contract for core MVP workflows.
- `docs/orchestration-contract.md` defines reusable job lifecycle and pipeline semantics.
- `docs/storage-schema.md` explains why each SQLite table exists and what depends on it.
- `docs/adrs/README.md` defines where architecture decisions should be recorded in the repo.
- `docs/release-checklist.md` defines what must be green before calling a local build release-ready.
- `docs/runbooks/local-release-smoke.md` gives the fastest operator path for boot, smoke verification, and gap diagnosis.
