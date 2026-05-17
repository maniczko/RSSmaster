# Orchestration contract

Linear anchor: `VAT-32`

This document defines the reusable orchestration contract for rssmaster background work. The goal is to separate a generic pipeline runtime from rssmaster-specific business rules so ingest, extraction, digest packaging, and delivery can later move into a shared platform-core without changing product semantics.

## Design goals

- keep lifecycle states explicit and stable across projects
- make retries, timeouts, and cancellation deterministic
- let adapters own business logic while the orchestration core owns execution semantics
- preserve enough run metadata that failures can be reconstructed from SQLite alone
- support partial success without collapsing it into either total success or total failure

## Canonical lifecycle states

Every persisted job run must use one of these states:

| State | Meaning | Exit paths |
| --- | --- | --- |
| `pending` | accepted for execution but not started yet | `running`, `canceled` |
| `running` | actively executing at least one step or unit of work | `partial_success`, `failed`, `canceled`, `completed` |
| `partial_success` | execution finished, at least one unit succeeded, and at least one unit failed or was skipped in a non-terminal way | terminal |
| `failed` | execution cannot produce a valid outcome for the requested scope | terminal |
| `canceled` | execution was intentionally stopped before a valid final outcome | terminal |
| `completed` | execution finished successfully for the full requested scope | terminal |

## Shared run model

The orchestration core treats each job as a persisted run with:

- `id`: stable run identifier
- `job_type`: rssmaster currently uses `sync`, `extract`, `digest`, and `delivery`
- `trigger_kind`: `manual`, `scheduled`, or `system`
- `status`: one of the canonical lifecycle states
- `scope`: durable JSON describing the requested work target
- `metadata`: durable JSON for non-business execution metadata
- `parent_run_id`: optional pointer to the parent run when a child run or retry attempt is materialized separately
- `retry_count`: number of retries already consumed by the logical run
- `total_count`, `success_count`, `failure_count`: execution counters for unit-level observability
- `started_at`, `completed_at`, `duration_ms`: wall-clock execution metadata

In rssmaster this model persists in `job_runs` and should remain the canonical audit trail for every background operation.

The local regression guard for this contract is `npm run check:orchestration`. It runs an isolated scheduled sync with one healthy feed and one failing feed, then continues through digest build and delivery dry-run. The check verifies the corresponding `job_runs`, partial feed error visibility, digest archive row, delivery log, generated artifact, and a `monitoring_report` in `output/job-orchestration-check.json`. It does not prove a hosted scheduler daemon, Inngest, live SMTP, or Kindle inbox acceptance.

## Payload envelope

The orchestration core passes a stable envelope into each step:

```json
{
  "run": {
    "id": "run_123",
    "job_type": "sync",
    "trigger_kind": "manual",
    "status": "running",
    "retry_count": 0,
    "scope": {
      "channel_ids": ["chn_123"]
    },
    "metadata": {
      "requested_by": "operator",
      "trace_id": "trace_123"
    }
  },
  "context": {
    "timeout_seconds": 300,
    "cancellation_key": "cancel_123",
    "idempotency_key": "sync:chn_123:2026-04-17"
  },
  "input": {},
  "artifacts": {}
}
```

Envelope rules:

- `run.scope` is durable business scope and should survive restarts
- `run.metadata` is durable execution context useful for debugging and replay
- `context` may contain transient runtime controls and derived execution knobs
- `input` is the step-specific normalized input produced by the previous step or adapter
- `artifacts` is the step-to-step container for durable outputs such as fetched entries, cleaned HTML, packaged digest metadata, or delivery receipts

## Step contract

The platform-core should expose a uniform step contract regardless of project:

- `ingest`: gather source records and produce normalized item candidates
- `extract`: transform raw article content into cleaned reading content
- `package`: turn curated content into a deterministic output artifact
- `deliver`: send a packaged artifact to the configured destination

Each step must accept:

- the shared payload envelope
- a runtime handle with logging, storage, clock, and cancellation primitives
- adapter configuration relevant to the project

Each step must return:

```json
{
  "status": "completed",
  "output": {},
  "artifacts": {},
  "counts": {
    "total": 1,
    "succeeded": 1,
    "failed": 0
  },
  "warnings": [],
  "errors": [],
  "retryable": false
}
```

Step return rules:

- `status` may be `completed`, `partial_success`, `failed`, or `canceled`
- `output` is the normalized business result used by downstream steps
- `artifacts` contains durable references or payload fragments worth persisting
- `counts` must reflect unit-level execution, not just step-level success
- `errors` must be structured enough to persist into `error_code`, `error_message`, and `error_details_json`
- `retryable` describes whether the failed outcome can be retried automatically without changing the request

## Retry semantics

- Retries are allowed only when the failing step reports `retryable: true` or the adapter marks the failure class as transient.
- `retry_count` must increase before a retry attempt starts.
- Retrying a run must preserve the same business `scope`.
- Automatic retries must not duplicate durable side effects; steps are required to use idempotency keys or dedupe checks before writing.
- If the retry budget is exhausted and no valid full result exists, the run becomes `failed` or `partial_success` depending on unit outcomes.

## Timeout semantics

- Each job type should define a default timeout budget at orchestration level.
- Each step may define a stricter timeout budget than the overall job.
- A timeout is a failed execution unless the adapter already produced a valid partial outcome and marked the result as `partial_success`.
- Timeout handling must persist the latest known counters and best available error details before the run exits.

## Cancellation semantics

- Cancellation is cooperative, not best-effort guessing.
- The runtime must check for cancellation before starting a step and after external network or filesystem boundaries.
- A canceled run must exit as `canceled`, never `failed`, unless the system cannot determine whether side effects completed safely.
- If some units already succeeded before cancellation, those durable results stay committed; the overall run still records `canceled`.

## Partial-success semantics

`partial_success` is required when:

- the run processed multiple units and at least one unit succeeded
- at least one unit failed, timed out, or was skipped for a business-valid reason
- the remaining successful output is still durable and meaningful to the operator

Examples:

- a sync run ingests 8 of 10 channels and 2 fail due to network errors
- an extract run cleans 15 items and 3 fail content parsing
- a delivery fan-out later sends to one target and another target fails

## Idempotency and deduplication

- Every run should derive an idempotency key from job type plus business scope.
- Replaying the same run must not create duplicate channels, items, digest rows, or delivery receipts.
- Adapters own domain dedupe rules; the orchestration core owns when replay is permitted.
- A retry may update observability fields and attempt counters, but it must not silently duplicate durable business records.

## rssmaster adapter mapping

rssmaster plugs into the generic contract like this:

| rssmaster job type | platform step | Primary scope | Primary durable outputs |
| --- | --- | --- | --- |
| `sync` | `ingest` | channel set or all active channels | updated `channels`, new or updated `items`, `job_runs` counters |
| `extract` | `extract` | item set needing cleanup | `items.cleaned_html`, `items.content_text`, extraction metadata |
| `digest` | `package` | selected or eligible item set | `digest_history`, local EPUB or digest artifact metadata |
| `delivery` | `deliver` | digest plus target | `delivery_logs`, provider message metadata |

The important separation is:

- the orchestration core decides how runs move through lifecycle states
- rssmaster adapters decide how to fetch feeds, clean articles, build digests, and deliver to Kindle targets

## Persistence expectations for rssmaster

- create or update a `job_runs` row before work starts
- persist counters continuously enough that a mid-run crash leaves useful evidence
- write project-specific outputs to their domain tables, not only to `metadata_json`
- store terminal error summaries in `job_runs`, even if detailed artifacts live elsewhere
- use `parent_run_id` only when materializing child attempts or fan-out units adds clarity; keep the first implementation simple when one row is enough

## Implementation guidance

When Codex implements future job execution:

1. create the run in `pending`
2. transition to `running` only when real work begins
3. update counters after each meaningful unit completes
4. let adapters return structured step results instead of mutating final status ad hoc
5. compute final status from counters and step result semantics, not from exceptions alone

## Related documents

- product scope: `docs/prd.md`
- API expectations: `docs/api-contract.md`
- storage model: `docs/storage-schema.md`
- system boundaries: `docs/architecture.md`
