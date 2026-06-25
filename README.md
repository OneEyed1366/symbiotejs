<div align="center">

# symbiote

### Want to ship a real native iOS/Android app, but you don't write React? Today you can't.

**Alpha** · iOS + Android · one native core, N framework adapters

[Architecture](#how-it-works) · [Design decisions](#design-decisions) · [Milestones](#milestones) · [Prior art](https://github.com/OneEyed1366/wolf-tui)

</div>

---

## The Problem

React Native gives you a genuinely good native stack — Fabric's C++ shadow tree, Yoga
layout, JSI, the iOS/Android host, Hermes. But that whole stack only takes orders from
**React**. Write your UI in Vue, Svelte, Solid, or Angular and your options collapse to
a WebView or a rewrite. The native rendering engine is right there, and every framework
except one is locked out of it.

It doesn't have to be. React is **not** privileged inside React Native's renderer. Fabric
exposes a framework-agnostic, JSI-bound mutation API — `global.nativeFabricUIManager` —
and React's renderer is just *one client* of it. All of React's glue lives in a single
file (`ReactFiberConfigFabric.js`). "Removing React" means: stop calling that file, call
the slot from your own renderer instead. **The native core is never touched.**

symbiote turns React Native's **internals** — Fabric's C++ shadow tree, Yoga layout,
Hermes, JSI — into a **universal native rendering layer**. It extracts that engine, puts a
tiny seam in front of it, and lets **any** UI framework drive real native views through it.
The rendering layer is React Native's; React the framework is just one client. One native
core, N thin adapters.

> If you've used [wolf-tui](https://github.com/OneEyed1366/wolf-tui) — shared retained-tree + a thin per-framework
> reconciler, already shipping across five frameworks against a native layout engine —
> you already know the shape. symbiote retargets it from ANSI terminal output to native
> iOS/Android views.

---

## How It Works

```
Vue · Svelte · Solid · Angular · React     thin reconciler / createRenderer per framework
        │  insert / remove / setProp / commit
        ▼
@symbiote/engine : retained shadow-tree + diff→childSet + event normalization
        │  ALL clone-on-write lives HERE, in one place
        ▼
nativeFabricUIManager   createNode · cloneNodeWithNewProps · appendChildToSet · completeRoot
        ▼
stock react-native : Fabric C++ · JSI · Yoga · RCTFabricSurface       ← never forked
```

The hard part is that Vue/Svelte/Solid/Angular **mutate** nodes in place
(`el.setAttribute`), while Fabric is **persistent** — every change clones the node with
new props and atomically commits a new child set. That mutation→clone-on-write translation
is the entire engineering substance of the project, and it lives **once** in
`@symbiote/engine`. Adapters see only a four-call mutation API. A persistence bug is fixed
once, for every framework.

<details>
<summary><b>Details</b> — data flow, events, bootstrap, what stays stock</summary>

**One update.** Framework reactivity fires → the adapter calls `engine.setProp / insert /
remove` on a retained node → the engine marks it dirty → on flush, the engine walks the dirty path,
clones changed nodes with new props, builds a new childSet, and calls
`completeRoot(rootTag, childSet)` → Fabric C++ diffs old vs new shadow tree → native views
update.

**Events fall out of the seam — they are not a separate subsystem.** At `createNode` time
the adapter passes an `instanceHandle`; Fabric hands that same handle back when an event
fires. In React it's the fiber; in symbiote it's the retained-tree node. The engine normalizes
the raw native event onto a listener registered on the node, and the adapter maps its own
template syntax (`@click`, `on:click`, `(click)`) onto that listener. No new layer.

**Bootstrap.** The native host raises a Fabric surface (`RCTFabricSurface` on iOS) via stock
RN's `AppRegistry`, which mints a `rootTag`. symbiote's entry registers a *runnable* (not a
component): instead of mounting React's app, it hands the `rootTag` to `mount(...)` and commits
the initial child set.

**What stays stock RN.** Fabric C++, JSI, Yoga, the iOS/Android host, `RCTFabricSurface`,
native modules. None of it is forked or patched — `react-native` is an ordinary dependency.
The only thing symbiote replaces is the JS renderer.

</details>

---

## See It Work

The canary ([`examples/canary/App.tsx`](./examples/canary/App.tsx)) runs a full demo on the
iOS simulator — every primitive, the runtime-module layer, `Animated` on both drivers, and a
third-party native slider, all committing through `@symbiote/engine` while React Native's own
renderer is never involved. The same canary now also boots on an Android emulator through the
same core. The smallest slice of it is a tap→increment counter:

The native entry registers a low-level *runnable* instead of a React component:

```js
// index.js — the canary entry
import { AppRegistry, processColor } from 'react-native';
import { createElement } from 'react';
import { mount } from '@symbiote/react';
import { setColorProcessor } from '@symbiote/engine';
import App from './App';
import { name as appName } from './app.json';

// Colors reach Fabric as platform ints; let the engine use RN's own converter.
setColorProcessor(processColor);

// Instead of AppRegistry.registerComponent (which runs RN's renderer), register a
// runnable. The native Fabric host calls it with the surface's rootTag; our renderer
// takes it from there and drives nativeFabricUIManager directly.
AppRegistry.registerRunnable(appName, ({ rootTag }) => {
  mount(rootTag, createElement(App));
});
```

The app itself is ordinary React — but it imports primitives from `@symbiote/react`, not
from `react-native`:

```jsx
import { useState } from 'react';
import { View, Text, Pressable } from '@symbiote/react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <View style={{ padding: 24 }}>
      <Text>Taps: {count}</Text>
      <Pressable onPress={() => setCount((c) => c + 1)}>
        <Text>Tap me</Text>
      </Pressable>
    </View>
  );
}
```

That tree paints real native views, and the tap re-commits through `@symbiote/engine` into
Fabric — no React Native renderer in the path.

---

## Status

> [!WARNING]
> **Alpha. Not published to npm, no stable API yet.** The architecture is proven: React Native's
> renderer is extracted and the React adapter drives the framework-agnostic core on iOS + Android,
> with RN's own renderer never in the path — the canary runs green on both. iOS stays the
> reference surface (most real-hardware time, widest prop-edge coverage). It is not yet a product
> you can ship a real app on — APIs will still move, the long-tail prop surface is hardening, and
> the `create-symbiote` scaffolder doesn't exist yet. **Vue ([M3](#milestones)) is next:** a
> second framework on the same untouched core, proving the renderer is genuinely framework-agnostic.

**Done:** the native pipe, bootstrap, and `@symbiote/engine`'s mutation→clone-on-write engine
are proven on a real iOS 26 simulator via the React canary (R1 + R2 + R3 — decision
record 0009). The canary now runs a full end-to-end demo on device — every interaction below
commits through `@symbiote/engine` into Fabric, with React Native's renderer never in the path:

- **Primitives** — `View` · `Text` · `Image` · `ImageBackground` · `ScrollView` · `TextInput` ·
  `Pressable` · `Touchable*` · `Button` · `Switch` · `Modal` · `ActivityIndicator` ·
  `SafeAreaView` · `RefreshControl` · `FlatList` · `SectionList` · `VirtualizedList`.
- **Runtime modules** — `Platform` · `StyleSheet` (incl. `hairlineWidth`) · `Dimensions` ·
  `Appearance` · `PixelRatio` · `AppState`, plus imperative `Alert` · `ActionSheetIOS` ·
  `Share` · `Linking` · `Vibration` · `Keyboard` · `StatusBar` — each reaching its real native
  module on the bridgeless host.
- **`Animated`, both drivers** — JS *and* native driver side by side (`timing` · `spring` ·
  `loop` · `interpolate` · `ValueXY` · tracking · `diffClamp`). Native offload is proven by
  jamming the JS thread 1.5 s: the native-driven animations keep moving, the JS-driven one
  stalls (decision records 0016 · 0017).
- **Third-party native views** — `@react-native-community/slider` used straight from the
  package with zero symbiote metadata; the engine derives its events and prop processors from the
  library's own ViewConfig at runtime — the "install the package, use its component" path.
- **Gestures & events** — the responder lifecycle (grant/move/release/terminate, LCA-scoped
  re-negotiation), two-phase capture→bubble delivery, `Pressable` press-retention, `Touchable*`
  delays, and `PanResponder` — all in the engine, on both platforms.
- **Accessibility** — the `accessibility*` / ARIA prop layer (roles, labels, states, focus,
  grouping) folded across components and verified against the platform a11y tree on iOS + Android.
- **Modern styling** — RN's JS style processors (`boxShadow` · `filter` · `transform` ·
  `transformOrigin` · `aspectRatio` · `fontVariant`) and color resolution run in the engine, so
  CSS-style props commit correctly on **both** platforms — not just iOS tolerating a raw string
  while Android's strict native converter crashes on it.

**Android — the full canary, verified on an emulator.** The same React canary runs on an
Android emulator through the same `@symbiote/engine` core, RN's renderer still never in the
path — every block of the demo confirmed on device: all primitives (`View`/`Text`/`ScrollView`
vertical *and* horizontal/`TextInput`/`Switch`/`Modal`/`FlatList`/`Image`+`prefetch`), the
runtime modules (`Platform` at the real OS/API level, `StatusBar`, `Keyboard`, `Settings`
persistence, `Alert`/`Share`/`Vibration`/`Linking`), `Animated` on both drivers, `PanResponder`
gestures, `PlatformColor`, the ref API (`measure`/`setNativeProps`), and the third-party native
slider through runtime ViewConfig derivation. Two signals RN ties to a view host symbiote
bypasses — or never shipped on Android — are re-supplied by a small `@symbiote/android` native
package (`KeyboardObserver` host shim; `SettingsManager` → `SharedPreferences`). `Platform` and
the component-name map are Metro-split per OS (`.ios`/`.android`), no `Platform.OS` runtime
branch. iOS stays the reference surface (more real-hardware time, wider prop-edge coverage);
`ActionSheetIOS` is iOS-only by design, and `Vibration` needs the app to declare the `VIBRATE`
permission (RN's standard requirement, owned by the future scaffolder).

**The bar for "done" is the canary, not a percentage.** [`examples/canary/App.tsx`](./examples/canary/App.tsx)
is the working spec — it exercises the real surface (every primitive, the runtime modules,
`Animated` on both drivers, gestures, a11y, a third-party native view) and it runs green on
both an iOS simulator and an Android emulator. React Native's own surface is effectively
unbounded; rather than chase a parity figure against it, the canary defines the contract and
stays green. Known RN divergences that fall **outside** that surface (e.g. vector-driven
`Animated.spring` on a `ValueXY`, the `item.key`/`item.id` default `keyExtractor` fallback) are
tracked and fixed when a real screen needs them.

**In progress:** widening the canary's surface (long-tail components and prop edges) and
bringing Android fully level with the iOS reference.

---

## Milestones

The strategy is to make **React** the known-good driver first — cover its React Native surface
on the framework-agnostic core, with the canary as the spec — then add one framework at a time
on a core that's already validated. A break in a new adapter is then a break in *that adapter*, not in
the native pipe or the commit engine.

There are **two orthogonal axes** here, not one line: the **framework** axis (React → Vue →
Angular → Svelte → Solid) and the **platform** axis (iOS, Android). They are independent — the
React adapter already drives both iOS and Android off the same core. So M7 below is not a
sequential phase that waits for Solid; it is the platform axis, already underway on React,
that each further adapter inherits as it lands.

| # | Milestone | What it proves | Status |
|---|-----------|----------------|--------|
| **M0** | Monorepo scaffold | pnpm workspaces, `engine` + `react` packages, headless harness | ✅ done |
| **M1** | React canary on iOS | native pipe (R1) + clone-on-write engine (R2) + event→recommit (R3) | ✅ done |
| **M2** | **React → React Native parity (canary surface)** | the canary's full primitive + prop + event surface on the agnostic core — green on iOS + Android | ✅ done |
| ↳ M2.1 | Primitive surface | `View`/`Text`/`ScrollView`/`TextInput`/`Modal`/`FlatList`/… all driven through the engine, on device | ✅ done |
| ↳ M2.2 | Runtime modules | `Platform`/`StyleSheet`/`Dimensions`/`Appearance`/`AppState` + imperative `Alert`/`ActionSheetIOS`/`Share`/`Linking`/`Vibration`/`Keyboard`/`StatusBar` | ✅ done |
| ↳ M2.3 | `Animated`, both drivers | JS + native driver (`ValueXY`/tracking/`diffClamp`); native offload proven by a JS-thread freeze (ADR 0016 · 0017) | ✅ done |
| ↳ M2.4 | Third-party native views | `@react-native-community/slider` via runtime ViewConfig derivation — zero symbiote metadata | ✅ done |
| ↳ M2.5 | Gestures & events | responder lifecycle, capture→bubble phases, `Pressable`/`Touchable*`/`PanResponder`, a11y prop layer | ✅ done |
| ↳ M2.6 | Long-tail prop edges | continuous hardening of remaining components and per-prop edges as the canary surface widens — not a gate on M2 | 🔁 ongoing |
| **M3** | Vue adapter | `createRenderer` + nodeOps on the validated core — first non-React framework (R4) | ⏳ next |
| **M4** | Angular adapter | a second mutation-oriented framework, template/renderer seam | ⏳ planned |
| **M5** | Svelte adapter | compiled-output framework driving the engine's mutation API | ⏳ planned |
| **M6** | Solid adapter | fine-grained reactivity driving the engine's mutation API | ⏳ planned |
| **M7** | Web *(stretch)* | the same trees rendered to the web as a default platform target | 💭 maybe |
| **DX** | `create-symbiote` scaffolder | pins `react-native` + `react` at the app root so your app code imports only `@symbiote/*`, never `react-native` | ⏳ planned |

**End goal:** each framework — Vue, Angular, Svelte, Solid, React — can render native iOS and
Android apps the same way React Native does today, off one untouched native core. Web as a
default platform target is a possible later pass.

Each adapter is built in layers (static paint → reactive update → event) so a break is
localizable.

---

## Repository Layout

```
core/
  engine/      @symbiote/engine  — retained tree + clone-on-write commit engine + events
adapters/
  react/       @symbiote/react   — react-reconciler host config (mutation mode) + primitives
packages/
  android/     @symbiote/android — autolinked native host shims (keyboard, settings) for Android
examples/
  canary/      stock RN 0.86 app whose entry drives symbiote on the iOS simulator
  headless/    fake-slot smoke tests — the engine runs green in Node, no simulator
```

---

## Develop

Requires Node ≥ 20 and pnpm 11.

```bash
pnpm install
pnpm typecheck            # tsc --build across the workspace
DEBUG=1 node examples/headless/<smoke>.tsx   # run a headless smoke (engine, no simulator)
```

To run the canary on the iOS simulator, `examples/canary` is a stock React Native 0.86 app
(driven by symbiote via a registered runnable). Requires Node ≥ 22 and the
[RN environment setup](https://reactnative.dev/docs/set-up-your-environment) (Xcode, CocoaPods):

```bash
cd examples/canary
npm install
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install        # (cd ios && pod install) — fetch native pods

# terminal 1 — Metro. DEBUG=1 turns on diagnostic logs (Babel inlines it).
DEBUG=1 npm start --reset-cache

# terminal 2 — build + launch on a simulator/emulator
npm run ios                    # iOS simulator (full surface)
npm run android                # Android emulator (manual-links @symbiote/android)
```

Press <kbd>R</kbd> in the simulator to reload. Because `DEBUG` is Babel-inlined into the
bundle, changing it requires restarting Metro with `--reset-cache`.

> **A note on logs.** All diagnostics go through `dlog` / `isDebug` from `@symbiote/engine`,
> off by default, gated by `DEBUG`. They are an asset — never deleted, only added. When
> debugging finds a useful seam, a log stays there permanently.

---

## Design Decisions

A few invariants hold the architecture together. Changing any of them is a deliberate
decision, not a drift:

- **The native core is never forked.** `react-native` is a dependency; only the JS renderer
  is replaced.
- **All clone-on-write lives in `@symbiote/engine`.** Adapters never reimplement the
  persistence dance.
- **Adapters stay thin.** Layout, commit batching, event normalization, and ViewConfig
  handling all live in the engine.
- **Layout is stock Yoga.** Taffy is out of scope — touching the C++ layout node
  turns "free RN upstream merges" into a permanent fork tax for an unmeasured
  benchmark win.

---

## FAQ

**Is this a fork of React Native?** No. `react-native` is consumed as an ordinary dependency;
its native C++/Obj-C++/JNI sources are never touched. symbiote replaces only the JS renderer.

**Why React first if the goal is framework independence?** React is a known-good driver. Using
it to validate the native pipe and the commit engine first means that when Vue/Svelte/Solid/
Angular break, the failure isolates to *that adapter* — not the native stack underneath it.

**Can I use it today?** Not for a real app yet — it's alpha: no stable API, no `create-symbiote`
scaffolder. The architecture is proven, though — the React adapter drives the agnostic core on
iOS + Android with RN's renderer never in the path. You can read the architecture, run the
headless smokes, drive the canary, and follow the milestones.

---

## License

[MIT](./LICENSE).
