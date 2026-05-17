# RSSmaster observability

Linear anchor: `VAT-276`

RSSmaster has optional Sentry instrumentation for the FastAPI backend and the Next.js frontend. It is disabled by default and becomes active only when a DSN is configured.

## Backend Sentry

The backend initializes Sentry from `apps/api/app/observability/sentry.py` during FastAPI startup.

Environment variables:

- `RSSMASTER_SENTRY_DSN`: enables backend Sentry when set.
- `RSSMASTER_SENTRY_TRACES_SAMPLE_RATE`: transaction sample rate, default `0.1`, valid range `0.0` to `1.0`.
- `RSSMASTER_SENTRY_ENABLE_LOGS`: enables Sentry log capture when explicitly set.
- `RSSMASTER_ENV`: environment name used in Sentry events.

Backend privacy guardrails:

- `send_default_pii` is disabled.
- FastAPI and Starlette integrations use endpoint transaction names.
- The local structured logger remains the first-line debugging tool; Sentry is an optional external mirror, not the source of truth.

## Frontend Sentry

The frontend uses the Next.js Sentry integration through:

- `apps/web/next.config.ts`
- `apps/web/instrumentation.ts`
- `apps/web/instrumentation-client.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`
- `apps/web/app/global-error.tsx`
- `apps/web/lib/sentry-config.ts`

Environment variables:

- `NEXT_PUBLIC_SENTRY_DSN`: enables browser/server frontend Sentry when set.
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`: frontend trace sample rate, default `1` in development and `0.1` otherwise.
- `RSSMASTER_ENV` or `NODE_ENV`: environment name.
- `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` or `VERCEL_GIT_COMMIT_SHA`: optional release identifier.

Frontend privacy guardrails:

- Do not send full article bodies, feed contents, notes, highlights, or local database paths as custom Sentry context.
- Prefer route names, issue identifiers, status codes, and high-level failure classes.
- Browser replay/session recording is not enabled by this local configuration.

## Verification

Run these after changing Sentry configuration:

- `npm run build`
- `npm run test:unit:web`
- `python scripts/test_api_unit.py`
- `python scripts/check_api.py`
- `python scripts/check_health.py` when startup or diagnostics changed

Live Sentry delivery requires a real DSN and should be treated as manual evidence. Do not commit DSNs or auth tokens.
