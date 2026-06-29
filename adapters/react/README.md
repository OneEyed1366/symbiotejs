# @symbiote/react

The **React adapter** for [symbiote](../../README.md) — drive real native iOS/Android views from
React, with React Native's own renderer never in the path. It is a `react-reconciler` host config
in **mutation mode** (`appendChild` / `insertBefore` / `removeChild` → the engine's four-call
mutation API); `@symbiote/engine` does the clone-on-write commit into Fabric.

This is the **reference adapter**: the known-good driver used to validate the native pipe and the
commit engine before any other framework lands, so a break in Vue/Svelte/Solid isolates to *that*
adapter, not the core.

<div align="center">

![React driving real native iOS views through symbiote](../../assets/react-demo.gif)

</div>

> New to symbiote? The [root README](../../README.md) has the architecture and the one fact it
> rests on — React is just *one client* of `nativeFabricUIManager`.

---

## Use it

The app is ordinary React — it imports primitives from `@symbiote/react`, not `react-native`:

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

The native entry registers a low-level *runnable* instead of a React component: RN's Fabric host
calls it with the surface's `rootTag`, and the renderer takes over from there — `nativeFabric-
UIManager` is driven directly, RN's own renderer never runs.

```js
// index.js
import { AppRegistry, processColor } from 'react-native';
import { createElement } from 'react';
import { mount } from '@symbiote/react';
import { setColorProcessor } from '@symbiote/engine';
import App from './App';
import { name as appName } from './app.json';

// Colors reach Fabric as platform ints; let the engine use RN's own converter.
setColorProcessor(processColor);

// registerRunnable (not registerComponent): RN stores a raw mount callback and never renders
// it with its own renderer.
AppRegistry.registerRunnable(appName, ({ rootTag }) => {
  mount(rootTag, createElement(App));
});
```

The runnable example is [`examples/react`](../../examples/react) — a stock RN 0.86 app whose full
canary ([`App.tsx`](../../examples/react/App.tsx)) exercises every block of the surface below.

---

## Surface — verified on device, iOS + Android

Every interaction commits through `@symbiote/engine` into Fabric, with RN's renderer never in the
path (R1 + R2 + R3 — decision record 0009):

- **Primitives** — `View` · `Text` · `Image` · `ImageBackground` · `ScrollView` · `TextInput` ·
  `Pressable` · `Touchable*` · `Button` · `Switch` · `Modal` · `ActivityIndicator` ·
  `SafeAreaView` · `RefreshControl` · `FlatList` · `SectionList` · `VirtualizedList`.
- **Runtime modules** — `Platform` · `StyleSheet` (incl. `hairlineWidth`) · `Dimensions` ·
  `Appearance` · `PixelRatio` · `AppState`, plus imperative `Alert` · `ActionSheetIOS` · `Share` ·
  `Linking` · `Vibration` · `Keyboard` · `StatusBar` — each reaching its real native module on the
  bridgeless host.
- **`Animated`, both drivers** — JS *and* native driver side by side (`timing` · `spring` · `loop` ·
  `interpolate` · `ValueXY` · tracking · `diffClamp`). Native offload is proven by jamming the JS
  thread 1.5 s: the native-driven animations keep moving, the JS-driven one stalls (ADR 0016 · 0017).
- **Third-party native views** — `@react-native-community/slider` used straight from the package
  with zero symbiote metadata; the engine derives its events and prop processors from the library's
  own ViewConfig at runtime — the "install the package, use its component" path.
- **Gestures & events** — the responder lifecycle (grant/move/release/terminate, LCA-scoped
  re-negotiation), two-phase capture→bubble delivery, `Pressable` press-retention, `Touchable*`
  delays, and `PanResponder` — all in the engine.
- **Accessibility** — the `accessibility*` / ARIA prop layer (roles, labels, states, focus,
  grouping) verified against the platform a11y tree on both platforms.
- **Modern styling** — RN's JS style processors (`boxShadow` · `filter` · `transform` ·
  `transformOrigin` · `aspectRatio` · `fontVariant`) and color resolution run in the engine, so
  CSS-style props commit correctly on **both** platforms — not just iOS tolerating a raw string
  while Android's strict native converter crashes on it.

### Android

The same canary runs on an Android emulator through the same `@symbiote/engine` core. Two signals
RN ties to a view host symbiote bypasses — or never shipped on Android — are re-supplied by a small
`@symbiote/android` native package (`KeyboardObserver` host shim; `SettingsManager` →
`SharedPreferences`). `Platform` and the component-name map are Metro-split per OS (`.ios` /
`.android`), so there is no `Platform.OS` runtime branch. iOS stays the reference surface (more
real-hardware time, wider prop-edge coverage); `ActionSheetIOS` is iOS-only by design, and
`Vibration` needs the app to declare the `VIBRATE` permission (RN's standard requirement, owned by
the future scaffolder).

---

## Run it

[`examples/react`](../../examples/react) is a stock React Native 0.86 app. Requires Node ≥ 22 and
the [RN environment setup](https://reactnative.dev/docs/set-up-your-environment) (Xcode, CocoaPods):

```bash
cd examples/react
npm install
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install        # (cd ios && pod install) — fetch native pods

# terminal 1 — Metro. DEBUG=1 turns on diagnostic logs (Babel inlines it).
DEBUG=1 npm start --reset-cache

# terminal 2 — build + launch
npm run ios                    # iOS simulator (the reference surface)
npm run android                # Android emulator (manual-links @symbiote/android)
```

Press <kbd>R</kbd> in the simulator to reload. Because `DEBUG` is Babel-inlined into the bundle,
changing it requires restarting Metro with `--reset-cache`.

---

## Test it

```bash
pnpm test                      # vitest, from the workspace root — headless, fake Fabric slot

cd examples/react
npm run e2e:build:ios          # build the app for Detox (once per native change)
npm run e2e:test:ios           # run the canary journeys on the iOS simulator
# …or the android equivalents: e2e:build:android / e2e:test:android
```

Why these come for free — a symbiote app is a stock RN app underneath, so RN's whole testing
ecosystem applies unchanged. See [Testing](../../README.md#testing).
