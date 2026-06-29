<div align="center">

# symbiote

### Want to ship a real native iOS/Android app, but you don't write React? Today you can't.

**Beta** · iOS + Android · React + Vue · one native core, N framework adapters

[Architecture](#how-it-works) · [Testing](#testing) · [Milestones](#milestones) · [React adapter](./adapters/react) · [Vue adapter](./adapters/vue) · [Prior art](https://github.com/OneEyed1366/wolf-tui)

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

The *same* native app — same `@symbiote/engine`, same stock Fabric core — driven by two different
frameworks on the iOS simulator. React Native's own renderer is never in the path of either:

<div align="center">

<table>
<tr>
<td align="center"><b>React</b></td>
<td align="center"><b>Vue 3</b></td>
</tr>
<tr>
<td><img src="./assets/react-demo.gif" width="300" alt="React driving real native iOS views through symbiote"></td>
<td><img src="./assets/vue-demo.gif" width="300" alt="Vue 3 driving real native iOS views through symbiote"></td>
</tr>
</table>

</div>

The smallest slice is a tap→increment counter. The app is ordinary React (or Vue) — it just
imports primitives from `@symbiote/*` instead of `react-native`:

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

That tree paints real native views, and the tap re-commits through `@symbiote/engine` into Fabric.
The entry seam (a low-level *runnable*, not a component), the full canary, and how to run each one
live in the per-adapter READMEs:

- **[`adapters/react`](./adapters/react)** — `@symbiote/react`, the reference adapter (full RN surface, iOS + Android).
- **[`adapters/vue`](./adapters/vue)** — `@symbiote/vue`, Vue 3 on the same core (`examples/vue-tsx`, `examples/vue-sfc`).

---

## Status

> [!WARNING]
> **Beta. Not published to npm, no stable API yet.** The thesis is proven *twice over*: React
> Native's renderer is extracted, and **two** frameworks — React and Vue 3 — drive the same
> untouched framework-agnostic core on iOS + Android, with RN's own renderer never in the path.
> It is not yet a product you can ship a real app on — APIs will still move, the long-tail prop
> surface is hardening, automated device coverage is just coming online, and the `create-symbiote`
> scaffolder doesn't exist yet. iOS stays the reference surface; Android is at canary parity.

**Proven on device, both platforms, RN's renderer never in the path:** every primitive
(`View` / `Text` / `Image` / `ScrollView` / `TextInput` / `Pressable` / `Switch` / `Modal` / the
`VirtualizedList` family / …), the runtime-module layer (`Platform` / `StyleSheet` / `Dimensions` /
`Alert` / `Share` / …), `Animated` on **both** the JS and native drivers, the gesture/responder
lifecycle, accessibility, and RN's JS style processors — all committing through `@symbiote/engine`
into Fabric. Each adapter's full surface and what's verified where lives in its README:
[**React →**](./adapters/react) · [**Vue →**](./adapters/vue).

**The bar for "done" is the canary, not a percentage.** The example apps are the working spec —
they exercise the real surface and run green on an iOS simulator and an Android emulator. RN's own
surface is effectively unbounded; rather than chase a parity figure, the canary defines the
contract and stays green. **In progress:** widening the long-tail prop surface and bringing Android
fully level with the iOS reference.

---

## Testing

symbiote never forks the native core, so a symbiote app **is** a stock React Native app underneath.
That has a quiet payoff: **any tool that hooks RN's internals works on symbiote unchanged — for every
adapter, for free.** We didn't build a test framework; we inherited RN's. The same lever that lets a
non-React renderer drive Fabric lets RN's testing, debugging, and native-module ecosystem come along
without per-framework reinvention.

- **Headless — `vitest`.** Colocated unit + smoke tests drive the engine against a fake
  `nativeFabricUIManager` slot (`installFabric`) and read the committed Fabric props back — the real
  commit path, no simulator, mirroring RN's own Fantom approach. ~500 tests run in Node in seconds,
  and because the engine and `@symbiote/components` are the shared layer, one suite covers the logic
  every adapter rides on. `pnpm test` at the workspace root.
- **On-device — `Detox`.** End-to-end user-journey tests run against the real app on a
  simulator/emulator. One `canary-journeys` spec is mirrored across `examples/react`,
  `examples/vue-tsx`, and `examples/vue-sfc` — the *same* journeys, proving each adapter paints and
  responds identically on device. Detox attaches with zero symbiote-specific glue, because to Detox
  it is just an RN app (`e2e:build:ios` / `e2e:test:ios`, and the `android` equivalents).

The lever is the same as the renderer's: stay on RN's internals, and the whole RN ecosystem —
testing, debugging, native modules — is yours across every framework. Per-adapter commands live in
each adapter's README.

---

## Milestones

Make **React** the known-good driver first — cover its RN surface on the agnostic core, canary as
spec — then add one framework at a time on an already-validated core, so a break in a new adapter
isolates to *that adapter*, not the native pipe or the commit engine. The **framework** axis
(React → Vue → Angular → Svelte → Solid) and the **platform** axis (iOS, Android) are independent:
React already drives both platforms, and each new adapter inherits the platform axis as it lands.

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
| **M3** | **Vue adapter (R4)** | `createRenderer` + nodeOps on the validated core — first non-React framework, same canary surface | ✅ done |
| ↳ M3.1 | Vue canary parity | `examples/vue-tsx` (TSX) + `examples/vue-sfc` (SFC) render the React canary's surface, minus React-only third-party components | ✅ done |
| ↳ M3.2 | Shared component layer | `VirtualizedList` family + component logic extracted to `@symbiote/components`, inherited by React **and** Vue | ✅ done |
| ↳ M3.3 | Test harness per adapter | colocated `vitest` (headless, fake Fabric slot) + `Detox` e2e mirrored across all three example apps | ✅ done |
| **M4** | Angular adapter | a second mutation-oriented framework, template/renderer seam | ⏳ next |
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
  engine/      @symbiote/engine     — retained tree + clone-on-write commit engine + events
  components/  @symbiote/components  — framework-agnostic component logic (state + render), shared by every adapter
adapters/
  react/       @symbiote/react      — react-reconciler host config (mutation mode) + primitives
  vue/         @symbiote/vue         — @vue/runtime-core createRenderer + nodeOps over the engine
packages/
  android/     @symbiote/android    — autolinked native host shims (keyboard, settings) for Android
examples/
  react/       stock RN 0.86 app driven by @symbiote/react (the reference canary)
  vue-tsx/     the same canary in Vue 3, authored in TSX
  vue-sfc/     the same canary in Vue 3, authored in single-file components
```

Tests are **colocated** next to the code they cover (`*.test.ts(x)` for `vitest`, `e2e/` per
example app for `Detox`) rather than gathered in one directory.

---

## Develop

Requires Node ≥ 20 and pnpm 11.

```bash
pnpm install
pnpm typecheck           # tsc --build across the workspace
pnpm test                # vitest — headless engine/adapter tests against a fake Fabric slot
DEBUG=1 pnpm test        # same, with diagnostic logs on
```

To build and run a canary on a simulator/emulator — and the Detox e2e journeys — follow the
per-adapter README. Each `examples/*` is a stock React Native 0.86 app driven by symbiote, and the
steps are identical bar the directory:

- **[adapters/react →](./adapters/react)** — `examples/react` (the reference)
- **[adapters/vue →](./adapters/vue)** — `examples/vue-tsx`, `examples/vue-sfc`

> **A note on logs.** All diagnostics go through `dlog` / `isDebug` from `@symbiote/engine`,
> off by default, gated by `DEBUG` (Babel-inlines it into the bundle, so changing it needs Metro
> `--reset-cache`). They are an asset — never deleted, only added.

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

**Can I use it today?** Not for a real app yet — it's beta: no stable API, no `create-symbiote`
scaffolder. The thesis is proven, though — **two** frameworks (React and Vue 3) drive the agnostic
core on iOS + Android with RN's renderer never in the path. You can read the architecture, run the
`vitest` suite and the `Detox` journeys, drive any of the three canaries, and follow the milestones.

**Do I have to write tests from scratch?** No — and that's a feature of the design. Because a
symbiote app is a stock RN app underneath, RN's testing tools apply unchanged: a headless `vitest`
harness against a fake Fabric slot and on-device `Detox` journeys, both already wired across every
example app. See [Testing](#testing).

---

## License

[MIT](./LICENSE).
