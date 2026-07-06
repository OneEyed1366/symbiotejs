---
name: symbiote-add-component
description: "Symbiote add-component workflow — 'add component X to adapter Y' at FULL P0 feature-parity via the three-layer split. Read BEFORE adding or porting ANY visual component (Switch, Modal, TextInput, ScrollView, the lists, a new primitive). The split, mirroring wolf-tui: (1) LOGIC — core/components/src/state/X.ts: a pure reducer (state, action) => state + createInitialXState factory + pure predicates, ZERO framework/render (Switch: switchReducer, shouldSnapBack, valueFromChange). (2) VIEW — core/components/src/view/render-X.ts: a pure renderX(view, platform) => Descriptor built with el()/txt(), PLUS the agnostic public IXProps (extends IAccessibilityProps, IAriaProps), the IXViewProps with its `passthrough` bag (ref + handlers + a11y ride here untouched), and IXPlatform (per-host prop-name mapping). (3) LIFECYCLE — the adapter: React useReducer/useRef/useLayoutEffect + dispatchViewCommand + descriptorToReact; Vue shallowRef(identity!)/ref/watch(flush:'post') + runtime guards (no `as`) + descriptorToVue. Switch is the canonical reference (state/switch.ts + view/render-switch.ts + adapters/{react,vue}/src/components/switch/{index,index.ios,index.android,shared}.ts). The P0 rule: parity is STRUCTURAL — extract the shared half into @symbiote-native/components so every adapter inherits the full surface; NEVER copy the prop surface into each adapter, NEVER ship a 'minimal'/'partial'/'stub' port. Covers per-component ADR 0026 folder, symbiote-X host-name registration, the prop-type split, and finishing with a parity-check. Trigger on adding/porting a component to any adapter."
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

React (`adapters/react/src/components/switch/shared.ts`) — `createSwitch(platform)
=> FC<ISwitchProps>`:

```ts
const ref = useRef<ISymbioteNode | null>(null);                       // host node
const [state, dispatch] = useReducer(switchReducer, undefined, createInitialSwitchState);
useLayoutEffect(() => {                                               // snap-back
  if (shouldSnapBack(state, fabricValue)) dispatchViewCommand(ref.current, platform.snapBackCommand, [fabricValue]);
}, [fabricValue, state]);
return descriptorToReact(renderSwitch({ …, passthrough: { ...rest, ref, onChange } }, platform));
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

adapters/react/src/components/switch/      (Vue identical, under adapters/vue/…)
  shared.ts        createSwitch(platform) — the hook half
  index.ts         re-exports ./index.ios (base, for tsx/headless)
  index.ios.ts     createSwitch({ snapBackCommand: 'setValue',       trackColorProps: iOS names })
  index.android.ts createSwitch({ snapBackCommand: 'setNativeValue',  trackColorProps: Android names })
  switch.test.tsx  co-located (ADR 0025)
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

Adding a component to a brand-new adapter that has no renderer yet? Do
`symbiote-new-adapter` first. Touching the engine API in the process?
`symbiote-engine-core`.

## Reference

- Canonical component (mirror this): `core/components/src/state/switch.ts`,
  `core/components/src/view/render-switch.ts`,
  `adapters/react/src/components/switch/*`, `adapters/vue/src/components/switch/*`.
- Descriptor model + `el()`/`txt()`: `core/components/src/descriptor.ts`.
- Bridges: `adapters/react/src/descriptor-to-react/`, `adapters/vue/src/descriptor-to-vue.ts`.
- Other fully-split references: ActivityIndicator (render-only), TextInput, Modal.
  Partial (no view layer — cells are framework children): the VirtualizedList family.
- Layout / prop-split rules: `symbiote-file-layout`. Vue lifecycle landmines:
  `vue-adapter-reactivity`. Vue scoped slots + slot typing: `vue-adapter-slots`. Finishing gate:
  `symbiote-parity-check`.
- Invariants: `<components_split_logic_view_lifecycle>`, `<adapters_reach_full_feature_parity>`.
</content>
