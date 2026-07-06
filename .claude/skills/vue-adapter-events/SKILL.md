---
name: vue-adapter-events
description: "Symbiote Vue adapter event typing + attrs routing — read BEFORE adding or changing Vue component events in adapters/vue/** or packages/*/src/vue/**. Use when converting React-style onX callback props to Vue emits, fixing Volar payload inference for SFC/TSX, deciding whether an event should be emits or raw passthrough, wiring a host callback after Vue removed a listener from $attrs, or adding v-model / update:modelValue support to a controlled-value component (TextInput, Switch, Slider…). Core rule: typed emits are for wrapper-synthesized/normalized events; raw Fabric/native passthrough listeners must remain attrs unless the wrapper manually re-supplies the host onX callback."
---

# Symbiote Vue adapter — event typing, emits, and attrs routing

Vue and Fabric disagree about where event listeners live:

- Vue-facing component APIs want typed events: `@press`, `@value-change`,
  `@content-size-change`, `@refresh`.
- The Symbiote engine/Fabric route sees host events as props: `onPress`,
  `onScroll`, `onLayout`, `onRefresh`, etc.

Declaring an event in Vue `emits` makes Vue remove that listener from `$attrs`.
That is good for Volar typing, but unsafe for raw Fabric passthrough: if the
component does not manually put a host `onX` callback back onto the host node, the
engine never sees the event prop.

## When to use this skill

Use before changing any Vue adapter component event surface, especially when:

- Volar/SFC shows event payloads as `any`.
- A public prop type contains React-style `onX` callbacks.
- You are adding `defineComponent<Props, Emits>`.
- You are deciding whether `scroll`, `layout`, `focus`, `blur`, `press`,
  `refresh`, list callbacks, or native direct events should be Vue `emits`.
- You are touching `adapters/vue/**` or `packages/*/src/vue/**` component files.

## Rule 1 — classify the event first

| Event kind | Vue API | Implementation | Examples |
|---|---|---|---|
| Wrapper-synthesized / normalized | `emits` | Wrapper calls `emit(...)` from internal/host callback | `valueChange(boolean)`, `changeText(string)`, `contentSizeChange(width,height)` |
| Wrapper-composed native event | `emits` allowed | Wrapper must manually supply host `onX` callback | `RefreshControl refresh()`, `TextInput focus/blur/change` when wrapper intercepts |
| Raw Fabric/native passthrough | **not** `emits` | Leave listener in attrs so engine sees `onX` | `scroll`, `layout`, drag/momentum, responder events |
| Generic item callbacks | Case-by-case | Preserve `ItemT` inference before converting | `FlatList` / `VirtualizedList` viewability callbacks |

Default to **attrs passthrough** for raw native events unless the wrapper already
needs to intercept the event for its own state.

## Rule 2 — if you declare `emits`, bridge back to the host

Never just add `emits` and assume passthrough still works. Vue has removed the
listener from `$attrs`.

```ts
export type IRefreshControlEmits = {
  refresh: () => boolean;
};

export const RefreshControl = defineComponent<IRefreshControlProps, IRefreshControlEmits>(
  (_props, { attrs: rawAttrs, emit }) => {
    return () => {
      const nativeProps = foldAttrs(normalizeVueAttrs(rawAttrs));
      return h('symbiote-refresh-control', {
        ...nativeProps,
        onRefresh: () => emit('refresh'),
      });
    };
  },
  {
    name: 'RefreshControl',
    inheritAttrs: false,
    emits: { refresh: () => true },
  },
);
```

The public app writes:

```vue
<RefreshControl :refreshing="loading" @refresh="reload" />
```

The host still receives:

```ts
{ onRefresh: () => emit('refresh') }
```

## Rule 3 — remove React-style callbacks from public Vue props

When an event becomes a Vue emit, remove the corresponding `onX` callback from
the Vue public prop type.

```ts
import type { IButtonProps as ICoreButtonProps } from '@symbiote-native/components';

export type IButtonProps = Omit<ICoreButtonProps, 'onPress'>;

export type IButtonEmits = {
  press: (event: ISymbioteEvent) => boolean;
};
```

Do not re-export a shared/core prop type unchanged if it still exposes callback
props that Vue now handles as emits.

## Rule 4 — prefer function-style `defineComponent<Props, Emits>`

This shape gives Volar/SFC useful prop and event payload inference while keeping
the runtime component attrs-driven internally:

```ts
export const Switch = defineComponent<ISwitchProps, ISwitchEmits>(
  (_props, { attrs: rawAttrs, emit }) => {
    return () => h('symbiote-switch', {
      ...forwarded,
      onChange: event => emit('change', event),
      onValueChange: value => emit('valueChange', value),
    });
  },
  {
    name: 'Switch',
    inheritAttrs: false,
    emits: {
      change: (_event: ISymbioteEvent) => true,
      valueChange: (_value: boolean) => true,
    },
  },
);
```

Keep `inheritAttrs: false`; normalize attrs with `normalizeVueAttrs(rawAttrs)` when
Vue templates may pass kebab-case props.

## Rule 5 — do not convert raw passthrough events blindly

These usually stay out of `emits`:

```text
scroll, layout, scrollBeginDrag, scrollEndDrag,
momentumScrollBegin, momentumScrollEnd, scrollToTop,
responder events, focus/blur direct events, accessibility direct events
```

Exception: if the wrapper already intercepts the event for component state, it may
be wrapper-composed as a typed emit **only if** the host `onX` callback is manually
re-supplied.

## Rule 6 — support `v-model` alongside the named emit

Vue's bare `v-model="x"` compiles to prop `modelValue` + emit `update:modelValue`;
named `v-model:value="x"` compiles to prop `value` + emit `update:value`. These are
independent compiler targets, not alternatives to pick between — a controlled-value
component (one whose public prop already carries a "current value") should support
both, not one at the expense of the other.

Use the shared helper `adapters/vue/src/utils/model-binding.ts`:

```ts
export function resolveModelValue<T>(
  attrs: Record<string, unknown>,
  isValid: (v: unknown) => v is T,
): T | undefined {
  if (isValid(attrs.modelValue)) return attrs.modelValue;
  if (isValid(attrs.value)) return attrs.value;
  return undefined;
}

export function emitModelUpdate<T>(emit: (event: string, value: T) => void, value: T): void {
  emit('update:modelValue', value);
  emit('update:value', value);
}
```

- Add `modelValue?: T` to the component's Vue-only public prop type; the RN-parity
  `value` prop is untouched.
- Declare `'update:modelValue'` and `'update:value'` in `emits`, alongside the
  existing named emit (`valueChange`, `changeText`, …). `emitModelUpdate` fires
  ADDITIONALLY next to that emit, never as a replacement for it.
- **Read every site that consumes the controlled value, not just the render
  function.** `Switch`'s snap-back watch and `TextInput`'s controlled-write watch
  each read `attrs.value` a second time, independent of the render path, to drive
  an imperative native command. Miss one of these and a `v-model`-bound instance
  renders correctly while the imperative correction silently compares against a
  stale/undefined value. Every such read must go through
  `resolveModelValue(attrs, guard)`, not just the one inside the render function.
- Native-element `v-model` directives (`vModelText`/`vModelCheckbox`/`vModelSelect`)
  do not apply here and are out of scope for this rule — there is no bare native
  `<input>`/`<select>` host tag in this renderer, only component wrappers, so every
  `v-model` target goes through this component-level prop+emit path. If a directive
  ever needs shimming instead (e.g. `v-show`), that is a different problem — see
  `vue-adapter-directives`.

## Current coverage

Typed emits already covered:

- `Button`: `press(event)`
- `Pressable`: `press`, `pressIn`, `pressOut`, `pressMove`, `longPress`, `hoverIn`, `hoverOut`
- `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback`, `TouchableNativeFeedback`: same press surface
- `Switch`: `change(event)`, `valueChange(boolean)`
- `TextInput`: `changeText(string)`, `change(event)`, `focus(event)`, `blur(event)`
- `Slider`: `valueChange(number)`, `slidingStart(number)`, `slidingComplete(number)`, `accessibilityAction(event)`
- `ScrollView`: `contentSizeChange(width, height)`
- `RefreshControl`: `refresh()`
- `Modal`: `show()`, `dismiss()`, `requestClose()`, `orientationChange(event)`

`v-model` (Rule 6) target components — `value` + one named emit, the shape
`resolveModelValue`/`emitModelUpdate` is built for:

- `TextInput`, `Switch`, `Slider`: the read-every-site gotcha above (render fn +
  a second imperative-command watch) applies to all three.

Known remaining decisions / work:

- Generic lists: `VirtualizedList`, `FlatList`, `SectionList`, `VirtualizedSectionList` synthesized callbacks. Preserve `ItemT` inference before converting.
- `KeyboardAvoidingView onLayout`: raw layout event that is wrapper-composed for measurement; convert only if the public API decision is to expose `@layout` from this wrapper.

## Verification checklist

After changing component events:

1. Search the file for public `onX?:` props. Any converted emit should be removed
   from the public Vue prop type.
2. Confirm `emits` validators match payloads.
3. Confirm any declared emit has a host/internal callback bridge where needed.
4. Confirm raw passthrough listeners still stay in attrs.
5. If the component carries a controlled value, confirm EVERY read site
   (render fn, snap-back/controlled-write watches) uses `resolveModelValue`, not
   a mix of `resolveModelValue` in one place and a raw `attrs.value` read in another.
6. Run LSP diagnostics on edited files.
7. Run the relevant TypeScript build, e.g.:

```bash
pnpm exec tsc --build adapters/vue/tsconfig.json --force --pretty false
pnpm exec tsc --build packages/slider/tsconfig.json --force --pretty false
```

## Common failure modes

| Failure | Cause | Fix |
|---|---|---|
| Native event stops firing | Added `emits` but did not bridge host `onX` | Add explicit host callback that calls `emit` |
| Volar payload is `any` | Component value has no typed emits | Use `defineComponent<Props, Emits>` |
| Public API still shows `onPress` | Re-exported core/React-style props | Export Vue-facing `Omit<..., 'onPress'>` type |
| Raw scroll/layout listener disappears | Declared raw event in `emits` | Remove from emits or wrapper-compose intentionally |
| Generic list item type becomes `unknown` | Naive `defineComponent` conversion erased `ItemT` | Design a generic component typing pattern first |
| A slot scope (`item`, `pressed`) is `any` | Slots not declared — a SLOTS concern, not events | See `vue-adapter-slots` (thread `IXSlots` through `ICtx<E, S>`) |
| `v-model`-bound value renders right but an imperative correction (snap-back, controlled-write) misfires | A second read site (a `watch`) still reads raw `attrs.value` instead of `resolveModelValue` | Audit every read site per Rule 6, not just the render function |

## Scope boundary — events vs slots vs directives

This skill owns the **event** half of the Vue public surface (`emits` / `$attrs` routing,
including `v-model` — Rule 6). The **children / cell / scoped-rendering** half — `#item` /
`#default="{ pressed }"` / the renderItem→slot conversion / typing a slot scope / the
`Non-function value encountered for default slot` warning — lives in **`vue-adapter-slots`**.
The **compiler-injected runtime directive** half — `v-show`, custom directives, or anything
that needs a runtime helper import intercepted at the Metro-transformer level because the
stock helper assumes a real DOM element — lives in **`vue-adapter-directives`**. Reach for
the right skill by what the work is actually about: RENDERS → slots, EMITS → this skill,
DOM-ASSUMING RUNTIME HELPER → directives.
