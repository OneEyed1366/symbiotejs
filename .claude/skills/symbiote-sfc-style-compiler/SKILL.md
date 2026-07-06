---
name: symbiote-sfc-style-compiler
description: "Symbiote CSS/CSS-Modules compiler — CSS (a Vue SFC style block, or a standalone .css/.module.css file), PLUS optional SCSS/Sass, Less, and Stylus preprocessor sources, compiled at build time into RN style objects, resolved at runtime via a class-name registry shared by ALL adapters (React className, Vue class, Angular addClass/removeClass). Read BEFORE touching core/css-parser/**, core/engine/src/style-registry/**, the class+style merge in core/engine/src/node.ts routeProp, style-block handling in examples/*/metro-vue-transformer.js, any adapter's metro-css-parser.cjs / metro-css-transformer.js, or adapters/*/renderer.ts's class-prop handling. Covers @symbiote-native/css-parser (build-time postcss compiler, never shipped in the app bundle, distributed as a regular dependency of each adapter package rather than a per-app devDependency), core/css-parser/src/preprocessors.ts (lazy-optional sass/less/stylus, devDependencies only), core/engine/src/style-registry (registerStyles/resolveClassName/scopeClassName), routeProp's centralized class+style merge (core/engine/src/node.ts, replacing an earlier Vue-only patchProp hack), a compiler nodeTransform scoping class/:class bindings (static and dynamic, including an opaque runtime class string) to a per-file scope id, a :global() escape hatch, Vue <style module>/standalone .module.css CSS-Modules support, and React's className prop / Angular's addClass-removeClass token accumulation. Documents a pseudo-class bug found only by manually running parseCSS after unit tests were green, and a pnpm-hoisting lesson about resolving a build-time-only dependency through an adapter re-export instead of per-app devDependencies. Covers a SEPARATE per-component mechanism (§4b) where a non-class prop like ScrollView's contentContainerStyle or ImageBackground's imageStyle ALSO accepts a class-name string resolved via resolveClassName, plus the correct Pressable className/class (static) + style-as-function (dynamic-only) split — read this before assuming such a prop can't take a class. Records $style.card .d.ts generation, Svelte, and Tailwind as the remaining open seams."
---

# Symbiote CSS / CSS-Modules compiler

**Status: STABLE (2026-07).** Plain CSS, `scoped`, `:global(...)`, CSS
Modules (Vue `<style module>` AND standalone `.module.css` files, usable from
ALL THREE adapters), and optional SCSS/Sass, Less, and Stylus preprocessing
(§7, added 2026-07) are shipped and considered a stable public feature, not
experimental — safe to document and recommend without hedging. Svelte support
and Tailwind CSS are the remaining open seams (§ below); neither blocks
calling the rest of this stable. The class+style merge that makes a resolved
class usable from ANY adapter (not just Vue) is centralized in
`core/engine/src/node.ts`'s `routeProp` — see §4, rewritten 2026-07 from an
earlier Vue-only `patchProp`-level hack.

A CSS source — a Vue SFC `<style>` block, OR a standalone `.css`/`.module.css`
file imported from ANY adapter's own source file — compiles at build time
into a `Record<className, RNStyleObject>`; a `class`/`className` prop (or, for
CSS Modules, an already-scoped string handed in directly) resolves that object
back at render time through a runtime registry shared by every adapter. Ported
from wolf-tui's proven Vite-plugin-plus-registry precedent, retargeted at
Metro's single-pass text-in/text-out transformer and RN's
`ViewStyle`/`TextStyle` surface instead of wolfie's terminal-cell `Styles`
type.

**wolf-tui precedent — re-read before extending this feature:**
`wolf-tui/packages/plugin/src/vue-sfc.ts` (the Vite resolveId/load plugin —
study for the CSS-Modules branch, do NOT copy its plugin shape, Metro has no
virtual-module hooks), `wolf-tui/internal/css-parser/src/parser.ts`
(`extractClassName` + `parseCSS`, the part ported near-verbatim),
`wolf-tui/internal/shared/src/styles/registry.ts` (the registry, ported minus
Tailwind detection).

## The four pieces

```
<style> CSS text / .css file text          class="foo" / className="foo" / addClass
      │  (build time, Metro)                          │  (runtime, routeProp — all adapters)
      ▼                                                ▼
@symbiote-native/css-parser              @symbiote-native/engine's style-registry
  parseCSS() — postcss              registerStyles() / resolveClassName()
  core/css-parser/src/              core/engine/src/style-registry/
      │                                                ▲
      └── metro-*-transformer.js emits ─────────────────┘
          registerStyles({...}) at module load
```

### 1. `core/css-parser` (`@symbiote-native/css-parser`) — build-time ONLY

`parseCSS(css: string, options?: { filename?: string }): Record<string,
Record<string, unknown>>`. **Never shipped in the app's native JS bundle** —
runs only inside a Metro transformer, on the Node build machine. That's why it
carries a `postcss` + `postcss-value-parser` dependency (catalogued in the
root `pnpm-workspace.yaml`) that the runtime registry does not.

- `src/parser.ts` — `extractClassName` (selector → camelCase key: `.card` →
  `card`, `.btn.primary` → `btnPrimary` compound, `.card .title` →
  `cardTitle` descendant, `#id`/`[attr]` supported) and `parseCSS` (postcss
  AST walk, CSS custom-property/`var()` resolution, a narrow `calc()`
  evaluator). Both ported near-verbatim from wolf-tui — this half is
  target-agnostic, no TUI coupling.
- `src/properties.ts` — kebab-CSS-prop → camelCase-RN-prop mapping table,
  written FRESH for RN (wolf-tui's own table targets its terminal-cell
  `Styles` type, wrong shape to port). `text-shadow` bypasses this table (see
  below — RN has no engine-level processor for it, unlike `transform`/
  `box-shadow`/`filter`/`transform-origin`/`background-image`, all covered
  below). Any OTHER property not in the table (`animation`, `@media`, …) is
  silently dropped from the output with one deduped `console.warn` per
  unique property name per `parseCSS()` call — never throws.

  **`transform` and `box-shadow` are registered as plain `raw` passthrough
  (2026-07) — the value is renamed to its RN camelCase key and handed on
  UNPARSED, as-authored CSS text.** An earlier version of this table (same
  day) hand-rolled a parser for both, decomposing `box-shadow` into
  `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` +
  an `elevation` heuristic, dropping `inset`/spread-radius/multi-shadow with
  a warning, and dropping `matrix()`/`perspective()` from `transform`. That
  turned out to be UNNECESSARY and WRONG: reading RN's actual source
  (`.vendors/react-native`) shows `boxShadow` and `transform` are both real,
  fully-native Fabric style props on iOS AND Android (native C++/ObjC/Kotlin:
  `BoxShadowPropsConversions.h`, `RCTBoxShadow.mm`, `BoxShadow.kt`,
  `InsetBoxShadowDrawable.kt`/`OutsetBoxShadowDrawable.kt`) — genuinely
  supporting `inset`, spread-radius, MULTIPLE comma-separated shadows, and
  (for transform) `matrix()`/`perspective()`/`translate3d()`. The catch: RN's
  `ReactNativeFeatureFlags::enableNativeCSSParsing()` defaults to `false`, so
  native C++ expects an ALREADY-PARSED array of plain-number objects, not the
  raw CSS string — RN's own JS renderer parses it first
  (`Libraries/StyleSheet/processBoxShadow.js`/`processTransform.js`,
  registered per-prop in `ReactNativeStyleAttributes.js`'s `{process: fn}`
  table) before `ReactFiberConfigFabric.js` ever calls `createNode`. Because
  SymbioteNative's engine talks to `nativeFabricUIManager` DIRECTLY (bypassing
  React's host config entirely, per this project's core architectural fact),
  it must replicate that JS pre-parse itself — and **it already does**:
  `core/engine/src/process-box-shadow` and `core/engine/src/process-transform`
  are JS ports of RN's own processors, wired into every style commit via
  `core/engine/src/commit.ts`'s `STYLE_PROCESSORS` map (keyed only by prop
  name — applies uniformly whether the style came from hand-written
  `StyleSheet.create` or from this CSS compiler). So css-parser doesn't need
  its OWN box-shadow/transform parser at all: it only has to rename the CSS
  property to the RN key and hand the text through untouched; the engine's
  existing, already-tested, RN-faithful processors do the real parsing at
  commit time — including everything (`inset`, spread, multi-shadow,
  `matrix()`) the hand-rolled version above dropped. See
  `core/engine/src/process-box-shadow/index.ts` and
  `core/engine/src/process-transform/index.ts` for the ported implementations,
  and `core/engine/src/commit.ts`'s `STYLE_PROCESSORS`/`processValue` for the
  commit-time wiring. **Lesson: before hand-rolling a CSS→RN value
  conversion, check whether `core/engine/src` already has a `process-*`
  port of the matching RN `Libraries/StyleSheet/process*.js` file — the
  passthrough-raw-string + let-the-engine-parse-it pattern applies to any
  future CSS property that turns out to be one of RN's own JS-preprocessed
  style props** (also covers `filter`, `transformOrigin`, `aspectRatio`,
  `fontVariant` — see the `STYLE_PROCESSORS` map for the full, current list).

  `text-shadow` is different: RN has NO unified CSS-string `textShadow` prop
  at all (no `processTextShadow.js` exists in RN's source, and
  `TextStyle`/`ShadowStyle` only expose the three separate legacy props
  `textShadowColor`/`textShadowOffset`/`textShadowRadius`, no composite/no
  engine-level processor to defer to) — so decomposing the CSS shorthand
  really is this package's job, and stays hand-rolled in `values.ts`.
- `src/values.ts` — `px` → plain `number`, `%` stays a `string`, colors pass
  through as raw strings unchanged. `REM_TO_PX = 16` is SymbioteNative's own
  constant (RN has no root-font-size registry to derive it from); wolf-tui's
  `1rem = 4 cells` scaling is dropped entirely, not adapted. Also holds
  `parseTextShadow` (2026-07) — decomposes CSS `text-shadow` (e.g.
  `1px 1px 2px black`) into `textShadowColor`/`textShadowOffset`/
  `textShadowRadius`; only the first of a comma-separated multi-shadow value
  is applied (with a warning) since RN's TextStyle takes exactly one. Parses
  with `postcss-value-parser` (not a regex split) so a color function's
  internal commas (`rgba(0, 0, 0, .3)`) can't be mistaken for a top-level
  multi-shadow separator — the same top-level-comma-aware approach
  `var()`/`calc()` resolution in `parser.ts` already relies on.
- `src/preprocessors.ts` — optional SCSS/Sass, Less, and Stylus support (§7).
  A style with a recognized preprocessor extension/`lang` is reduced to plain
  CSS text here, BEFORE `parseCSS()` ever sees it — `parser.ts`/`properties.ts`/
  `values.ts` above are entirely unaware preprocessing exists.

### 2. `core/engine/src/style-registry/` — runtime, ships in the app bundle

`registerStyles(styles)`, `resolveClassName(className)`, `clearGlobalStyles()`
(test isolation). A global `Map<string, Partial<IViewStyle & ITextStyle>>`
with compound-selector permutation lookup — `class="btn primary"` in a
template finds a `.btn.primary` rule that got registered under the single key
`btnPrimary`. Ported from wolf-tui's registry MINUS its Tailwind-utility
auto-detection (`isTailwindUtility`, `STATIC_UTILITIES`/`UTILITY_PREFIXES` —
not part of this feature, do not resurrect without a separate design pass)
and MINUS its kebab-case fallback lookup (this compiler always emits camelCase
keys, so no dual-casing lookup was needed). Exported from
`core/engine/src/index.ts` next to `StyleSheet`.

This module never touches CSS or postcss — it is a plain string-keyed lookup,
by design, so it costs nothing extra in the shipped bundle.

### 3. `examples/vue-sfc/metro-vue-transformer.js`

Reads style blocks via `@vue/compiler-sfc`'s **`descriptor.styles`**, not a
hand-rolled regex extractor like wolf-tui's `extractStyleBlocks` — Vue's own
SFC parser already gives pre-parsed `{ content, lang, ... }` blocks, which is
simpler and immune to a `</style>`-lookalike inside a string breaking a greedy
regex match. For each block, calls `@symbiote-native/css-parser`'s `parseCSS()`,
merges multiple blocks with last-wins semantics (same cascade wolf-tui
documents), and prepends this to the compiled module source:
```js
import { registerStyles } from '@symbiote-native/engine';
registerStyles({ /* merged parseCSS() output */ });
```
No `<style>` block → no injected code, zero behavior change for style-less
`.vue` files. `lang="scss"`/`"sass"`/`"less"`/`"stylus"` are preprocessed
first (§7); any OTHER `lang` value still throws
(`SFC style lang="X" not supported yet — plain CSS only`) rather than
silently mis-compiling.

### 4. `core/engine/src/node.ts` `routeProp` — the cross-adapter class+style merge

**Rewritten 2026-07 — was Vue-only, now shared by every adapter.** The
original design put the class/style merge inside Vue's own `patchProp`
(`adapters/vue/src/renderer.ts`), which worked but meant React and Angular
each would have had to reimplement the identical merge to get `className` /
`addClass` resolving through the registry — a violation of
`<adapters_stay_thin>`. It now lives once, in the engine's `routeProp`
(`core/engine/src/node.ts`), and every adapter's class-prop path funnels
through it: Vue template `class="foo"` (`patchProp` → `routeProp`), React JSX
`className="foo"` (the reconciler's `applyProps`/`applyUpdate` already called
`routeProp` for every prop key — React needed **zero renderer changes**, only
the `className` field on `IViewProps`/`ITextProps`,
`adapters/react/src/components.ts`), and Angular's `addClass`/`removeClass`
(Ivy compiles every `class=`/`[class.foo]`/`[ngClass]` form to **per-token**
addClass/removeClass calls, never a single string — `SymbioteRenderer`
accumulates a per-node `Set<string>` of tokens and re-joins it into one string
on every change, then calls `routeProp(el, 'class', joined)`, same entry point
as the other two — see `adapters/angular/src/renderer.ts`).

**The non-obvious part, unchanged from the original design.** `class`/`style`
(or React's `className`/`style`) can each be set independently and out of
order — Vue's `patchProp` fires one call per changed key, Angular's
`addClass`/`removeClass` and `setStyle` are separate `Renderer2` calls, and
even React re-invokes `routeProp` once per changed prop on an update. The
engine's `setProp` does a flat overwrite (`node.props[key] = value`, no merge),
so naively routing both branches to `routeProp(el, 'style', ...)`
independently would let whichever call runs *last* silently clobber the
other. That is wrong: explicit `style` must always win over class-derived
style, like CSS cascade specificity, regardless of call order.

Fix, in `node.ts`:
```ts
const classStyleParts = new WeakMap<ISymbioteNode, { classStyle?: unknown; explicitStyle?: unknown }>();
const CLASS_PROP_KEYS: ReadonlySet<string> = new Set(['class', 'className']);
// routeProp: 'class'/'className' -> commitClassStyle(node, { classStyle: resolveClassName(...) })
//            'style'             -> commitClassStyle(node, { explicitStyle: value })
// commitClassStyle always does: setProp(node, 'style', [entry.classStyle, entry.explicitStyle]);
```
Both branches always write a **2-element array in fixed order**
(`[classStyle, explicitStyle]`), and let `core/engine/src/style/index.ts`'s
existing `flattenStyle` do the actual collapse (array flatten is already
later-wins, falsy-entry-skipping — reused, not reimplemented). This makes the
explicit half always win regardless of call order, without hand-merging style
objects. The literal string `class`/`className` never reaches `node.props` —
RN has no attribute-selector concept to give it meaning. `getExplicitStyle
(node)` is exported for an adapter that builds its style prop up **key-by-key**
instead of handing over one whole object (Angular's Ivy `ɵɵstyleProp`/
`setStyle`) — it must merge onto that, not onto `node.props.style` directly,
which may now be the `[classStyle, explicitStyle]` array `routeProp` writes
(spreading an array as a record would silently produce numeric-index keys —
this is the bug `getExplicitStyle` exists to prevent). WeakMap keyed on the
raw `ISymbioteNode` is safe here (confirmed against the
`vue-adapter-reactivity` skill — `el` inside Vue's `patchProp` is never
Vue-proxy-wrapped, so identity holds); entries GC automatically on unmount.

Prop-type note: `className` was added to React's `IViewProps`/`ITextProps`
directly (`adapters/react/src/components.ts`) rather than promoted to the
shared agnostic base in `core/components` — per
`<prop_types_split_agnostic_vs_per_adapter>` this is a framework-idiom field
(React's own web convention), not a cross-framework-safe type; Vue authors
`class=` in templates, Angular authors `class=`/`[ngClass]=`, React authors
`className=` — three different idioms over the SAME underlying registry.

## 4b. Secondary style props (`contentContainerStyle`, `imageStyle`, …) — a SEPARATE, per-component mechanism

`routeProp`'s class+style merge above is scoped to the literal `class`/
`className`/`style` triad on a host node. It is NOT the only place
`resolveClassName` gets called — several components ALSO accept a class-name
string on a secondary, non-`style`-named prop that targets an inner or
composed part of the component. This is implemented per-component, ad hoc,
not centrally by the engine — a real gap this skill left undocumented until a
migration session (2026-07) wrote NEW code claiming these props "never reach
the class registry", which was wrong and had to be corrected once the user
pointed at the actual adapter source.

Known instances, all typed `IStyleProp<T> | string` with the same inline
resolver shape (`typeof x === 'string' ? resolveClassName(x) : x`):

- **`contentContainerStyle` (ScrollView)** — `adapters/{react,vue,angular}/src/components/scroll-view/shared.ts`. Angular exposes it as a `resolvedContentContainerStyle` getter; React/Vue inline the same ternary at the point `selectScrollIntrinsics` consumes it.
- **`imageStyle` (ImageBackground)** — `adapters/{react,vue,angular}/src/components/image-background*`. Targets the INNER image, as opposed to `style` which is the wrapper View — same string-resolves-via-registry shape.

A NEW component that wants this needs to add its OWN resolver at the same
shape — there is no shared helper to call beyond `resolveClassName` itself
(exported from `core/engine/src/style-registry`). Before assuming a
non-`style`/`class` prop "can't" take a class name, grep the target
component's `shared.ts`/`index.ts` for `resolveClassName` first.

**Pressable's `style` (function-of-press-state) vs its `className`/`class`
(plain static) — a related but distinct split.** `Pressable`'s `style` prop
can be a function of press state (`({ pressed }) => StyleProp`), which a CSS
class fundamentally cannot express (compiled statically, no runtime
branching). But Pressable ALSO carries an ordinary static `className?:
string` (React, `adapters/react/src/components/pressable/index.ts`) / `class?:
IClassNameValue` (Vue, `adapters/vue/src/components/pressable.ts`) prop,
entirely separate from `style`. The correct idiom for "static look + a
press-state-dependent color change" is: move every static property into a CSS
class via `className`/`class`, and let `style` be a function that returns
ONLY the properties that truly vary with press state —

```tsx
<Pressable
  className="pressable-card"
  style={({ pressed }) => ({ backgroundColor: pressed ? '#13243a' : '#0f1e30' })}
/>
```

— NOT `style={({ pressed }) => [styles.pressableCard, { backgroundColor: ... }]}`
with the entire static shape stuffed into the array's first element. The
latter was the exact mistake made in `examples/{react,vue-tsx}/App.tsx`
(fixed 2026-07): a comment justified keeping the WHOLE style object in JS
"because `style` is a function", conflating "the style prop can be a
function" with "therefore nothing here can be a class" — the two are
independent; only the genuinely dynamic subset needs the function.

## How to verify this quickly

```bash
npx vitest run core/css-parser              # parser + compileCssFile + createCssMetroTransformer
npx vitest run core/engine/src/__tests__/class-style-merge.test.ts   # routeProp merge (all adapters)
npx vitest run adapters/vue                 # ScrollView class/style forwarding
npx vitest run adapters/react/src/class-name.test.tsx                # React className resolution
npx vitest run adapters/angular/src/renderer.test.ts                 # Angular addClass/removeClass
npx vitest run examples/vue-sfc             # transformer <style>/<style module>/.css tests

# manual ad-hoc check — pure Node, no RN/build needed, this is how a real bug (below) was found
node -e "
import('$PWD/core/css-parser/src/index.ts').then(({parseCSS}) => {
  console.log(parseCSS('.card { padding: 10px } .card:hover { opacity: .5 }'));
});
"
```

**Manually run `parseCSS` on real-world-shaped CSS before trusting a change
to `parser.ts`/`properties.ts` green from unit tests alone.** Unit tests only
catch what someone thought to write a case for; this is table-driven,
ported/adapted selector logic, exactly the kind of code where a plausible
port silently diverges from the target's actual semantics on inputs nobody
wrote a test for.

### The pseudo-class bug this practice caught

`.card:hover { opacity: 0.5 }` — a pseudo-class *trailing a real class*, not
a bare `:hover`. The original ported `extractClassName` had a test for bare
`:hover` (correctly → `null`), but its **compound-selector branch** matched
`.card:hover` as a compound selector before that check could apply, and
registered the rule under a dead, unreachable key `"card:hover"` (harmless
but silently wrong). An interim fix that stripped just the pseudo suffix and
kept resolving `.card` was **worse**: it silently merged the hover-only
`opacity: 0.5` into the base `.card` style, permanently applying it. The
correct fix, now in `parser.ts`: if a selector — after removing `[...]`
attribute-selector contents, which may legitimately contain a colon
(`[data-x="a:b"]`) — contains `:` **anywhere**, drop the **whole rule**, same
as a bare `:hover`. RN has no hover/focus/nth-child pseudo-class concept at
all, so there is no correct partial-application semantics to preserve; a
regression test now covers `.card:hover` specifically.

## 5. Vue `<style scoped>` and `:global(...)` — implemented

`<style>` with no `scoped` attribute behaves exactly like piece 3 above:
classes register globally, unsuffixed, shared across every component. A
`<style scoped>` block's classes are suffixed at registration time —
`card` → `card__data-v-xxxxxxxx`, using the SAME `scopeIdFor(filename)` hash
`metro-vue-transformer.js` already computed for `compileScript({ id })` — so
two components can each own a `.card` without colliding in the shared
registry. This is the *intent* of Vue's real `data-v-hash` DOM-attribute
mechanism, reimplemented as a name suffix instead, since SymbioteNative has no DOM
and no attribute-selector matching (`class` is always a flat string-keyed
`Map` lookup, full stop).

**The non-obvious part, and why this needed a compiler `nodeTransform`, not a
raw-text regex rewrite of the template (the originally-considered, simpler-
looking approach — read this before "simplifying" it back):** Vue allows a
static `class="card"` and a dynamic `:class="expr"` on the SAME element, and
**Vue's own `transformElement` already merges both into ONE `class` codegen
entry** before emitting `normalizeClass(...)`. A text-level regex pass over
the raw template can't reproduce that merge safely (it would have to
reimplement Vue's own merge logic, or risk emitting two conflicting `:class`
bindings). Instead, `metro-vue-transformer.js` passes a custom `nodeTransform`
into `compileScript({ inlineTemplate: true, templateOptions: {
compilerOptions: { nodeTransforms: [...] } } })` (`nodeTransforms`/
`directiveTransforms` are real, public, stable fields of
`@vue/compiler-core`'s `TransformOptions`, confirmed by reading the installed
package source — not a private/internal mechanism, and `inlineTemplate: true`
forwards them through unmodified, no need to call `compileTemplate()`
separately). The transform:

- A static `AttributeNode` (`prop.type === 6`, `name === 'class'`) — its
  string content is rewritten DIRECTLY, at compile time: every space-
  separated token that's in this file's locally-scoped class set gets the
  `__${scopeId}` suffix, everything else (a class from a sibling *unscoped*
  block in the same file, or literally anything else) passes through
  untouched. No runtime call needed for the purely-static case.
- A dynamic `bind` `DirectiveNode` targeting `class` (`prop.arg.content ===
  'class'`) — its expression node (`prop.exp`) is wrapped, via
  `@vue/compiler-core`'s `createCompoundExpression`, into a call to
  `scopeClassName(<original expression, untouched>, __localScopedClassNames,
  __scopeId)` (`scopeClassName` — `core/engine/src/style-registry/index.ts`
  — imported as `__scopeClass`). Vue's own `normalizeClass()` still runs
  afterward on `scopeClassName`'s return value exactly as it would have on
  the original, so no other codegen shape changes.

Because our transform runs on `prop.exp`/`prop.value` **before** Vue's own
merge-and-normalize logic executes, `transformElement`'s merge of a
same-element static `class=` + dynamic `:class=` into one codegen entry still
runs *on our rewritten nodes*, unmodified — this is what makes the mixed case
(`class="card" :class="{ active: isActive }"`) come out correctly without any
special-case merge code of our own. `scopeClassName` does its token-matching
at **runtime**, so even a fully opaque dynamic value the compiler can't see
into (`:class="someRuntimeString"`) still resolves correctly — there is no
unresolved gap for dynamic scoped classes, static or dynamic, alone or mixed.

`:global(.reset)` inside a `<style scoped>` block opts that one selector out
of scoping, exactly like real Vue. Two pieces: `@symbiote-native/css-parser`'s
`extractClassName` recognizes the `^:global\(\s*(.+?)\s*\)$` wrapper and
recursively resolves the selector inside it (so `:global(.btn.primary)` still
resolves via the ordinary compound-selector path to `btnPrimary`) — this had
to be checked BEFORE the pseudo-class-drop rule from the bug above, since
`:global(...)` legitimately contains a colon that must NOT trigger a drop.
Separately, `metro-vue-transformer.js`'s own `globalClassNamesIn()` re-scans
a scoped block's raw CSS text with an independent regex to find which keys
came from inside a `:global()` wrapper, since `parseCSS`'s return shape
(`{ className: style }`) carries no such marker — those names are excluded
from suffixing and from `__localScopedClassNames`, registering exactly like
an unscoped class.

## 6. CSS Modules — implemented (2026-07), two forms

Both forms reuse the SAME suffixing scheme: a class registers under
`${className}__module__${scopeId}` (the `module` tag disambiguates from
`<style scoped>`'s plain `${className}__${scopeId}`, so a file that happens
to mix `scoped` and `module` blocks with the same class name can't collide in
the shared registry — a real regression test covers this, see
`metro-vue-transformer.test.ts`). `resolveClassName` needed **no changes** —
a template/JSX binding that hands over the already-scoped string (`$style.card`
/ `styles.card`) just passes straight to the registry's existing exact-match
path.

### Inline Vue `<style module>` — `examples/vue-sfc/metro-vue-transformer.js`

`descriptor.styles[i].module` (a `string | boolean`, confirmed in
`@vue/compiler-sfc`'s type defs alongside `.scoped`) flags a `<style module>`
block inline, in the SAME `.vue` file — parsed via the SAME `parseCSS()`,
scoped via the SAME `scopeIdFor(filename)` hash already used for `scoped`
blocks. The binding name is `$style` by default, or the block's
`module="name"` value; `compileSfc` emits it as a plain top-level `const`
holding the name→scopedName map (`const $style = {"card":"card__module__…"}`),
placed before the compiled `export default {...}` so it's a closed-over
module-scope variable inside `setup()` — usable both from the inlined
template (`:class="$style.card"`) and from `<script setup>` code itself
(`$style.card`), no extra wiring on either side. Unlike `scoped`, a module
block's classes are **never** added to `__localScopedClassNames` — CSS
Modules is opt-in per usage via `$style.x`, so a literal `class="card"`
elsewhere in the same file must stay unsuffixed. `:global(.name)` opts a
selector out of scoping, same mechanism as `scoped`.

### Standalone `.css` / `.module.css` file imports — `core/css-parser`'s `compileCssFile`

The framework-agnostic form, usable from ANY adapter's own source file:
`import styles from './Card.module.css'` works the same from a React `.tsx`,
a Vue `<script>`, or an Angular `.ts` — `core/css-parser/src/metro-css-
module.ts`. A plain `.css` file registers its classes globally (side-effect
import only, `import './theme.css'`, no default export) — the standalone
twin of an unscoped Vue `<style>` block. A `.module.css` file is ALWAYS
scoped (that's the entire point of the extension) and its default export is
the name→scopedName map, exactly like Vue's `$style`. Scope id here is a bare
hash of the file's own path (`core/css-parser/src/file-scope-id.ts`'s
`hashFilePath`, NOT prefixed `data-v-` — that prefix is Vue's own
`compileScript({id})` convention, unrelated to a plain file's scope id; both
share the same hash algorithm so it isn't duplicated).

Metro wiring: each example's own `metro.config.js` adds `'css'`, `'scss'`,
`'sass'`, `'less'`, and `'styl'` to `resolver.sourceExts` and points
`transformer.babelTransformerPath` at a tiny per-app wiring file built on
`@symbiote-native/css-parser`'s exported `createCssMetroTransformer(upstreamTransformer)`
(`core/css-parser/src/metro-transformer.ts`) — the "preprocess if needed,
compile the resulting CSS, delegate everything else to the upstream RN babel
transformer" branch lives ONCE there, not copy-pasted per app. Vue's
`metro-vue-transformer.js` handles every style extension inline alongside its
existing `.vue` handling (both need the SFC-vs-standalone distinction in one
file, since Metro allows only one `babelTransformerPath`); React's and
Angular's examples each have their own minimal `metro-css-transformer.js`
that just calls the factory.

### Distribution: css-parser is a dependency of each ADAPTER, not each app — a pnpm-hoisting lesson

`@symbiote-native/css-parser` is a regular `dependency` of `@symbiote-native/react`,
`@symbiote-native/vue`, and `@symbiote-native/angular` (never a peer, never a devDependency
of the example apps) — each adapter package also re-exports it verbatim via a
tiny `.cjs` file at its own root (`adapters/react/metro-css-parser.cjs`, etc.,
exposed as the `./metro-css-parser` subpath in `package.json` `exports`), so
a consuming app writes `require('@symbiote-native/react/metro-css-parser')` instead
of needing `@symbiote-native/css-parser` in its OWN `package.json` at all — matching
the "framework ships the whole feature" ethos of
`<adapters_reach_full_feature_parity>`.

**The first attempt at this got the mechanism wrong — worth recording.** The
initial assumption was that this repo's `.npmrc` (`node-linker=hoisted`,
`shamefully-hoist=true`) would make a regular dependency of `@symbiote-native/react`
transitively resolvable from ANY app that depends on `@symbiote-native/react`,
without the app declaring it — i.e. that hoisting propagates across the whole
workspace graph. **Verified false**: pnpm's hoisted linker builds each
workspace package its OWN scoped `node_modules` reflecting only ITS dependency
tree; `@symbiote-native/css-parser` landed in `adapters/react/node_modules/@symbiote-native/
css-parser` but NOT in `examples/react/node_modules` or the workspace root —
confirmed by removing the app's own devDependency entry and finding `require`
failed until the indirection below was added, on a fresh `pnpm install` (not a
stale-cache artifact). Node's CJS resolution is **file-system-ancestry**
based, not dependency-graph based: a `require()` call resolves relative to the
**requiring file's own directory**, not the original importer's. So the fix
isn't hoisting — it's ensuring the file that does `require('@symbiote-native/
css-parser')` **physically lives inside the adapter package**
(`adapters/react/metro-css-parser.cjs`), where css-parser genuinely IS
resolvable (a real dependency, symlinked into that package's own
`node_modules`); the app's own wiring file then requires THAT file via the
package's `exports` subpath, and Node resolves the ADAPTER's own `require()`
calls relative to the adapter's location once execution reaches there — this
works regardless of whatever the app's own hoisted view looks like. `.cjs`,
not `.js`: each adapter package is `"type": "module"`, so a bare `.js` file
there would be parsed as ESM and `require`/`module.exports` would be
`ReferenceError`s; `.cjs` always forces CommonJS interpretation regardless of
the package's `"type"` field.

A related, narrower version of the same lesson hit
`@react-native/metro-babel-transformer` specifically for the Angular example
(NOT css-parser-related): `react-native` IS a real, direct dependency of
`examples/angular` (confirmed via `pnpm why`, identical dependency path to
the React/Vue examples), yet `@react-native/metro-babel-transformer` (one of
`react-native`'s own transitive deps) was reliably hoisted into
`examples/react/node_modules` and `examples/vue-sfc/node_modules` but NOT
`examples/angular/node_modules`, even after a full clean reinstall — an
unexplained per-package hoisting divergence, not something worth chasing
further given the fix is simple and robust either way: anchor
`require.resolve` explicitly with an anchor location guaranteed to have it —
`@react-native/metro-config`'s own installed directory, since metro-config
depends on metro-babel-transformer itself and pnpm always guarantees a
package can resolve its own direct dependencies from within its own store
location:
```js
const path = require('path');
const metroConfigPkgPath = require.resolve('@react-native/metro-config/package.json');
const upstreamTransformer = require(
  require.resolve('@react-native/metro-babel-transformer', { paths: [path.dirname(metroConfigPkgPath)] }),
);
```
See `examples/angular/metro-css-transformer.js` for the real, working version
of this. If a future app's own `babelTransformerPath` wiring throws
`Cannot find module '@react-native/metro-babel-transformer'`, this is why —
don't add it as an explicit devDependency pin as a first move; try the
anchored `require.resolve` first, since it's robust to whatever hoisting
quirk caused the gap, not just this one instance of it.

## 7. SCSS/Sass, Less, and Stylus preprocessors — implemented (2026-07)

`core/css-parser/src/preprocessors.ts` reduces a preprocessor source down to
plain CSS text; `parser.ts`'s `parseCSS()` is the single, UNCHANGED downstream
consumer of that text either way — every CSS-Modules/`scoped`/`:global()`
mechanism in §5/§6 runs identically regardless of source language, since by
the time it runs the language distinction is already gone. Recognized by
extension (`.scss`/`.sass` → `scss`, `.less` → `less`, `.styl`/`.stylus` →
`stylus`, `detectLanguage()`) for a standalone file, or by the SFC `<style
lang="...">` attribute for an inline Vue block — the two are keyed
differently (extension vs. explicit lang string) because an inline block has
no file extension of its own.

**Ported from wolf-tui's own already-working preprocessor layer** —
`wolf-tui/internal/css-parser/src/preprocessors.ts` — MINUS its Tailwind
branch (`TailwindCompiler`, `getTailwind()`, the `compile()` function's
`@tailwind`/`@import "tailwindcss"` detection): Tailwind is a separate,
deliberately out-of-scope concern for this compiler (see the
`symbiote-tailwind-support` skill for why it needs a fundamentally different,
non-preprocessor shape — whole-project class scanning + JIT generation, not a
source-reduces-to-CSS transform). The `compileScss`/`compileSass` (alias),
`compileLess`, `compileStylus`, `detectLanguage`, and unified `compile()`
shapes carry over close to verbatim; only the Tailwind-adjacent parts were
dropped.

**Lazy-optional dependency pattern.** `sass`, `less`, and `stylus` are
`devDependencies` of `@symbiote-native/css-parser` ONLY (never a `dependency`) — a
project that never authors `.scss`/`.less`/`.styl` must never be forced to
install any of the three, same reasoning as `postcss` being the one CSS
dependency that IS always required (§1). Each compiler function does a lazy
`await import('sass' | 'less' | 'stylus')`, cached in a module-scope variable
after the first successful load; a failed import throws a plain
install-instruction error (`"sass is required for .scss/.sass files. Install
it: npm i -D sass"`) instead of failing this package's whole module graph at
import time. `less` and `stylus` ship no types of their own, so `@types/less`
and `@types/stylus` are additional catalog-pinned devDependencies purely for
this package's own typecheck.

**Sync vs async — the whole transform chain went async, uniformly, including
plain `.css`.** SCSS/Less/Stylus compilation is inherently async in Node:
Less ships no synchronous render API at all, Stylus's callback-based render
must be Promise-wrapped, and Sass's `compileString` does have a sync API but
the lazy `import('sass')` step itself is still async either way. Every
existing transform function here was synchronous before this feature
(`compileCssFile`, `createCssMetroTransformer`'s `transform()`,
`metro-vue-transformer.js`'s `compileSfc`/`transform`) — first confirmed Metro
actually tolerates a Promise-returning `babelTransformerPath.transform()` by
reading the installed `metro-transform-worker` source directly
(`transformJSWithBabel` in its `index.js` already does `await
transformer.transform(...)` before touching the result — a supported,
exercised shape, not a hack we're relying on undocumented behavior for). Then
chose whole-chain-uniform-async over a sync-fast-path-for-`.css` fork: this
function only ever runs at Metro build time, content-hash-cached (never a
runtime hot path), so forking it into two shapes to save a single microtask
on the plain-CSS branch wasn't worth the duplication — one shape, documented
at each decision site (`metro-css-module.ts`, `metro-transformer.ts`,
`metro-vue-transformer.js`) rather than left implicit.

**The four wiring points that needed updating** (all documented at the call
site, not just here):
1. `metro-css-module.ts`'s `compileCssFile` — now `async`; detects the
   language via `detectLanguage()` and awaits `preprocessors.ts`'s `compile()`
   before `parseCSS()` runs. `isCssModuleFile()` was generalized from a
   literal `.module.css` suffix check to "does the extension-stripped
   basename end in `.module`" so `Card.module.scss` etc. scope exactly like
   `Card.module.css` always did. `globalClassNamesIn()` is now scanned
   against the COMPILED CSS text, not the raw preprocessor source — `:global(...)`
   isn't native SCSS/Less/Stylus syntax (each preprocessor passes an
   unrecognized selector through unchanged in practice), but scanning actual
   compiler output can't drift under nesting/interpolation the way assuming
   source-and-output stay textually identical could.
2. `metro-transformer.ts`'s `createCssMetroTransformer` — the extension check
   broadened from `.endsWith('.css')` to `preprocessors.ts`'s `isStyleFile()`
   (one shared recognized-extension list, so a new preprocessor extension is
   added in exactly one place); `transform()` is now `async`.
3. `metro-vue-transformer.js` — the `<style lang="X">` branch that used to
   throw for anything but plain CSS now maps `scss`/`sass`/`less`/`stylus` to
   a `compilePreprocessor()` call (still throws for any OTHER lang, a typo or
   genuinely unsupported value, unchanged message); `compileSfc` and
   `module.exports.transform` are both now `async`. The one wrinkle: an
   inline block has no real file path, so `.sass`'s indented-syntax
   selection (which `compileScss` picks off a `.sass`-suffixed path) needs a
   SYNTHETIC path (`` `${filename}.sass` ``) built from the `.vue` file's own
   name — every other preprocessor only uses the path for relative-import
   `dirname()` resolution, where the real `.vue` file path is correct as-is.
4. Every example's `metro.config.js` — `resolver.sourceExts` gained `'scss'`,
   `'sass'`, `'less'`, `'styl'` alongside the existing `'css'` entry.

Testing note (see `symbiote-sfc-style-compiler`'s own "verify this quickly"
practice above): `core/css-parser/src/preprocessors.test.ts` drives the REAL
installed `sass`/`less`/`stylus` packages (nesting, a variable, a mixin/
function, per language) rather than mocking them, since this is exactly the
kind of ported/adapted logic that can pass green against a mock while
silently diverging from the real compiler's actual output — the missing-
package error path is the one thing that IS mocked (`vi.doMock` + `vi.resetModules()`
+ a fresh dynamic `import('./preprocessors.ts')` per case, so each test gets
an isolated lazy-load cache instead of colliding with the "real compile"
tests for the same language).

## 8. Standalone `.module.css` type safety — CLOSED (2026-07)

Two complementary mechanisms, both required — neither alone is sufficient,
matching the dual approach `@wolf-tui/typescript-plugin`'s own README
documents for the identical problem (a language-service plugin never loads
for a standalone `tsc`/CI run; an on-disk `.d.ts` alone can't give
live-while-typing feedback without a save-triggered regeneration step).

### `css-dts` — on-disk `.d.ts` generation, the `tsc`/CI-time source of truth

`core/css-parser/src/generate-dts.ts`'s `classNamesToDtsSource`/
`generateModuleDts` (pure, disk-free — reuses the real `parseCSS`/
preprocessor pipeline, so compound/descendant selectors and `:global(...)`
resolve exactly like `compileCssFile` does) plus `generate-dts-cli.ts` (the
disk-touching layer: walks a directory, finds every `.module.css`/`.module.
scss`/`.module.less`/`.module.styl`, writes `<file>.d.ts` next to each —
`Card.module.css.d.ts`, full original filename with `.d.ts` appended rather
than replaced, so TypeScript's own module resolution picks it up for
`import styles from './Card.module.css'` with no extra wiring). Unlike
Volar's `<style module>` intersection type (§ below), the emitted type has
**no index signature** — `styles.typoKey` is a genuine `error TS2339` under
`tsc`/`vue-tsc`, confirmed end-to-end against a real probe file in
`examples/react` (generate → `tsc --noEmit -p tsconfig.json` → the typo
error appears; delete the generated `.d.ts` → the loose ambient fallback
below takes over and the typo silently passes again).

Exposed as the `css-dts` bin from `@symbiote-native/css-parser`'s own `package.json`
— and, unlike `metro-css-parser.cjs`/the ViewConfig registration pattern,
**this is NOT re-exported through each adapter**. An app already types the
plugin's package name by hand in its own `tsconfig.json` (see below), so
requiring one extra `"@symbiote-native/css-parser": "workspace:*"` devDependency
line costs nothing extra over writing `@symbiote-native/react/typescript-plugin`
instead of `@symbiote-native/css-parser/typescript-plugin` — and it is MORE correct:
the plugin is pure dev tooling with zero adapter-specific behavior (same
`.cjs` file would otherwise be duplicated verbatim three times), and every
comparable community tool (`typescript-plugin-css-modules` etc.) is consumed
this same way, as a direct devDependency, never routed through a UI
framework's own package. Contrast with `metro-css-parser.cjs`: Metro's
`babelTransformerPath` is wired from a config file the app never edits by
name (`metro-css-transformer.js`), so hiding css-parser from the app's own
`package.json` there is the RIGHT call — an earlier version of this section
mirrored that indirection here too, tried it (adapter-level
`typescript-plugin.cjs`/`css-dts.cjs` shims), confirmed it worked, and then
reverted it once this asymmetry was pointed out: the two distribution
problems only LOOK identical, they don't share the same justification.
Wire `css-dts` as a `pretypecheck` script (`examples/vue-sfc/package.json`'s
`"pretypecheck": "css-dts ."`) — runs before every typecheck, local or CI,
with zero dependency on Metro/a dev server being up. `pretypecheck`/`preX`
is npm/pnpm's own generic convention (any `preX` script auto-runs before
`X` when invoked via `pnpm run X`/`npm run X`; verified live against this
repo's pnpm — it is NOT limited to npm's reserved lifecycle names), not
something this package wires itself. **Deliberately NOT wired into the
Metro transformer**: Metro's transform is content-hash-cached and only
touches a file actually reached by the CURRENT bundle graph, so a `tsc`/
`vue-tsc` run with no Metro involved (the normal CI shape) would find
`.d.ts` files missing or stale exactly where correctness matters.

**Current wiring state (2026-07), so a future session doesn't have to
re-discover it by grepping):** `pretypecheck` is wired ONLY in
`examples/vue-sfc/package.json` today — `examples/react`, `examples/vue-tsx`,
and `examples/angular` register the `typescript-plugin` in their
`tsconfig.json` but have no `pretypecheck`/`css-dts` script of their own yet,
a real parity gap per `<adapters_reach_full_feature_parity>`, not
deliberate. Separately: **no example app has an actual `.module.css` (or
`.module.scss`/`.less`/`.styl`) file today** — `find examples -iname
"*.module.*"` returns nothing repo-wide — so running `css-dts .` anywhere
right now is a real no-op (`css-dts: no .module.css (or .module.scss/.less/
.styl) files found`), by design of there being nothing to generate yet, not
a sign the tool is broken or unnecessary.

### `@symbiote-native/css-parser/typescript-plugin` — live in-editor autocomplete, zero watch process

A real TypeScript language-service plugin (`core/css-parser/
typescript-plugin.cjs`, subpath `@symbiote-native/css-parser/typescript-plugin`,
a DIRECT devDependency of each example — see the distribution note above for
why this one is NOT adapter-routed) registered via each example's
`tsconfig.json` `compilerOptions.plugins: [{"name":
"@symbiote-native/css-parser/typescript-plugin"}]`. Overrides
`getScriptSnapshot`/`resolveModuleNameLiterals` on the language service host
to synthesize a virtual `.d.ts` for a `.module.css` import — runs INSIDE the
IDE's own tsserver, recomputing on every keystroke the same way the rest of
tsserver already does. This is what makes "does the user have to keep a
terminal open" a non-question for live editing. (An earlier version of this
section said a `css-dts --watch` mode "was considered and rejected" for the
same reason — stale: `generate-dts-cli.ts` DOES implement `--watch` today, as
an opt-in convenience for keeping the on-disk `.d.ts` fresh during a long
local session. It doesn't compete with the plugin — the plugin needs no
watch process for the in-editor case regardless of whether `--watch` is
running, since `getScriptSnapshot` recomputes synchronously per keystroke on
its own.)

Ported from `wolf-tui/packages/typescript-plugin/src/index.ts`
(`@wolf-tui/typescript-plugin`) — same core mechanism, but reading that
source directly (not trusting the README summary) surfaced two real bugs
fixed in our version: (1) its class extractor never camelCases a kebab-case
selector, so its suggested key (`'section-tight'`) does not match the
ACTUAL exported key our runtime produces (`sectionTight` — `parseCSS`
always camelCases, confirmed by generating a real `.d.ts` from
`.section-tight { }` and getting `sectionTight`); (2) its `.d.ts` cache
(`Map<cssPath, dts>`) never invalidates, so autocomplete goes stale after
editing the CSS file until tsserver restarts — ours keys the cache on the
file's `mtimeMs` instead. wolf-tui's own `package.json` also lists a real
dependency on `@wolf-tui/css-parser` that `index.ts` never actually imports
— a leftover of an abandoned attempt to reuse it directly; also confirmed
`wolf-tui/packages/typescript-plugin/src/{host-proxy,type-generator,
css-resolver,language-service-enhancements}.ts` (~900 lines) are dead,
unreferenced-by-the-built-entry files from an earlier decomposed attempt —
`vite.config.ts`'s `build.lib.entry` points at `index.ts` alone.

**Scope, honestly recorded, not silently thinner:**
- Plain `.module.css` only — not `.module.scss`/`.less`/`.styl`.
  `getScriptSnapshot` must be fully SYNCHRONOUS (no async hook in the
  plugin protocol); Less and Stylus have no sync compile API at all (see
  §7), so a non-approximated preprocessor pipeline can't run here. Those
  files still get the loose ambient fallback + `css-dts`'s on-disk
  generation, just no live per-class completion in the plugin.
- Simple `.foo { }` selectors only — a compound (`.btn.primary`) or
  descendant (`.card .title`) selector, which the real parser merges into
  ONE key (`btnPrimary`/`cardTitle`), is extracted here as separate (wrong,
  non-existent) keys. Reusing the real parser would need importing this
  package's own ESM `parser.ts` from the plugin, which the CJS/ESM note
  below rules out; this is the SAME limitation wolf-tui's own README
  documents for its regex approach.
- Written as **hand-authored plain CommonJS** (`typescript-plugin.cjs` at
  each package's ROOT, not a compiled `.ts`/`.cts` under `src/`) — tsserver
  loads a plugin via a synchronous `require()`, which cannot load this
  package's own ESM build output without Node's newer synchronous-ESM-
  require support (stable only from Node 22.12, a floor neither this
  project's `engines.node: ">=20"` nor a user's editor-bundled Node
  guarantees). A `.cts` source was tried first and rejected: this package's
  shared tsconfig (`moduleResolution: "Bundler"`, needed for the rest of
  the package) doesn't apply the classic `.cts`→CJS format-forcing
  TypeScript otherwise gives Node16/NodeNext projects, and carving out a
  second tsconfig/project reference for one ~150-line file wasn't worth it
  — same `.cjs`-at-package-root shape as `metro-css-parser.cjs`.

Together: `css-dts`+`pretypecheck` is the correctness guarantee (CI, no
Metro, no IDE), the plugin is the live DX (editor only, zero terminal). A
loose `declare module '*.module.css' { const styles: Record<string,
string>; export default styles; }` ambient fallback lives in each example's
`css.d.ts` for a file that has neither yet.

**Why these two don't overlap — a general TypeScript fact, not something
specific to this plugin, worth knowing before assuming one makes the other
redundant.** `compilerOptions.plugins` in `tsconfig.json` is a
language-service-only extension point: only a running `tsserver` (the
process behind an IDE's live diagnostics/autocomplete) loads it. The
standalone `tsc`/`vue-tsc` CLI binary — which is what `pretypecheck` feeds
into, and what any CI typecheck job actually runs — reads the rest of
`tsconfig.json` but **silently ignores the `plugins` array entirely**; it
never spins up a language service at all. So `@symbiote-native/css-parser/
typescript-plugin` genuinely cannot catch a `.module.css` typo in a `tsc
--noEmit` / CI run, no matter how "automatic" it looks in the editor — it
is architecturally absent from that process. `css-dts`'s on-disk `.d.ts` is
the only thing a CLI/CI compile ever sees; the plugin only ever exists
inside a live editor session. Neither is optional if you want both "catch it
while typing" and "catch it in CI" — they're two different consumers of the
same underlying `.module.css` type problem, not two implementations of the
same fix.

## Explicitly open — NOT built, do not assume any of this exists

Per `<adapters_reach_full_feature_parity>`'s "record deferred scope honestly"
convention: these are real seams with a real path forward, not gaps silently
left thinner.

### `$style.card` autocomplete for inline `<style module>` — comes free from Volar, NOT from us; still no typo-catching

**Correction (2026-07, verified against a real `vue-tsc` run) — an earlier
version of this section claimed `$style.card` "type-checks as `string` with
no literal-key narrowing", which understated what actually happens for the
inline-SFC form.** Vue Language Tools (Volar, which `vue-tsc` shares its
virtual-file generation with) has its OWN built-in support for `<style
module>` blocks: it scans the block's raw CSS text for top-level class
selectors and synthesizes `$style`'s type as `Record<string, string> & {
row: string; badge: string; ... }` — entirely independent of
`@symbiote-native/css-parser`/the style-registry, using Volar's own naive selector
scan. This is why `$style.foo` autocompletes with the real class list in an
editor (confirmed via a real IDE screenshot hovering `$style` inside an
inline `<style module>` block) — it is a generic Vue SFC feature that also
happens to work for us, for free, because our transform keeps the exposed
object KEY identical to the original class name and only suffixes the
runtime VALUE (`row` → `"row__module__<scopeId>"`).

**It still does not catch a typo, confirmed by running `vue-tsc --noEmit`
against a real probe file** (`examples/vue-sfc`, temporary `.vue` with
`<style module>{.row{} .badge{}}` and a template reference to
`$style.typoKey`): zero diagnostics. Reason: the generated type is an
INTERSECTION with `Record<string, string>`, and that catch-all index
signature accepts any string key — so `$style.typoKey` still type-checks as
`string`, it just isn't one of the named literal properties. The practical
upshot is unchanged from before: a typo is a silent runtime miss (`$style`
resolving an unknown key to `undefined`), not a compile error — only the
"no autocomplete at all" half of the old claim was wrong.

**Unlike standalone `.module.css` (§8, CLOSED), this SFC-inline form is
STILL OPEN, and confirmed NOT WORTH CLOSING** — verified by reading
`@vue/language-core`'s own installed source directly rather than assuming a
config flag might exist. `generateStyleModules` in
`@vue/language-core/lib/codegen/style/modules.js` hardcodes the intersection
unconditionally:
```js
yield `: Record<string, string> & __VLS_PrettifyGlobal<{}`;
```
— no `vueCompilerOptions` flag gates it (grepped the package's `types.d.ts`,
nothing like a `strictCssModules` option exists), and it is called directly
from `codegen/script/template.js`, NOT through Volar's own pluggable
`vueCompilerOptions.plugins` codegen-extension point — so even Volar's own
supported customization mechanism can't override just this one function.
The only way to actually drop the index signature would be patching
`@vue/language-core` itself (pnpm `patch`/a fork), which breaks on every
Volar upgrade and isn't worth carrying for one string literal.

**Decision: don't chase this further.** The practical answer is already
shipped: use a standalone `Card.module.css` file + `import styles from
'./Card.module.css'` in the SFC's `<script>` instead of an inline `<style
module>` block — same CSS Modules semantics, and it goes through §8's
`css-dts`/`typescript-plugin` pair instead of Volar's, so a typo genuinely
fails `tsc`/`vue-tsc`. Inline `<style module>` keeps Volar's free-but-loose
autocomplete as documented above; nobody is patching Volar to fix it.

### Svelte

Svelte's `<style>` is scoped **by default** (opposite of Vue's opt-in
`scoped`), via an implicitly-injected `.svelte-hash` class rather than a
`data-v-hash` attribute, plus its own `:global(...)`. Symbiote has no Svelte
adapter yet (React, Vue, Angular only — see the other adapter skills) — this
is a forward-reference for whenever one is built, not actionable now. The
registry-scoping mechanism transfers directly once `scoped` exists for Vue;
only the SFC-syntax-extraction side (Svelte's own compiler) would differ.

### Tailwind CSS

Not built, and NOT a small extension of §7's preprocessor layer — Tailwind
needs whole-project class-name scanning and JIT utility generation, a
fundamentally different shape from "one source file reduces to plain CSS
text". Deliberately kept out of this compiler; being researched separately as
its own future package — see the `symbiote-tailwind-support` skill for the
current findings and the reasoning for why it doesn't fit here.

### `background-image` (gradients), `filter`, `transform-origin` — CLOSED (2026-07)

**This whole family is now DONE — do not repeat the mistake of assuming any
of it needs a Tailwind-style "different mechanism".** Unlike `@media`/
`animation` (genuinely no native RN concept to target), `box-shadow`,
`transform`, `filter`, `transform-origin`, and `background-image`/gradients
are ALL real, fully-native Fabric style props on both platforms — confirmed
by reading `.vendors/react-native` source directly (not memory):
`BoxShadowPropsConversions.h`/`RCTBoxShadow.mm`/`BoxShadow.kt`, `filter`'s
`FilterPropsConversions.h`, and `experimental_backgroundImage`'s
`BackgroundImagePropsConversions.h`/`.cpp`, `BackgroundImageDrawable.kt`,
`LinearGradient.kt`, `Gradient.kt`. Closed in three steps, same session:

1. `transform`/`box-shadow` → `raw` PROPERTY_TABLE entries (documented in the
   `properties.ts` bullet above) — `core/engine/src/process-transform` and
   `process-box-shadow` already existed and were already wired into
   `commit.ts`'s `STYLE_PROCESSORS`; the CSS-parser side was the only gap.
2. `filter`/`transform-origin` → same pattern: `core/engine/src/
   process-filter.ts` and `process-transform-origin` were ALSO already ported
   and wired, `PROPERTY_TABLE` was just missing the two `raw` entries.
3. `background-image` → the only one needing a NEW engine-level port:
   `core/engine/src/process-background-image/index.ts` (a faithful port of
   RN's `Libraries/StyleSheet/processBackgroundImage.js` — linear/radial
   gradient parsing, color-stop transition-hint syntax, the `at <position>`
   micro-grammar), wired into `commit.ts`'s `STYLE_PROCESSORS` under the key
   `'experimental_backgroundImage'` (RN's own prop name, not a plain
   kebab→camel rename — see the `PROPERTY_TABLE` comment), plus one new
   `IBackgroundImageValue` family of types in `core/engine/src/styles.ts`.

**A real, previously-silent bug this fix exposed:** `examples/angular/
App.css` had ALWAYS authored `box-shadow`/`filter`/`transform`/
`transform-origin` directly as CSS (`.shadow-card`, `.filter-tile-dim`,
`.rotated-card`) — not a migration, that's how the Angular canary was written
from the start. Before this session's `PROPERTY_TABLE` fix, every one of
those declarations was silently DROPPED by css-parser (one deduped
`console.warn` each), so the Angular demo had been rendering with NO shadow,
NO dimming, and NO rotation this whole time, with nothing failing loudly
enough to notice. Confirmed fixed on a real Android simulator screenshot
(blue glow, dimmed tile, and rotated card all visibly correct) the same
session `background-image` shipped. React/Vue-sfc/Vue-tsx's equivalent demos
use inline dynamic style objects (`shadowCardExtra`/`dimStyle`/
`rotationStyle`) instead of CSS classes for historical reasons unrelated to
this bug (predating `<style scoped>`/CSS-Modules support) — left as-is, not
migrated, since both forms are equally valid once the CSS form works; a new
`.gradient-card` CSS class + demo section was added to all four example apps
(react/vue-sfc/vue-tsx/angular) specifically to exercise `background-image`,
and all four were confirmed rendering a correct gradient sweep on real iOS/
Android simulators.

Confirm current status by re-reading `core/engine/src/commit.ts`'s
`STYLE_PROCESSORS` map and `core/css-parser/src/properties.ts`'s
`PROPERTY_TABLE` before assuming anything in this family still needs work —
it was closed incrementally, in three passes, across one session, so an
older "not built yet" claim (including an EARLIER version of this very
section) can go stale within hours.
