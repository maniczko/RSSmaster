# Layout test plan

Use this runbook when a change touches layout, spacing, button rhythm, card gutters, responsive behavior, or page-level visual polish.

## Purpose

`npm run check:layout` is the repo-native browser sweep for page-level shell quality.

It is not a component workshop. It proves that the real app shell can:

- open the main RSSmaster surfaces without browser errors
- navigate between primary sections through the real UI
- hold desktop, tablet, and mobile layouts without horizontal overflow
- capture fresh screenshots for visual review
- record representative shell states, not just a single static render per route

## What it checks

Desktop routes:

- `/read/inbox`
- `/read/continue`
- `/read/saved`
- `/read/digest`
- `/read/archive`
- `/discover`
- `/sources`
- `/digest`
- `/settings`
- `/capture`

Responsive routes:

- `/read/inbox`
- `/discover`
- `/sources`
- `/digest`
- `/settings`
- `/capture`

The sweep records:

- console warnings and errors
- page errors
- horizontal overflow per route
- primary navigation clickthrough across `Czytaj`, `Odkrywaj`, `Zrodla`, `Digest`, `Ustawienia`
- screenshots under `output/playwright/`
- representative state screenshots for collapsed desktop shell and responsive menu-open states

## Commands

Run the layout sweep against the currently healthy runtime:

```powershell
npm run check:layout
```

If your healthy runtime is on fallback ports, set them explicitly:

```powershell
$env:RSSMASTER_WEB_URL='http://127.0.0.1:3100'
$env:RSSMASTER_API_URL='http://127.0.0.1:8100'
npm run check:layout
```

## Evidence

- summary: `output/playwright/layout-qa.json`
- screenshots:
  - `output/playwright/page-audit-*-desktop.png`
  - `output/playwright/page-audit-*-tablet.png`
  - `output/playwright/page-audit-*-mobile.png`
  - `output/playwright/page-audit-*-sidebar-collapsed.png`
  - `output/playwright/page-audit-*-menu-open.png`

## Representative states

The visual proof is intentionally split into two layers:

- route sweep screenshots prove the core shell loads across the main app surfaces
- representative state screenshots prove the shell can also move between common interaction states without clipping or layout collapse

Current representative states:

- desktop `read/inbox` with the shell sidebar collapsed
- desktop `sources` with the shell sidebar collapsed
- tablet `read/inbox` with the menu drawer opened
- mobile `sources` with the menu drawer opened

## What it proves

- browser sweep of the primary app shell is green
- primary navigation works in the real UI
- key screens stay within viewport width on desktop, tablet, and mobile
- representative shell states are captured as proof artifacts for manual visual review

## What it does not prove

- perfect visual polish by itself
- screen-reader spoken behavior
- canonical cold boot on `127.0.0.1:3000` and `127.0.0.1:8000`
- every possible content state for every screen

Use manual visual review together with the screenshots when the goal is premium polish, not just technical layout safety.
Inspect both the route sweep and the representative state screenshots before calling the layout pass release-confidence green.
