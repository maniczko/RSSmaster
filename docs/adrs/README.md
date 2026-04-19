# ADR index

Linear anchor: `VAT-33`

This directory is reserved for Architecture Decision Records for rssmaster.

## Purpose

Use ADRs when a decision:

- changes system boundaries or persistence rules
- introduces a meaningful tradeoff that future work must understand
- supersedes an earlier technical direction
- should survive beyond one ticket description or chat thread

## Naming convention

- file name format: `NNNN-short-kebab-title.md`
- example: `0001-use-sqlite-as-mvp-system-of-record.md`

## Suggested template

Each ADR should include:

1. title
2. status: `proposed`, `accepted`, or `superseded`
3. date
4. context
5. decision
6. consequences
7. links to related Linear issues, repo docs, and superseded ADRs

## Scope boundary

ADRs belong here when the decision is technical and durable. Ticket execution detail stays in Linear. Broader product intent belongs in Confluence or its temporary local mirror while bootstrap is in progress.
