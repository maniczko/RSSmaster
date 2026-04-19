# Architecture overview

## Runtime boundaries

- `apps/web` owns the operator-facing UI, local health endpoints, and the browser-facing API base URL.
- `apps/api` owns validated runtime configuration, health endpoints, and the backend contract surface.
- `data` is reserved for local SQLite state and generated runtime artifacts.
- `docs` is the repo-local source of truth for architecture and setup guidance that should live close to implementation.

## Initial local-first flow

1. The developer starts both services with `npm run dev`.
2. The FastAPI app validates shared configuration on startup.
3. The Next.js app reads the same `.env` file for browser-safe configuration.
4. Health and startup diagnostics are available on both services before product features are added.

## Why this shape

- Next.js gives a strong shell for the future reader UI and task-oriented operator screens.
- FastAPI keeps ingestion, orchestration, extraction, and delivery concerns isolated from the UI.
- SQLite remains local and simple while leaving room for future repositories and migration tooling.
- Shared scripts reduce setup drift on a new machine and give Codex a stable entry point.

