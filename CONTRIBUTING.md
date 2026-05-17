# Contributing to RSSmaster

Linear anchor: `VAT-292`

RSSmaster is developed as a local-first product. Changes should preserve reader reliability, clear operator diagnostics, and premium reading UX.

## Start here

Before changing code, read:

- `AGENTS.md` for the repo-local agent contract.
- `docs/agent-workflow.md` for Linear-to-implementation workflow.
- `docs/quality-gates.md` for required verification by change class.
- `docs/rssmaster-domain-rules.md` for product and architecture invariants.

## Standard workflow

1. Identify the Linear issue, user request, or bug report being addressed.
2. Inspect the smallest relevant docs and code.
3. Make a short plan before editing.
4. Implement a narrow, reviewable slice.
5. Run the smallest sufficient gate first, then widen if the change crosses layers.
6. Update docs when behavior, contracts, storage, or operator workflow changes.
7. Sync Linear status only after verification supports the status change.

## Branch and PR policy

- Use `codex/<short-description>` for agent branches unless a user asks otherwise.
- Keep unrelated changes out of a PR.
- Do not rewrite public API or storage semantics without docs and tests.
- Prefer draft PRs for large bundles until gates are green and review notes are clear.

## Required final report

Every agent handoff should include:

- diagnosis and root cause
- plan and implementation summary
- changed files
- exact tests run and their result
- remaining risks
- what still does not work

The canonical final report format lives in `AGENTS.md`.
