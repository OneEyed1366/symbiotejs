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
5. `## Usage` — a single `<Tabs syncKey="framework">` block (from `@astrojs/starlight/components`)
   with one `<TabItem label="React">` / `<TabItem label="Vue">` / `<TabItem label="Angular">`
   each, `label` bare (no subtitle — a shared site-wide script matches tabs across every page by
   this exact text, see the astro.config.mjs head scripts). If the package has more than one
   usage shape (e.g. splash-screen's imperative `hide()` vs the animated `useHideAnimation()`),
   use a separate `<Tabs syncKey="framework">` block per shape, each still broken out by adapter.
   (Superseded the older "one `###` sub-heading per adapter" shape in 2026-07 — every package/
   howto/example/learn page with a genuine React+Vue+Angular triad now uses Tabs instead of
   stacked headings, synced to the same site-wide framework preference.)
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

## Angular-parity check — a real bug pattern found repeatedly (2026-07)

A site-wide sweep converting per-framework doc sections into `<Tabs syncKey="framework">` (see
above) found the SAME real bug independently in 5+ files: **Angular's `<TabItem>` was demoted to
an import-only line or a prose-only sentence while React's and Vue's siblings showed full,
working code** — not a stylistic gap, an ACCURACY gap. Concretely found and fixed this pass:

- `packages/splash-screen.mdx`'s animated-case Angular example bound `[style]`/`[source]` but
  omitted `imports: [View, Image]` and the `(layout)`/`(loadEnd)` event outputs — without them
  the readiness gate (`layoutReady`/`logoReady` in `HideAnimationController`) never flips true,
  so `hide()` never fires. Angular has no generic prop-spread (unlike React's `{...container}` /
  Vue's `v-bind`), so every readiness callback needs an EXPLICIT output binding — silently easy
  to forget when transcribing from the React/Vue version.
- `howtos/splash-screen.mdx`'s Angular tab showed only `import { hide } from '...'` plus a prose
  sentence ("called once from ngOnInit") with no actual `ngOnInit(): void { hide(); }` call.
- `howtos/portals-and-tunnels.mdx`'s Tabs had ONLY React+Vue `<TabItem>`s — Angular's real
  `*portal`/`portalOutlet` directives and `createTunnel()`/`*tunnelIn`/`<tunnel-out>` existed
  (see the `angular-adapter-portal` skill) but were mentioned only in one trailing prose
  sentence, never shown as code.
- `examples/text-input.mdx` claimed the imperative handle needed `@ViewChild(..., { read:
  ElementRef })`; the real pattern is that `TextInput` the component class itself implements
  the handle interface (`@ViewChild(TextInput)` directly).
- Two architecture diagrams (`docs/index.mdx`, `docs/how-it-works.mdx`) listed Angular under
  "future adapters" alongside genuinely-unstarted Svelte/Solid, contradicting the prose stating
  Angular is a shipped, tested adapter (M4, done).

**Why this keeps happening**: React is the oldest/most-documented adapter, Vue came second, and
Angular is newest — a doc author (or an agent transcribing a pattern from React/Vue) reaches for
the same shape and either skips Angular's real mechanism (it's less familiar) or writes
plausible-looking Angular syntax without verifying it against the real adapter source.

**The check, whenever writing or reviewing an Angular `<TabItem>` (or ANY Angular-specific doc
claim)**: never trust prose or a plausible-looking snippet alone — cross-check the exact
component/directive/selector/prop/event name against the real source
(`adapters/angular/src/`, `packages/*/src/angular/`) or the matching `angular-adapter*` project
skill before publishing. If Angular's real mechanism differs structurally from React/Vue's (no
prop-spread, structural directives instead of factories, DI instead of hooks — see
`angular-adapter-portal`), show THAT real mechanism, never a guessed React/Vue-shaped
approximation of it.
