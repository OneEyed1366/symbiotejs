<div align="center">

# symbiote

### Want to ship a real native iOS/Android app, but you don't write React? Today you can't.

**Pre-alpha** · iOS-first · one native core, N framework adapters

[Architecture](.docs/architecture.md) · [Decision records](.docs/README.md) · [Milestones](#milestones) · [Prior art](./wolf-tui)

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

symbiote extracts that native stack and puts a tiny seam in front of it, so **any** UI
framework can drive real native views. One native core, N thin adapters.

> If you've used [wolf-tui](./wolf-tui) — shared retained-tree + a thin per-framework
> reconciler, already shipping across five frameworks against a native layout engine —
> you already know the shape. symbiote retargets it from ANSI terminal output to native
> iOS/Android views.

---

## How It Works

```
Vue · Svelte · Solid · Angular · React     thin reconciler / createRenderer per framework
        │  insert / remove / setProp / commit
        ▼
@symbiote/shared : retained shadow-tree + diff→childSet + event normalization
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
`@symbiote/shared`. Adapters see only a four-call mutation API. A persistence bug is fixed
once, for every framework.

<details>
<summary><b>Details</b> — data flow, events, bootstrap, what stays stock</summary>

**One update.** Framework reactivity fires → the adapter calls `shared.setProp / insert /
remove` on a retained node → shared marks it dirty → on flush, shared walks the dirty path,
clones changed nodes with new props, builds a new childSet, and calls
`completeRoot(rootTag, childSet)` → Fabric C++ diffs old vs new shadow tree → native views
update.

**Events fall out of the seam — they are not a separate subsystem.** At `createNode` time
the adapter passes an `instanceHandle`; Fabric hands that same handle back when an event
fires. In React it's the fiber; in symbiote it's the retained-tree node. `shared` normalizes
the raw native event onto a listener registered on the node, and the adapter maps its own
template syntax (`@click`, `on:click`, `(click)`) onto that listener. No new layer.

**Bootstrap.** The native host raises a Fabric surface (`RCTFabricSurface` on iOS) via stock
RN's `AppRegistry`, which mints a `rootTag`. symbiote's entry registers a *runnable* (not a
component): instead of mounting React's app, it hands the `rootTag` to `mount(...)` and commits
the initial child set.

**What stays stock RN.** Fabric C++, JSI, Yoga, the iOS/Android host, `RCTFabricSurface`,
native modules. None of it is forked or patched — `react-native` is an ordinary dependency.
The only thing symbiote replaces is the JS renderer. See
[decision 0003](.docs/decisions/0003-native-source-stock-rn-swap-renderer.md).

</details>

---

## See It Work

The Milestone 1 canary renders `<View><Text>…</Text></View>` to the iOS simulator with a
working tap→increment — and React Native's own renderer is never involved.

The native entry registers a low-level *runnable* instead of a React component:

```js
// index.js — the canary entry
import { AppRegistry, processColor } from 'react-native';
import { createElement } from 'react';
import { mount } from '@symbiote/react';
import { setColorProcessor } from '@symbiote/shared';
import App from './App';
import { name as appName } from './app.json';

// Colors reach Fabric as platform ints; let shared use RN's own converter.
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

That tree paints real native views, and the tap re-commits through `@symbiote/shared` into
Fabric — no React Native renderer in the path.

---

## Status

> [!WARNING]
> **Pre-alpha. Not published to npm, no stable API, iOS-only.** This is a research project
> proving an architecture, not a product you can build an app on yet. Watch the
> [milestones](#milestones) — the README will say "alpha" when the React adapter reaches
> React Native feature parity.

**Done:** the native pipe, bootstrap, and `@symbiote/shared`'s mutation→clone-on-write engine
are proven on a real iOS 26 simulator via the React canary (R1 + R2 + R3 — see
[decision 0009](.docs/decisions/0009-react-canary-shipped.md)).

**In progress:** building `@symbiote/react` out toward React Native feature parity. Primitives
already wired include `View` · `Text` · `Image` · `ImageBackground` · `ScrollView` ·
`TextInput` · `Pressable` · `Touchable*` · `Button` · `Switch` · `Modal` · `ActivityIndicator`
· `SafeAreaView` · `RefreshControl` · `FlatList` · `SectionList` · `VirtualizedList`.

---

## Milestones

The strategy is to make **React** the known-good driver first — reach full React Native
feature parity on the framework-agnostic core — then add one framework at a time on a core
that's already validated. A break in a new adapter is then a break in *that adapter*, not in
the native pipe or the commit engine.

| # | Milestone | What it proves | Status |
|---|-----------|----------------|--------|
| **M0** | Monorepo scaffold | pnpm workspaces, `shared` + `react` packages, headless harness | ✅ done |
| **M1** | React canary on iOS | native pipe (R1) + clone-on-write engine (R2) + event→recommit (R3) | ✅ done |
| **M2** | **React → React Native feature parity** | the full primitive + prop + event surface on the agnostic core | 🚧 in progress |
| **M3** | Vue adapter | `createRenderer` + nodeOps on the validated core — first non-React framework (R4) | ⏳ next |
| **M4** | Angular adapter | a second mutation-oriented framework, template/renderer seam | ⏳ planned |
| **M5** | Svelte adapter | compiled-output framework driving the shared mutation API | ⏳ planned |
| **M6** | Solid adapter | fine-grained reactivity driving the shared mutation API | ⏳ planned |
| **M7** | Android | every adapter renders native Android, same code path as iOS | ⏳ planned |
| **M8** | Web *(stretch)* | the same trees rendered to the web as a default platform target | 💭 maybe |

**End goal:** each framework — Vue, Angular, Svelte, Solid, React — can render native iOS and
Android apps the same way React Native does today, off one untouched native core. Web as a
default platform target is a possible later pass.

Each adapter is built in layers (static paint → reactive update → event) so a break is
localizable. See [decision 0007](.docs/decisions/0007-first-milestone-vue-vertical-slice.md).

---

## Repository Layout

```
packages/
  shared/      @symbiote/shared — retained tree + clone-on-write commit engine + events
  react/       @symbiote/react  — react-reconciler host config (mutation mode) + primitives
examples/
  canary/      stock RN 0.86 app whose entry drives symbiote on the iOS simulator
  headless/    fake-slot smoke tests — the engine runs green in Node, no simulator
.docs/         decision records (ADRs) — read before proposing architectural changes
.vendors/      stock react-native + react sources, for reference only (never forked)
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

# terminal 2 — build + launch on the iOS simulator
npm run ios                    # npm run android for Android (M7, not yet wired)
```

Press <kbd>R</kbd> in the simulator to reload. Because `DEBUG` is Babel-inlined into the
bundle, changing it requires restarting Metro with `--reset-cache`.

> **A note on logs.** All diagnostics go through `dlog` / `isDebug` from `@symbiote/shared`,
> off by default, gated by `DEBUG`. They are an asset — never deleted, only added. When
> debugging finds a useful seam, a log stays there permanently.

---

## Design Decisions

Every load-bearing choice is a decision record in [`.docs/`](.docs/README.md), with its
context, the option taken, the rationale, and — importantly — what it explicitly rules out.
Read the relevant ADR before proposing an architectural change; if your change contradicts
one, write a superseding record rather than drifting silently.

A few invariants are non-negotiable without a new decision record:

- **The native core is never forked.** `react-native` is a dependency; only the JS renderer
  is replaced.
- **All clone-on-write lives in `@symbiote/shared`.** Adapters never reimplement the
  persistence dance.
- **Adapters stay thin.** Layout, commit batching, event normalization, and ViewConfig
  handling are all shared.
- **Layout is stock Yoga.** Taffy is out of scope — touching the C++ layout node
  turns "free RN upstream merges" into a permanent fork tax for an unmeasured
  benchmark win ([decision 0004](.docs/decisions/0004-layout-yoga-not-taffy.md)).

---

## FAQ

**Is this a fork of React Native?** No. `react-native` is consumed as an ordinary dependency;
its native C++/Obj-C++/JNI sources are never touched. symbiote replaces only the JS renderer.

**Why React first if the goal is framework independence?** React is a known-good driver. Using
it to validate the native pipe and the commit engine first means that when Vue/Svelte/Solid/
Angular break, the failure isolates to *that adapter* — not the native stack underneath it.

**Can I use it today?** Not for a real app — it's pre-alpha and iOS-only. You can read the
architecture, run the headless smokes, and follow the milestones.

---

## License

[MIT](./LICENSE).
