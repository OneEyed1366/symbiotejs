---
name: vue-adapter-slots
description: "Symbiote Vue adapter scoped slots + slot typing — read BEFORE adding or changing how any Vue component (adapters/vue/**) renders children / cells / headers / separators, or when a slot scope types as `any` (e.g. Pressable `pressed`, a list `item`). Core rule: parametrized rendering on Vue is a SCOPED SLOT, never a React-style renderItem / ItemSeparatorComponent / render-prop — those are removed from the Vue public contract (no duality; ADR 0028). Use when converting a renderItem-prop component to slots, typing a slot scope so SFC `template #item=...` and JSX infer it (thread the slots type through ICtx Emits+Slots), wiring a slot to the shared render layer via slots-to-render-props, killing the `Non-function value encountered for default slot` warn, or wiring vue-tsc typecheck for an SFC example. Slot return type is VNode[] or VNode. Triggers: Vue slot typing, pressed is any, item is any in template, scoped slot, renderItem to slot, SlotsType, vue-tsc example typecheck."
---

# Symbiote Vue adapter — scoped slots & slot typing

On React, a component renders its cells/headers through **props that return elements**:
`renderItem`, `renderSectionHeader`, `ItemSeparatorComponent`, `ListHeaderComponent`, … On Vue,
the framework-agnostic seam for the same job is the **scoped slot**. Forcing React's render-prop
shape onto Vue is the cross-adapter symmetry `<adapter_src_follows_framework_idioms>` forbids — and
it tripped a real Vue warning (see Rule 5). So:

> **Parametrized rendering on Vue = scoped slot. The React render-prop family is REMOVED from the
> Vue public contract — no duality (it kills DX). Decision: `.docs/decisions/0028`.**

This is NOT a parity regression: the FEATURE (custom item/header/separator/empty rendering) is fully
present, through the surface Vue authors expect. The shared `@symbiote-native/components` windowing/render
layer is untouched; only the adapter's public surface changes.

## When to use this skill

- A slot scope types as `any` — `pressed` on Pressable, `item` on a list `template #item`.
- Converting a `renderItem` / `render*` / `*Component` prop component to slots.
- Adding a new Vue component that renders children with scope (press state, item, section…).
- You see `[Vue warn]: Non-function value encountered for default slot`.
- Wiring a slot to the shared render/windowing layer.
- Setting up `vue-tsc` typecheck for an SFC example.

## Rule 1 — slot vocabulary (slot ↔ React prop)

Same feature, idiomatic surface per framework. The lists map:

```
#item             ↔ renderItem
#separator        ↔ ItemSeparatorComponent
#header           ↔ ListHeaderComponent
#footer           ↔ ListFooterComponent
#empty            ↔ ListEmptyComponent
#sectionHeader    ↔ renderSectionHeader
#sectionFooter    ↔ renderSectionFooter
#sectionSeparator ↔ SectionSeparatorComponent
```

Pressable's children are a **scoped `#default`** carrying `{ pressed }` (the press state) — the Vue
twin of React's children-as-function. Touchables / Modal / SafeAreaView / Drawer pass children with
**no scope**, so their `#default` (and Drawer's named `#navigationView`) needs no slots type.

## Rule 2 — type the slot scope by threading slots through `ICtx<Emits, Slots>`

A slot scope is `any` until the component declares its slots. Thread the slots type through the
`ICtx` helper (`adapters/vue/src/utils/component-helpers.ts`):

```ts
// ICtx<E, S> = SetupContext<E | {}, SlotsType<S>>  (the pd-web-kit Ctx pattern)

export type IFlatListSlots<ItemT> = {
  item: (info: { item: ItemT; index: number; separators: ISeparators }) => VNode[] | VNode;
  separator?: (props: ISeparatorProps<ItemT>) => VNode[] | VNode;
  header?: () => VNode[] | VNode;
  footer?: () => VNode[] | VNode;
  empty?: () => VNode[] | VNode;
};

export const FlatList = defineComponent(
  <ItemT,>(
    props: IFlatListProps<ItemT>,
    { slots, emit }: ICtx<IFlatListEmits<ItemT>, IFlatListSlots<ItemT>>,
  ) => { /* … */ },
  { name: 'FlatList', inheritAttrs: false, props: PROP_KEYS, emits: EMIT_KEYS } as unknown as undefined,
);
```

**VERIFIED (vue-tsc):** this surfaces the typed scope to SFC `template #item="{ item }"` (ItemT
inferred from `data`) AND survives the `{ … } as unknown as undefined` runtime-options cast — the
cast does NOT strip slot typing. (Proof technique in Rule 6.)

- **Slot return type is `VNode[] | VNode`** — a Vue scoped slot may return one root or many.
- **Non-generic component** (Pressable): same `ICtx` form, just no `<ItemT,>` and no cast:
  ```ts
  export type IPressableSlots = { default?: (state: IPressState) => VNode[] | VNode };
  export const Pressable = defineComponent(
    (_props: IPressableProps, { slots, emit }: ICtx<IPressableEmits, IPressableSlots>) => { /* … */ },
    { name: 'Pressable', inheritAttrs: false, emits: PRESSABLE_EMITS },
  );
  ```
- **Export every `IXSlots` from the package barrel** (`src/index.ts`) so JSX/TSX consumers can write
  `satisfies IXSlots<ItemT>` (Rule 4).

## Rule 3 — the slot to render-fn bridge lives in one place

The shared windowing layer (`@symbiote-native/components`) still drives an internal `renderItem` /
separator-component contract. The slot→render translation lives once in
`adapters/vue/src/utils/slots-to-render-props.ts` — keeping `<adapters_stay_thin>` intact:

- `#item` and the **scopeless** chrome slots (`#header`/`#footer`/`#empty`) need **no wrapper** — a
  slot fn is already a valid render fn / functional component (assign `slots.item` directly; the cell
  wrapper accepts `VNode[] | VNode`).
- `#separator` / `#sectionSeparator` go through `componentFromSlot(slot)` because the list invokes
  them as `h(component, props)`.
- **Lists forward slots to each other** (FlatList builds/forwards its `#item` down to VirtualizedList
  as a slot; SectionList → VirtualizedSectionList → VirtualizedList) so even the internal contract
  has a single source — no hidden `renderItem` prop anywhere.

## Rule 4 — authoring forms

```vue
<!-- SFC: scoped slot in template (compiler emits a function slot; item is typed) -->
<FlatList :data="rows">
  <template #item="{ item }">
    <View :style="styles.row"><Text>{{ item.label }}</Text></View>
  </template>
</FlatList>
```

```tsx
// JSX/TSX: children-slot-object form; `satisfies` types the object and keeps item inferred
<FlatList data={rows}>
  {{ item: ({ item }) => <View style={styles.row}><Text>{item.label}</Text></View> }
    satisfies IFlatListSlots<IRow>}
</FlatList>
```

`h()` is the low-level API — app code should not hand-build render functions for cells.

## Rule 5 — never pass a non-function as h()'s 3rd arg to a COMPONENT

```
h(SomeComponent, props, 'string' | [vnodes] | vnodeVar)  → [Vue warn]: Non-function value
                                                            encountered for default slot
h(SomeComponent, props, () => children)                  → ok  (function slot)
h(SomeComponent, props, { default: () => children })     → ok  (object slot)
h('symbiote-view', props, [vnodes])                      → ok  (HOST STRING — exempt)
```

A non-function third arg to a *component* vnode (`h(Text, {}, title)`, `h(View, {}, [child])`)
warns: Vue can't optimize the slot and re-normalizes it every render. Host elements (lowercase
`symbiote-*` strings) are exempt. The warn is dev-only but never benign in this codebase — in JSX its
trace formats native HostObjects and can throw, unwinding the mount. Always pass a function/object
slot for component children.

## Rule 6 — verify slot typing with vue-tsc (don't trust "should work")

SFC templates are not type-checked by `tsc --build` (it can't parse `.vue`). To verify a slot scope
is typed, run `vue-tsc` against a **probe**: access a bogus property on the slot scope — a typed
scope errors, an `any` scope stays silent.

```vue
<!-- probe.vue — delete after -->
<FlatList :data="[{ id: 'a', n: 1 }]">
  <template #item="{ item }">{{ item.NOPE }}</template>   <!-- errors iff typed -->
</FlatList>
<Pressable><template #default="{ pressed }">{{ pressed.NOPE }}</template></Pressable>
```

`vue-tsc … | grep probe`: a `Property 'NOPE' does not exist on '{ id; n }'` / `on 'boolean'` line
means the scope is typed; no line means `any`.

### Wiring an SFC example typecheck

`vue-tsc` (devDep) + a `tsconfig.typecheck.json`:

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node"] },   // @symbiote-native/* resolve to SOURCE, so this re-checks
  "exclude": ["**/node_modules", "**/Pods", "e2e"]  // adapter/engine source, which needs the
}                                                    // runtime globals the app strips via types:[]
```

Script: `"typecheck": "vue-tsc --noEmit -p tsconfig.typecheck.json"`. Needs `@types/node` (the
re-checked workspace source uses `setTimeout`/`process`/`console`/`queueMicrotask`). Exclude `e2e`
(Detox + jest globals, checked via ts-jest).

**vue-tsx (JSX) full typecheck is NOT currently feasible:** `IViewProps`/`ITextProps` omit `children`
by design (children go through slots — see the prop-type split), so Vue-JSX `View children /View`
fails. That is a separate effort, not a quick win.

## Anti-patterns

| Avoid | Why | Instead |
|---|---|---|
| Keeping a `renderItem` prop on a Vue list | Duality kills DX (ADR 0028) | Slots only; bridge to the inner `renderItem` internally |
| `slots: Object as SlotsType<…>` option for a generic component | Can't be generic over ItemT | `ICtx<E, S>` (function-generic form) |
| Slot type returning only `VNode[]` | `satisfies` rejects a single-element slot fn | `VNode[] | VNode` |
| `h(Text, {}, title)` for a cell | Non-function default slot warn | `() => title` or a `template`/slot |
| Adding `children` to `IViewProps` to make JSX typecheck | Breaks the prop-type split | Author cells via slots; JSX typecheck stays out of scope |
| "Slots should be typed" without running vue-tsc | SFC isn't tsc-checked; `any` hides | Probe with vue-tsc (Rule 6) |

## Verification checklist

1. Each scoped slot has an `IXSlots` type threaded via `ICtx<E, S>`; return type `VNode[] | VNode`.
2. `IXSlots` exported from the package barrel.
3. The React render-prop family is absent from the Vue public prop type (re-exported handle types
   are fine).
4. Slot→render bridge goes through `slots-to-render-props` (no per-component re-implementation).
5. `pnpm exec tsc --build adapters/vue/tsconfig.json --force` → exit 0.
6. vue-tsc probe confirms the slot scope is the concrete type, not `any` (Rule 6).
7. No `[Vue warn]: Non-function value encountered for default slot` in the canary log.

## Related

- `vue-adapter-events` — emits / `$attrs` routing (the OTHER half of the Vue public surface). Events
  are emits; children/cells are slots. The Rule 5 warning is about how children reach a component.
- `symbiote-add-component` — the 3-layer split; a new component's Vue lifecycle wires slots here.
- `.docs/decisions/0028-vue-lists-scoped-slots-not-renderitem.md` — the load-bearing decision.
- prop-type split (`<prop_types_split_agnostic_vs_per_adapter>`): a slot type carries framework
  elements, so it is per-adapter (declared in the adapter), never moved verbatim to the shared layer.
