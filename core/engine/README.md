# @symbiotejs/engine

The **retained shadow-tree engine** at the bottom of [SymbioteJS](../../README.md) — the one
package every framework adapter (`@symbiotejs/react`, `@symbiotejs/vue`, `@symbiotejs/angular`, …)
drives, and the only place the mutation→clone-on-write translation into React Native's Fabric
exists. It holds a retained, mutable tree of nodes that an adapter mutates cheaply
(`appendChild` / `setProp` / `removeChild` …), then on commit diffs that tree against Fabric's
current one, clones only what changed, and calls `completeRoot` — the persistent, clone-on-write
dance Fabric requires, done **once**, for every framework.

> New to SymbioteJS? The [root README](../../README.md) has the architecture and the one fact it
> rests on — React is just *one client* of `nativeFabricUIManager`. This package is what sits
> between every adapter and that native slot.

---

## Who calls this, directly vs. indirectly

**Most consumers never import this package by name.** An app written against
`@symbiotejs/react`/`@symbiotejs/vue`/`@symbiotejs/angular` never calls `createElement` or
`setProp` itself — the adapter's reconciler does that on the app's behalf. You reach for
`@symbiotejs/engine` directly only when:

- you are **writing or debugging a framework adapter** (a `react-reconciler` host config, a Vue
  `createRenderer`, an Angular `Renderer2`) — this is its primary audience;
- you need one of the **framework-agnostic runtime modules** it re-exports (`Platform`,
  `StyleSheet`, `Dimensions`, `Alert`, `Animated`, …) — every adapter re-exports these verbatim, so
  most apps still reach them through `@symbiotejs/react` etc., not this package.

The mutation API below is intentionally low-level and closely mirrors Fabric's own persistent
semantics — it is an internal seam, not an app-facing API.

---

## The mutation API — `core/engine/src/node.ts`

The entire surface a renderer seam drives:

```ts
import {
  createElement, createRawText, createAnchor,
  appendChild, insertBefore, removeChild,
  routeProp, setEventListener, setProp, setText,
} from '@symbiotejs/engine';

const node = createElement('RCTView');          // component IS the Fabric view name
const text = createRawText('Hello');
appendChild(node, text);
routeProp(node, 'onPress', () => {});            // ← the flat-bag entry point (React/Vue/Solid):
                                                  //   decides event-vs-prop via the ViewConfig,
                                                  //   NOT by the "onX" naming convention
```

`routeProp` is the one call a flat-bag adapter should route every prop through — a **structural**
adapter (Angular's `Renderer2.listen`, Svelte's `addEventListener`) already knows the event name
and calls `setEventListener` directly instead.

### Committing — `SymbioteSurface`

```ts
import { createSurface } from '@symbiotejs/engine';

const surface = createSurface(rootTag);
surface.appendChild(root, node);
surface.commit();          // synchronous — for a framework that already batches (React)
// surface.requestCommit(); // microtask-coalesced — for reactive frameworks (Vue/Svelte/Angular)
```

Every imperative call in the bridge below (`dispatchViewCommand`, `measure`, `setNativeProps`, …)
is gated on the node having actually committed — see `whenCommitted` for wiring a native call
before a tag is guaranteed to exist.

---

## What else it exports

- **The imperative/native bridge** — `dispatchViewCommand`, `measure` / `measureInWindow` /
  `measureLayout`, `getNativeTag`, `getNativeNode`, `setNativeProps`, `sendAccessibilityEvent`,
  `whenCommitted`, `toPublicInstance` (the `ref` handle every adapter grafts onto a host node).
- **Runtime modules**, framework-agnostic, re-exported by every adapter: `Platform`,
  `StyleSheet` (+ `computeHairlineWidth`), `Dimensions`, `PixelRatio`, `Appearance`, `AppState`,
  `Keyboard`, `AccessibilityInfo`, `BackHandler`, `PermissionsAndroid`, `LayoutAnimation`,
  `InteractionManager`, `PanResponder`, and the imperative modules `Alert`, `Share`,
  `ActionSheetIOS`, `Linking`, `Vibration`, `ToastAndroid`, `Settings`, `I18nManager`.
- **`Animated`** — both the JS and native driver (`timing` / `spring` / `decay` / `loop` /
  `ValueXY` / tracking / `diffClamp` / `Easing`), including the native-event attachment path
  (`attachNativeEvent`, `AnimatedEvent`).
- **The style pipeline** — `flattenStyle`, the CSS-style processors RN itself runs in JS
  (`processBoxShadow`, `processFilter`, `processTransform`, `processTransformOrigin`,
  `processAspectRatio`, `processFontVariant`, `processBackgroundImage`), and the runtime
  **class-name registry** (`registerStyles` / `resolveClassName` / `scopeClassName`) that
  `@symbiotejs/css-parser`'s build-time output resolves against — shared by every adapter's
  `class` / `className` / `addClass` prop path.
- **`AppRegistry` core** (`createAppRegistry`) — registry bookkeeping + headless-task plumbing;
  each adapter supplies only its own `runnableFor`.
- **`dlog` / `isDebug`** — the diagnostic-logging seam every adapter and this package route
  through, gated by the `DEBUG` env var, never a bare `console.log`.

## What it does NOT do

- It does not know about React, Vue, Angular, JSX, templates, or reactivity — an adapter maps its
  own framework idioms onto this API, never the other way around.
- It does not touch Fabric C++, JSI, or Yoga directly — it calls `nativeFabricUIManager`
  (`createNode` / `cloneNodeWithNewProps` / `appendChildToSet` / `completeRoot`), the same
  framework-agnostic seam React's own renderer uses.
- It is not a component library — visual components (Switch, Modal, the lists, …) live in
  [`@symbiotejs/components`](../components), built on top of this package's `Descriptor`-free
  mutation API.

## Related packages

- [`@symbiotejs/components`](../components) — the framework-agnostic component layer (state +
  render), built on this engine.
- [`@symbiotejs/react`](../../adapters/react) / [`@symbiotejs/vue`](../../adapters/vue) /
  [`@symbiotejs/angular`](../../adapters/angular) — the framework adapters that drive this API.
- [`@symbiotejs/css-parser`](../css-parser) — compiles CSS into the style objects this package's
  `style-registry` resolves at runtime.

## Test it

```bash
pnpm test              # vitest, from the workspace root — headless, against a fake Fabric slot
DEBUG=1 pnpm test       # same, with diagnostic logs on
```
