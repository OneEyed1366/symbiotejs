# SymbioteNative

Framework-agnostic React Native renderer. Extract the entire native stack of
React Native (Fabric C++, JSI, Yoga, the iOS/Android host) and let renderers for
**any** UI framework — Vue, Svelte, Solid, Angular, React — drive it through the
framework-agnostic seam that Fabric already exposes. One native core, N thin
adapters. The proven shape from [wolf-tui](./wolf-tui) (shared retained-tree +
a thin per-framework reconciler), retargeted from ANSI to native views.

> Local knowledge and decisions live in project Claude skills (`.claude/skills/`,
> authored with SkillForge), not in `.docs/` ADRs. Read the matching skill
> before proposing architectural changes — that's where the rationale and the
> explicit list of what it rules out live now.

## The one architectural fact everything rests on

React is **not** privileged inside React Native's renderer. Fabric exposes a
framework-agnostic, JSI-bound mutation API — `global.nativeFabricUIManager`:

```
createNode / cloneNodeWithNewProps / cloneNodeWithNewChildren
createChildSet / appendChildToSet / completeRoot
```

React's renderer is just **one client** of it, and all of its React-specific glue
lives in a single file: `react/packages/react-native-renderer/src/ReactFiberConfigFabric.js`
(`supportsPersistence = true`, `createInstance`, `cloneInstance`,
`createContainerChildSet`, `completeRoot`). "Removing React" means: stop calling
that host config, call the slot directly from your own renderer. **The native
core is never touched.**

## Architecture (locked — see project skills in `.claude/skills/`)

```
@symbiote-native/components : framework-agnostic state machines + render functions (→ Descriptor)
        │  every adapter wires state→render with ITS lifecycle (hooks / reactivity)
        ▼
Vue · Svelte · Solid · Angular · React        thin reconciler + descriptor→element bridge
        │  insert / remove / setProp / commit
        ▼
@symbiote-native/engine : retained shadow-tree + diff→childSet + event normalization
        │  ALL clone-on-write lives HERE, in one place
        ▼
nativeFabricUIManager  (createNode / cloneNodeWithNewProps / appendChildToSet / completeRoot)
        ▼
stock react-native : Fabric C++ · JSI · Yoga · RCTFabricSurface     ← never forked
```

## Invariants (do not violate without recording the change in a project skill)

<native_core_is_untouched>
We consume `react-native` as an ordinary dependency. We never fork, patch, or
vendor its native (C++/Obj-C++/JNI) sources. The only thing we replace is the
**JS renderer**: instead of React's Fabric host config, our own renderer drives
`nativeFabricUIManager`. If a task seems to require editing ReactCommon, Yoga, or
any native file — stop. That is a signal the design has drifted; raise it as a
new decision, do not patch native.
</native_core_is_untouched>

<react_native_is_an_explicit_top_level_peer>
`react-native` (and `react`) is a **peerDependency** of `@symbiote-native/engine` and every
adapter — never a regular or bundled dependency — and an **explicit top-level
dependency of the consuming app**. It is a runtime singleton and the Metro version
anchor (same class as `react` / `expo`): exactly one copy, declared at the app root.
The adapter facade hides only **imports** — app _code_ names only `@symbiote-native/*`, but
the app _manifest_ still pins `react-native`. Do NOT try to make RN a hidden /
transitive dependency to keep it out of the app's `package.json`: modern Expo
autolinking would resolve it, but it forfeits version-pinning and breaks pnpm
isolated installs — an ecosystem anti-pattern. The future `create-symbiote`
scaffolder owns the top-level pin so the developer never writes it by hand.
</react_native_is_an_explicit_top_level_peer>

<third_party_rn_packages_are_react_only>
A third-party React Native component package (`@react-native-community/slider`,
`react-native-*`, any library shipping a JS component) runs ONLY under the **React
adapter**. Its component body is React internally — it calls `useState` / hooks off
the React dispatcher — so when a non-React adapter (Vue, Svelte, Solid, Angular)
renders it the dispatcher is null and it throws (`Cannot read property 'useState' of
null`). SymbioteNative only makes the _native view_ framework-agnostic (it derives the RN
ViewConfig — events + prop processors — at runtime); it does NOT make the library's
React _component_ framework-agnostic. So: examples and canaries for a non-React
adapter must NOT import RN component packages. A native third-party view is reachable
from a non-React adapter ONLY through that adapter's own thin wrapper over the engine
(the same `createNode`-by-ViewConfig path SymbioteNative uses for its own primitives) — never
by importing the library's React component. Until such a wrapper exists, the component
is React-adapter-only.
</third_party_rn_packages_are_react_only>

<clone_on_write_lives_in_engine>
Fabric is persistent / clone-on-write: you never mutate a node, you clone it with
new props and atomically commit a new child set. Mutation-oriented frameworks
(Vue, Svelte, Solid, Angular) must NOT each reimplement this dance. The entire
mutation→clone-on-write translation lives once in `@symbiote-native/engine`. Adapters
see only a tiny mutation API (`insert / remove / setProp / commit`). A persistence
bug is fixed once, for all adapters.
</clone_on_write_lives_in_engine>

<adapters_stay_thin>
Each framework adapter is a thin reconciler that maps its framework's node
operations onto the engine's mutation API — nothing more. Layout, commit batching,
event normalization, ViewConfig handling: all live in the engine. If adapter code
grows framework-specific layout or commit logic, that logic belongs in the engine.
</adapters_stay_thin>

<adapter_src_follows_framework_idioms>
An adapter is written in IDIOMATIC code for the framework it targets — respect that
framework's own best-practices and naming conventions, do NOT force a foreign one
across adapters for the sake of looking symmetric. The concrete tell is the lifecycle
bucket inside `<package>/src/`: it is named for the framework's term — React groups its
lifecycle files under `hooks/`, Vue under `composables/` — because that is what each
ecosystem calls them; a Vue `hooks/` folder or a React `composables/` folder would be
wrong even though the role is identical. The framework-AGNOSTIC buckets, by contrast,
carry the SAME name in every adapter: `components/` (visual primitives — folders +
flat), `modules/` (imperative RN-API namespaces with no view — `Alert`, `Share`,
`Animated`, `StatusBar`, `PanResponder`…), `utils/` (small agnostic helpers). The
adapter's reconciler wiring stays FLAT at the package root, never in a bucket: `index`,
`render`/`renderer`, `host-config`, `host-instance`, `descriptor-to-<fw>`, the
`components.ts` re-export barrel, `*.d.ts`. The public package barrel (`@symbiote-native/<fw>`,
i.e. `src/index.ts`) is the ONLY thing external code imports — grouping is internal, so
moving files between buckets never changes the package's surface. This idiom rule is
orthogonal to the `symbiote-file-layout` skill's folder-as-module rule (that governs a
single module's platform/shared variants; this governs the top-level category
grouping of `src/`).
</adapter_src_follows_framework_idioms>

<adapters_reach_full_feature_parity>
**P0 — MANDATORY, NO EXCEPTIONS.** Every component / primitive / runtime module
ships at **full feature-parity across ALL adapters**. A "minimal", "basic",
"partial", or "stub" port is FORBIDDEN — if React's `ScrollView` carries sticky
headers, RefreshControl, the imperative scroll handle, `maintainVisibleContent-
Position`, and native scroll-attach, then Vue's `ScrollView` (and every future
adapter's) exposes that SAME complete prop + behavior surface. The same holds for
every prop, event, imperative method, and platform branch of every component.

The rule is not "copy the surface into each adapter" — that would violate
`<adapters_stay_thin>`. It is: extract the shared logic (state machine, render,
prop resolution, platform-invariant assembly) into `@symbiote-native/engine` /
`@symbiote-native/components` so EVERY adapter inherits the full surface for free, and the
adapter supplies ONLY its lifecycle + descriptor bridge. Parity must be
**structural**, not maintained by hand. If a component's shared half does not yet
exist (e.g. React's lives in `adapters/react/src/scroll-view-shared.ts`, not yet in
`core/`), extracting it to the shared layer is PART OF the task of bringing it to a
second adapter — not a follow-up, not deferred.

Concretely, "add component X to adapter Y" is DONE only when X on Y has the same
features X has on every other adapter, proven by a parity check (smoke +
prop-by-prop diff against the reference adapter). Shipping a reduced surface and
calling the rest a "follow-up" is a P0 violation. When the full surface is genuinely
too large for one pass, SPLIT THE WORK HONESTLY (record exactly what is and isn't
covered in the relevant project skill) — never by silently shipping a thinner
component.
</adapters_reach_full_feature_parity>

<layout_is_yoga>
Layout is stock Yoga. Taffy is explicitly out of scope. The C++ seam
`LayoutableShadowNode` keeps the door open for a future engine swap, but swapping
means a native fork and is not on the table until Yoga genuinely blocks us.
</layout_is_yoga>

<runtime_modules_layering>
The runtime-module layer (RN's `Platform`, `StyleSheet`, `Dimensions`,
`Appearance`, `AppState`, `Alert`, `Linking`, `Vibration`, `Share`,
`ActionSheetIOS`, + the `use*` hooks) splits by purity: **pure utilities with no
native event / React dependency (`Platform`, `StyleSheet`) live in
`@symbiote-native/engine`** (framework-agnostic, every adapter re-exports them); **native-
bridge consumers live in the adapter** (`@symbiote-native/react`), exactly like
`Keyboard` / `StatusBar` — thin JS over `getNativeModule` + device events, no Fabric
component of their own. New runtime modules follow this split, never the reverse.
</runtime_modules_layering>

<examples_vs_dot_examples>
`examples/*` are the PUBLIC canary apps. Since 2026-07-14 they are OUTSIDE the
pnpm workspace entirely (removed from `pnpm-workspace.yaml`'s `packages:`) — a
standalone `npm install`-able tree with no `catalog:`/`workspace:*` specifiers
(neither resolves outside a pnpm workspace); every dependency is a literal
version, and every `@symbiote-native/*` is a pkg.pr.new canary URL pending a real
npm release. Install with plain `npm install` INSIDE the example directory, never
`pnpm install` from repo root — that reason is load-bearing: pnpm's
`blockExoticSubdeps` supply-chain guard blocks a pkg.pr.new URL's own transitive
URL subdeps anywhere in a SHARED pnpm workspace, which used to poison
`.examples/*`'s install too when both trees shared one lockfile.
`.examples/{react,vue-sfc,vue-tsx,angular}` (dot-prefixed, gitignored by the
existing blanket `.*/` rule — no explicit `.gitignore` entry needed) is UNCHANGED:
a private, untracked dev harness still inside the pnpm workspace, same apps, full
native scaffolding, every `@symbiote-native/*` dependency `workspace:*` so local
source edits in `core/*`/`adapters/*`/`packages/*` are picked up live. **Any task
that adds, ports, or wires up a component / adapter / third-party wrapper /
package integrates it ONLY into the matching `.examples/<app>` — never into
`examples/<app>`.** `examples/<app>` is updated later, deliberately, as its own
step: a direct literal-version edit in `examples/*/package.json` after a real npm
publish (no catalog to bump anymore). Full mechanics, the `blockExoticSubdeps`
root cause, the Metro/`react-native.config.js` fallout, the diagnostic for which
tree an app is actually linked to, and the 2026-07-04 incident that originally
motivated the split: the `symbiote-dev-examples` skill.
</examples_vs_dot_examples>

<components_split_logic_view_lifecycle>
Visual components (Pressable, Switch, TextInput, Modal, Button, the lists,
ScrollView…) split into THREE layers, mirroring wolf-tui's
`internal/shared` + per-framework adapter (study
`wolf-tui/internal/shared/src/{state,wnode}` and
`wolf-tui/packages/react/src/components/TextInput/*` — the reference shape):

1. **Logic — `core/components/state/`.** A pure reducer `(state, action) → state`
   - a `createInitial*` factory + pure helpers. Zero framework, zero render. The
     wolf-tui twin is `internal/shared/src/state/text-input.ts`.
2. **View — `core/components/view/`.** A pure render function
   `render*(viewState, theme) → Descriptor`. Visual AND state enter **only through
   props**; out comes a tree of `Descriptor` nodes (`core/components/descriptor.ts`
   — `{ type, props, children, key }` over our primitives `symbiote-view` /
   `symbiote-text` / `symbiote-image`, built with `el()` / `txt()`). No framework,
   no state, no events. The wolf-tui twin is `internal/shared/src/wnode/render-*.ts`
   (`WNode` + `wbox`/`wtext`).
3. **Lifecycle — the adapter.** The framework owns state-as-lifecycle and the
   descriptor→element bridge, NOTHING else: React → `use*State` hooks
   (`useReducer`/`useEffect`/`useRef` over the `core/components/state` reducer) +
   `descriptorToReact` (`Descriptor → React.createElement`); Vue → reactive
   `ref`/`watch` + `descriptorToVue` (`Descriptor → h()`). The bridge output is an
   ordinary host element that flows on through the adapter reconciler → engine →
   Fabric.

So **render functions are framework-agnostic and prop-driven; frameworks own only
the lifecycle.** A component's logic and visual are written once and a new adapter
gets them for free — it supplies only hooks + the one descriptor bridge. Adapter
code that re-implements state or render for a component that already lives in
`core/components` is the bug this split exists to prevent.

Note this supersedes the older placement where component bodies lived wholesale in
`@symbiote-native/react`; the imperative runtime modules of `<runtime_modules_layering>`
(Alert, Share, Dimensions… — no visual, no lifecycle) do NOT follow this split,
they just move to core as plain modules.
</components_split_logic_view_lifecycle>

<prop_types_split_agnostic_vs_per_adapter>
A component's **public prop type** belongs in the shared layer (`@symbiote-native/components`)
ONLY when every field is framework-agnostic — fields typed off `IAccessibilityProps` /
`IAriaProps`, `IStyleProp<…>`, `ISymbioteEvent`, or plain scalars. Such a type is defined
ONCE next to its render fn (`core/components/src/view/render-X.ts`) and EVERY adapter
re-exports it verbatim (`export type { IXProps } from '@symbiote-native/components'`). A second
definition of the same prop type inside an adapter is a duplication bug — the adapter must
re-export, never redeclare. Done so far: `IResponderProps`, `IActivityIndicatorProps`,
`ISwitchProps`, `IButtonProps` (+ the style / Platform / accessibility / native-view-config
types already in the engine).

A prop type is **inherently per-adapter** — it CANNOT move to the shared layer as-is — the
moment any field carries a _framework element or framework ref_: `children` (React
`ReactNode` vs Vue slots/`VNode`), a host `ref` (`Ref<IHostInstance>` vs a Vue template
ref), or a render callback returning a framework element (`renderItem: (info) => ReactNode`
vs `=> VNode`). For these, each adapter DECLARES ITS OWN public prop type, sharing only the
agnostic FIELD BASE from the shared layer and adding its framework-specific children/ref/
render fields. The reference precedent is `IPressableProps`: React's and Vue's are separate
declarations (Vue's comment: "mirrors React's IPressableProps minus children, which Vue
takes via slots") — by design, not by omission. Still-per-adapter: `IViewProps`, `ITextProps`,
the `ITouchable*Props` family, `IKeyboardAvoidingViewProps`, `ISectionListProps`,
`IVirtualizedSectionListProps`. Bringing one of these to a new adapter means writing that
adapter's flavored prop type over the shared agnostic base — NOT importing the React one
(an adapter never imports another adapter's types; see `<third_party_rn_packages_are_react_only>`
for the same React-dispatcher reason). Promoting such a type to "fully shared" requires
making the shared base generic over the element type — a deliberate design step recorded in
its own project skill, never a silent verbatim move.
</prop_types_split_agnostic_vs_per_adapter>

<native_module_name_is_platform_specific>
The native module a JS API talks to is chosen from the RN wrapper's `Platform.OS`
branch (`.vendors/react-native/.../Libraries/<X>/<X>.js`), **NOT** from the spec
filename `Native<X>.js`. The same JS API hits different native modules per platform
(iOS `Share` → `ActionSheetManager`; Android `Share` → `ShareModule`). Headless
fakes resolve any name, so a wrong name passes every smoke and only fails on a real
host: the log `native module "<X>" not found (… bridgeless=object)` means the
**name** is wrong, the bridge is fine. Module-name correctness is proven on
device/simulator, never headless. Full iOS↔Android map and the Android to-do list:
`.docs/native-module-platform-routing.md`.
</native_module_name_is_platform_specific>

## Diagnostics & logging (P0 — do not violate)

<keep_logs_gate_behind_DEBUG>
Diagnostic logs are an asset: **never delete them — only add.** When debugging
finds a useful seam, leave a log there permanently. The cost of keeping logs is
zero because they are gated, not removed.

All logging goes through `dlog` / `isDebug` from `@symbiote-native/engine` (`debug.ts`),
never a bare `console.log`. It is **off by default** and toggled by the `DEBUG`
env var:

- `DEBUG=1` — Node reads it natively (headless smokes); the canary's
  `babel.config.js` inlines it into the RN bundle, so changing it needs Metro
  `--reset-cache`. Runtime escape hatch: `globalThis.__SYMBIOTE_DEBUG__ = true`.
- Default (unset) — silent; one property read per call, nothing emitted.

New code with non-trivial runtime behavior (a commit path, an event, a native
bring-up step) should add a `dlog` at its seam as a matter of course.
</keep_logs_gate_behind_DEBUG>

## Build & platform

- **Bundler:** Metro + per-framework transformers (Vue SFC / Svelte / Angular
  templates). Metro owns the RN-native contract — Hermes bytecode, native-module
  resolution, `.ios.js`/`.android.js` extensions, Fast Refresh — that we cannot
  cheaply reimplement. Not Vite, not Re.Pack.
- **File layout — folder-as-module for platform/shared groups (see the `symbiote-file-layout`
  skill).** A module that has platform (`X.ios`/`X.android`) and/or shared (`X-shared`)
  variants lives in its OWN folder `X/` with an `index` barrel: `X/index.ts` (base — re-exports the
  platform variant for headless), `X/index.ios.ts`, `X/index.android.ts`, `X/shared.ts`,
  plus the co-located `X/X.test.ts` / `X/X.detox.ts`. The import contract is
  UNCHANGED — `from '.../X'` (no suffix) resolves to the folder (Metro picks
  `X/index.ios` per platform, tsx/headless picks `X/index.ts`); only an EXPLICIT platform
  import changes form (`'.../X.ios'` → `'.../X/index.ios'`, `'.../X-shared'` →
  `'.../X/shared'`). Inside a folder, a sibling is `./shared` / `./index.ios`; a
  package-root module (one level up) is `../debug` / `../native-modules`. **Single-file
  modules with no platform/shared variant STAY FLAT** — only genuine groups get a folder.
  New components/modules follow this from the start; the flat
  `X.ts`/`X.ios.ts`/`X.android.ts`/`X-shared.ts` form is retired for grouped modules.
- **Platform:** iOS + Android both shipping (alpha). iOS stays the reference
  surface (shortest simulator loop on macOS, widest prop-edge coverage); Android
  is at canary parity. The `RCTFabricSurface` bootstrap and the Android native
  host-shims (`packages/android`) are both wired.
- **Primitives:** `View` · `Text` · `Image` · `ScrollView` all done. `Text`
  carries the only non-trivial nesting (`NativeText` vs `NativeVirtualText` via
  `TextAncestorContext`).
- **Styling — CSS classes are the convention; `StyleSheet.create` remains fully
  supported.** Every current example app (`examples/react`, `examples/vue-sfc`,
  `examples/vue-tsx`, `examples/angular`) styles its static look with a CSS class
  (`className`/`class`/`[class]`) against a `.css` file or, for Vue, an SFC `<style>`
  block — none of them call `StyleSheet.create`. `StyleSheet.create({…})` (engine
  export, re-exported by every adapter) is still identity at runtime — the engine
  flattens a raw object literal the same way — and stays the right tool for a value
  genuinely computed at runtime, or for an app that would rather not introduce CSS at
  all; its only value beyond a raw literal is preserving literal types
  (`flexDirection: 'row'` stays `'row'`). A Vue-SFC `<style>` block is
  supported, including `<style scoped>` (a per-file scope-suffixed class name, both
  static and dynamic `:class` bindings), `<style module>`, and a `:global()` escape hatch —
  `@symbiote-native/css-parser` compiles the CSS at build time, a class-name registry resolves it at
  runtime — see the `symbiote-sfc-style-compiler` skill for the full mechanism. The class+style
  merge and resolution is CROSS-ADAPTER, not Vue-only: `core/engine/src/node.ts`'s `routeProp`
  centralizes it, so a registered class resolves identically from React's `className` prop,
  Vue's `class`/`:class`, and Angular's `class`/`[ngClass]` (via real `addClass`/`removeClass`
  token accumulation, not the earlier no-op). A standalone `.css`/`.module.css` file import
  (`import styles from './Card.module.css'`) works the same way from ANY adapter's own source
  file, not just inside a `.vue` SFC. `@symbiote-native/css-parser` is a regular dependency of each
  adapter package (not a per-app devDependency) — each adapter re-exports it via a
  `metro-css-parser.cjs`/`./metro-css-parser` subpath, so a consuming app needs zero extra
  install step. SCSS/Sass, Less, and Stylus are ALSO supported (2026-07) — each preprocessor
  source reduces to plain CSS text before the same parser/registry pipeline runs, so every
  scoped/module/`:global()` mechanism above applies identically regardless of source language;
  `sass`/`less`/`stylus` are lazy-optional devDependencies of `@symbiote-native/css-parser` only, never
  forced on a project that doesn't author them. Cross-adapter class/style resolution (React,
  Vue, Angular) is exercised for plain CSS and CSS Modules; the preprocessor layer is newer and
  not yet exercised as heavily end-to-end. `$style.card` property-access type safety (`.d.ts`
  generation), Svelte's default-scoped styles, and `background-image` (CSS gradients — a real
  native Fabric prop via `experimental_backgroundImage`, unlike Tailwind; `filter` and
  `transform-origin` are already done) are recorded in that skill as the remaining open,
  unimplemented seams. JS style objects via `StyleSheet.create` remain the baseline every
  adapter supports; the CSS path is additive.

## Milestones

The milestones separate the risks: **R1** native pipe/bootstrap/slot, **R2** the
engine's mutation→clone-on-write commit path, **R3** event→recommit, **R4** a
non-React framework driving the engine (proves the core is genuinely
framework-agnostic). Authoritative milestone
table lives in [`README.md`](./README.md).

**M1 + M2 — React, done (alpha).** `@symbiote-native/react`: a `react-reconciler` host
config in **mutation mode** (`supportsMutation: true`, `appendChild`/`insertBefore`/
`removeChild` → the engine's mutation API) drives the full canary surface — `View` ·
`Text` · `Image` · `ScrollView`, the responder/gesture lifecycle, accessibility,
and RN's JS style processors — green on **iOS + Android**, with RN's own renderer
never in the path. React is a known-good driver, so a failure isolates to the engine /
slot / bootstrap (the `@wolf-tui/react` shape with a Fabric-backed engine). **React
goes through the engine in mutation mode** — NOT its native persistent mode straight to
the slot, which would skip R2. The bar for "done" is the canary green on both
platforms, not a parity percentage.

**M3 — Vue, done (isolated R4).** Vue (`@vue/runtime-core` `createRenderer`) renders
the full canary surface on the shared engine — first non-React proof of the
framework-agnostic seam, built in layers (static paint → reactive update → event) so
a break stayed localizable. The `core/`+`adapters/` layout and the `@symbiote-native/engine`
rename (from the former `shared` package) both landed as part of this milestone.

**M4 — Angular, done (isolates R4 again).** A `Renderer2`/`RendererFactory2` driving
the engine — Angular's framework-agnostic seam (twin of Vue `createRenderer`), DOM-less
bootstrap over a `SymbioteSurface`, on `@angular/core >=20` (stable
`provideZonelessChangeDetection` — zoneless is required, zone.js fights Hermes; v17–19
are EOL). The new risk vs Vue was **AOT under Metro**: two stages — ngtsc
`compilationMode:'partial'` (whole-program, compiles templates, does NOT fit Metro's
per-file slot) → `@angular/compiler-cli/linker/babel` (per-file, drops into Metro).
Full component parity, the renderer seam, and native bootstrap are implemented and
tested against `examples/angular`, and Angular is on the live framework switcher on the
landing page alongside React and Vue. Reference source vendored at `.vendors/angular`.
**Read the `angular-adapter` skill before any Angular adapter / build work** — it holds
the full seam map, bootstrap, version rationale, and the AOT pipeline.

**Workstream B — `core/components` (in progress).** Extract every reusable
component out of `@symbiote-native/react` into the three-layer split of
`<components_split_logic_view_lifecycle>`, so Vue (and the next adapters) get the
whole component surface for free. Done step-by-step, each slice verified against a
running example (`examples/react`, the React reference). Pilot order:
ActivityIndicator (render-only — proves the `Descriptor` + `descriptorToReact`/
`descriptorToVue` bridge) → Switch (first state machine — proves the
`state/` + `use*State` half).

**Dropped: `DrawerLayoutAndroid` (2026-07).** Was implemented across all three adapters purely
for parity coverage (proving the seam drives an arbitrary third-party native `ViewManager`, not
just SymbioteNative's own primitives), demoed only in `examples/angular/App.ts`. Removed entirely after
hitting an unfixable real-device Android crash (`ReactDrawerLayoutManager` — RN's own native
Fabric mounting layer, "The Drawer cannot have more than two children", root cause outside this
project's control) in a component RN itself has deprecated in favor of `@react-navigation/drawer`.
Do not re-add it as a SymbioteNative component; if a native Android drawer is ever needed again,
wrap `@react-navigation/drawer` through `<third_party_rn_packages_are_react_only>` instead.
Full incident record: `angular-adapter` skill §19.

## Reference material

- RN source: `.vendors/react-native` (and `.vendors/react` for the renderer
  host config). Authoritative for how the slot actually behaves.
- Internals notes: `.notes/Frontend/React Native` and
  `.notes/Frontend/React Native Internals`.
- Prior art: `./wolf-tui` — the shared-retained-tree + thin-reconciler pattern,
  already shipping across five frameworks against a native layout engine. It is the
  **same architecture, retargeted ANSI→native**, so when building an adapter
  cross-check its wolf-tui twin: `wolf-tui/packages/{react,vue,svelte,solid,angular}`.
  The Vue adapter there (`packages/vue/src/renderer/{nodeOps,patchProp}.ts`) is the
  reference shape for ours — `createRenderer` + nodeOps mapping each RendererOptions
  call onto the engine mutation API. Caveat: wolf-tui drives a TUI layout engine, so
  the framework seam transfers verbatim but the host-call targets differ (its
  `createComment` fakes an empty text node — we use a real anchor node the commit walk
  skips, because an empty RCTRawText would actually paint in Fabric).
