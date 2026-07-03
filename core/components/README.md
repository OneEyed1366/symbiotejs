# @symbiotejs/components

The **framework-agnostic component layer** of [SymbioteJS](../../README.md) — pure state machines
and pure render functions for every visual component (`Switch`, `Modal`, `ScrollView`, the
`FlatList`/`SectionList` family, …), written **once** and inherited by every framework adapter
(`@symbiotejs/react`, `@symbiotejs/vue`, `@symbiotejs/angular`, and the ones after them). It
exists so that "add component X to a new adapter" means writing a thin lifecycle + descriptor
bridge, not re-implementing X's logic per framework.

> New to SymbioteJS? The [root README](../../README.md) has the architecture. This package is
> "Workstream B" — the piece that makes cross-adapter feature parity **structural** instead of a
> promise kept by hand.

---

## The split this package embodies

A component's logic splits into three layers; this package owns the first two, an adapter
supplies only the third:

1. **Logic — `src/state/*.ts`.** A pure reducer `(state, action) => state`, a
   `createInitial*State` factory, and pure predicates. Zero framework, zero render —
   `switchReducer` / `shouldSnapBack` / `valueFromChange` for `Switch`, `modalReducer` for `Modal`,
   the `virtualized-list` windowing math for the list family.
2. **View — `src/view/render-*.ts`.** A pure function `render*(viewState, platform) => Descriptor`.
   State and visuals enter **only through arguments**; out comes a tree of `Descriptor` nodes
   (`{ type, props, children, key }`, built with `el()` / `txt()`) over the intrinsic primitives
   (`symbiote-view`, `symbiote-switch`, …). No framework, no state, no events.
3. **Lifecycle — the adapter.** React wires the reducer through `useReducer`/`useLayoutEffect` and
   bridges the `Descriptor` to `React.createElement`; Vue wires it through `ref`/`watch` and
   bridges to `h()`. This is the ONLY part a new adapter has to write.

`Switch` is the canonical reference for a full three-layer component; `ActivityIndicator` is the
canonical render-only reference (no state machine needed).

---

## Usage

Nearly every consumer reaches this package **through an adapter**, not directly — an app imports
`Switch` from `@symbiotejs/react` (or `@symbiotejs/vue`), and that adapter re-exports the prop
types and wires the reducer/render pair from here. Calling the render function directly is what an
adapter itself does, to build its lifecycle wrapper:

```ts
import { renderSwitch, createInitialSwitchState, switchReducer } from '@symbiotejs/components';

// inside an adapter's own hook/composable:
const state = createInitialSwitchState();
const next = switchReducer(state, { type: 'native-reported', value: true });
const descriptor = renderSwitch(
  { value: true, disabled: false, passthrough: { onChange, ref } },
  { trackColorProps: (value, trackColor) => ({ /* platform-specific prop names */ }) },
);
// descriptor is then handed to the adapter's own descriptorToReact / descriptorToVue bridge
```

The `passthrough` bag on each view-props type is the seam that keeps `render*` framework-agnostic:
an adapter folds its `ref`, event handlers, and accessibility props into it, and they land on the
host node untouched — the render function never names a framework type.

---

## What's in here

- **The `Descriptor` model** — `el()` / `txt()`, the `IDescriptor` tree every `render*` function
  builds, and `descriptorFor` / `COMPONENT_DESCRIPTORS` (the `symbiote-*` intrinsic → Fabric
  view-name resolution table, platform-split so the name tables can never drift between adapters).
- **Accessibility folding** — `resolveAccessibilityProps`, the web-alias (`aria-*`/`role`) →
  canonical `accessibility*` transform, shared so every adapter folds identically.
- **Components with a full state + render split** — `Switch`, `Modal` (its reducer gates the iOS
  keep-alive frame).
- **Render-only components** (no state machine) — `ActivityIndicator`, `Image`,
  `ImageBackground`, `InputAccessoryView`.
- **Pure logic/plumbing without a `Descriptor`** — `Pressable`'s press state machine
  (`createPressHandlers` / `createPressRuntime`), the `Touchable*` timing constants,
  `Button`'s shared text-style fold, `TextInput`'s controlled-value/event-count handshake
  (`resolveTextInputProps`, `foldText`, `eventCountFromChange`, …), `KeyboardAvoidingView`'s inset
  math, `ScrollView`'s intrinsics/sticky-header math (no full 3-layer split — the adapter owns the
  element assembly).
- **The `VirtualizedList` family's windowing engine** — `computeWindow`, `buildListPlan`,
  viewability tracking (`computeViewableSet`, `diffViewable`), and the `FlatList`/`SectionList`
  row/section folding helpers. Lists have no `view/render-*.ts` (a cell's content is the
  framework's own children) — the shared layer here is pure state/logic, reused verbatim by every
  adapter.

## What it does NOT do

- It does not touch the DOM, Fabric, or any framework's reactivity system — it depends only on
  `@symbiotejs/engine`'s agnostic types (`IStyleProp`, `ISymbioteEvent`, accessibility types).
- It does not own `children`, refs, or render-callback props — a prop type with a framework
  element in it (`IViewProps`, `IPressableProps`, `renderItem`) is declared **per adapter**, over
  an agnostic base this package may still supply.
- It is not itself renderable — a `Descriptor` tree only becomes native views once an adapter's
  `descriptorTo<Framework>` bridge turns it into a host element and the reconciler commits it
  through `@symbiotejs/engine`.

## Related packages

- [`@symbiotejs/engine`](../engine) — the retained-tree/clone-on-write engine this package's
  render output ultimately commits through.
- [`@symbiotejs/react`](../../adapters/react) / [`@symbiotejs/vue`](../../adapters/vue) /
  [`@symbiotejs/angular`](../../adapters/angular) — the adapters that supply the lifecycle layer
  over these state machines and render functions.

## Test it

```bash
pnpm test              # vitest, from the workspace root — reducers + render-fn snapshots, headless
```
