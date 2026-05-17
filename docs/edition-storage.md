# Edition storage

Linear anchor: `VAT-296`

RSSmaster stores generated magazine/digest files as local artifacts, not only database rows.

## V1 storage model

The current implementation uses a local `EditionStorage` adapter in `apps/api/app/digests/storage.py`.

Responsibilities:

- create the artifact root when needed
- write Kindle-ready EPUB bytes
- derive a deterministic filename from the issue id and title
- return the artifact path, SHA-256, and byte size

The database remains the system of record for workflow state:

- `digest_history.artifact_path`
- `digest_history.artifact_sha256`
- `digest_history.artifact_size_bytes`
- `delivery_logs` for delivery attempts
- `job_runs` for build/delivery lifecycle evidence

The file itself remains local under the configured digest artifact root. `npm run check:archive` validates that the file exists, stays inside the expected archive root, has a matching SHA-256, and can be inspected by delivery code without regenerating it.

## Why local storage first

RSSmaster is local-first. Adding Cloudflare R2, Backblaze, Supabase Storage, or another object store would introduce credentials, network availability, retention policy, and privacy decisions that are not needed for V1.

V1 should keep the adapter small and replaceable instead of adding cloud storage prematurely.

## Future extension seam

If multi-device sync or hosted delivery later requires remote artifacts, introduce a second implementation behind the same domain boundary:

- `LocalEditionStorage` for current local-first use
- `ObjectEditionStorage` for remote object stores
- `EditionArtifact` metadata persisted in SQLite regardless of backend

Do not move artifact ownership out of the digest/magazine domain without updating `docs/storage-schema.md`, `docs/orchestration-contract.md`, and `docs/release-checklist.md`.

## Verification

Run:

```powershell
npm run check:archive
```

Expected evidence lives in `output/digest-archive-check.json` and includes:

- artifact path
- artifact size
- stored SHA-256
- calculated SHA-256
- EPUB quality report
- delivery artifact inspection
- magazine quality report
