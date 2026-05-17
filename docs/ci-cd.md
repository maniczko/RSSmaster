# RSSmaster CI/CD

Linear anchor: `VAT-288`

RSSmaster currently has a GitHub Actions quality gate, not a production deployment pipeline.

## What CI does

The workflow lives at `.github/workflows/ci.yml` and runs on:

- pull requests to `main`
- pushes to `main`
- manual `workflow_dispatch`

It verifies:

- Node dependency install with `npm ci`
- Python dependency install through `scripts/bootstrap_python.py`
- Next.js build with `npm run build`
- web unit tests with `npm run test:unit:web`
- API unit tests with `python scripts/test_api_unit.py`
- API contract smoke with `python scripts/check_api.py`
- SQLite storage schema smoke with `npm run check:storage`
- digest archive smoke with `npm run check:archive`
- job orchestration smoke with `npm run check:orchestration`
- runtime port-audit tests, Playwright artifact schema tests, and ownership checks
- a single Playwright browser canary with `npm run check:magazines`

## What CI does not do

CI intentionally does not perform:

- live SMTP delivery
- Kindle inbox acceptance
- the full browser-heavy Playwright smoke suite
- production deployment
- cloud infrastructure changes

The magazine smoke is intentionally the only CI browser canary for now. The full browser-heavy suite remains a local/release gate because those checks start multiple isolated runtimes and can be expensive or flaky in shared CI until the harness is made fully CI-native.

## Deployment status

No Vercel, Cloudflare Pages, Railway, Render, Netlify, or other hosted deployment is configured as the canonical production target in this repository.

Do not add a deployment provider without:

- a Linear issue that names the target
- documented secrets and environments
- rollback/recovery expectations
- a clear reason the local-first runtime needs hosted deployment

## Release relationship

CI is a PR safety net. It is not the full release sign-off.

For local release confidence, still use:

- `docs/release-checklist.md`
- `docs/quality-gates.md`
- `npm run release:evidence`

Live delivery and screen-reader sign-off remain manual evidence paths.
