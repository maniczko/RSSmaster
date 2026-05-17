# RSSmaster Domain Rules

Linear anchor: `VAT-292`

These rules protect RSSmaster from drifting into a generic dashboard or cloud service. They should guide implementation, review, and Linear triage.

## Product identity

RSSmaster is a local-first reading workspace for RSS/Atom sources, clean in-app reading, durable triage, deterministic digest/magazine generation, and Kindle-friendly delivery.

It is not:

- a multi-tenant cloud SaaS by default
- a generic analytics dashboard
- a social feed reader
- a place to add AI features when deterministic logic is enough

## Local-first data rules

- SQLite is the default system of record.
- Do not introduce PostgreSQL, Prisma, object storage, or hosted services unless a ticket explicitly justifies the migration and docs explain the operational cost.
- Never edit `data/*.db` by hand for implementation.
- Account/workspace context must be explicit for background jobs and delivery flows.

## Feed and reading rules

- A source should either sync successfully or explain clearly why it cannot.
- A readable item can be full cleaned text, feed text fallback, excerpt fallback, or source-only fallback, but the UI must label the quality honestly.
- Empty reader states must explain whether the cause is filter/search, saved/archive scope, no sync, no items, extraction failure, or auth state.
- Reader continuity should preserve route, active item, search, sort, and reading mode where possible.

## Digest and magazine rules

- Digest and magazine generation must use persisted state, not whatever happens to be visible in the browser.
- Generated artifacts must be auditable through history and logs.
- Magazine UI should be issue-first: concrete editions such as `Wydanie 1/2026`, not raw feed queues.
- Delivery must support dry-run evidence before live SMTP/Kindle acceptance.

## AI rules

- AI is optional and must be configurable.
- AI calls belong behind adapters/services, not scattered through UI or repositories.
- Prompts and model choices must be versioned or documented when they affect persisted outcomes.
- Missing API keys or provider failures must degrade gracefully.

## UI rules

- The reader should feel calm, text-first, and premium.
- Use the RSSmaster design system and shadcn/ui primitives where they improve consistency.
- Do not trade working reader/source/digest functionality for visual polish.
- Responsive and keyboard/focus behavior are part of the feature, not afterthoughts.

## Linear triage rules

- Prefer canonical issues over duplicate implementation threads.
- If a ticket says PostgreSQL/Prisma but the repo is SQLite local-first, treat it as a storage-model clarification task before changing technology.
- If a ticket says PostHog, decide whether an analytics adapter is safer than binding product code directly to one vendor.
- If a ticket says AI, start with settings, adapter, tests, and deterministic fallbacks before adding expensive runtime calls.
