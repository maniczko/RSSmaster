# VAT-97 Cross-Device Sync — Implementation Plan (2026-04-24)

## Cel biznesowy
- Przenieść continuity z modelu manual portability (`export/import`) do bezpiecznego, automatycznego cross-device sync.
- Zachować manual bundle jako fallback/offline export i nie zepsuć obecnego UX.

## Zakres
- Dostarczyć dwukierunkową synchronizację dla:
  - item state: `is_read`, `is_favorite`, `is_archive`, `score_hint`, `digest_hint`
  - knowledge: notes, highlights, tags, collections assignment
  - collections metadata and membership
  - saved searches / source filters history where relevant
- Dodać conflict resolution i deterministyczne rozstrzyganie.

## Faza 1 — Model sync (podstawa)
1. Backend: nowy moduł `apps/api/app/sync/`
   - modele:
     - `SyncDevice`
     - `SyncState` (cursor per device)
     - `SyncOperation` (delta op)
     - `SyncTombstone` (idempotent deletes)
   - pola minimalne:
     - `device_id`, `scope`, `entity_type`, `entity_id`
     - `op_type` (`upsert`/`delete`)
     - `clock` (logical timestamp or monotonic counter)
     - `op_id` (deterministic ULID/UUID)
     - `payload_hash`
2. Endpointy API:
   - `POST /api/v1/sync/push`
   - `GET /api/v1/sync/pull`
   - `POST /api/v1/sync/ack`
   - `GET /api/v1/sync/state` (debug/operator)
3. Payload contract:
   - envelope: `{device_id, from_cursor, ops[], client_clock, batch_id, signature?}`
   - response: `{server_clock, server_cursor, ops[], pending_tombstones[], has_more}`

## Faza 2 — Mapowanie aktualnych danych
- Ułożyć mapy odczytu i zapisu między obecnym modelem a delta entities:
  - `items` ← `item_id`, `is_read`, `is_favorite`, `is_archive`, `digest_queue`
  - `annotations` ← note / highlight events
  - `collections` + `collection_items` + `tags` + join tables
  - `saved_searches`
- Nie zmieniać ręcznie `continuity bundle`:
  - pozostaje jako `restore/export` fallback
  - endpointy sync nie mogą zastępować obecnego bezpiecznika

## Faza 3 — Conflict resolution
- Ustalić policy (deterministyczne):
  - item flags (`is_read`, `is_favorite`, `is_archive`): last-writer-wins per entity by `(updated_at, op_id)`
  - notes/highlights: idempotent merge by hash
  - tags/collections: set-union z `op_id` tie-break
  - deletes: `tombstone` beats older upsert with older clock
- API odpowiada polem:
  - `applied_ops[]`
  - `rejected_conflicts[]`
  - `retry_after_ms` w razie przeciążenia

## Faza 4 — Frontend orchestration
- `apps/web/app/channel-lab.tsx`:
  - dodać background sync worker (poller + force sync button)
  - stan:
    - `unknown`
    - `syncing`
    - `synced`
    - `conflict`
    - `failed`
- UX:
  - przy pierwszym uruchomieniu, jeśli nie ma konta -> kontynuować open mode
  - po otwarciu konta: poller włączony (np. co 30s, exponential backoff przy błędzie)
- Po udanym pull → wymuszać odświeżenie list/triggers w cache.

## Faza 5 — Bezpieczeństwo i trwałość
- token/oparte auth:
  - użyć istniejącego konta lokalnego + urządzenie jako stabilny identyfikator
- retries:
  - `409` i `409_conflict` zapisane do `SyncState.retry_queue`
- dead-letter:
  - `sync_ops` niewykonalne po N próbach oznaczone jako `failed_permanent` z diagnostycznym komunikatem

## Faza 6 — Testy i dowód wdrożenia
- Unit/API:
  - `apps/api/tests/test_sync_*`:
    - idempotent upsert
    - idempotent delete through tombstone
    - conflict scenario (parallel edits)
    - cursor and pagination
- Browser:
  - scenariusz multi-session:
    - session A: add source, add note, tag
    - session B: import same item state, pull, validate
    - session C: concurrent edits -> conflict -> merge outcome zgodnie z policy
- Release smoke:
  - utrzymać obecny suite + dodać `npm run check:sync`
  - `app-qa` gate obejmuje:
    - sync push/pull
    - restore continuity
    - no regression on `check:sources` and `check:reader`

## Etapy wdrożenia (sequence)
1. Schema + repozytorium sync opów
2. API push/pull/ack
3. Web sync client + state UI
4. Conflict policy + dead-letter
5. Integration tests + QA
6. Aktualizacja docs + Linear + optional Confluence note if scope shifts

## Acceptance criteria (DoD)
- `VAT-97`:
  - cross-device zmianę widać po pullie na innym urządzeniu w ≤ 5 minut
  - brak utraty lokalnych danych dla notatek/tagów/collections w 30-dniowym scenariuszu
  - konflikty rozstrzygane deterministycznie, bez utraty zmian
  - manual continuity bundle nadal działa jako recovery path
  - runtime gates:
    - `contract_green=true`
    - `fallback_runtime_green=true`
    - `canonical_cold_boot_green=true` (jeśli obejmuje nowy sync path)

## Odpowiedzialności (preliminarne)
- backend: `apps/api` models/repository/service/routes
- frontend: `apps/web` sync orchestration + status surface in settings
- docs: `docs/api-contract.md`, `docs/local-development.md`, `docs/release-checklist.md`
- QA: `scripts/check_api.py`, nowe `check:sync` i manifest regresji

