# Documentation map

Linear anchor: `VAT-33`

This document defines where rssmaster knowledge lives so neither humans nor Codex have to guess which system is authoritative.

## Ownership model

| Knowledge class | System of record | Purpose |
| --- | --- | --- |
| PRD, functional requirements, architecture overview, reliability strategy | Confluence | strategic product and system intent |
| Epics, stories, acceptance criteria, delivery status | Linear | execution planning and delivery tracking |
| ADRs, runbooks, release checklists, implementation-near contracts and design notes | repo `docs/` | technical decisions and code-adjacent operating knowledge |

## Current bootstrap reality

The project is still in local bootstrap mode. Until Confluence pages are populated, repo documents can hold seed drafts, but they should be treated as mirrors-in-progress for strategic product and architecture knowledge. Once a Confluence page exists, the repo mirror must point back to it and avoid drifting into a second competing source of truth.

## Canonical homes

### Confluence

Confluence is the home for:

- PRD and MVP scope narrative
- functional requirement expansions beyond ticket-sized acceptance criteria
- architecture overview intended for broad project orientation
- reliability strategy, operational policy, and higher-level system guidance

Confluence pages should link back to:

- the relevant Linear epic or story
- any repo docs that hold code-near contracts or ADRs

### Linear

Linear is the execution system for:

- epics and stories
- acceptance criteria that define completion for a delivery slice
- implementation status and workflow state
- dependency tracking and sequencing

Linear issues should link to:

- the canonical requirement page in Confluence when a requirement exists
- the relevant repo doc when implementation depends on a code-near contract, ADR, or runbook

### Repo `docs/`

The repository is the home for:

- ADRs in `docs/adrs/`
- local setup and runbooks such as `docs/local-development.md`
- implementation-near contracts such as `docs/api-contract.md` and `docs/orchestration-contract.md`
- storage and schema notes such as `docs/storage-schema.md`
- release and operational checklists once they exist

Repo docs should remain close to implementation detail, not become a shadow project manager.

## Discovery order for Codex

When starting work, Codex should read in this order:

1. Linear issue or epic for the current execution slice
2. Confluence requirement or architecture page if the ticket points to one
3. repo `docs/` for code-near contracts, ADRs, and runbooks
4. implementation files in `apps/`, `scripts/`, and `data/`

If a required source does not exist, Codex should create the missing artifact in the owning system instead of leaving the decision only in chat history.

## Cross-link rules

- Every Linear epic should point to at least one canonical requirement or design document.
- Every implementation-near repo doc should name the Linear issue or epic that justified it.
- Every ADR should link to the decision context, affected components, and any superseded ADR.
- Confluence summary pages should link down to deeper repo docs when implementation semantics matter.
- README should point to the most important repo-local entry documents so a new operator can orient quickly.

## No orphan knowledge classes

These requirement classes already have a home:

| Requirement class | Home |
| --- | --- |
| MVP scope and non-goals | `docs/prd.md` now, later mirrored or promoted into Confluence |
| local runtime setup | `docs/local-development.md` |
| code ownership and cleanup boundaries | `docs/code-ownership.md` plus `docs/code-ownership.json` |
| backend and frontend API semantics | `docs/api-contract.md` |
| orchestration semantics | `docs/orchestration-contract.md` and `npm run check:orchestration` |
| storage semantics | `docs/storage-schema.md`, `npm run check:storage`, and `npm run check:archive` |
| architecture boundaries | `docs/architecture.md` now, later mirrored or promoted into Confluence |
| execution backlog and delivery status | Linear project `rssmaster` |
| architectural decisions | `docs/adrs/` |
| agent execution workflow | `CONTRIBUTING.md`, `docs/agent-workflow.md`, `docs/quality-gates.md`, `docs/rssmaster-domain-rules.md`, and `AGENTS.md` |
| CI/CD and deployment policy | `.github/workflows/ci.yml` and `docs/ci-cd.md` |
| observability and error monitoring | `docs/observability.md` |
| magazine issue model | `docs/magazine-model.md` and `docs/runbooks/magazine-local-smoke.md` |
| edition artifact storage | `docs/edition-storage.md` |

## Repository entry points

- `docs/prd.md` is the current local MVP scope mirror
- `docs/architecture.md` is the current local architecture overview mirror
- `docs/code-ownership.md` is the current owner map for cleanup work and the source for `npm run check:ownership`
- `docs/ui-system.md` defines the current hybrid RSSmaster + shadcn/ui migration policy
- `docs/agent-workflow.md` defines the Linear-to-code workflow for agents
- `docs/quality-gates.md` defines the verification gate to run for each change class
- `docs/rssmaster-domain-rules.md` defines local-first product invariants and backlog triage rules
- `docs/magazine-model.md` defines the digest-backed magazine issue model and future durable table boundary
- `docs/runbooks/magazine-local-smoke.md` defines the magazine local smoke path and evidence expectations
- `docs/edition-storage.md` defines the local artifact archive boundary and future object-storage seam
- `docs/ci-cd.md` defines the GitHub Actions quality gate and explains why deployment is not configured yet
- `docs/observability.md` defines optional Sentry configuration for API and web error monitoring
- `docs/orchestration-contract.md` defines reusable pipeline semantics
- `docs/adrs/README.md` defines where architecture decisions should be recorded
- `docs/runbooks/live-delivery-signoff.md` defines the manual SMTP/Kindle acceptance path that automated release evidence intentionally does not perform

## Practical rule

If you cannot answer "where does this decision live after today," the documentation is incomplete and should be fixed before more implementation piles on top.
