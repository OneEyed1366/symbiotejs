# @symbiotejs/android

Android host-shim native modules for [SymbioteJS](../../README.md), written in Kotlin. SymbioteJS
drives Fabric directly and bypasses RN's own renderer, which means two signals that RN's stock
Android host normally supplies for free — because they hang off `ReactRootView`, a class this
project's surface never instantiates — go missing. iOS needs no equivalent package: its two
counterparts (`RCTKeyboardObserver`, `RCTSettingsManager`/`NSUserDefaults`) are global native
observers RN already ships, independent of which renderer drives the view tree.

## What it re-provides

- **`KeyboardObserverModule`** (native module name `KeyboardObserver`) — Android's only built-in
  keyboard-event source is `ReactRootView.CustomGlobalLayoutListener`, which the bridgeless
  `ReactSurfaceView` this project uses never triggers, so `keyboardDidShow`/`keyboardDidHide`
  never fire. This module re-derives the same signal from an
  `OnApplyWindowInsetsListener` on the activity's decor view, reading the IME inset directly
  (rather than `getRootWindowInsets()`, whose *consumed* insets read `0` under `adjustResize`
  while the keyboard is up) and emitting the same `keyboardDidShow`/`Hide` payload shape RN's JS
  `Keyboard` module already listens for. `@symbiotejs/react`'s `Keyboard` resolves the
  `KeyboardObserver` module name on both iOS and Android, so the JS side stays platform-uniform
  and unchanged.
- **`SettingsManagerModule`** (native module name `SettingsManager`) — RN's `Settings` API wraps
  iOS `NSUserDefaults` and has no stock Android implementation (`Settings.js` routes non-iOS
  platforms to a fallback that warns and returns `null`). This module claims the
  `SettingsManager` name on Android too and backs it with `SharedPreferences`, mirroring the iOS
  native surface (`getConstants().settings` seeds the initial snapshot, `setValues`/`deleteValues`
  persist, external writes re-broadcast through a `settingsUpdated` device event, suppressed for
  the module's own writes — the same `_ignoringUpdates` pattern as `RCTSettingsManager`).
- **`SymbioteAndroidPackage`** — the single `ReactPackage` that registers both modules with
  autolinking. A plain legacy `ReactPackage` works under the New Architecture via TurboModule
  interop, so no codegen spec is needed for either module.

## No JS/TS API of its own

This package ships no JavaScript or TypeScript — it is pure native autolinking. A consuming
Android app adds `@symbiotejs/android` as an ordinary dependency (`react-native.config.js`
declares its Android `sourceDir` and the `SymbioteAndroidPackage` import/instance), and RN's
Gradle autolinking picks it up automatically. There is nothing to import from JS: the modules
are consumed transparently through `@symbiotejs/react`'s existing `Keyboard` and `Settings`
wrappers, which simply find a real native module on Android where they previously found none.

## Where it's wired

See [`adapters/react/README.md`](../../adapters/react/README.md#android) — the Android canary
in `examples/react` links this package for its emulator run (`npm run android`).
