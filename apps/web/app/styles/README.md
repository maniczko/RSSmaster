# RSSmaster Web Styles

This directory owns imported global CSS slices for the Next.js app shell.

- `base.css` contains foundational tokens, resets, primitive states, and legacy reader/workspace styles that must load first.
- `app-shell-reader-sources.css` is an ordered import manifest for the newer product shell layers.
- `legacy-workspace.css` keeps the older Inoreader-inspired workspace refresh rules that still need to load before the newer shell.
- `reader.css` owns reader queue, clean article, reader toolbar, quality, and command overlay rules.
- `app-shell.css` owns the product shell, app bar, nav rail, sidebar, and top-level navigation rules.
- `feed-browser.css` owns feed list/tree and feed stream browsing rules.
- `sources.css` owns the add/manage source onboarding surface.
- `capture-shared-surfaces.css` owns capture plus late shared cards/chips/surfaces that still need a follow-up extraction.
- `responsive.css` owns responsive overrides and should stay last.
- `../globals.css` should stay a small ordered import file. Do not add new surface styles there unless the import structure itself changes.

When changing visual behavior, keep cascade order stable and run `npm run build`, `npm run test:unit:web`, and `npm run check:layout`.
