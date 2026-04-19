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

## Useful commands

- `npm run bootstrap` installs Node dependencies, creates `.venv`, installs Python requirements, and seeds `.env` from `.env.example` when needed.
- `npm run dev` runs the FastAPI API and Next.js web app together.
- `npm run build` verifies the Next.js application builds successfully.
- `npm run check` builds the frontend and runs an in-process end-to-end smoke that covers feed discovery, sync, extraction, item filtering, and local schema checks.
- `npm run db:init` creates the SQLite schema if it does not exist and prints schema metadata.
- `npm run health` pings the running local services and prints their health payloads.

## Local testing note

The homepage now includes a live channel intake panel, a manual sync launcher, a dense keyboard-first reader shell, digest preview/build controls, and SMTP/Kindle delivery settings with dry-run/send actions. You can test direct feed URLs, homepage autodiscovery, repeated sync deduplication, extraction-backed reading, digest packaging, and local delivery flow from the browser once `npm run dev` is running.

## Documentation

- `docs/documentation-map.md` defines where requirements, execution, and technical decisions should live.
- `docs/prd.md` defines the canonical MVP scope and user journey.
- `docs/local-development.md` explains clean-room setup and daily commands.
- `docs/architecture.md` describes the service boundaries for the MVP runtime.
- `docs/api-contract.md` defines the canonical frontend-backend contract for core MVP workflows.
- `docs/orchestration-contract.md` defines reusable job lifecycle and pipeline semantics.
- `docs/storage-schema.md` explains why each SQLite table exists and what depends on it.
- `docs/adrs/README.md` defines where architecture decisions should be recorded in the repo.
- `docs/release-checklist.md` defines what must be green before calling a local build release-ready.
- `docs/runbooks/local-release-smoke.md` gives the fastest operator path for boot, smoke verification, and gap diagnosis.
