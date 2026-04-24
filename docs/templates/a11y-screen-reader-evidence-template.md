# Screen Reader Evidence Template

Use this template to capture manual accessibility sign-off evidence for RSSmaster.

Recommended save path after filling:

- `output/playwright/a11y-screen-reader-signoff-YYYY-MM-DD.md`

## Case metadata

- **Case ID:**
- **Date:**
- **Reviewer:**
- **Workspace / branch:**
- **Flow:** `/sources` or `/read/saved`
- **Decision:** `pass` / `pass-with-parity-note` / `fail` / `blocked`

## Environment

- **OS:**
- **Browser:**
- **Screen reader:**
- **Screen reader version:**
- **Screen reader availability check:** `NVDA.exe`, `Narrator.exe`, or `VoiceOver` and what was actually present
- **Execution mode:** `NVDA-first`, `Narrator fallback`, `VoiceOver parity`, or `blocked`
- **Display scale / zoom:**
- **Runtime notes:** default ports or fallback ports, if relevant

## Automation evidence

Use this section for the browser/runtime proof that precedes manual narration.

- **Browser smoke artifact(s):**
- **Browser accessibility snapshot artifact(s):**
- **Smoke command used:**
- **Smoke status:** pass / fail
- **Relevant artifact paths:**

## Manual spoken evidence

Use this section for the actual screen-reader sign-off. Keep it separate from automation evidence.

## Test path

List the exact path taken through the product.

Example:

1. Opened route
2. Focus landed on
3. Selected mode / item
4. Completed action
5. Returned or refreshed

## NVDA-first narration notes

Capture what the screen reader actually said or implied at each checkpoint.

- **Page entry:**
- **Primary control labels:**
- **Region / landmark traversal:**
- **State change announcements:**
- **Error / empty / loading messaging:**
- **Focus return behavior:**
- **Focus trail / snapshot notes:**

## Runtime boundary

Use this section to note runtime state, but do not turn it into a cold boot gate.

- **Canonical cold boot status:** separate gate / not applicable / failed / passed
- **Fallback runtime status:** pass / fail / not used
- **Notes:** any port fallback or runtime caveat that shaped the manual pass

## `/sources` checkpoints

Use this section when validating the add flow.

- **Skip link / first focus:**
- **Input naming and hinting:**
- **Mode selection:**
- **Preview or discovery result:**
- **Success / failure announcement:**
- **Backoffice focus continuity:**

## `/read/saved` checkpoints

Use this section when validating cleaned reader rendering.

- **Article title and header:**
- **Image / figure speech:**
- **Heading / list / quote order:**
- **Link and button naming:**
- **Toolbar controls:**
- **Notes / highlight / stateful actions:**
- **Back navigation and restore:**

## VoiceOver parity

Fill this section only if VoiceOver was run.

- **VoiceOver result:** pass / fail / blocked
- **Differences from NVDA:**
- **Any macOS-specific issue:**

## Issues found

For each issue, include a short sentence and the impact.

1. **Issue:**
   - **Impact:**
   - **Where it happened:**
   - **Suggested follow-up:**

## Final call

- **Overall result:**
- **Remaining risk:**
- **Reviewer sign-off:**
