# Vue canary — SFC (`@symbiote/vue` on device)

The **M3 / R4 proof on a real host**: a Vue 3 app driving the framework-agnostic
`@symbiote/engine` core on the iOS simulator / Android emulator, with React Native's own
renderer never in the path. It is the [`examples/react`](../react) React app with the
JS layer swapped for Vue — same native shell, same engine, a different framework on top.

This is the **SFC** authoring of the Vue slice (`.vue` single-file components). The same app
authored in **Vue JSX/TSX** lives next door in [`examples/vue-tsx`](../vue-tsx) — same engine,
same components, only the template-vs-JSX authoring differs.

```
index.js                  registers a RUNNABLE with RN's AppRegistry → mounts the Vue app via @symbiote/vue
App.vue                    a Vue counter, authored as a real SFC (<template> + <script setup lang="ts">)
metro-vue-transformer.js   compiles .vue on the way into the bundle (parse → compileScript → 'vue'→runtime-core)
metro.config.js            sourceExts += 'vue', babelTransformerPath → the SFC transformer; pins one react + one runtime-core
```

`App.vue` is an ordinary Vue SFC. Metro has no Vue plugin (unplugin-vue ships
vite/webpack/esbuild/rollup adapters, not Metro), so `metro-vue-transformer.js` does the
single-pass compile itself with `@vue/compiler-sfc` — `parse` → `compileScript` with
`inlineTemplate`, then rewrites every `from 'vue'` to `@symbiote/vue/runtime-helpers` (the
custom, non-DOM renderer needs the compiler helpers from `@vue/runtime-core`, not
`vue/runtime-dom` — the wolf-tui pattern; the shim also supplies `vShow`, since `v-show`
compiles to an import runtime-core alone doesn't export — see the `vue-adapter-directives`
skill). The compiled module is handed to `@react-native/babel-preset` as `.tsx`
so it strips the `lang="ts"` types. The tap is the raw responder protocol
(`@start-should-set-responder` + `@responder-release`), not `Pressable` — the press-retention
controller lands with `@symbiote/components`. `ActivityIndicator` is the first
`@symbiote/components` component: render fn shared verbatim with React, Vue supplies only the
`descriptorToVue` bridge.

Editing the transformer or `metro.config.js` needs a Metro cache reset
(`npm start -- --reset-cache`); editing `App.vue` does not.

## Run

```sh
cd examples/vue-sfc
npm install
# iOS
(cd ios && bundle install && bundle exec pod install)
npm run ios
# Android
npm run android
# diagnostic logs:  DEBUG=1 npm start -- --reset-cache   (then run ios/android)
```

Tap the box → the counter increments. That tap re-enters Vue's reactivity, which recommits
through `@symbiote/engine` into Fabric — RN's renderer never involved.

## Note — shares the canary's native shell

The native iOS/Android projects are copied verbatim from `examples/react`, so this app
keeps the **same bundle id and app name ("Canary")**. On a simulator the canaries
overwrite each other — run **one at a time** (`examples/vue-sfc` or `examples/vue-tsx` for
Vue, `examples/react` for React). Renaming to a distinct bundle id is a follow-up if you
want several installed side by side.
