# RSSmaster Agent Operating Guide

This file is the repo-local operating contract for any coding agent working in `C:\Users\user\Desktop\RSSmaster`.

Use it as the first source of execution guidance inside this workspace. It supplements, but does not replace, higher-level system or tool instructions.

## 1. Mission

Build and maintain RSSmaster as a local-first reading workspace for:

- subscribing to RSS/Atom feeds
- ingesting and deduplicating articles
- reading cleaned articles in-app
- triaging articles into durable library states
- generating deterministic digest artifacts
- delivering those artifacts to Kindle-friendly targets

Optimize for product clarity, operational safety, and premium reading UX over cleverness.

## 2. Product Goals & Architecture Snapshot

Treat the points below as the canonical short architecture map for day-to-day implementation:

1. RSSmaster is local-first. The primary supported runtime is one trusted operator on one machine.
2. `apps/web` is the Next.js App Router frontend and owns the browser-facing product shell.
3. `apps/api` is the FastAPI backend and owns the validated backend contract and operational endpoints.
4. `data/` is the local persistence area; SQLite is the system of record for critical workflow state.
5. Startup must be predictable and diagnosable from local docs and local commands alone.
6. Feed subscription supports both direct feed URLs and homepage autodiscovery.
7. Sync runs ingest entries, normalize them, deduplicate them, and persist observable run history.
8. Article extraction produces `cleaned_html` and/or `content_text` so reading can happen inside the app.
9. Reader workflows are stateful and must preserve continuity for search, sort, active item, and reading mode.
10. Core article triage states include read, saved/favorite, digest candidate, archive/library state, and annotations.
11. Digest generation must be deterministic from persisted state, not ad hoc browser state.
12. Delivery flows must be auditable through persisted history and logs, even when sending fails.
13. Orchestration semantics are explicit: `pending`, `running`, `partial_success`, `failed`, `canceled`, `completed`.
14. API behavior is contract-driven. The canonical product API lives under `/api/v1` and uses stable envelopes.
15. Health and startup diagnostics on both frontend and backend are part of the operator workflow, not optional extras.
16. Docs in `docs/` are implementation-near sources of truth and must stay aligned with code.

## 3. Source Of Truth Documents

Before non-trivial changes, read the smallest relevant set from these:

- `.codex/config.toml` - repo-local Codex defaults for model, approvals, integrations, and repo constraints
- `README.md` - repo overview and daily commands
- `docs/prd.md` - product scope and user journey
- `docs/architecture.md` - runtime boundaries
- `docs/local-development.md` - boot and recovery workflow
- `docs/api-contract.md` - frontend/backend contract
- `docs/orchestration-contract.md` - job lifecycle semantics
- `docs/storage-schema.md` - persistence model and table responsibilities
- `docs/release-checklist.md` - release gates and smoke expectations

If code and docs disagree, do not guess. Either:

- align code and docs in the same change, or
- state the conflict explicitly in the final report

### 3.1 Docs Update Policy

Update repo docs in the same turn when changes affect any of these:

- `docs/api-contract.md` - endpoint shape, filters, query semantics, list envelopes, error envelopes
- `docs/architecture.md` - runtime boundaries, service roles, major layout of responsibilities
- `docs/storage-schema.md` - durable tables, persisted fields, migration-sensitive behavior
- `docs/orchestration-contract.md` - lifecycle states, retries, background job semantics
- `docs/local-development.md` - boot flow, ports, recovery steps, required local tooling
- `docs/release-checklist.md` or `docs/runbooks/local-release-smoke.md` - verification order or release gates

Do not leave contract or operator workflow changes undocumented.

### 3.2 Module Ownership Map

Use this table to map a task to its primary code surface before editing.

| Product surface | Primary implementation areas | Docs that usually need review | Default verification bias |
| --- | --- | --- | --- |
| product shell, routes, layout, responsive behavior | `apps/web/app/[[...slug]]/page.tsx`, `apps/web/app/channel-lab.tsx`, `apps/web/app/components/*`, `apps/web/app/lib/app-routes.ts`, `apps/web/app/globals.css` | `docs/prd.md`, `docs/architecture.md`, `docs/api-contract.md` when URL semantics change | browser verification required |
| feed browsing, source lists, source controls | `apps/api/app/channels/*`, `apps/api/app/source_management/*`, `apps/api/app/sync/*`, related web feed/source components | `docs/api-contract.md`, `docs/storage-schema.md`, `docs/local-development.md` when boot or sync flow changes | API verification required; browser verification required if user-facing |
| library states, triage, search, item lists | `apps/api/app/items/*`, `apps/api/app/library/*`, `apps/api/app/workspace/*`, related queue/list UI | `docs/api-contract.md`, `docs/storage-schema.md` | cross-layer verification required; browser verification usually required |
| annotations, notes, tags, collections, retrieval | `apps/api/app/annotations/*`, `apps/web/app/components/annotation-panel.tsx`, related reader surfaces | `docs/api-contract.md`, `docs/storage-schema.md`, relevant product docs | cross-layer verification required; browser verification required |
| ranking, stories, briefing, discover surfaces | `apps/api/app/ranking/*`, `apps/api/app/stories/*`, `apps/api/app/workspace/*`, related discovery UI | `docs/api-contract.md`, `docs/ranking-pipeline-v1.md`, `docs/architecture.md` if boundaries shift | API verification required; browser verification recommended and usually required |
| digests, EPUB packaging, delivery | `apps/api/app/digests/*`, `apps/api/app/delivery/*`, `apps/api/app/settings/*`, related delivery UI | `docs/api-contract.md`, `docs/orchestration-contract.md`, `docs/release-checklist.md` | API verification required; browser verification optional unless UI changed |
| startup, settings, diagnostics, observability | `apps/api/app/config.py`, `apps/api/app/main.py`, `apps/api/app/observability/*`, `apps/web/app/api/*`, startup scripts | `docs/local-development.md`, `docs/architecture.md`, `docs/release-checklist.md` | health/startup verification required |
| docs, runbooks, regression harness | `docs/*`, `scripts/check_api.py`, `scripts/check_health.py`, `scripts/test_api_unit.py` | `docs/documentation-map.md`, touched docs/runbooks | doc review required; run matching harness if behavior changed |

If a task crosses two or more product surfaces, treat it as cross-layer by default even if the diff is small.

### 3.3 When To Update Linear / Confluence / Docs Together

When product scope, acceptance criteria, rollout order, or operator workflow changes, update the relevant planning surfaces in the same turn when access is available.

Update all three surfaces together when any of these happen:

- a feature boundary changes materially
- acceptance criteria change
- shipped behavior no longer matches the tracked ticket or spec
- implementation reveals a different delivery sequence than the one being tracked
- a follow-up or risk is important enough that another person may need to act on it later

Default policy:

- update `docs/` when code or operator behavior changed
- update Linear when execution status, scope, risks, or follow-up tasks changed
- update Confluence when the product requirement, architecture decision, or broader workflow changed

Rule of thumb:

- bug fix with no scope change: code + tests + docs only if contract or operator behavior changed
- implementation that satisfies an existing ticket: code + tests + Linear status
- implementation that changes the agreed solution: code + tests + docs + Linear + Confluence
- discovery work that changes roadmap or sequencing: Linear + Confluence even if code did not change

If Linear or Confluence should be updated but are unavailable in the current session, call that out explicitly in the final report.

## 4. Non-Negotiable Guardrails

These areas are high-risk. Do not change them casually.

### 4.1 Do not change without explicit justification

- the local-first product model
- default runtime ports: web `127.0.0.1:3000`, API `127.0.0.1:8000`
- the `/api/v1` contract shape without updating docs and verification
- the uniform API error envelope semantics
- persisted audit tables and their role: `job_runs`, `digest_history`, `delivery_logs`
- deterministic digest semantics
- health and startup diagnostics endpoints

### 4.2 Do not modify directly unless the task explicitly requires it

- `.env` or any real secrets
- `.venv/`
- `node_modules/`
- generated app caches like `.next/`
- runtime artifact folders under `output/` except for deliberate test evidence
- SQLite files under `data/` by hand

### 4.3 Do not perform unsafe shortcuts

- do not bypass repositories/services by editing database rows manually
- do not introduce breaking API shape drift "just for the UI"
- do not silently remove diagnostics to hide a runtime problem
- do not rewrite large surfaces when a smaller fix will solve the problem

### 4.4 High-Risk Files And Modules

Changes in these areas require wider verification than usual:

- `apps/web/app/channel-lab.tsx` - state-heavy product shell, reader workflow, route sync, selection continuity
- `apps/web/app/globals.css` - global interaction, layout, responsive behavior, cross-screen UI regressions
- `apps/web/app/lib/app-routes.ts` - canonical route and URL-state behavior
- `apps/api/app/main.py` - middleware, route registration, startup wiring, observability
- `apps/api/app/workspace/service.py` - ranking, stories, briefing, workspace shaping, cross-feature aggregation
- `apps/api/app/items/repository.py` - list semantics, search, filtering, persistence behavior
- `apps/api/app/db/schema.sql` and `apps/api/app/db/*` - schema, initialization, migration-sensitive changes
- `scripts/check_api.py` and `scripts/test_api_unit.py` - regression harness and release confidence

When touching any of these, prefer at least one extra verification layer beyond the narrow local fix.

## 5. How To Boot The Project

Use these commands from the repo root:

### Full bootstrap

```powershell
npm run bootstrap
```

### Start both services

```powershell
npm run dev
```

### Useful local endpoints

- web app: `http://127.0.0.1:3000`
- web health: `http://127.0.0.1:3000/api/health`
- API health: `http://127.0.0.1:8000/health`
- API diagnostics: `http://127.0.0.1:8000/diagnostics/startup`

### Common targeted commands

```powershell
npm run dev:web
npm run dev:api
npm run build
npm run test:unit
npm run test:unit:web
npm run test:unit:api
npm run check
npm run health
npm run db:init
```

## 6. Standard Execution Model

For non-trivial work, always follow this sequence:

1. Understand the request.
2. Identify the root cause or the exact surface being changed.
3. Read the smallest relevant code and docs.
4. Make a short plan.
5. Implement in the thinnest possible vertical slice.
6. Run the smallest sufficient verification first.
7. Widen verification if the change touches contracts, state, or multiple layers.
8. Review your own work for regressions and weak spots.
9. Report outcome, verification, and remaining risks clearly.

## 7. Break Work Into Small Steps

Prefer small, reviewable steps instead of broad rewrites.

### Good step boundaries

- one bug root cause + one fix
- one UI surface + its supporting styles
- one backend endpoint + its tests
- one contract adjustment + aligned frontend usage + docs
- one refactor extraction with no behavior change

### Avoid combining in one step

- unrelated UI polish plus ranking logic changes
- API contract changes plus broad visual redesign unless necessary
- dependency upgrades mixed with behavioral fixes
- schema changes mixed with speculative cleanup

### Safe slicing pattern

1. Reproduce or inspect.
2. Stabilize the failing path.
3. Add or update tests.
4. Polish only after behavior is correct.

## 8. Verification Matrix

Choose the smallest sufficient set below, then widen when risk increases.

### Documentation-only change

- no runtime tests required
- verify text accuracy against current repo scripts/docs

### Frontend-only change

Run:

```powershell
npm run build
npm run test:unit:web
```

Also do a browser verification when the change affects:

- visible layout
- reader behavior
- navigation
- filters/search
- state restoration

### API-only change

Run:

```powershell
python scripts/test_api_unit.py
python scripts/check_api.py
```

Add:

```powershell
python scripts/check_health.py
```

if startup, diagnostics, config, or service boot behavior changed.

### Cross-layer change

Run:

```powershell
npm run build
npm run test:unit
python scripts/check_api.py
```

If the change affects a real user flow, prefer:

```powershell
npm run check
```

### Reader / UX / feed-flow change

Run:

```powershell
npm run build
npm run test:unit:web
```

Then verify in a real browser:

- open the relevant local route
- reproduce the target flow
- inspect console warnings/errors
- capture a screenshot if the change is visually important

### Release-level confidence

Run:

```powershell
npm run check
npm run health
```

Use `docs/release-checklist.md` as the final gate.

### 8.1 Change Class -> Required Verification

Use this as the minimum verification table:

| Change class | Minimum verification |
| --- | --- |
| docs-only | direct doc review against current repo behavior |
| single-component UI polish | `npm run build`, `npm run test:unit:web` |
| reader/feed/search UX | `npm run build`, `npm run test:unit:web`, real browser verification |
| API endpoint or repository behavior | `python scripts/test_api_unit.py`, `python scripts/check_api.py` |
| startup/config/health | `python scripts/check_health.py`, plus relevant build/tests |
| cross-layer UI + API change | `npm run build`, `npm run test:unit`, `python scripts/check_api.py` |
| schema/persistence/orchestration | `npm run test:unit`, `python scripts/check_api.py`, and targeted smoke path |
| release-ready claim | `npm run check`, `npm run health`, plus relevant manual browser smoke |

If the change affects a user-visible workflow and no browser verification happened, call that out as a gap.

### 8.2 Browser Verification Required vs Optional

Use this table in addition to the matrix above:

| Change type | Browser verification |
| --- | --- |
| docs, comments, or internal refactor with no UI effect | optional |
| server-only logic with no visible behavior change | optional |
| startup/health/diagnostics endpoint change | optional, but recommended when the app boot path changed |
| visible layout, spacing, typography, responsive behavior, or styling | required |
| navigation, route parsing, deep-link restoration, or browser state continuity | required |
| feed browsing, reader behavior, search, filters, triage actions, annotations | required |
| API change consumed directly by visible UI surfaces | required |
| digest/delivery backend change with no UI change | optional |
| settings UI or any operator-facing form | required |
| release-ready claim | required for at least one representative user flow |

Browser verification should include, when relevant:

- opening the affected route
- checking for console errors
- confirming the intended flow visually
- confirming no obvious overlap, overflow, or broken interaction state

### 8.3 Manual Regression Checklist

When the task affects reading, triage, search, workspace, or layout, verify as many of these as are relevant:

1. Open the app and confirm the shell loads without console errors.
2. Confirm the expected route and URL state are preserved.
3. Open an article in-app and verify the reading surface.
4. Toggle read, save, archive, and digest state.
5. Use search and confirm visible results narrow correctly.
6. Switch sort or view mode and confirm continuity.
7. Refresh and confirm the app restores a sensible state.
8. If sources are touched, add or inspect a feed and run sync.
9. If digest is touched, preview/build and check resulting history/log state.

### 8.4 Feature -> Docs -> Tests -> Smoke Path Map

Use this map when deciding what must move together for a feature-complete change:

| Feature area | Docs to review/update | Tests to run | Smoke path |
| --- | --- | --- | --- |
| shell, routing, responsive layout | `docs/prd.md`, `docs/architecture.md`, `docs/local-development.md` when route semantics change | `npm run build`, `npm run test:unit:web` | open `/read/inbox`, switch views, refresh, confirm route continuity |
| feed browsing and source management | `docs/api-contract.md`, `docs/storage-schema.md`, `docs/local-development.md` | `python scripts/test_api_unit.py`, `python scripts/check_api.py`, plus browser checks if UI changed | add or inspect a feed, run sync, verify source list and feed pane |
| library, triage, search, queue behavior | `docs/api-contract.md`, `docs/storage-schema.md`, `docs/prd.md` if behavior changes materially | `npm run build`, `npm run test:unit`, `python scripts/check_api.py` | search, save, archive, mark read, reload, verify continuity |
| notes, tags, collections, retrieval | `docs/api-contract.md`, `docs/storage-schema.md`, product docs if retrieval semantics change | `npm run test:unit`, `python scripts/check_api.py` | open article, annotate, tag, retrieve again through UI |
| ranking, stories, discover surfaces | `docs/api-contract.md`, `docs/ranking-pipeline-v1.md`, `docs/architecture.md` if boundaries shift | `python scripts/test_api_unit.py`, `python scripts/check_api.py`, relevant web tests | load ranking, stories, briefing, confirm top items and visible grouping |
| digest, EPUB, delivery | `docs/api-contract.md`, `docs/orchestration-contract.md`, `docs/release-checklist.md` | `python scripts/test_api_unit.py`, `python scripts/check_api.py`, `npm run build` if UI changed | preview/build digest, inspect history/logs, verify delivery preflight if relevant |
| startup, diagnostics, observability | `docs/local-development.md`, `docs/architecture.md`, `docs/release-checklist.md` | `python scripts/check_health.py`, plus matching unit/build checks | verify web and API health endpoints plus startup diagnostics |
| docs or harness-only work | touched docs, `docs/documentation-map.md`, relevant runbook | targeted doc review; run harness only if behavior changed | confirm referenced commands and paths still match repo reality |

If a change touches a feature row and one of the listed docs/tests/smoke paths is skipped, explain that gap explicitly in the final report.

## 9. Final Response Standard

Every task must end with a final report using exactly these sections and exactly these section titles:

- `## Diagnoza`
- `## Root cause`
- `## Plan`
- `## Zmienione pliki`
- `## Testy`
- `## Ryzyka`
- `## Co jeszcze nie działa`

Never omit a section.

Use `Brak` only when the section is truly empty, with a one-line explanation.

Be concrete, not generic. Prefer file paths, commands, and observable facts.

Always distinguish:

- verified findings
- strong inference
- assumption

### Section rules

#### `## Diagnoza`

- describe what was observed
- describe what was reproduced
- separate direct evidence from assumptions

#### `## Root cause`

- state the most likely confirmed root cause
- if only partially confirmed, say that explicitly
- do not present speculation as certainty

#### `## Plan`

- list the steps taken or the implementation plan
- keep bullets short and action-oriented

#### `## Zmienione pliki`

- list every modified file
- give a short reason for each file change
- if nothing changed, say `Brak - bez zmian w plikach.`

#### `## Testy`

- list every executed command
- mark each as passed or failed
- if no tests were run, say exactly why

#### `## Ryzyka`

- list remaining technical or functional risks after the change
- include contract, runtime, UX, data, and regression risk when relevant

#### `## Co jeszcze nie działa`

- state unfinished work, known limitations, uncertain areas, or follow-ups
- if fully complete, say so explicitly and keep it short

### Never do this

- do not invent verification that did not happen
- do not hide uncertainty
- do not say a root cause is confirmed when it is only suspected
- do not skip modified files
- do not skip failed commands

## 10. When To Ask vs When To Act

### Ask the user before proceeding when:

- the change is destructive or may risk user data
- there are multiple valid product behaviors with different UX consequences
- the task would change the public API contract or core product semantics
- the work needs real credentials, external infrastructure, or secrets
- the work requires adding a major dependency with long-term impact
- the request conflicts with docs, code, or existing behavior in a non-obvious way

### Act without asking when:

- the bug has a clear local root cause
- the fix is internal and preserves intended product behavior
- the work is test coverage, refactoring, cleanup, accessibility, or UI polish within the current direction
- a small documentation update can remove ambiguity
- the next step is obvious from the repo and low-risk

Default bias:

- ask only when the decision has real downstream cost
- otherwise make the best reasonable assumption and state it afterward

## 11. Definition Of Done

Work is not done until all of the following are true:

- the requested behavior is implemented or the blocker is explicit
- the relevant verification has been run, or the reason it was not run is stated
- the change does not obviously violate the API, storage, or orchestration contracts
- the final report includes known weaknesses
- docs are updated when the change alters operator workflow, architecture, or contract expectations

## 12. Preferred Engineering Style

- simple, production-ready solutions over clever hacks
- modular code over giant conditional branches
- explicit state transitions over hidden side effects
- small, readable helpers over duplicated inline logic
- deterministic behavior over magic
- premium UX polish where users read or act repeatedly

When uncertain, choose the more maintainable option and call the uncertainty out explicitly.

## 13. Evidence Expectations

To improve work quality, prefer evidence-rich execution:

- For UI changes, verify in a real browser when feasible.
- For visually important changes, capture a screenshot artifact under `output/`.
- For API or contract changes, verify both code and documentation in the same turn.
- For debugging, reproduce first, then fix, then re-run the failing flow.
- In final reports, prefer commands, routes, file paths, and concrete observations over opinion.

## 14. Skill Usage Guidance

When relevant skills are available, prefer them deliberately:

- use `rssmaster-reader-ux` for reader, feed, search, triage, and layout work
- use `rssmaster-debug-playbook` for runtime failures, render loops, startup issues, and browser/API mismatches
- use `rssmaster-api-contract-guardian` for endpoint, payload, filter, or query semantic changes
- use `rssmaster-playwright-e2e` or browser automation for UI regression verification
- use `rssmaster-release-qa` before calling work release-ready
- use `rssmaster-product-backlog` when shaping scope, priorities, or tradeoffs
- use `rssmaster-semantic-ranking-v4` for ranking, novelty, dedupe, reranking, and feedback-driven recommendation work
- use `rssmaster-feed-ops-and-health` for source onboarding, feed health, autodiscovery, and noisy-feed operational work
- use `rssmaster-design-system-polish` for spacing, states, responsive polish, and visual QA
- use `rssmaster-localization-pl` for Polish UI copy, terminology, validation, and product-language consistency
- use `rssmaster-release-incident-response` for release regressions, smoke failures, rollback judgment, and incident triage

If a relevant skill is not used, state why briefly in your working notes or final review when it matters to decision quality.
