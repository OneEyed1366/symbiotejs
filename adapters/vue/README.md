# @symbiote/vue

The **Vue 3 adapter** for [symbiote](../../README.md) — render real native iOS/Android views from
Vue, on the *same* untouched core as React, with React Native's own renderer never in the path. It
is a `@vue/runtime-core` `createRenderer` whose nodeOps map each mutation onto the engine's
four-call API; `@symbiote/engine` does the clone-on-write commit into Fabric.

Vue is the **proof the core is genuinely framework-agnostic** (milestone R4): a second, non-React,
mutation-oriented framework driving the already-validated engine.

<div align="center">

![Vue 3 driving real native iOS views through symbiote](../../assets/vue-demo.gif)

</div>

> New to symbiote? The [root README](../../README.md) has the architecture.

---

## Use it

The native entry reaches the *same* `registerRunnable` seam as React — only the adapter changes. It
hands the surface's `rootTag` to `mount` from `@symbiote/vue`, which drives the engine through Vue's
`createRenderer`:

```js
// index.js
import { AppRegistry as RNAppRegistry } from 'react-native';
import { mount } from '@symbiote/vue';
import App from './App';
import { name as appName } from './app.json';

// registerRunnable (not registerComponent): RN stores a raw mount callback and never renders
// it with its own renderer. We mount the Vue app onto the surface's rootTag.
RNAppRegistry.registerRunnable(appName, ({ rootTag }) => {
  mount(rootTag, App);
});
```

The app is ordinary Vue — it just imports primitives from `@symbiote/vue` instead of
`react-native`. A tap→increment counter, authored in TSX:

```jsx
import { ref } from '@vue/runtime-core';
import { View, Text, Pressable } from '@symbiote/vue';

export default {
  setup() {
    const count = ref(0);
    return () => (
      <View style={{ padding: 24 }}>
        <Text>Taps: {count.value}</Text>
        <Pressable onPress={() => count.value++}>
          <Text>Tap me</Text>
        </Pressable>
      </View>
    );
  },
};
```

### Two example apps

The full canary exists in two flavors — both render the same surface as the React reference, and
the demo above is the first one running on the iOS simulator:

- [`examples/vue-tsx`](../../examples/vue-tsx) — authored in **TSX**.
- [`examples/vue-sfc`](../../examples/vue-sfc) — authored in **single-file components**, compiled by
  a per-framework Metro transformer.

---

## Parity — and the one gap

Both adapters reach the same primitives, runtime modules, `Animated` on both drivers, gestures,
accessibility, and the `VirtualizedList` family. That parity is **structural, not hand-copied**: the
component logic (state machines + render functions) is written **once** in `@symbiote/components`,
and each adapter supplies only its lifecycle (Vue's `ref`/`watch` + the descriptor→`h()` bridge).

The one deliberate gap is third-party **React component** packages such as
`@react-native-community/slider`. Their body calls React hooks off the React dispatcher, so they run
only under the React adapter — under Vue the dispatcher is null and they throw. symbiote makes the
*native view* framework-agnostic, not the library's React *component*; such a view becomes reachable
from Vue only through a thin wrapper over the same `createNode`-by-ViewConfig path symbiote uses for
its own primitives. Until that wrapper ships, the component is React-adapter-only.

---

## A Vue-specific gotcha — async commit timing

Vue batches commits on a microtask (every mutation schedules one `completeRoot`), so a node's
Fabric tag is assigned *after* `onMounted` / `watch(flush:'post')` runs. A native bind that reads
the tag at lifecycle time (native-driver `Animated`, sticky-header scroll attach, `TextInput`
autoFocus) would race the commit and silently no-op — while the JS-path headless test stays green.
React doesn't hit this because `react-reconciler` commits synchronously.

The fix lives in the engine: `whenCommitted(node, action)` runs `action` now if the node already
has a tag, else after the commit that assigns it. Any native/imperative call wired at Vue lifecycle
time must go through it. This is the only place the Vue adapter's timing differs from React's — see
the `vue-adapter-reactivity` notes and `core/engine/src/post-commit.ts`.

---

## Run it

Each example is a stock React Native 0.86 app — the steps are identical to the
[React adapter](../react/README.md#run-it), just swap the directory:

```bash
cd examples/vue-tsx            # or examples/vue-sfc
npm install
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install        # fetch native pods

# terminal 1 — Metro (DEBUG=1 turns on diagnostic logs)
DEBUG=1 npm start --reset-cache

# terminal 2 — build + launch
npm run ios                    # iOS simulator
npm run android                # Android emulator
```

---

## Test it

```bash
pnpm test                      # vitest, from the workspace root — headless, fake Fabric slot

cd examples/vue-tsx
npm run e2e:build:ios          # build the app for Detox
npm run e2e:test:ios           # run the canary journeys on the iOS simulator
# …or the android equivalents: e2e:build:android / e2e:test:android
```

The headless suite includes Vue regression guards for the async-commit gotcha above (native-driver
`Animated`, sticky scroll, autoFocus). Why testing comes for free: see
[Testing](../../README.md#testing).
