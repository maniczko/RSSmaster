# Continuity Roadmap

## Current Shippable Milestone

The first continuity milestone is intentionally narrow:

- current-device session restore
- stored reading progress per article
- resume surfaces in the reader and briefing
- quick URL capture into the saved library
- dedicated `/capture` entry point with prefilled URL/title support
- manifest-driven web share target and bookmarklet-friendly browser capture
- exportable workspace state for portability

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
