# PRD skeleton

Linear anchor: `VAT-31`

## Product summary

rssmaster is a local-first reading workflow for collecting RSS sources, triaging incoming articles, generating a deterministic daily digest, and sending that digest to Kindle-friendly delivery targets.

The MVP intentionally optimizes for one operator on one machine before any multi-user or hosted concerns.

## Problem statement

The product should make it easy to:

- subscribe to feeds from direct RSS/Atom URLs or normal homepages
- save a single web article by URL when reading outside the app
- keep article ingestion observable and repeatable
- triage a growing reading list quickly
- package selected content into one clean daily digest
- deliver the digest to Kindle with minimal operator friction

## Users

### Primary user

- a single local operator who reads a high volume of articles and wants a premium, low-friction personal workflow

### Secondary future user

- a technically comfortable operator who may later reuse the orchestration model for other personal publishing or digest workflows

## MVP goals

The MVP must support:

1. local-first setup and predictable startup
2. feed subscription from direct feed URLs and homepage autodiscovery
3. persisted channels, items, settings, job runs, digest history, and delivery logs
4. manual and scheduled sync with visible run outcomes
5. basic article triage through read, favorite, and digest-candidate state
6. deterministic digest generation from persisted item state
7. Kindle-oriented delivery with visible send outcomes
8. operational diagnostics strong enough for safe Codex iteration

## Non-goals for MVP

The MVP explicitly does not include:

- hosted auth, remote identity providers, or multi-tenant collaboration
- cloud deployment as the primary runtime
- social sharing, annotations, or collaborative reading features
- recommendation systems or ranking models
- browser extensions or mobile apps
- arbitrary CMS publishing targets beyond the initial digest and delivery scope
- fully generic orchestration extraction as a shipped platform product

## Post-MVP directions

After the MVP is stable, likely next layers are:

- richer keyboard-first reader UX
- stronger extraction quality and fallback strategies
- reusable platform-core orchestration shared across projects
- more delivery targets and richer digest customization
- release hardening, performance profiling, and recovery tooling

## Localhost-first assumptions

- the first supported runtime is one local machine
- SQLite is the system of record for MVP state
- the operator owns configuration locally through `.env` and persisted settings
- startup failures should fail fast with actionable diagnostics
- the initial product may assume one trusted operator and local account auth only
- local artifacts may exist on disk, but critical workflow state must live in SQLite

## Local account model

- local accounts are in scope when they protect or isolate one operator's durable library on one machine
- the first account should claim the pre-auth shared workspace instead of discarding existing feeds and saved items
- account sessions are local-only and do not imply hosted sync, multi-user collaboration, or cloud tenancy

## Canonical MVP user journey

1. The operator boots the local web app and API.
2. The operator adds a source using either a direct feed URL or a homepage URL.
3. rssmaster validates the source before persisting it.
4. The operator triggers or schedules sync runs to ingest new entries.
5. Newly ingested items appear in the reading workflow.
6. The operator triages items using read, favorite, and digest-related state.
7. rssmaster generates a deterministic digest from selected or eligible items.
8. The operator reviews send readiness and delivers the digest to Kindle.
9. The operator can inspect job history, digest history, and delivery logs when something fails.

## Core product flows

### Flow 1: subscribe to a source

- input: feed URL or homepage URL
- system behavior: validate, autodiscover when needed, reject ambiguous sources clearly
- ux rule: the first sources screen should stay add-first and lightweight; operational source management belongs in a secondary layer, not in the default first-contact viewport
- output: active channel with visible status and metadata

### Flow 2: ingest new items

- input: manual or scheduled sync
- system behavior: fetch entries, normalize, deduplicate, persist run history
- output: updated item list and observable run result

### Flow 2b: capture a read-later link

- input: a normal article URL shared or pasted from outside the app
- system behavior: fetch, extract, store the article inside the saved library, preserve any quick capture note, and keep a direct route back into the reader article surface
- output: one saved item ready for later reading without requiring feed subscription first

### Flow 3: triage articles

- input: unread items in the reader
- system behavior: support practical filters and explicit state transitions
- output: a curated set of items ready for digest generation

### Flow 4: build digest

- input: selected or eligible items
- system behavior: compose a deterministic digest and package it for Kindle-safe reading
- output: stored digest history entry and local artifact

### Flow 5: review magazine issues

- input: digest history and currently selected digest candidates
- system behavior: expose a calm `/magazines` surface for listing issues such as `Wydanie 1/2026`, opening an issue through a shareable `/magazines?issue=<id>` link, reviewing its article snapshot, starting generation, inspecting issue history, and running delivery checks for the opened issue
- output: a visible magazine issue archive backed by deterministic digest artifacts and selection snapshots

### Flow 6: deliver digest

- input: a built digest and configured delivery settings
- system behavior: run preflight checks, send, and persist delivery result
- output: visible send status with retry context

## Success criteria for MVP

- a new machine can boot the project from repo docs alone
- a healthy feed can be subscribed and managed from the UI
- repeated syncs do not create duplicate items
- digest composition is reproducible from persisted state
- delivery attempts are visible and auditable
- failures are explicit enough that Codex can continue implementation without guessing system behavior

## Source of truth links

- documentation ownership and cross-link rules: `docs/documentation-map.md`
- magazine issue model: `docs/magazine-model.md`
- architecture and runtime shape: `docs/architecture.md`
- local setup and operations: `docs/local-development.md`
- API surface: `docs/api-contract.md`
- orchestration semantics: `docs/orchestration-contract.md`
- storage design: `docs/storage-schema.md`
