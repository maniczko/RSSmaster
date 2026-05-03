# Live SMTP and Kindle delivery sign-off

Linear anchor: `VAT-196`

This runbook is the manual, intentional proof that RSSmaster can send a real EPUB through SMTP and that Amazon accepts and renders it in a Kindle library. Automated checks still stop at preflight and dry-run because live delivery requires real credentials, a real Kindle address, and human confirmation.

## Scope

Use this runbook only for live sign-off. It verifies:

- SMTP server accepts the RSSmaster message.
- RSSmaster persists a delivery log for the live send.
- Amazon accepts the attached EPUB for the configured Kindle address.
- The document opens on Kindle or in a Kindle app with readable title, table of contents, and article body.

It does not verify long-term Amazon delivery reliability, spam filtering across every provider, or every EPUB in the local library.

## Safety rules

- Do not write SMTP passwords, app passwords, OAuth tokens, or full private addresses into the repo.
- Store completed evidence under ignored `output/live-delivery/`.
- Redact private addresses as `reader***@example.com` and `name***@kindle.com`.
- Use a small digest or a single article first.
- Run settings preflight with `check_connection: true`, then dry-run, before `mode: "send"`.
- Confirm the Amazon approved sender before the live send.

## Prerequisites

1. RSSmaster is running on the target runtime.
2. Delivery settings are configured in the app:
   - `smtp_host`
   - `smtp_port`
   - `smtp_username`
   - `smtp_password`
   - `smtp_from`
   - `kindle_email`
3. In Amazon Personal Document Settings, `smtp_from` is listed as an approved sender.
4. A digest EPUB exists, or an article is open and the reader `Wyślij na Kindle` action can build a one-item EPUB.

## Evidence setup

1. Create a new evidence file from `docs/runbooks/live-delivery-evidence-template.md`.
2. Save it under ignored output, for example:

```text
output/live-delivery/2026-05-02-kindle-signoff.md
```

3. Fill in non-secret environment fields before sending.

## Procedure

1. Record the current commit or branch in the evidence file.
2. Run delivery settings preflight from the UI, or call `POST /api/v1/settings/delivery/preflight` with `check_connection: true`.
3. Build a digest EPUB from `/digest`, or open an article and use `Wyślij na Kindle`.
4. If using `/digest`, run delivery preflight for the built digest.
5. Run dry-run send and record the resulting delivery log id.
6. Run the live send intentionally:

```json
{
  "digest_id": "dig_...",
  "target_kind": "kindle",
  "mode": "send"
}
```

7. Record:
   - digest id
   - digest title
   - artifact path
   - artifact sha256
   - delivery log id
   - delivery status
   - RSSmaster message id when available
   - recipient redacted Kindle address
8. Wait for Amazon processing. This may take several minutes.
9. Open the document on Kindle or in the Kindle app.
10. Confirm:
    - title is recognizable
    - content opens without conversion failure
    - at least one article body is readable
    - table of contents or article boundary is acceptable
    - no secret or local filesystem path appears in the rendered document
11. Add optional screenshots under `output/live-delivery/` and reference their paths in the evidence file.

## Pass criteria

Live sign-off passes only when all are true:

- RSSmaster delivery log status is `sent`.
- SMTP provider accepted the message without an error.
- Settings preflight with `check_connection: true` passed before the live send.
- Amazon shows the document in the Kindle library or target app.
- The EPUB renders with readable body content.
- Evidence file is complete and contains no secrets.

## Failure triage

- If preflight fails, fix settings before sending.
- If SMTP fails, verify host, port, TLS, username, app password, and `smtp_from`.
- If Amazon does not accept the message, verify approved sender and supported attachment type.
- If Amazon accepts but rendering is poor, inspect the generated EPUB and file a digest/EPUB quality issue.
- If a live send accidentally used the wrong recipient, stop and rotate credentials if needed.

## Release interpretation

After a passing evidence file exists, `npm run release:evidence` may still list live SMTP and Kindle acceptance as automated `unverified`; that is expected. The release decision should reference the manual evidence path explicitly.
