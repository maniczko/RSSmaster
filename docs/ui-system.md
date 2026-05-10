# RSSmaster UI system

Linear anchor: `VAT-193`

RSSmaster uses a hybrid UI system during the shadcn/ui migration.

## Current layers

- Product-specific layout, reader typography, and premium surfaces remain in `apps/web/app/styles/*`.
- Existing RSSmaster primitives remain in `apps/web/app/components/workspace-primitives.tsx`.
- shadcn/ui components live under `apps/web/app/components/ui/*`.
- Shared class merging lives in `apps/web/app/lib/utils.ts`.

## shadcn/ui configuration

- The project config is `apps/web/components.json`.
- Component base is `radix`.
- Tailwind is v4 and is loaded from `apps/web/app/globals.css`.
- shadcn aliases intentionally point into `apps/web/app`:
  - `ui`: `@/app/components/ui`
  - `utils`: `@/app/lib/utils`
  - `components`: `@/app/components`

## Migration rule

Prefer small adapters over large rewrites.

Good first targets:

- isolated controls and cards with existing unit tests
- empty states and small status chips
- settings and source-management panels

Avoid early migration of:

- reader article typography
- route synchronization
- `channel-lab.tsx` state orchestration
- large source/digest/magazine flows without browser smoke coverage

## Component policy

- Add upstream components with `npx shadcn@latest add <component>` from `apps/web`.
- Run `npx shadcn@latest docs <component>` before using a new component family.
- Preserve existing `data-testid`, focus order, and Polish copy when migrating a component.
- Keep RSSmaster theme tokens separate from shadcn tokens. shadcn variables use the `--shadcn-*` prefix so they do not overwrite legacy tokens such as `--muted`.

## Verification

For shadcn foundation or component migration, run at minimum:

```powershell
npm run build
npm run test:unit:web
npm run check:layout
```

When the changed component is visible in source onboarding, also run:

```powershell
npm run check:sources
```

When the change may affect global CSS or reader chrome, also run:

```powershell
npm run check:reader:interaction
```
