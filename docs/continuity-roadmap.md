# Continuity Roadmap

## Current Shippable Milestone

The first continuity milestone is intentionally narrow:

- current-device session restore
- stored reading progress per article
- resume surfaces in the reader and briefing
- quick URL capture into the saved library
- dedicated `/capture` entry point with prefilled URL/title support
- manifest-driven web share target and bookmarklet-friendly browser capture
- exportable continuity bundle for portability, including feed OPML, library state, and browser-restored reader context

## Offline / PWA Scope

The smallest useful offline-aware milestone is:

1. installable shell
2. cached app chrome
3. cached cleaned article bodies for recently opened items
4. explicit offline indicator instead of pretending background sync exists

Not in the first milestone:

- full background feed sync while offline
- conflict resolution across multiple devices
- silent write-behind semantics for annotations or triage state

## Cross-Device Future-Safe Plan

When rssmaster moves beyond local-only continuity, the sync model should promote the following records to durable sync entities:

- library state: read, saved, archived, digest-candidate
- reader continuity: active item, last open view, reading progress
- annotations: notes, highlights, highlight anchors
- profile settings: interests, source controls, saved searches

## Rollout Order

1. current-device continuity
2. installable offline-aware shell
3. durable sync contract for continuity records
4. multi-device transport and conflict rules

## Remaining umbrella backlog order

Keep the broader cross-device continuity follow-up as one umbrella until these milestones are complete in order:

1. define the durable sync contract for continuity entities:
   - library state
   - reader continuity
   - annotations
   - profile settings
2. add transport between devices for those continuity entities
3. define and implement conflict rules for concurrent edits
4. replay notes, highlights, tags, and collections as part of the post-import continuity experience

## Current Manual Portability Contract

Today RSSmaster ships a manual continuity bundle instead of automatic multi-device sync:

- export starts from `GET /api/v1/workspace/export`
- the browser augments that export with local reader route and reading progress
- import starts with `POST /api/v1/workspace/continuity/import`
- the browser then restores local route, view preferences, and reader progress from the downloaded bundle

What is restored now:

- feed presence through optional OPML import
- library-state booleans matched by `normalized_source_url`
- notes and highlights replayed onto the primary matched local item for a given article source URL
- tag assignments, collection definitions, collection memberships, and saved searches from the manual continuity bundle
- active reader article, library view, search scope, and saved-reader route
- local reader progress and reading-surface scroll position

What is not restored yet:

- live multi-device transport
- conflict resolution
- automatic cross-device propagation of annotations, tags, collections, and saved searches without a manual bundle handoff
