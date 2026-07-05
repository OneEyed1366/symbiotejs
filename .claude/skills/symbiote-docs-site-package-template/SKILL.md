---
name: symbiote-docs-site-package-template
description: "Symbiote docs-site package-page template — read BEFORE writing or restructuring apps/docs-site/src/content/docs/docs/packages/*.mdx for any @symbiote-native/* wrapper package (slider, splash-screen, and every future one). Fixes the section order and, specifically, mandates a canonical `## API` heading (never `## Props` / `## Props / config` / any ad-hoc name) with one `###` sub-table per surface group (Props, Events, an imperative function's Signature, a hook/composable's config, a hook/composable's return value). Every table row MUST carry a real one-line human-readable Description — inspired by VueUse's function pages (vueuse.org/core/useX), which pair each TypeScript field with an inline JSDoc comment so the description can never drift from the type; we don't auto-generate from TSDoc (no build-time extractor yet), so the discipline is manual: no blank/empty Description cells, ever — an empty cell is the single most common way this template rots. Reference implementations: docs/packages/slider.mdx (Props table) and docs/packages/splash-screen.mdx (Signature / config / return-value tables, since it wraps both an imperative function pair and a hook). Trigger on 'add a package doc page', 'document @symbiote-native/<pkg>', 'API section for a package', 'docs-site package template', or any task following symbiote-third-party-native-view that reaches the docs-site step."
---

# Symbiote docs-site package-page template

One canonical section order for every `apps/docs-site/src/content/docs/docs/packages/<pkg>.mdx`
page, so a reader who's used one package page already knows where to look on the next.

## Section order

1. Frontmatter: `title` (the package's short display name, e.g. "Splash screen") + `description`
   (one sentence).
2. Intro paragraph — what it wraps, why it's a wrapper at all (one-line contrast against the
   closest sibling package, e.g. splash-screen.mdx contrasts itself against slider.mdx's
   native-view wrapping since it wraps an imperative TurboModule instead).
3. OS-platform support table + framework-adapter support table (`| OS platform | Support |` /
   `| Framework adapter | Support |`) — copy verbatim shape from either reference page.
4. `## Installation` — the real npm install command, per `docs-site.md`'s install-snippet rule
   (never `workspace:*` in a snippet).
5. `## Usage` — one `###` sub-heading per adapter (React / Vue / Angular) with a runnable code
   block each. If the package has more than one usage shape (e.g. splash-screen's imperative
   `hide()` vs the animated `useHideAnimation()`), nest an extra heading level per shape, each
   still broken out by adapter.
6. **`## API`** — see below, the section this skill exists to enforce.
7. `## How the wrapper works` (or `## How it works`) — the implementation-level section: what the
   package ships vs. what it doesn't (zero native metadata, register.ts side effects, etc.),
   linking back to `/symbiote-native/docs/how-it-works/`.

## `## API` — the enforced shape

Never `## Props`, `## Props / config`, or any other ad-hoc name — always exactly `## API`. Under
it, one `###` sub-table per distinct surface group the package exposes:

- A view/component package (slider) → `### Props` (a single table covering every prop, event
  callback, and the accessibility/style passthrough row).
- An imperative-function + hook package (splash-screen) → one table per shape:
  `### \`hide()\` / \`isVisible()\`` (a **Signature / Description** table, not Prop/Type/Default —
  there's no "prop" here, just function signatures), `### \`useHideAnimation()\` config` (the
  hook's input, Field/Type/Default/Description), `### \`useHideAnimation()\` return value` (the
  hook's output shape, Field/Type/Description — no Default column, since a return value has none).

Every table's last column is **Description**, always prose, always filled — the exact convention
VueUse pages use (its `Type Declarations` section pairs each field with an inline
`/** … */` JSDoc comment right above it: `useMouse`'s `type` field reads
"Mouse position based by page, client, screen, or relative to previous position", `touch` reads
"Listen to `touchmove` events", etc. — never a bare type with no explanation). We render the same
idea as a markdown table cell instead of a JSDoc block (no build-time TSDoc-to-markdown extractor
exists yet in this repo), but the bar is identical: **a reader must never have to open the source
to learn what a field does.** An empty Description cell is a template violation, not a stylistic
choice — if you can't write one honest sentence for a field, that's a signal the field itself
needs a better name or a code comment first.

## Applying this to a new package

1. Copy the section order above.
2. Pick the API sub-table shape that matches the package's surface (component prop table vs.
   signature/config/return-value tables) — don't force one page's shape onto a package with a
   different-shaped surface.
3. Fill every Description cell before publishing — grep the page for `| — |` or `| |` (an empty
   trailing cell) as a quick self-check.
