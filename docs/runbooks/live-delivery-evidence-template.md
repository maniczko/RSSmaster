# Live delivery evidence template

Copy this file to ignored `output/live-delivery/YYYY-MM-DD-kindle-signoff.md` before a live SMTP/Kindle sign-off. Do not store secrets in the completed evidence.

## Run metadata

- Date:
- Operator:
- Repo branch:
- Repo commit:
- Runtime web URL:
- Runtime API URL:
- Evidence file path:

## Delivery configuration

- SMTP provider or host family:
- SMTP port:
- SMTP username redacted:
- SMTP from redacted:
- Kindle email redacted:
- Amazon approved sender confirmed: yes/no
- Notes about credential type, for example app password: yes/no

## Artifact

- Source flow: digest UI / reader `Wyślij na Kindle` / API
- Digest id:
- Digest title:
- Article count:
- Artifact path:
- Artifact sha256:
- Artifact size bytes:

## Automated local checks before live send

- Settings preflight status:
- SMTP connection check status:
- SMTP NOOP or connection message:
- Delivery preflight status:
- Dry-run delivery log id:
- Dry-run delivery status:
- Commands or UI path used:

## Live send

- Live send timestamp:
- Delivery log id:
- Delivery run id:
- Delivery status:
- RSSmaster message id:
- Delivery log status after refresh:
- Job run status after refresh:
- Digest status after send:
- Sent at timestamp:
- Recipient redacted:
- Error code, if any:
- Error message, if any:

## Kindle acceptance

- Amazon receipt observed: yes/no
- Amazon observed at:
- Receipt time:
- Kindle render device/app checked:
- Document title as shown by Kindle:
- Opened successfully: yes/no
- Body readable: yes/no
- TOC/article boundaries acceptable: yes/no
- Conversion failure observed: yes/no
- Local paths or secrets visible in document: yes/no
- Screenshot paths under `output/live-delivery/`:

## Result

- Overall result: pass/fail
- Blocking issue ids created, if any:
- Follow-up notes:
