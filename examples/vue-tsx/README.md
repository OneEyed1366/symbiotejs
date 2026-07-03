# Vue canary — JSX/TSX (`@symbiotejs/vue` on device)

The **M3 / R4 proof on a real host**, authored in **Vue JSX** instead of an SFC: a Vue 3 app
driving the framework-agnostic `@symbiotejs/engine` core on the iOS simulator / Android emulator,
with React Native's own renderer never in the path. It is the [`examples/vue-sfc`](../vue-sfc)
app rewritten JSX-for-template — **same native shell, same engine, same components, only the
authoring differs**. Together the two examples show the Vue slice is template-agnostic.

```
index.js          registers a RUNNABLE with RN's AppRegistry → mounts the Vue app via @symbiotejs/vue
App.tsx           a Vue counter, authored as a defineComponent whose setup() returns a JSX render fn
babel.config.js   @vue/babel-plugin-jsx compiles the JSX → @vue/runtime-core createVNode (before RN's React-JSX transform)
metro.config.js   aliases 'vue' → @vue/runtime-core; pins one react + one runtime-core (no custom transformer)
```

## How the JSX compiles (vs the SFC canary)

The SFC canary needs a Metro transformer to compile `.vue`. The TSX canary needs none — JSX is
a babel concern:

- **`@vue/babel-plugin-jsx`** (listed first in `babel.config.js`) rewrites every `JSXElement`
  into a `@vue/runtime-core` `createVNode` call. Because babel applies `plugins` before
  `presets`, it runs ahead of the RN preset's React-JSX transform, which then finds no JSX left
  and no-ops — so there is **no `react/jsx-runtime` import** in the bundle.
- The plugin injects its helper imports `from 'vue'`; `metro.config.js` aliases the bare `vue`
  specifier to `@vue/runtime-core` (the resolver twin of the SFC transformer's
  `'vue'`→runtime-core string rewrite), so the app and the adapter share **one** Vue runtime —
  reactivity is a singleton, two copies would silently fail to react.

So `<View onResponderRelease={onTap}>` compiles to `createVNode(View, { onResponderRelease: onTap })`;
that `onX` key lands in `patchProp` → `routeProp` exactly as the SFC's `@responder-release` did.

This exercises the same structural reconciler paths as the SFC: a `? :` ternary mounts/unmounts
the spinner (Vue comment placeholder → our anchor node), `.map()` diffs a keyed list (Vue
Fragment → empty-text anchors + engine `insertBefore` / `removeChild`), and a `computed` derives
reactive text. The tap is the raw responder protocol (`onStartShouldSetResponder` +
`onResponderRelease`), not `Pressable`. `ActivityIndicator` is the first `@symbiotejs/components`
component — its render fn is shared verbatim with React; Vue supplies only the `descriptorToVue`
bridge.

Editing `babel.config.js` or `metro.config.js` needs a Metro cache reset
(`npm start -- --reset-cache`); editing `App.tsx` does not.

## Run

```sh
cd examples/vue-tsx
npm install
# iOS
(cd ios && bundle install && bundle exec pod install)
npm run ios
# Android
npm run android
# diagnostic logs:  DEBUG=1 npm start -- --reset-cache   (then run ios/android)
```

Tap the box → the counter increments and a keyed row is prepended; the second box toggles the
spinner. Every tap re-enters Vue's reactivity, which recommits through `@symbiotejs/engine` into
Fabric — RN's renderer never involved.

## Note — shares the canary's native shell

The native iOS/Android projects are copied verbatim from `examples/vue-sfc`, so this app keeps
the **same bundle id and app name ("Canary")**. On a simulator the canaries overwrite each
other — run **one at a time** (`examples/vue-tsx` or `examples/vue-sfc` for Vue,
`examples/react` for React). Renaming to a distinct bundle id is a follow-up if you want several
installed side by side.
