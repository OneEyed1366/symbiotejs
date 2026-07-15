---
name: symbiote-add-component
description: "Symbiote add-component workflow — 'add component X to adapter Y' at FULL P0 feature-parity via the three-layer split. Read BEFORE adding or porting ANY visual component (Switch, Modal, TextInput, ScrollView, the lists, a new primitive). The split, mirroring wolf-tui: (1) LOGIC — core/components/src/state/X.ts: a pure reducer (state, action) => state + createInitialXState factory + pure predicates, ZERO framework/render (Switch: switchReducer, shouldSnapBack, valueFromChange). (2) VIEW — core/components/src/view/render-X.ts: a pure renderX(view, platform) => Descriptor built with el()/txt(), PLUS the agnostic public IXProps (extends IAccessibilityProps, IAriaProps), the IXViewProps with its `passthrough` bag (ref + handlers + a11y ride here untouched), and IXPlatform (per-host prop-name mapping). (3) LIFECYCLE — the adapter: React useReducer/useRef/useLayoutEffect + dispatchViewCommand + descriptorToReact; Vue shallowRef(identity!)/ref/watch(flush:'post') + runtime guards (no `as`) + descriptorToVue. React's Switch lifecycle is a top-level useSwitchLogic hook + a top-level named Switch function per platform file (index.ios.ts/index.android.ts), NOT a createSwitch(platform) factory — Vue keeps the factory shape. Switch is the canonical reference (state/switch.ts + view/render-switch.ts + adapters/{react,vue}/src/components/switch/{index,index.ios,index.android,shared}.ts). The P0 rule: parity is STRUCTURAL — extract the shared half into @symbiote-native/components so every adapter inherits the full surface; NEVER copy the prop surface into each adapter, NEVER ship a 'minimal'/'partial'/'stub' port. Covers per-component ADR 0026 folder, symbiote-X host-name registration, the prop-type split, finishing with a parity-check, AND (§7) React Compiler compatibility for adapters/react — why a factory-returning-closure defeats its component/hook detection (fixed the same way for ActivityIndicator, its only other genuine case), and why passing a ref through passthrough into ANY function call — renderX(), createElement, a cross-package layout resolver, not just renderX() specifically — is a permanent, structural bail-out (tested: raw ref, callback ref, 'use no memo', removing an eslint-disable suppression, fixing an unrelated 'Todo'-category compiler gap — none unlock it) since the compiler can't verify a cross-package function is ref-safe. Full per-component survey results (which of the 18 React components are Finding-1 cases, Finding-2 dead ends, or already clean) in §7 Finding 3. Trigger on adding/porting a component to any adapter, or on 'react-compiler'/'babel-plugin-react-compiler'/'million.js' questions about adapters/react."
---

# Symbiote add-component — full-parity three-layer split

This is the active Workstream B task. "Add component X to adapter Y" is DONE only
when X on Y has the **same** props, events, imperative methods, and platform
branches X has on every other adapter — proven by a parity check
(`<adapters_reach_full_feature_parity>`, P0). The way you get there without
duplicating code is the three-layer split: write logic + view ONCE in
`@symbiote-native/components`, and each adapter supplies only its lifecycle + a
descriptor bridge.

**Switch is the canonical reference.** Mirror it file-for-file.

## 0. Mental model — when a component gets a render fn (read this first)

The core truth, and the whole point of RN: **JS is a higher-level, more
declarative language over the native stack — never a replacement for it.** A
`renderX()` IS that language; the native side executes. Every boundary below is
where the declarative language stops and native execution begins — none is a "gap"
or a "todo".

**Three categories of a component's logic — only category 1 becomes a render fn:**

```
1. view = f(props), assembled in ONE shot     → renderX() → Descriptor in core
   (the whole frame derives from values)         Switch, Modal, Image, InputAccessoryView, ActivityIndicator

2. pure logic, injected at DIFFERENT points   → helpers in core + assembly in the adapter
   of the adapter lifecycle (style here,         ScrollView math (selectScrollIntrinsics, didContentSizeChange),
   intrinsic there, dedup in an effect,          list virtualization (buildListPlan, computeWindow),
   window in the scroll handler)                 press machine (createPressRuntime)
   → CANNOT be one renderX() (not one tree in one moment) but IS still in core → reused
     free by every adapter. This is NOT a per-adapter re-implementation.

3. binding to the runtime / native node       → adapter only (the three seams below)
   (refs, effects, sticky-wrapping children,
    RefreshControl element, imperative handle)
```

**The render-fn criterion.** A render fn moves to core ⟺ every input, after the
framework brings it to life, is a framework-agnostic VALUE (scalar / prop / style —
identical on every framework). It stays in the adapter ⟺ any input is a live
SUBTREE of the user's components (`children`, or a render-prop like `renderItem`):
reducing that subtree to primitives is the framework's own reconciler,
framework-specific by definition.

Key: user `children` are **never converted back into a Descriptor**. Two
independent streams reach the engine and meet only at the reconciler:

```
our core components:  values → renderX() → Descriptor → descriptorTo<Fw> → framework element ─┐
                                                                                             ├→ reconciler → engine
user JSX (renderItem): <ProductCard/> → [framework runs it: hooks / context / nested comps] ──┘
```

The runtime is already there (we are inside a React/Vue/Angular app), so we don't
run the subtree — we **pass it through**. A render fn is a *generator of view from
values*; a user subtree has nothing to generate (the user already wrote it), so a
render fn there isn't restricted — it's absent by definition.

**Three "animators" of what core describes.** The model is "core describes, the
runtime animates" — and "the runtime" is plural:

```
JS reactivity of the framework  → Switch value, list data       (JS OWNS the state)
native driver (UI thread)       → Animated.event scroll-driven  (declared once in core, native runs it per frame)
imperative command              → scrollTo / focus / measure    (one-shot, off the render cycle)
```

**Three seams that live in the adapter by design (not a gap):**

```
1. WHEN an effect / commit fires  — framework timing (useLayoutEffect vs watch flush:'post' vs zoneless CD).
                                    The framework's idiom → correctly in the adapter.
                                    (vue-adapter-reactivity, angular-adapter-change-detection)
2. state whose source of truth    — scroll position, focus, measured layout. The native node owns and drives it
   is NATIVE                        60fps past JS (freeze JS 3s and the scroll still moves — CanaryScreen's
                                    Freeze-JS button proves it). JS may COMMAND (scrollTo), DECLARE a native-driver
                                    binding (Animated.event), or OBSERVE throttled (onScroll) — but never OWN it
                                    per-frame; per-frame ownership over the bridge = jank.
3. user children                  — the right-hand stream above; passed through as-is.
```

**The guarantee this buys** (the reason to keep the split clean): write reducer +
render in core, and the adapter is subscribe + dispatch + bridge. Then "wrote it in
core, wired the lifecycle, called the render fn → it works" is TRUE — and when it
doesn't, the bug is either in the core reducer (shared by every adapter) or in ONE
of the three named seams. There is no fourth "somewhere in the smeared assembly"
place to hunt.

**Extraction surfaces adapter drift — a feature, not a surprise.** Pulling a
triplicated pattern into core routinely reveals the three copies had quietly
diverged: one adapter carried a guard or fix the others lacked. Real case (2026-07,
VirtualizedList): extracting `resolveAverageLength` exposed that React averaged cell
lengths WITHOUT Vue/Angular's `count > 0` guard, so `data=[] + getItemLayout`
dereferenced a non-existent cell. Unifying in core applied the safe behavior to all
three at once. So when adapters "look identical", extract anyway — the diff between
the copies is exactly where a latent bug hides, and structural parity is what closes
it for good.

**Wrong first approximations (this took 9 passes to pin down — don't re-derive them):**
- ❌ "intertwined with lifecycle" — no: the adapter can feed measurements / refs INTO a render fn as inputs.
- ❌ "it has to crack the children box" — no: you could crack it if children were Descriptors.
- ❌ "needs a framework runtime inside" — refined: not "needs a runtime" but "must ANIMATE a subtree vs a value".
- ❌ "imperative channel = just scrollTo" — refined: the seam is "source of truth is native"; scrollTo is one face of it.
- ❌ "describe effects declaratively in core" — unnecessary: the effect stays imperative in the adapter (its timing
     is the framework's idiom); only its BRAIN (the reducer) is in core, and its result flows back as props.

## 1. The P0 rule — parity is structural, not copied

```
WRONG                                    RIGHT (the split)
copy X's full prop surface into          shared half (reducer + render + prop
adapters/react AND adapters/vue          resolution) in @symbiote-native/components;
→ violates <adapters_stay_thin>,         each adapter supplies ONLY lifecycle +
  drifts, P0 violation                   descriptor bridge → inherits the full
                                         surface for free
```

If X's shared half doesn't exist yet (e.g. React's lives in an adapter-local
`scroll-view-shared.ts`), **extracting it to `core/components` is PART OF the task**
of bringing X to a second adapter — not a follow-up. A reduced surface called a
"follow-up" is a P0 violation; if the full surface is genuinely too big for one
pass, split it honestly in an ADR listing exactly what is and isn't covered.

## 2. The three layers (Switch, literal)

### Layer 1 — Logic · `core/components/src/state/switch.ts`

Pure state machine. Zero framework, zero render. Unit-testable alone.

```ts
export type ISwitchState  = { lastNativeReport: boolean | null };
export type ISwitchAction = { type: 'native-reported'; value: boolean };
export function createInitialSwitchState(): ISwitchState
export function switchReducer(state, action): ISwitchState      // (state, action) => state
export function valueFromChange(event: ISymbioteEvent): boolean | undefined   // pure event reader
export function shouldSnapBack(state, fabricValue: boolean): boolean           // pure predicate
```

### Layer 2 — View · `core/components/src/view/render-switch.ts`

Pure render: state+props in (only through args), a `Descriptor` out. Built with
`el()` / `txt()` (`core/components/src/descriptor.ts`). Three types live here:

```ts
// agnostic PUBLIC surface — every adapter re-exports this verbatim
export interface ISwitchProps extends IAccessibilityProps, IAriaProps {
  value?: boolean; onValueChange?: (v: boolean) => void; disabled?: boolean;
  trackColor?: ISwitchTrackColor; thumbColor?: string; style?: IStyleProp<IViewStyle>; …
}
// the per-host prop-NAME mapping the adapter's .ios/.android supplies
export type ISwitchPlatform = { trackColorProps: (value, trackColor?) => Record<string, unknown> };
// pre-resolved inputs the render paints from; ref/handlers/a11y ride in `passthrough` untouched
export type ISwitchViewProps = { value: boolean; …; passthrough: Record<string, unknown> };

export function renderSwitch(view: ISwitchViewProps, platform: ISwitchPlatform): IDescriptor
//   → el('symbiote-switch', { ...view.passthrough, value, ...platform.trackColorProps(...), style })
```

The `passthrough` bag is the seam that keeps the render framework-agnostic: the
adapter folds ref + event handlers + accessibility into it, and they land on the
host node verbatim — the render never names a framework type.

### Layer 3 — Lifecycle · the adapter

React (`adapters/react/src/components/switch/shared.ts`) — a plain hook
`useSwitchLogic(rawProps, platform) => Descriptor`, NOT a factory returning a
closure (see §7 — a factory-returned closure is invisible to React Compiler):

```ts
// shared.ts
export function useSwitchLogic(rawProps: ISwitchProps, platform: ISwitchHostPlatform) {
  const ref = useRef<ISymbioteNode | null>(null);                       // host node
  const [state, dispatch] = useReducer(switchReducer, undefined, createInitialSwitchState);
  useLayoutEffect(() => {                                               // snap-back
    if (shouldSnapBack(state, fabricValue)) dispatchViewCommand(ref.current, platform.snapBackCommand, [fabricValue]);
  }, [fabricValue, state]);
  return renderSwitch({ …, passthrough: { ...rest, ref, onChange } }, platform);   // Descriptor out
}
```

```ts
// index.ios.ts / index.android.ts — a top-level named function per platform file,
// each supplying its own PLATFORM const and bridging the Descriptor to React:
const PLATFORM: ISwitchHostPlatform = { snapBackCommand: 'setValue', trackColorProps: … };
export function Switch(rawProps: ISwitchProps) {
  return descriptorToReact(useSwitchLogic(rawProps, PLATFORM));
}
```

Vue (`adapters/vue/src/components/switch/shared.ts`) — `createSwitch(platform) =>
defineComponent`, the exact twin, with the two Vue landmines handled:

```ts
const nodeRef = shallowRef<ISymbioteNode | null>(null);   // ← shallowRef, NOT ref: hold node by IDENTITY
const state   = ref<ISwitchState>(createInitialSwitchState());
watch(() => ({ fabricValue: rawAttrs.value === true, switchState: state.value }),
  ({ fabricValue, switchState }) => {
    if (shouldSnapBack(switchState, fabricValue)) dispatchViewCommand(nodeRef.value, platform.snapBackCommand, [fabricValue]);
  }, { flush: 'post' });                                  // ← post-flush so the node is committed
// attrs are untyped → narrow with runtime guards (isRecord / asString), NEVER `as`
return () => descriptorToVue(renderSwitch({ … }, platform));
```

## 3. The per-component file inventory (ADR 0026 folder)

A component is a folder in `components/`, platform-split by filename (no
`Platform.OS`):

```
core/components/src/
  state/switch.ts                          ← Layer 1
  view/render-switch.ts                    ← Layer 2 (+ the agnostic IXProps)
  component-names/shared.ts                ← register the host name 'symbiote-switch'
  component-names/{ios,android}.ts         ← map 'symbiote-switch' → Fabric 'Switch' / 'AndroidSwitch'
  index.ts                                 ← export all of the above

adapters/react/src/components/switch/      Vue still uses createSwitch(platform) — React-only
  shared.ts        useSwitchLogic(rawProps, platform) — the hook half (§7: NOT a factory)
  index.ts         re-exports ./index.ios (base, for tsx/headless)
  index.ios.ts     top-level `function Switch(rawProps)`, PLATFORM = { snapBackCommand: 'setValue',      trackColorProps: iOS names }
  index.android.ts top-level `function Switch(rawProps)`, PLATFORM = { snapBackCommand: 'setNativeValue', trackColorProps: Android names }
  switch.test.tsx  co-located (ADR 0025)

adapters/vue/src/components/switch/        Vue keeps the factory shape (no React Compiler concern)
  shared.ts        createSwitch(platform) => defineComponent — the hook half
  index.ios.ts / index.android.ts   createSwitch({ snapBackCommand: …, trackColorProps: … })
```

The platform file supplies the whole platform piece: `ISwitchHostPlatform =
ISwitchPlatform & { snapBackCommand: string }` (the view's color-name mapping +
the lifecycle's command name).

## 4. The prop-type split for this component

- `ISwitchProps` is all-agnostic (no `children`, no host `ref`) → it lives in
  `@symbiote-native/components` and each adapter **re-exports it verbatim**
  (`export type { ISwitchProps } from '@symbiote-native/components'`). Redeclaring it in the
  adapter is a duplication bug.
- A component whose props carry a framework `children`/`ref`/render-callback
  (`IViewProps`, `IPressableProps`, the list props) is **declared per-adapter** over
  the shared agnostic base. Full rule: `symbiote-file-layout` §4 +
  `<prop_types_split_agnostic_vs_per_adapter>`.

## 5. The two Vue landmines (don't skip)

Any stateful Vue component that grabs the host node hits both:
1. **Identity** — host node in `shallowRef`/`markRaw`, never deep `ref` (a Proxy
   breaks every imperative command).
2. **Timing** — a native call wired at mount needs `whenCommitted`; a value-driven
   `watch(flush:'post')` (like Switch snap-back) is safe because it fires after the
   node is committed.

Both are the `vue-adapter-reactivity` skill — read it before writing the Vue lifecycle. If the
component renders children with scope (an item, a press state, a section) read `vue-adapter-slots`
too: Vue exposes that as a typed scoped slot, never a React-style `renderItem` / `*Component` prop.

## 6. The sequence

```
PHASE 1  core/components   state/X.ts → view/render-X.ts (+ IXProps, IXViewProps, IXPlatform)
                           → register 'symbiote-X' in component-names → export from index.ts
PHASE 2  React adapter     components/X/{shared,index,index.ios,index.android}.ts → export X from src/index.ts
PHASE 3  Vue adapter       same folder shape; shallowRef + watch(flush:'post') + runtime guards
PHASE 4  Tests             state/X.test.ts (reducer), render-X.test.ts (Descriptor snapshot),
                           components/X/X.test.* per adapter
PHASE 5  PARITY CHECK      prove X on Y matches X on React → the symbiote-parity-check skill
```

Wire up and smoke-test every phase in the matching `.examples/<app>` (never
`examples/<app>` — that's the public catalog-pinned canary, see
`symbiote-dev-examples`). `examples/<app>` only picks up X later, deliberately,
after `@symbiote-native/components`/adapter is actually published.

**Device-smoke bar for a SHARED-CORE change (all adapters drive ONE core state
machine).** When the logic being verified lives once in `@symbiote-native/components`
and each adapter is only a thin lifecycle bridge over it (the whole point of the
split — extreme case: the VirtualizedList `reduceList` refactor, 2026-07), you do
NOT need all N adapters on a real device. Green headless proves the shared logic +
each bridge identically; a device run of the REFERENCE adapter (React) then exercises
the one thing headless fakes — the real native loop (scroll→window→recycle, real
onLayout measure, visual MVCP anchor, imperative scroll-to). Reference-on-device +
green headless = defensible "done"; the other adapters on device is extra rigor, not
a gate — and it is gated on the `.examples/<app>` being relinked to `workspace:*` with
the §5b metro fix (see `symbiote-dev-examples`), which most are NOT by default. This
applies ONLY when the core half is genuinely shared; a per-adapter behavior (a
framework-specific bridge quirk) still needs that adapter on device.

**Component-conformance status (2026-07-16 — audit complete, no violators left).**
A five-domain parallel audit of all 19 components confirmed the whole component
layer now conforms to the three-layer split. The last two holdouts were extracted
this date: `touchable` (the TouchableOpacity/Highlight press-scheduling machine was
triplicated line-for-line) and `scroll-view` sticky headers (the per-header effect
machine, hand-written in every adapter and TWICE in Angular — component +
`StickyProjectionWrapper`). ScrollView PROPER already conformed — its imperative
handle is core-owned (`buildScrollViewHandle`), scroll-offset is native-owned, MVCP
/ RefreshControl are legit seams, so it never needed a `reduceScroll`. There are now
three enriched-machine instances to copy from: `reduceList`
(`state/virtualized-list-reducer.ts`), `reduceSticky` (`state/sticky-header-reducer.ts`),
and `createTouchableFeedbackHandlers` (`state/touchable.ts`). The list family
(flat/section/virtualized-section) conforms purely by COMPOSING VirtualizedList — no
per-list reducer needed. Do not re-audit these; extend the map if a NEW component lands.

**Enriched-machine extraction conventions (learned across the three instances).**
When you extract a stateful effect machine into core:
- Inject the clock and scheduler (`now: () => number`, `schedule: (cb, ms) => cancel`)
  so the machine is unit-testable with a fake clock AND timer globals stay out of
  `@symbiote-native/components` (mirrors Pressable's `host.schedule`).
- The reducer emits timing as DATA — a `schedule-debounce` effect the ADAPTER runs —
  it never holds a live `setTimeout`. Same for the imperative native seam
  (`Animated.timing` opacity, `interpolate()` + `addListener`): injected via
  `activate`/`deactivate` callbacks or run by the adapter from an effect, never in core.
- A shared decision helper returns DECISIONS, not freshly-built handlers, when an
  adapter caches handlers by identity. `resolveScrollForwarding` returns
  `{ mode, scrollEventThrottle, ... }` (not an `onScroll` closure) precisely because
  Angular caches its handlers to avoid a Fabric re-clone cascade on every change-detection
  pass; a fresh-closure-per-call helper would regress it.

Adding a component to a brand-new adapter that has no renderer yet? Do
`symbiote-new-adapter` first. Touching the engine API in the process?
`symbiote-engine-core`.

## 7. React Compiler compatibility (React adapter only, 2026-07)

Investigated whether `babel-plugin-react-compiler` (Meta's React Compiler) can
optimize `adapters/react` component code, prompted by evaluating Million.js's
"Block Virtual DOM" first — ruled out immediately and permanently: it's 100%
real-DOM-bound (`cloneNode`, `innerHTML`, DOM `Text` nodes — see
`.vendors/million/packages/million/dom.ts`), nothing in it is reusable against
Fabric's shadow tree. React Compiler has no such DOM dependency and is a genuine
candidate — confirmed working for plain app code (wired into `.examples/react`'s
`babel.config.js`, first in `plugins`) — but two real findings when pointed at
`adapters/react` itself:

**Finding 1 — a `createX(platform)` factory defeats component/hook detection.**
React Compiler's default `'infer'` mode only walks TOP-LEVEL declarations
(function declarations / const-assigned arrows at Program scope). The OLD Switch
shape — `createSwitch(platform)` returning an anonymous closure — is invisible to
it: from the compiler's per-file view, `createSwitch` is just a lowercase factory
function; the actual component is a NESTED closure with no name of its own in that
scope. Renaming the closure (`return function Switch(rawProps) {…}`) does NOT fix
it either — still nested, still invisible. The fix that DOES work (verified via
the compiler's own `logger` option, not by grepping a minified bundle — React's own
dispatcher always exports `useMemoCache`, so its bare presence in a bundle is not
proof of anything): give each platform file its own TOP-LEVEL named function that
calls a plain hook, per §2's Layer-3 code above. Confirmed `CompileSuccess` on the
wrapper (`memoSlots: 3`) after this rewrite — this is why Switch's React lifecycle
is a `useXLogic` hook + a top-level `function X` per platform file now, not a
factory. Vue's `createSwitch(platform) => defineComponent` factory is UNCHANGED —
this is a React Compiler-only concern, not a general anti-pattern.

**Finding 2 — passing `ref` through `passthrough` into `renderX()` is a
permanent, structural incompatibility, not fixable by code shape.** Even after
Finding 1's fix, the actual hook body (`useSwitchLogic`) still fails to compile:
`CompileError`, category `"Refs"`, `"Cannot access refs during render"` /
`"Passing a ref to a function may read its value during render"`, pointing at
exactly the `passthrough: { ...rest, ref, onChange }` line. Root cause: React
Compiler analyzes ONE FILE at a time (Babel plugins don't do cross-file dataflow
analysis); `renderX()` lives in a DIFFERENT PACKAGE (`@symbiote-native/components`),
so the compiler can't verify it never reads `ref.current` synchronously and
conservatively bails the whole containing function. Tried and confirmed NONE of
these change the outcome: passing a ref CALLBACK instead of the raw `RefObject`
(the compiler traces the closure and flags it anyway), and the `"use no memo"`
directive (a no-op here because `panicThreshold: 'none'`, the default, already
silently skips optimizing a function with a Rules-of-React violation — the
directive only matters for suppressing the diagnostic, not for unlocking
anything). There is no restructuring within `<components_split_logic_view_lifecycle>`
that avoids this: `ref` flowing `useRef → passthrough → renderX() (cross-package)
→ Descriptor → descriptorToReact → createElement` is exactly the shape every
stateful/imperative component uses (measure, focus, `dispatchViewCommand` all need
a host ref this same way) — so this isn't a Switch quirk, it recurs for every such
component, and the only real fix would be to stop threading the live ref through
`renderX()` at all (a cross-component architectural change, unproven payoff on
mobile where Fabric/Yoga native layout — not JS reconciliation — is the actual
cost center).

**Net:** React Compiler on `adapters/react` gives a real but small win (the
top-level wrapper memoizes) and cannot touch the part that matters (the stateful
hook) without a bigger architectural change than a compiler adoption should
require. Don't re-attempt Findings 1/2 from scratch — this is the answer.

**Finding 3 — full-component survey (2026-07): only `ActivityIndicator` was a
genuine Finding-1 twin; the Refs wall is bigger than `renderX()`.** Surveyed
every `adapters/react/src/components/*` folder against Findings 1/2 (via the
compiler's `logger`, real Metro bundle, not bundle-grepping):

- **Applied the Finding-1 rewrite to `activity-indicator`** (`createActivity-
  Indicator(platform) => closure` → top-level `useActivityIndicatorLogic` hook +
  top-level `ActivityIndicator` per platform file, same shape as Switch). It had
  no ref in its `passthrough` at all, so unlike Switch it compiles genuinely
  clean end to end — `CompileSuccess` on the wrapper, and the logic hook has no
  hook calls of its own to fail on. This is the one other component that was a
  pure Finding-1 case (factory shape, zero ref) — done, verified, tests green.
- **`text-input`** is a Switch twin, but its `forwardRef((props, ref) => {…})`
  closure is ALREADY top-level-detected (a `forwardRef(fn)` call is not a custom
  factory — the compiler special-cases it, unlike `createSwitch(platform)`'s
  hand-rolled factory). Its real blocker is layered: first a `CompileError`
  category `"Suppression"` (an `eslint-disable-next-line react-hooks/exhaustive-
  deps` on the mount-only `autoFocus` effect trips an automatic bail-out — React
  Compiler treats ANY disabled Rules-of-React lint rule as proof it can't trust
  the function). Removing just that comment (tested, then reverted — it's a
  deliberate, correct suppression for a legitimate mount-only effect and removing
  it for real would need restructuring the effect, not just deleting a comment)
  unmasks the SAME Finding-2 Refs error underneath, at its own `passthrough: {
  ...rest, ref, onChange, onFocus, onBlur }` → `renderTextInput()` line. No
  extraction needed or worth doing here — it is already at the Switch end-state
  with one extra layer, not a case Finding 1's fix improves.
- **The Refs wall is not specific to `renderX()` — it fires on ANY function call
  that receives a ref**, cross-package or not: `pressable` and `touchable` (both
  `CompileError`/`Refs`) pass their `viewRef` straight into `createElement(View,
  viewProps)`, no `renderX()` involved at all, and still bail for the identical
  reason (`createElement` is itself an opaque function call from the compiler's
  point of view). `scroll-view` mixes both outcomes in the same file (some of its
  hooks are ref-free and compile; the ones threading the scroll-node ref through
  `createElement`/`dispatchViewCommand`-adjacent calls don't).
- **Two components hit a DIFFERENT compiler limitation — category `"Todo"`
  (an unsupported syntax shape, not a Rules-of-React violation) — and it's worth
  telling apart from Findings 1/2 because it can look fixable at first glance:**
  `virtualized-list` uses `stateRef.current ??= createInitialListState(...)`
  (nullish-assignment lowering unsupported by the compiler's HIR builder), and
  `keyboard-avoiding-view` declares `function renderWrapper(...)` textually AFTER
  its own `return` statements (legal via hoisting, but the compiler's builder
  flags code after a `return` as unreachable and won't look inside it for the
  declaration). Both LOOK like a quick syntax tweak away from compiling. Tested
  the `keyboard-avoiding-view` one for real: moved `renderWrapper`'s declaration
  above its call sites (functionally identical, hoisting doesn't change
  semantics) — the Todo error is gone, but it immediately reveals the same
  Finding-2 Refs error underneath (`initialHeightRef.current` read into
  `resolveKeyboardAvoidingLayout()`, and `renderWrapper` itself closes over a
  ref). Reverted the edit — it fixed a cosmetic blocker only to hit the real,
  permanent one, so it was a change with no compilation payoff, not worth
  carrying. Treat any `"Todo"` category compiler error on a component that also
  threads a ref through `passthrough`/`createElement` as very likely the same
  dead end one layer down — verify with the logger before spending effort on the
  syntax-level fix.
- **Everything else surveyed either has no `renderX()`/ref involvement to begin
  with** (`flat-list`, `section-list`, `virtualized-section-list`, `refresh-
  control`, `safe-area-view`, `touchable-native-feedback`, `button.ts` — plain
  top-level composition, nothing for Finding 1 to fix) **or was already top-level
  with no ref in its render call** (`image`, `image-background`, `input-
  accessory-view`, `modal` — confirmed `modal` compiles clean via the logger;
  the other three weren't reachable from the canary's bundle graph to confirm
  directly, but match the same shape).

## Reference

- Canonical component (mirror this): `core/components/src/state/switch.ts`,
  `core/components/src/view/render-switch.ts`,
  `adapters/react/src/components/switch/*`, `adapters/vue/src/components/switch/*`.
- Descriptor model + `el()`/`txt()`: `core/components/src/descriptor.ts`.
- Bridges: `adapters/react/src/descriptor-to-react/`, `adapters/vue/src/descriptor-to-vue.ts`.
- Other fully-split references: ActivityIndicator (render-only), TextInput, Modal.
  No view layer BY DESIGN (cells are user children — the pass-through stream of §0,
  category 2/3, not a gap): the VirtualizedList family.
- Layout / prop-split rules: `symbiote-file-layout`. Vue lifecycle landmines:
  `vue-adapter-reactivity`. Vue scoped slots + slot typing: `vue-adapter-slots`. Finishing gate:
  `symbiote-parity-check`.
- React Compiler compatibility (React adapter only): §7. Trigger on "react-compiler",
  "babel-plugin-react-compiler", "can we compile/memoize adapters/react", "million.js"/
  "block virtual dom" (ruled out — DOM-bound, vendored at `.vendors/million` for reference only).
- Invariants: `<components_split_logic_view_lifecycle>`, `<adapters_reach_full_feature_parity>`.
</content>
