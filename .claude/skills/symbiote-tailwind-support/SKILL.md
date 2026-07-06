---
name: symbiote-tailwind-support
description: Tailwind CSS support for SymbioteNative — read BEFORE starting any Tailwind/utility-class work (a new `@symbiote-native/tailwind` package, or anything touching whole-project class-name scanning, JIT style generation, or hover:/focus:/dark:/md: variant resolution). Status (2026-07) — NOT BUILT, deliberately deferred as a separate future package, distinct from `@symbiote-native/css-parser` (which stays scoped to plain-CSS/SCSS/Less/Stylus, all of which reduce to plain CSS text with no scanning/variant runtime needed). Documents why Tailwind is architecturally NOT a thin preprocessor wrapper like SCSS/Less/Stylus, real findings from reading wolf-tui's own shipped (and partly broken) Tailwind integration, real findings from NativeWind v5's architecture (verified via Context7, not memory) including why its Babel-plugin-and-hooks core is React-adapter-only under `<third_party_rn_packages_are_react_only>`, and the recommended shape for a future SymbioteNative implementation. Do not port wolf-tui's variant handling as-is — it has a real, undocumented `:hover` bug recorded below.
---

# Tailwind CSS support for SymbioteNative

**Status: NOT BUILT (2026-07).** Explicitly deferred, decided during the same
session that shipped SCSS/Less/Stylus support in `@symbiote-native/css-parser` (see
the `symbiote-sfc-style-compiler` skill). Tailwind will be its own separate
package (proposed `@symbiote-native/tailwind` — name not finalized) when built, NOT
a fourth "flavor" bolted onto `@symbiote-native/css-parser`. This skill exists so a
future session doesn't re-derive (or worse, re-port wolf-tui's broken parts
of) the research below from scratch.

## Why Tailwind is a different category from SCSS/Less/Stylus — read this first

SCSS/Less/Stylus are **syntax-only preprocessors**: they compile to plain CSS
text (variables/nesting/mixins expanded), which `@symbiote-native/css-parser`'s
existing `parseCSS()` already consumes unchanged. Porting them was a thin
wrapper — lazy-load the user's own installed compiler, get plain CSS text
back, hand it to the pipeline that already exists. See
`symbiote-sfc-style-compiler` skill's preprocessor section for that shipped
implementation.

Tailwind needs two capabilities neither preprocessor needs, and neither
exists anywhere in SymbioteNative today:

1. **Whole-project source scanning for class-name candidates.** Tailwind's
   JIT engine doesn't compile a stylesheet — it generates CSS ONLY for the
   utility class names it observes being used in your actual component
   source (`class="flex p-4 hover:bg-red-500"`). Something has to scan every
   template/JSX file in the project for those literal strings before the CSS
   generation step can even run.
2. **A live variant/interaction/responsive runtime.** RN has no CSS cascade,
   no DOM pseudo-classes, no media queries. `hover:`/`focus:`/`active:` need
   a real press/touch-state-driven style switch; `md:`/`lg:` need a real
   `Dimensions`/viewport-driven switch; `dark:` needs a real
   `Appearance`-driven switch. None of this is text-to-text translation —
   it's new runtime machinery.

Both of these are genuinely new engineering, not wrapper work — hence a
separate package, built deliberately, not squeezed into the CSS-parser's
existing scope.

## wolf-tui's own Tailwind integration — real findings, do not trust blindly

wolf-tui (`internal/css-parser/src/preprocessors.ts`, `utility-parser.ts`,
`shim.ts`, `vite.ts`, `internal/shared/src/styles/registry.ts`,
`tailwind-data.generated.ts`) already ships Tailwind support for its
Vite-based TUI renderer. A dedicated research pass (2026-07) read the actual
code and tests rather than trusting the README. Full pipeline, verified:

```
source scan (regex over raw file text, NOT an AST — matches class="..."/
className={...}/:class="...") -> candidate Set (module-level singleton) ->
Tailwind v4 JIT compile (tailwindcss's own compile()/loadDesignSystem()) ->
parseCSS() (the SAME parser SymbioteNative's own css-parser ported) ->
registerStyles()
```

**Source-file scanning is whole-project AND incremental, both bundler-hook-
dependent in a way Metro doesn't provide out of the box.** Vite's
`configResolved` hook gets a synchronous `readdirSync` walk of the entire
project root before any CSS is processed; its `transform` hook then re-scans
each file as Vite streams it and calls `moduleGraph.invalidateModule` +
`ws.send({type:'full-reload'})` for live updates. esbuild's `setup()` does an
equivalent `fast-glob` pre-pass plus per-file `onLoad` re-scan. Metro
transforms files one at a time with no whole-graph pre-pass hook and no
callback to invalidate sibling modules — **this is not automatically
portable**, and would need either a separate pre-build script (accept losing
live incremental re-scan) or a bespoke file-watcher process running
alongside Metro (real new infrastructure). *(NativeWind proves this specific
gap IS closeable on Metro — see below — but nobody has built a
generic/non-Tailwind-specific version of it.)*

**A real, undocumented bug: `hover:`/`focus:` variants are effectively
broken in wolf-tui's own shipped code.** Verified directly, not assumed: real
Tailwind v4 output for `hover:bg-blue-500` is the selector
`.hover\:bg-blue-500:hover { ... }` (trailing pseudo-class on a compound
selector). wolf-tui's `extractClassName()` only strips a selector that
**starts** with `:` (`:root`, `::before`) — a trailing `:hover` embedded
later in a compound selector is never stripped, so the registry key keeps
the full `hover:bg-blue-500:hover` string. At runtime,
`resolveClassName('hover:bg-blue-500')` (the literal string a developer
writes) does exact-match, then a camelCase-fallback, then a
strip-variant-look-up-base fallback — **none of which produce the actual
registered key** with `:hover` still appended. The variant only resolves at
all if the bare, non-hover utility happens to be registered too — a
coincidental fallback, not a working design. The one unit test that exercises
this path (`complex-selectors.test.ts`, "parses utility with variant
prefix") uses a hand-crafted fixture selector with NO trailing `:hover` at
all, so it never catches this — it tests something Tailwind doesn't actually
generate.

**`md:`/breakpoint variants "work" but are not actually responsive.**
`@media` at-rules round-trip through `postcss`'s `walkRules` (which
transparently descends into at-rules), so `md:flex-row`'s selector resolves
to a clean registry key with no pseudo-class problem. But the `@media`
**condition itself is discarded** — `parseCSS` never inspects the wrapping
at-rule — so the style registers and applies **unconditionally**, regardless
of actual terminal/viewport width. There is no breakpoint-switching
mechanism anywhere in `registry.ts`. None of this is documented as a
limitation in wolf-tui's own README, which only ever shows plain static
utilities in its examples (`flex-col p-4 gap-2`) — never a single variant
example.

**Verdict: do not port wolf-tui's variant/scanning layer as-is.** The
CSS-generation-to-style-object half (JIT-generated CSS -> `parseCSS` ->
registry) is legitimate, thin, reusable infrastructure SymbioteNative already has
an equivalent of. The scanning half is bundler-specific and only partially
portable. The variant half would import a real bug, not a working feature —
fix `extractClassName`'s pseudo-class stripping and build a genuine
interaction/viewport-driven runtime from scratch instead of copying this.

## NativeWind v5 — verified via Context7 (2026-07), not memory

NativeWind is a real, production RN library, and unlike wolf-tui's homegrown
version it DOES close the Metro-scanning gap:

```
Tailwind CSS v4 (@tailwindcss/postcss) -> nativewind plugin (adds @map
variant, generates @nativeMapping directives) -> theme.css (RN-specific:
elevation, fonts, platform variants) -> react-native-css compiler (CSS ->
RN styles) -> react-native-css babel plugin (JSX className -> style prop) ->
react-native-css runtime (applies styles reactively)
```

`nativewind/metro`'s `withNativewind()` wraps `withReactNativeCSS()` from
`react-native-css/metro` — a REAL, working Metro integration that does
whole-project content scanning + live updates. **This proves the Metro gap
identified above is closeable, in principle** — someone built the missing
infrastructure, it isn't structurally impossible on Metro. Nobody has built
a generic (non-Tailwind-specific, non-React-specific) version of it, though.

**But it is React-only at two levels, which is disqualifying as-is for
SymbioteNative's multi-framework requirement:**

1. The Babel plugin that rewrites `className` -> `style` operates on **JSX
   AST nodes specifically** (Babel's JSX node types) — it has no path into a
   Vue SFC `<template>` or an Angular template, which are entirely different
   parser/AST shapes.
2. The runtime is hook- and HOC-based: `useColorScheme()`,
   `useUnstableNativeVariable()`, and the `styled(View)` wrapper pattern —
   confirmed in NativeWind's own docs, including a React Suspense API
   mention. Any component whose internals call React hooks throws under a
   non-React adapter's dispatcher-less render (Vue/Angular have no React
   dispatcher) — this is the exact, already-established failure mode
   documented in this project's own `<third_party_rn_packages_are_react_only>`
   invariant (CLAUDE.md), the same reason
   `@react-native-community/slider` is React-adapter-only.

So "just wrap NativeWind" would ship a React-only feature and call it done —
a `<adapters_reach_full_feature_parity>` P0 violation if shipped without the
other adapters' equivalent, not a quick win.

## Recommended shape for a future `@symbiote-native/tailwind` package (not started)

Genuinely reusable, framework-agnostic (no React coupling):
- The CSS-generation-to-style-object concept: run Tailwind's own JIT
  compiler (`tailwindcss`'s `compile()`/`loadDesignSystem()`, same API
  wolf-tui and NativeWind both use) against a candidate class-name list, feed
  the resulting CSS text into `@symbiote-native/css-parser`'s existing `parseCSS()`,
  register via the existing `@symbiote-native/engine` style-registry. This slots in
  exactly like the SCSS/Less/Stylus output does today.

Must be built fresh, per adapter, NOT copied from either precedent:
- **Class-name scanning** — one implementation per adapter's own template
  syntax: Vue SFC via a `@vue/compiler-core` `nodeTransform` (the SAME
  mechanism `scopeClassName`'s scoped-class rewrite already uses, see
  `symbiote-sfc-style-compiler` skill §5 — proven pattern, do not
  reinvent), Angular via its template AST, React via a Babel/JSX visitor
  (this narrow piece could look at NativeWind's Babel plugin for shape, NOT
  its runtime).
- **Variant/interaction/responsive runtime** — framework-agnostic core in
  `@symbiote-native/engine` (per `<adapters_stay_thin>`): press/touch-state-driven
  style switching for `hover:`/`focus:`/`active:` (RN has real touch
  primitives to hook, unlike a terminal), a `Dimensions`/viewport-driven
  switch for `md:`/`lg:` breakpoints, an `Appearance`-driven switch for
  `dark:` — thin per-adapter lifecycle glue on top, exactly the
  `<components_split_logic_view_lifecycle>` split already used for
  stateful components.
- **Fix, don't copy, the pseudo-class selector bug**: `extractClassName`
  (or SymbioteNative's own equivalent, if this package gets its own parser
  entry point) must strip a TRAILING pseudo-class from a compound selector
  (`.hover\:bg-blue-500:hover` -> `hoverBgBlue-500`, matching the literal
  `hover:bg-blue-500` string a developer writes), not just a selector that
  starts with `:`.

Not scoped by this skill (a real design pass when the package is actually
started): exact package name/boundaries, whether `tailwindcss` becomes an
optional peer dependency of the new package or of each adapter, how
candidate scanning integrates with Metro's transform-per-file model without
either sacrificing live re-scan or building a whole new watcher process.
