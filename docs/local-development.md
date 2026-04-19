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

## Diagnostics

- `GET /api/health` exposes frontend runtime health.
- `GET /api/diagnostics/startup` exposes frontend configuration diagnostics.
- `GET /health` exposes backend runtime health.
- `GET /diagnostics/startup` exposes backend configuration, route, and startup metadata.

## Common recovery steps

- Re-run `npm run bootstrap` after dependency changes.
- Delete `.venv` and run `npm run bootstrap:api` if Python dependencies drift.
- Delete `apps/web/.next` if the frontend cache gets stale.
- Check `.env` first when ports or URLs do not match the expected local runtime.

