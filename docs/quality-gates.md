# RSSmaster Quality Gates

Linear anchor: `VAT-292`

Use this document to choose the minimum safe verification for a change. Wider gates are welcome, but do not use broad checks as a substitute for targeted diagnosis.

## Gate levels

| Gate | Use when | Commands |
| --- | --- | --- |
| Docs gate | Documentation-only change | Direct doc review against current repo behavior |
| Web fast gate | Frontend component, copy, layout, routing, shadcn/ui | `npm run build`, `npm run test:unit:web` |
| API fast gate | FastAPI endpoint, service, repository, storage-facing logic | `python scripts/test_api_unit.py`, `python scripts/check_api.py` |
| Cross-layer gate | UI and API/storage contract touched together | `npm run build`, `npm run test:unit`, `python scripts/check_api.py` |
| Browser gate | Visible reader/source/capture/digest/settings behavior | relevant `npm run check:*` smoke |
| Release gate | Claiming release confidence | `npm run check`, `npm run health`, plus manual gaps from `docs/release-checklist.md` |

## Surface-specific commands

| Surface | Minimum commands |
| --- | --- |
| Reader browse/article/triage | `npm run build`, `npm run test:unit:web`, `npm run check:reader:interaction` |
| Cleaned article rendering | `npm run build`, `npm run check:reader` |
| Sources/add feed/sync UX | `npm run build`, `npm run test:unit:web`, `npm run check:sources` |
| Capture | `npm run build`, `npm run check:capture` |
| Digest or magazines UI | `npm run build`, `npm run test:unit:web`, `npm run check:digest`, `npm run check:magazines` when magazines are touched |
| Auth/session UI | `npm run build`, `npm run test:unit:web`, `npm run check:auth` |
| Layout or responsive behavior | `npm run build`, `npm run test:unit:web`, `npm run check:layout` |
| API contract or models | `python scripts/test_api_unit.py`, `python scripts/check_api.py` |
| SQLite storage schema | `npm run check:storage`, `python scripts/test_api_unit.py` when repository behavior changes |
| Digest/archive artifacts | `npm run check:archive`, `python scripts/check_api.py` |
| Background orchestration, schedule, or job lifecycle | `npm run check:orchestration`, `python scripts/check_api.py` |
| Startup/config/health | `python scripts/check_health.py`, plus the relevant build/test command |

## Sequencing rule

Run browser-heavy checks sequentially. Parallel browser smokes can contaminate generated frontend runtime configuration and produce false failures such as one isolated web runtime calling another isolated API port.

## Failed gate policy

When a gate fails:

1. Preserve the first failure evidence.
2. Identify whether the failure is product, harness, environment, or timeout.
3. Run the smallest diagnostic command that can confirm the root cause.
4. Fix the root cause, not the symptom.
5. Rerun the failing gate before widening.

Do not hide console errors, HTTP 4xx/5xx, hydration failures, or stale artifacts. If a benign browser issue is ignored, document the exact reason in the harness.

## Manual gaps

These remain manual unless a separate issue says otherwise:

- live SMTP delivery
- Kindle inbox acceptance/rendering
- screen-reader spoken sign-off
- live Sentry event delivery with a real DSN
- external analytics provider dashboards
- production hosting/deployment sign-off

Automated dry-runs can support these flows, but they do not replace manual evidence.
