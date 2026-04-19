# Release checklist

This checklist is the implementation-near gate for calling the local rssmaster runtime release-ready.

## 1. Runtime boot

- Run `npm run bootstrap` on a clean machine or clean virtual environment.
- Run `npm run dev`.
- Confirm `http://127.0.0.1:3000/api/health` returns `status: ok`.
- Confirm `http://127.0.0.1:8000/health` returns `status: ok`.
- Confirm `http://127.0.0.1:8000/diagnostics/startup` reports `database_ready: true`.

## 2. Automated verification

- Run `npm run build`.
- Run `npm run check`.
- Treat any failure in `scripts/check_api.py` as a release blocker.

Current automated coverage:

- channel add flow with direct feed validation and homepage autodiscovery
- sync run creation, partial failure handling, rerun recovery, and deduplication
- extraction from real article pages into `cleaned_html` and `content_text`
- item detail plus list filters for channel, category, state, digest candidate, metadata search, and time windows
- read, save, unsave, archived-history, and baseline page-envelope verification for the current filter-based library model
- delivery settings save and preflight
- digest preview/build/history
- delivery preflight and dry-run dispatch with persisted logs
- schema integrity for `channels`, `items`, `settings`, `job_runs`, `digest_history`, and `delivery_logs`

## 3. Manual operator smoke

- Open `http://127.0.0.1:3000/`.
- Add at least one feed from the UI.
- Trigger a manual sync.
- Confirm the reader list shows imported items.
- Toggle `read`, `favorite`, and digest selection from the UI.
- Confirm counts and channel state reconcile after changes.

## 4. Data integrity checks

- `items.cleaned_html` should be populated for feeds whose article pages are reachable and readable.
- `items.extraction_status` should not stay stuck at `running`.
- `job_runs` should show the latest sync history with terminal states.
- `channels.unread_count` should reconcile with item read state after mutations.

## 5. Blocking gaps before full MVP release

These are still release blockers for the full PRD loop, even if the current automated suite is green:

- real SMTP send path is implemented but not covered by automated checks against a live mail server
- no automated proof exists yet for a real Kindle inbox accepting and rendering the sent EPUB
- UI smoke is still manual; keyboard ergonomics and focused mode are not asserted in browser automation

Interpretation:

- current runtime can be called release-ready for local ingest, extraction, reader triage, digest packaging, and delivery dry-runs
- current runtime still needs live SMTP and Kindle acceptance proof before being called fully release-ready for the PRD's final send promise
