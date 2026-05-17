# RSSmaster Agent Workflow

Linear anchor: `VAT-292`

This document defines the practical workflow for Codex and other agents working from Linear issues into local RSSmaster changes.

## Goal

Make agent work predictable: small slices, clear ownership, real verification, and accurate Linear status. The product should improve without leaving hidden runtime, UX, or documentation debt behind.

## Linear-to-code flow

1. Read the Linear issue and identify the user-visible outcome.
2. Check whether the issue is a duplicate, already satisfied, blocked, or underspecified.
3. Read the smallest relevant repo docs:
   - `docs/prd.md` for product scope
   - `docs/architecture.md` for runtime boundaries
   - `docs/api-contract.md` for API shape
   - `docs/storage-schema.md` for persisted data
   - `docs/release-checklist.md` for release expectations
4. Inspect the implementation owner from `AGENTS.md` and `docs/code-ownership.md`.
5. Move the issue to `In Progress` only when code/docs work actually starts.
6. Implement the smallest vertical slice that can be verified.
7. Run the matching quality gate from `docs/quality-gates.md`.
8. Update docs and Linear with factual evidence.

## Status rules

Use these rules when syncing Linear:

| Linear state | When to use |
| --- | --- |
| `Backlog` | Not started, still valid, not currently being implemented. |
| `Todo` | Selected next, ready to implement, dependencies clear. |
| `In Progress` | Active local work has started. |
| `In Review` | Implementation is complete, branch/PR or reviewable diff exists, gates are reported. |
| `Done` | Behavior is implemented, verified, documented if needed, and merged or otherwise accepted. |
| `Duplicate` | Another active or done issue owns the same outcome. Link the canonical issue. |
| `Canceled` | The issue conflicts with product direction or is no longer desired. Explain why. |

Do not mark an issue `Done` just because related code exists. Mark it done when acceptance criteria are demonstrably met.

## Duplicate handling

RSSmaster has several overlapping themes in Linear. Before implementing, check for duplicates around:

- AI scoring, classification, summaries, and OpenAI adapter
- PostHog or analytics adapters
- Daily Edition, Magazine, and Kindle Magazine UI
- PostgreSQL/Prisma data-model wording versus the actual SQLite local-first architecture
- Codex/agent workflow documentation

When a duplicate exists:

- keep the clearest issue as canonical
- mark the duplicate `Duplicate`
- add a comment naming the canonical issue and why
- do not implement the same scope twice

## Evidence expectations

For every completed issue, record:

- exact commands run
- whether each command passed or failed
- output artifacts when browser or release checks are involved
- remaining unverified items such as live SMTP, Kindle acceptance, secrets, or manual screen-reader sign-off

## Agent checklist

Before closing work:

- The change is scoped to the issue.
- The worktree does not include accidental runtime artifacts.
- Docs are updated when contracts, workflow, or storage changed.
- Tests match the touched surface.
- Linear status and comments reflect actual evidence.
- Any skipped check has a reason and follow-up.
