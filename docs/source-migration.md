# Source Migration

## Supported Migration Path

`rssmaster` supports OPML export and OPML import for source migration from tools such as Feedly or Inoreader.

## Export

1. Open the app.
2. Use `Capture and export`.
3. Export the workspace JSON for ownership backup.
4. Export OPML when you want a source-only interchange format.

## Import

1. Export OPML from the previous RSS tool.
2. Paste the OPML payload into `Capture and export`.
3. Run `Import OPML`.
4. Review duplicate counts and newly imported sources.

## Safety Rules

- duplicates are skipped instead of creating repeated channels
- category metadata from the OPML outline is preserved when present
- imported feeds still go through normal source health, sync, and ranking rules after import

## Recommended Sequence

1. import OPML
2. review source health
3. group or mute noisy sources
4. run sync
5. tune ranking preferences and interests
