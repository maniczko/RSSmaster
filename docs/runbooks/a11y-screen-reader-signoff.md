# Screen Reader Sign-off Runbook

This runbook defines the manual accessibility sign-off protocol for RSSmaster reader surfaces that need real screen-reader validation, not just keyboard automation or browser smoke.

## Scope

Use this protocol for:

1. `/sources` add flow
2. `/read/saved` cleaned reader

The sign-off target is decision-complete coverage for the two flows above. Do not treat browser smoke, focus management, or keyboard reachability alone as screen-reader proof.
Do not use this runbook as a canonical cold boot gate; runtime port proof belongs in the runtime QA and port-audit harnesses.

## Evidence boundary

This runbook is for spoken, manual AT evidence only.

Use browser/runtime automation evidence as baseline context, but keep it separate from the manual call:

1. Automation evidence proves the app booted, the route worked, and the browser smoke passed.
2. Manual AT evidence proves the user can understand the same flow through narration.
3. Cold boot evidence is a separate runtime gate and must not be merged into the accessibility decision.

## Primary decision rule

NVDA on Windows is the primary sign-off path.

VoiceOver on macOS is optional parity evidence. Use it to confirm there is no major AT-specific regression, but do not require it as the deciding gate unless the change is explicitly cross-platform accessibility work.

If NVDA is not installed on the current Windows machine, use Narrator as the fallback screen reader and record that fact explicitly in the evidence. Do not silently upgrade Narrator fallback into NVDA proof.

If Narrator is used, mark the decision as Narrator fallback evidence and keep the limitation explicit in the final call.

## Local availability check

Before starting the manual pass, verify which screen readers are actually available on the machine:

```powershell
Get-Command NVDA.exe, Narrator.exe -ErrorAction SilentlyContinue
```

If the command finds only `Narrator.exe`, you can still perform a meaningful manual pass, but the outcome should be recorded as Narrator fallback evidence rather than NVDA-first sign-off.

## What counts as sign-off

A flow is sign-off complete only when all of the following are true:

1. The keyboard path still works end to end.
2. The screen reader announces the right controls, regions, and state changes in the right order.
3. The user can complete the task without getting trapped, disoriented, or forced to infer hidden state.
4. The recorded evidence is sufficient for another reviewer to audit the pass.

## What does not count

The following are necessary but not sufficient:

- Playwright or browser smoke
- visible focus ring checks
- live-region presence in the DOM
- accessible-name inspection alone
- screenshots without narration notes

## Preconditions

Before starting the manual pass, confirm the latest browser smoke evidence already exists for the flow being reviewed:

- `output/playwright/sources-a11y-smoke.json`
- `output/playwright/sources-a11y-smoke.png`
- `output/playwright/reader-rich-smoke.json`
- `output/playwright/reader-rich-smoke.png`
- `output/playwright/reader-qa.json`

If the browser smoke is missing or clearly stale, stop and run the appropriate existing QA path first. Do not use the manual pass to compensate for a broken baseline.
Do not require canonical cold boot green for this sign-off if the runtime proof lives in a separate release gate; this runbook only consumes the latest available automation evidence.

## Manual pass order

### 1. `/sources` NVDA pass

Validate the source onboarding flow with a real screen reader on Windows.

Check:

1. landing on `/sources` exposes a sensible page title and starting context
2. the skip/link, search/input, and mode controls are named clearly
3. the chosen mode is announced without duplicate or contradictory speech
4. the results region is discoverable and the preview outcome is understandable
5. expected failure states are calm and descriptive
6. the follow/add action is announced as a successful state change
7. the backoffice region, if opened, does not steal focus unexpectedly

Pass criteria:

- NVDA narration matches the intended task flow
- no critical action is silent
- no control is mislabeled in a way that blocks task completion
- focus return remains predictable after success, failure, and mode switches

### 2. `/read/saved` NVDA pass

Validate the cleaned reader with a real screen reader on Windows.

Check:

1. article title and reading surface are announced clearly
2. headings, lists, quotes, links, and media are read in a logical order
3. article images are understandable and do not create noisy or repetitive speech
4. the reader toolbar controls are reachable and named correctly
5. notes, highlight, and other stateful reader actions are announced in context
6. navigation back to the saved list is reliable and focus does not jump unexpectedly

Pass criteria:

- the article can be read from top to bottom without lost context
- toolbar actions are reachable, named, and predictable
- rich HTML does not collapse into a confusing stream of speech
- reader state restoration still works after navigation or refresh

## Optional VoiceOver parity

If the change is likely to affect macOS users or introduces a semantics-heavy reader update, repeat the relevant flow in VoiceOver.

Use VoiceOver to check:

- landmark traversal
- heading navigation
- button and link naming
- announcement timing for dynamic updates
- whether the same task still feels coherent on a different AT/browser stack

Record VoiceOver as parity evidence, not as a replacement for the NVDA-first gate.

## Evidence package

Capture the following for each signed-off flow:

1. date and local time
2. browser and OS
3. screen reader and version
4. tested route
5. commands or harness used to start the runtime, if any
6. browser smoke artifact references
7. browser accessibility snapshot references if the harness captured them
8. concise narration notes for each checkpoint
9. pass/fail decision and any follow-up risk
10. whether the spoken pass came from NVDA-first or Narrator fallback

Store the structured notes in the reusable template under `docs/templates/`.
Use `docs/templates/a11y-screen-reader-evidence-template.md` as the source template, then save the filled evidence under `output/playwright/a11y-screen-reader-signoff-YYYY-MM-DD.md`.

## Decision outcomes

Use one of these outcomes:

- `pass`
- `pass-with-parity-note`
- `fail`
- `blocked`

Guidance:

- `pass` means the primary spoken path for this machine is complete and no critical SR issue remains:
  - NVDA-first when NVDA is available
  - Narrator fallback when NVDA is not available and the limitation is recorded explicitly
- `pass-with-parity-note` means the primary Windows path passed and VoiceOver produced minor non-blocking differences
- `fail` means a real SR defect blocks sign-off
- `blocked` means the environment, fixture, or runtime prevented a meaningful pass

## Narrator fallback operator appendix

Use this appendix when the availability check finds `Narrator.exe` but not `NVDA.exe`.

### Preflight

Run these commands first:

```powershell
Get-Command NVDA.exe, Narrator.exe -ErrorAction SilentlyContinue
$env:RSSMASTER_WEB_URL="http://127.0.0.1:3000"
$env:RSSMASTER_API_URL="http://127.0.0.1:8100"
npm run check:sources
npm run check:reader
```

Confirm these fresh artifacts exist before the spoken pass:

- `output/playwright/sources-a11y-smoke.json`
- `output/playwright/sources-a11y-smoke.png`
- `output/playwright/reader-rich-smoke.json`
- `output/playwright/reader-rich-smoke.png`
- `output/playwright/reader-qa.json`

### Start Narrator

Use one of these:

- `Win + Ctrl + Enter`
- `Start-Process C:\Windows\System32\Narrator.exe`

### Routes to open

1. `http://127.0.0.1:3000/sources`
2. `http://127.0.0.1:3000/read/saved`

### Evidence to fill

Use:

- template: `docs/templates/a11y-screen-reader-evidence-template.md`
- filled file: `output/playwright/a11y-screen-reader-signoff-YYYY-MM-DD.md`

### Closing rule for `VAT-135`

- close `VAT-135` only if the filled evidence reaches `pass` or `pass-with-parity-note`
- keep `VAT-135` open if the result is `blocked` or `fail`
- create a follow-up defect only when the spoken pass reveals a real product issue, not just a missing reviewer

## Review bar

Sign-off is complete only when the evidence shows:

- `/sources` works as an accessible add flow, not just a keyboard flow
- `/read/saved` is readable as a cleaned article surface, not just a styled HTML container
- any remaining gap is explicitly named and bounded

If a gap remains, do not call the flow signed off. Mark it `blocked` or `fail` and capture the specific missing condition.
