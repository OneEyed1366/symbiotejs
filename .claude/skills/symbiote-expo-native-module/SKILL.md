---
name: symbiote-expo-native-module
description: "Symbiote third-party Expo native-MODULE wrapper workflow — read BEFORE wrapping a package built on expo-modules-core (expo-sensors, expo-camera, any Expo Module, not a plain RN NativeModule or codegenNativeComponent view), or before adding expo-modules-core here for the first time. Distinct from symbiote-third-party-native-view (native VIEW, ViewConfig+Descriptor) — this is a native MODULE, zero view, pure EventEmitter/async-function surface. Reference case: sensors package wrapping expo-sensors sdk-57, pilot Accelerometer. Covers: depend on expo-modules-core only, never expo meta-package (own CLI/Metro-config/babel-preset, collides with this repos Metro pipeline); native code NOT vendored (autolinking resolves pnpm symlinks itself); JS ported into our core since upstream hard-imports from expo; autolinking is a one-time app-level native change; permissions ship with the native code; testing mocks the native module, no Fabric harness. Trigger: wrap an expo package, expo-modules-core or autolinking questions."
---

# Symbiote — wrapping a third-party Expo native MODULE (no view, no Descriptor)

A third-party package built on **expo-modules-core** (Expo's own native-module runtime —
Swift/Kotlin "Modules" registered through Expo's own autolinking, not RN's NativeModule/
TurboModule system) is architecturally different from anything else this repo has wrapped.
`expo-sensors`, and packages like it, ship **no native view at all** — every export is a
plain JS class over an EventEmitter (`addListener`, `hasListeners`, `removeAllListeners`) plus
a handful of async functions (`isAvailableAsync`, `getPermissionsAsync`,
`requestPermissionsAsync`, `setUpdateInterval`). There is no `codegenNativeComponent`, no
ViewConfig, no `Descriptor`, no per-adapter descriptor bridge. This skill is the twin of
`symbiote-third-party-native-view` for that shape — read that skill first if the package
you're wrapping has a visible native view; read this one if it doesn't.

Reference case, decided 2026-07 while planning `@symbiote-native/sensors` (wraps
`expo-sensors` sdk-57, pilot component = `Accelerometer` only — the other 7 sensor families
follow later by the same recipe). All facts below were verified by reading the actual
vendored source, not from memory or upstream docs alone: `.vendors/expo` is a shared git
checkout (via the `.vendors` symlink used across other projects too) — read a specific SDK's
files with `git -C .vendors/expo show origin/sdk-57:<path>` after `git -C .vendors/expo fetch
origin sdk-57`; do **not** `git checkout`/switch its branch, that mutates a checkout other
projects also read.

## 1. Dependency scope — `expo-modules-core` directly, never the `expo` meta-package

Expo's own bare-workflow docs say "install `expo` first." Do not. `packages/expo/package.json`
lists 15+ forced `dependencies`, not just a native-module runtime:

```json
"@expo/cli", "@expo/config", "@expo/config-plugins", "@expo/metro", "@expo/metro-config",
"babel-preset-expo", "expo-asset", "expo-constants", "expo-file-system", "expo-font",
"expo-keep-awake", "expo-modules-autolinking", "expo-modules-core", "@ungap/structured-clone", ...
```

`@expo/metro-config` + `babel-preset-expo` is a second, competing Metro/babel pipeline —
this repo already has its own (Vue SFC transformer, Angular AOT linker, the CSS-parser
transform; see the `symbiote-sfc-style-compiler` skill and the root CLAUDE.md Build &
platform section). Installing `expo` risks someone later "helpfully" wiring in
`babel-preset-expo`/`expo/metro-config` per Expo's own docs and silently breaking that
pipeline.

The fix: depend on **`expo-modules-core` only**. It already exports everything a sensor-style
wrapper needs — confirmed by reading `packages/expo-modules-core/src/index.ts` at `sdk-57`:

```ts
export * from './PermissionsInterface';   // PermissionResponse, PermissionExpiration, PermissionStatus
export * from './PermissionsHook';
```

Those are the *only* two things `expo-sensors`' own JS imports from the `expo` package
(`DeviceSensor.ts`: `import { type PermissionResponse, PermissionStatus } from 'expo'`) — so
nothing upstream is actually lost by skipping `expo`.

Version check, not an assumption to carry forward blindly: `packages/expo/
bundledNativeModules.json` at `sdk-57` pins `"react-native": "0.86.0"` — this repo's exact
pinned RN version. That match was a genuine (and load-bearing) surprise for sdk-57; re-verify
it against the target SDK version for every future Expo package, don't assume it holds.

## 2. Do NOT vendor/copy native code — this is a different autolinking mechanism

`symbiote-third-party-native-view` mandates physically copying the wrapped library's native
source into a package-local `.rn-<lib>` folder, because CocoaPods' `source_files` resolution
walks the filesystem with `Dir.glob` and **never crosses a symlink** — and pnpm always hides
the real package behind a `.pnpm` store symlink. That workaround does **not** apply here.

`expo-modules-autolinking` resolves packages through its own JS/Ruby layer, and its
`src/utils.ts` (verified at `sdk-57`) does this before ever handing a path to CocoaPods or
Gradle:

```ts
export const maybeRealpath = async (target: string): Promise<string | null> => {
  try { return await fs.promises.realpath(target); }
  catch { return null; }
};
```

`fs.promises.realpath` resolves the pnpm symlink to the package's real physical directory —
so the podspec/Gradle config `expo-modules-autolinking` generates already points at the real
files, not through a symlink `Dir.glob` would fail to traverse. Confirmed further by reading
the actual `ios/ExpoSensors.podspec`: it declares only `s.dependency 'ExpoModulesCore'` and
`s.source_files = "**/*.{h,m,swift}"` relative to its own directory — nothing about the
wrapper needs to restate or copy that.

**Consequence:** install the real upstream package (e.g. `expo-sensors`) as an ordinary
`dependency` of the wrapper, purely so its native `ios/`/`android/` folders physically exist
in `node_modules` for `use_expo_modules!`/the Android autolinking script to find. Never touch,
copy, or fork those native files. If you catch yourself reaching for the
`.rn-<lib>`-vendoring recipe from the native-view skill while wrapping an
expo-modules-core-based package, stop — that recipe solves a bug this mechanism doesn't have.

Accepted side effect: the upstream package's `peerDependencies` typically list
`{ "expo": "*", "react-native": "*" }` with no `peerDependenciesMeta` marking `expo` optional
— pnpm prints an "unmet peer dependency" warning for `expo` at install time. Cosmetic only
(we never import `expo`'s JS); can be silenced later via root `package.json`
`pnpm.peerDependencyRules` if it becomes noisy enough to matter.

## 3. JS is ported into our own `core`, never imported from upstream

The real upstream JS (e.g. `expo-sensors`' `build/DeviceSensor.js`) does a hard
`import ... from 'expo'` — if `expo` isn't installed (and per §1 it never is here), that
import breaks Metro bundling the moment anything reaches it. So the wrapped package is a
**dependency for its native folder only** — its JS entry point (`main`/`module` in its
`package.json`) is never imported from our code.

Instead, hand-port the class hierarchy into `packages/<lib>/src/core/`, same spirit as
`packages/splash-screen` porting `react-native-bootsplash`'s pure JS into `core/hide.ts` (see
the `components_split_logic_view_lifecycle` invariant in the root CLAUDE.md) — but here the
reason is a concrete hard-import break, not just architectural preference:

- Port the base class (`DeviceSensor`) and each sensor class (`Accelerometer`, …) verbatim,
  changing only the one import line to pull `PermissionResponse`/`PermissionStatus` from
  `expo-modules-core` instead of `expo`.
- Resolve the native module the same way upstream's own one-liner does — e.g.
  `packages/expo-sensors/src/ExponentAccelerometer.ts` is just
  `export default requireNativeModule('ExponentAccelerometer')` from `expo-modules-core`.
  Copy that one line per sensor, not the whole upstream JS tree.

## 4. Autolinking is still required — one-time, app-level, smaller than the `expo` package implies

Skipping the `expo` meta-package does not skip native linking. `use_expo_modules!` (the
Podfile macro) lives in `expo-modules-autolinking`'s own Ruby scripts
(`scripts/ios/autolinking_manager.rb`), **not** in the `expo` package — confirmed by reading
it directly. It scans `node_modules` for `expo-module.config.json`/native-Expo-module
packages via its own JS resolver, independent of whether `expo` itself is present.

Required, once per native host app (not per wrapped package):

| File | Change |
|---|---|
| `ios/Podfile` | add `use_expo_modules!` |
| `android/build.gradle` / `settings.gradle` | apply the `expo-modules-autolinking` Gradle script |
| `ios/*/AppDelegate.swift` | minimal Expo bootstrap hook |
| `android/.../MainApplication.kt` | minimal Expo bootstrap hook |

Per this repo's convention, wire this into `.examples/<app>` only, never the public
`examples/<app>` — see `symbiote-dev-examples`. Once wired once at the app level, any *future*
expo-modules-core-based package is auto-discovered with zero further app changes — unlike the
per-package `react-native.config.cjs`/podspec proxy the native-view skill requires for every
new RN-CLI-autolinked wrapper.

**iOS — done and verified end-to-end (2026-07, accelerometer pilot).** Three separate hard
requirements surfaced that the original plan didn't anticipate; all three are reproduced
directly in `.examples/react/ios/Podfile` rather than worked around:

1. **`use_expo_modules!` itself has to be reproduced, not just called.** It isn't a Podfile
   DSL method `expo-modules-autolinking` exposes — that thin wrapper (`def
   use_expo_modules!; Expo::AutolinkingManager.new(...); end`) normally ships in the `expo`
   package's own `scripts/autolinking.rb`. Since it has zero expo-package-specific logic —
   it only requires `expo-modules-autolinking`'s own `scripts/ios/autolinking_manager.rb` /
   `xcode_env_generator.rb` and delegates — the Podfile reproduces it verbatim. Gotcha: a
   Podfile is `instance_eval`'d inside `Pod::Podfile`, so reopening the class as `module
   Expo` (no leading `::`) silently creates `Pod::Podfile::Expo::AutolinkingManager` instead
   of reopening the real top-level class — always `module ::Expo`.

2. **`expo-modules-autolinking`'s own Ruby scripts hardcode `require('expo/bin/autolinking')`
   in THREE separate places**, even though the actual CLI logic is 100% inside
   `expo-modules-autolinking` — `expo/bin/autolinking` is a one-line wrapper
   (`require('expo-modules-autolinking/bin/expo-modules-autolinking')`) that exists purely
   to give these calls a resolution anchor assuming `expo` is installed:
   `Expo::AutolinkingManager#node_command_args` (used by both `resolve` and
   `generate-modules-provider` at `pod install` time), `Expo::PrecompiledModules
   .invoke_autolinking` (a second, independent `resolve` path), and
   `Expo::ProjectIntegrator.generate_support_script`, which renders the `[Expo] Configure
   project` Xcode **build-phase script** — regenerated every `pod install` but *executed on
   every build*, so this one still bites even after a green `pod install`. All three are
   monkey-patched in the Podfile (reopen `module ::Expo`, redefine each method, point the
   require string at `expo-modules-autolinking/bin/expo-modules-autolinking` directly).

3. **`.examples/react/package.json` needs `expo-modules-autolinking` as a direct
   dependency** (now present, pinned to the same `57.0.5` as the catalog) — without it, pnpm
   never hoists it into `.examples/react/node_modules` (`shamefully-hoist` only hoists what's
   actually reachable from a project's own dependency graph), so the Podfile's
   `require.resolve('expo-modules-autolinking/...')` fails even though `packages/sensors`
   itself resolves `expo-sensors`/`expo-modules-core` fine. `expo-sensors`/`expo-modules-core`
   themselves do **not** need to be added — they resolve transitively through
   `@symbiote-native/sensors` exactly as designed; only the autolinking *tool* needed the
   direct edge. Verified: `node .../expo-modules-autolinking/bin/expo-modules-autolinking.js
   resolve --platform ios --json` from `.examples/react` lists `expo-sensors`
   (`AccelerometerModule`, `BarometerModule`, `DeviceMotionModule`, `GyroscopeModule`,
   `MagnetometerModule`, `MagnetometerUncalibratedModule`, `PedometerModule`), each with
   `appDelegateSubscribers: []`.

**pnpm's `auto-install-peers` silently installs `expo` itself — the same accidental-linking
trap as Android above, hit independently on iOS.** `expo-sensors` declares
`peerDependencies: { expo: '*' }` with no `peerDependenciesMeta` marking it optional, so
pnpm's default `auto-install-peers: true` installs a real `expo@57.0.4` (plus its own
`expo-asset`/`expo-constants`/`expo-file-system`/`expo-font`/`expo-keep-awake`/
`@expo/dom-webview`/`@expo/log-box`) — reachable only from `expo-sensors`' own resolution
slot, invisible from any project's `node_modules` listing, but very visible to
`expo-modules-autolinking resolve`, which scans the whole tree regardless of which project
asked. Left un-excluded, all of it gets linked, and the `Expo` pod **fails to build**
(`ExpoModulesCore/ExpoModulesCore.h file not found` — its module map assumes the full `expo`
package's build wiring, which isn't there). Fixed with `use_expo_modules!(exclude: ['expo',
'expo-asset', 'expo-constants', 'expo-file-system', 'expo-font', 'expo-keep-awake',
'@expo/dom-webview', '@expo/log-box'])`. Check every future expo-modules-core package added
here for the same unmarked-optional `expo` peer and extend this list, or the accidental
link + build failure recurs.

**Deployment target: 16.4 in the Podfile AND the Xcode project.** `ExpoSensors.podspec` pins
`s.platforms = { :ios => '16.4' }`, above RN's own `min_ios_version_supported` (`15.1`).
CocoaPods checks pod-vs-target compatibility against the Podfile's `platform :ios, X` line
specifically, not just the pbxproj's `IPHONEOS_DEPLOYMENT_TARGET` — a mismatch there
silently *skips* the pod (`[!] [Expo] ExpoSensors was not linked: requires iOS 16.4 but app
targets 15.1`, a warning not an error, easy to miss). Fixed via `platform :ios,
[min_ios_version_supported.to_f, 16.4].max.to_s` in the Podfile, plus bumping all four
`IPHONEOS_DEPLOYMENT_TARGET` entries (target + project level) in
`Canary.xcodeproj/project.pbxproj`.

**The open question this skill originally posed — resolved: `ExpoAppDelegateSubscriberManager`
alone is NOT sufficient, but `expo-modules-core`-only is still enough; it just takes real new
native code.** `ExpoAppDelegateSubscriberManager` only forwards classic
`UIApplicationDelegate` lifecycle events to modules that register an app-delegate
subscriber — `expo-sensors` registers zero, so it's irrelevant to Accelerometer specifically
(wired anyway, for completeness, since `expo-file-system` needs it and could get linked by
a future package). What actually gates `requireNativeModule('ExponentAccelerometer')` is
installing `global.expo.modules`, the JSI host object `AppContext.prepareRuntime()` creates
(traced: `expo-modules-core/src/requireNativeModule.ts` → `AppContext.swift`'s
`prepareRuntime()`/`installExpoModulesHostObject()`). Upstream, that's triggered from exactly
one place: `packages/expo/ios/AppDelegates/ExpoReactNativeFactory.mm`'s
`host:didInitializeRuntime:`, an `RCTHostDelegate` callback on `expo`'s own
`RCTReactNativeFactory` subclass. That file lives in the `expo` package — but every symbol
it calls (`AppContext`/`EXAppContext`, `EXHostWrapper`, `EXReactSchedulerDispatch`) is
`expo-modules-core`-only (verified by grep across both packages' source trees), so the hook
itself needed reproducing, not importing:

`.examples/react/ios/Canary/SymbioteExpoModulesFactory.h` + `.mm` subclass
`RCTReactNativeFactory` (react-native's own stock factory) and implement
`host:didInitializeRuntime:` — Objective-C++, not Swift, since Swift can't express
`facebook::jsi::Runtime&` directly — creating an `EXAppContext`, wiring the runtime +
`RuntimeSchedulerBinding`, and calling `registerNativeModules`. `AppDelegate.swift`
instantiates `SymbioteExpoModulesFactory` instead of the stock `RCTReactNativeFactory`, and
separately forwards the core `UIApplicationDelegate` lifecycle methods to
`ExpoAppDelegateSubscriberManager`. Wiring this into the app target also needs a new
`SWIFT_OBJC_BRIDGING_HEADER` (`Canary-Bridging-Header.h` — Swift app targets, unlike pod
targets, don't auto-bridge their own ObjC/C++ sources) and matching the access level of
`import ExpoModulesCore` across the target's Swift files (`internal import` — the
autogenerated `ExpoModulesProvider.swift` uses `internal import ExpoModulesCore`, and Swift
errors `ambiguous implicit access level` if another file in the same target imports it with
a different implicit/explicit level).

Verified end-to-end, in this order:
1. `node .../expo-modules-autolinking/bin/expo-modules-autolinking.js resolve --platform ios
   --json` (see point 3 above) → `expo-sensors` and its 7 module classes resolve.
2. `pod install` → green (`84 dependencies from the Podfile and 83 total pods installed`,
   `Expo`/`ExpoAsset`/etc. correctly excluded).
3. `grep -c AccelerometerModule Pods/Pods.xcodeproj/project.pbxproj` → **4** (source-file
   references to the real `AccelerometerModule.swift`, resolved through the pnpm store —
   not copied into `Pods/`, referenced at its original `node_modules/.pnpm/...` path, which
   is why `Pods/ExpoModulesCore`/`Pods/ExpoSensors` folders don't physically exist even
   though the pbxproj correctly references their files).
4. Generated `Pods/Target Support Files/Pods-Canary/ExpoModulesProvider.swift` lists
   `(module: AccelerometerModule.self, name: nil)` among `getModuleClasses()` — proves the
   whole autolinking → codegen pipeline reaches the real module class, not just that a pod
   got installed.
5. `xcodebuild -workspace Canary.xcworkspace -scheme Canary -configuration Debug -destination
   'platform=iOS Simulator,...' build` → **BUILD SUCCEEDED**, 0 errors, real Xcode 26.6
   toolchain, not skipped.
6. `xcrun simctl install` + `launch` on that simulator → launched and stayed alive (no
   crash, no `.ips` report) through the native-bootstrap portion of app launch. JS bundle
   loading wasn't exercised (no Metro server running in this pass, JS core not finished in
   this session) — verify that once `packages/sensors/src/core` + a demo screen exist.

**Android — done and verified 2026-07 (accelerometer pilot).** The premise that "the Gradle-side
plugins live in `expo-modules-autolinking` itself, independent of the `expo` package" turned out
to be **only half true** once the actual Kotlin source was read (`.vendors/expo` at
`origin/sdk-57`, `packages/expo-modules-autolinking/android/expo-gradle-plugin`): the
`expo-autolinking-settings` Gradle plugin (`ExpoAutolinkingSettingsPlugin.kt`) hardcodes
`require.resolve('expo-modules-autolinking/package.json', { paths: [require.resolve('expo/
package.json')] })` to locate its own composite build, and the *shared* command builder every
one of its Gradle actions goes through (`AutolinkingCommandBuilder.baseCommand`, used by both
`SettingsManager`'s `resolve` call and `ExpoAutolinkingSettingsExtension.rnConfigCommand`)
hardcodes `require('expo/bin/autolinking')`. Both are compiled Kotlin, not something a consuming
`settings.gradle` can override — so `expoAutolinking.useExpoModules()` and the
`expo-autolinking-settings` plugin genuinely cannot run without the real `expo` package
installed. This is a hard wall, not a workaround-able inconvenience.

The way through: `expo-module-gradle-plugin` (shipped **inside `expo-modules-core` itself**,
not `expo-modules-autolinking`) already ships a first-class fallback for exactly this situation
— its own `build.gradle.kts` compiles a `withoutAutolinkingPlugin` Kotlin source set (vs.
`withAutolinkingPlugin`) whenever the `expoAutolinkingSettingsPlugin` Gradle extra-property
isn't set, and that fallback's `AutolinkingIntegrationImpl.getExpoDependency()` is just
`project.rootProject.findProject(":$name")` — i.e. it expects the consuming app to `include()`
the Expo module projects itself, by hand. So `.examples/react/android` does exactly that,
without ever touching `expo-autolinking-settings`:

- `settings.gradle`: `pluginManagement {}` (must stay the file's first statement — Gradle
  enforces this at parse time even before a plain `def`) runs `expo-modules-autolinking`'s own
  CLI directly — `node ./node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js
  resolve --platform android --json` (the real entry file, not the `.bin/` shim, which is a
  shell script `node <path>` can't parse as JS) — then filters the JSON to exactly
  `expo-modules-core` + `expo-sensors` before `includeBuild()`-ing `expo-module-gradle-plugin`
  and `include()`-ing the two projects with their real `projectDir`s. The filter matters:
  `expo-sensors`' own `peerDependencies` list `expo: "*"` with no `peerDependenciesMeta` marking
  it optional, so pnpm's `auto-install-peers` default resolves (and, with this repo's
  `shamefully-hoist`, makes filesystem-discoverable) the **entire `expo` meta-package tree** —
  `expo-modules-autolinking`'s resolver walks `node_modules` by directory and reports all of it
  back (`expo`, `@expo/dom-webview`, `@expo/log-box`, `expo-asset`, `expo-constants`,
  `expo-file-system`, `expo-font`, `expo-keep-awake`) alongside the two wanted packages. Verified
  directly: `cd .examples/react && ./node_modules/.bin/expo-modules-autolinking resolve
  --platform android --json` lists all 10; only `expo-modules-core`/`expo-sensors` get
  `include()`-d.
- `android/build.gradle`: added `classpath("expo.modules:expo-module-gradle-plugin")` to the
  root `buildscript { dependencies {} }` block. Needed for a separate reason from the
  `includeBuild()` above — `expo-modules-core/android/build.gradle` and `expo-sensors/android/
  build.gradle` both `import expo.modules.plugin.gradle.ExpoModuleExtension` at the top of the
  file *before* their own `apply plugin: 'expo-module-gradle-plugin'` line runs, and an
  old-style `apply plugin:` only makes an external plugin's classes resolvable for a plain
  Groovy `import` via the classic shared-root-buildscript-classpath convention (the same reason
  `com.android.tools.build:gradle` lives in the root, not per-module) — composite-build
  substitution via `pluginManagement.includeBuild()` alone does not extend to bare `import`
  statements compiled ahead of `apply plugin:`.
- `app/build.gradle`: added `implementation project(':expo-modules-core')` and `implementation
  project(':expo-sensors')`. With no `expo` aggregator project to depend on transitively (that's
  what the real `expo` package's own Android module normally is), `:app` depends on both
  directly.
- `MainApplication.kt`: **does need a change**, but not `ExpoReactHostFactory`/
  `ApplicationLifecycleDispatcher` (both `expo`-package-only classes, confirmed absent from
  `expo-modules-core`/`expo-modules-autolinking`). There's no `expo` aggregator project to
  generate `expo.modules.ExpoModulesPackageList` (the reflection-discovered class
  `ExpoModulesHelper.modulesProvider` looks for) either, since that generation task
  (`GeneratePackagesListTask`, part of `expo-autolinking-plugin`) is applied to the `expo`
  package's own build script, not the app's. The fix is a small hand-written equivalent: a
  private `SensorsModulesProvider : ModulesProvider` (interface: `getModulesMap(): Map<Class<out
  Module>, String?>`) listing `AccelerometerModule::class.java to "ExponentAccelerometer"` (the
  name has to match `AccelerometerModule.definition()`'s `Name("ExponentAccelerometer")`, since
  that's the key expo-modules-core's JS-side `requireNativeModule(...)` resolves by), passed —
  together with a plain `ReactAdapterPackage()` for the classic Permissions/EventEmitter/
  UIManager services — into `expo.modules.adapters.react.ModuleRegistryAdapter` (a normal
  `ReactPackage`, confirmed by reading its source), added to `PackageList(this).packages` the
  same way the file's own pre-existing comment already invites for any package RN's autolinking
  can't reach (`// Packages that cannot be autolinked yet can be added manually here`).
- `MainActivity.kt`: **no change needed**, confirmed by reading `expo-modules-core`'s
  `ReactLifecycleDelegate.kt` — it implements plain RN `LifecycleEventListener` +
  `ActivityEventListener`, both wired up automatically by RN's own bridge for any `NativeModule`
  advertising them (the `NativeModulesProxy` inside `ModuleRegistryAdapter` does), no
  `ReactActivityDelegateWrapper` needed. Also confirmed by reading `AccelerometerModule.kt` and
  `SensorProxy.kt` directly: the accelerometer path has **no runtime-permission request at all**
  (raw hardware-sensor access needs none on Android — `ACTIVITY_RECOGNITION`, which
  `expo-sensors`' manifest does declare, is for the step-counter-based sensors, not
  Accelerometer), so there's no permission-result routing to wire for this pilot either. Revisit
  this file only if/when a sensor family that actually requests a runtime permission
  (`Pedometer`, `DeviceMotion`) gets added.
- **No manifest edit needed.** `expo-sensors`' own `AndroidManifest.xml`
  (`<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION"/>`) merges in
  automatically via the standard Android manifest merger once `expo-sensors` is a real Gradle
  dependency of `:app` — same as any other native Android library dependency.

Verified end-to-end, in this order:
1. `cd .examples/react && ./node_modules/.bin/expo-modules-autolinking resolve --platform
   android --json` → lists `expo-sensors` (and `expo-modules-core`) among the resolved modules.
2. `cd .examples/react/android && ./gradlew projects` → `Root project 'Canary'` lists
   `Project ':expo-modules-core'` and `Project ':expo-sensors'` as real included subprojects,
   alongside `Included build ':expo-module-gradle-plugin'`.
3. `./gradlew :app:assembleDebug` → `BUILD SUCCESSFUL` (233 tasks, real device/simulator-grade
   compile, not headless) — `expo-modules-core` and `expo-sensors` both ran
   `compileDebugKotlin`/native `buildCMakeDebug` successfully.
4. Extracted `classes*.dex` from the produced `app-debug.apk` and grepped for the literal
   strings: `Lexpo/modules/sensors/modules/AccelerometerModule;`,
   `Lexpo/modules/adapters/react/ModuleRegistryAdapter;`, and `Lcom/canary/
   SensorsModulesProvider;` are all present in `classes19.dex` — the real upstream Kotlin
   `AccelerometerModule` and this app's own wiring are both compiled into the shipped APK, not
   just "the build didn't error."

**`SensorsModulesProvider`'s map needs a new entry for EVERY sensor, and this is easy to
forget.** Hit for real (2026-07-16): after porting all 7 remaining sensor families to
`core`/the adapters, the app crashed at runtime with `Cannot find native module 'ExpoBarometer'`
— `getModulesMap()` still only listed `AccelerometerModule`, the one entry from the original
pilot. The Gradle side (`settings.gradle`'s `include()` wiring) links the WHOLE `expo-sensors`
android/ project, so every sensor's `Module` class compiles into the app fine (confirmed
present in the built APK's dex) — but compiling isn't registering. Since there's no `expo`
package to auto-generate the package list, adding a sensor to the JS/core layer does **nothing**
on the Android side by itself; `MainApplication.kt`'s map is hand-maintained and needs one new
`<SensorModule>::class.java to "<its Name(...) string>"` line per sensor, matching each Module's
own `definition() { Name("...") }` exactly (confirmed for all 8: `ExponentAccelerometer`,
`ExpoBarometer`, `ExponentDeviceMotion`, `ExponentGyroscope`, `ExpoLightSensor`,
`ExponentMagnetometer`, `ExponentMagnetometerUncalibrated`, `ExponentPedometer`) — no build
error, no compile warning, only a runtime `Cannot find native module` crash on first use.

None of this required Android SDK/Gradle tooling beyond what a normal RN dev machine already
has (Java 17, `ANDROID_HOME` set, the repo's own `./gradlew`); ANDROID_HOME + Gradle 9.3.1
(via wrapper) were available in the verifying environment, so this was a real build, not a
best-effort static check.

**Two more real iOS build failures surface only at `xcodebuild`, per-app (2026-07-17, wiring the
Vue-TSX canary) — a green `pod install` does not catch either.** Full fix + code, kept in the
howto doc since it's the copy-paste-adaptable source: `expo-native-module-setup.mdx`'s "iOS —
install the runtime hook" section, the two `<Aside type="danger">` blocks.
1. `expo-modules-autolinking`'s `generate_support_script` arity drifts across versions — 57.0.8
   calls it with 4 args (added `target_name`, forwarded as `--target-name`); a Podfile monkey-patch
   copied from an older doc snippet with the old 3-arg signature raises `ArgumentError: wrong
   number of arguments (given 4, expected 3)` on `pod install`. Verify the real arity in your
   installed copy before trusting any doc's exact signature.
2. `SymbioteExpoModulesFactory.h`/`.mm` dropped on disk next to `AppDelegate.swift` are invisible
   to the Xcode project unless it uses Xcode 16 file-system-synchronized groups (check for
   `PBXFileSystemSynchronizedRootGroup` in `project.pbxproj`) — most RN templates still don't, so
   the `.mm` needs an explicit `PBXFileReference` + Sources build-phase membership (via the
   `xcodeproj` gem) or linking fails with `Undefined symbols … _OBJC_CLASS_$_SymbioteExpoModulesFactory`.
   Separately, the app target's own `IPHONEOS_DEPLOYMENT_TARGET` (not just the Podfile's
   `platform :ios` line, which only governs Pod-to-Pod compatibility) must be bumped to match
   `ExpoModulesCore`'s floor once `AppDelegate.swift` imports it directly — otherwise `compiling
   for iOS 15.1, but module 'ExpoModulesCore' has a minimum deployment target of iOS 16.4`.

## 5. Permissions ship with the wrapped native code — do not reimplement

Native permission handling for a sensor family is part of its native module, already
autolinked for free per §2 — not something to write yourself. For `Accelerometer` on iOS:
`packages/expo-sensors/ios/EXMotionPermissionRequester.h/.m` already exists upstream; the app
side only needs an `NSMotionUsageDescription` entry in Info.plist. Android needs its own
runtime permission request. Every sensor family may need its own platform permission string —
check the specific sensor's native folder before assuming Accelerometer's permission shape
generalizes to e.g. Pedometer or DeviceMotion.

## 6. Testing — no Fabric/Descriptor angle at all

Every other wrapper in this repo (`slider`, `splash-screen`) eventually touches a Fabric view,
so this repo's `ADR-0025` `installFabric()`-based headless harness is the default testing
pattern. A pure native-module wrapper has **no view**, so that harness does not apply here —
do not reach for `installFabric()`/`fabric.find`/`fabric.fireEvent` for this shape of package.

The correct precedent is upstream's own test pattern, verified in
`expo-sensors/src/__tests__/Accelerometer-test.native.ts` and
`expo-sensors/mocks/ExponentAccelerometer.ts`: inject a fake native-module object in place of
the real `requireNativeModule` resolution (a plain object with `vi.fn()`/stub
`addListener`/`isAvailableAsync`/`setUpdateInterval`), then assert against it directly —
e.g. `Accelerometer._nativeModule.setUpdateInterval` was called with the right args. No Fabric
fake, no ViewConfig, no `installFabric()`.

**The iOS Simulator has no real IMU/pedometer hardware — `isAvailableAsync()` genuinely
returns `false` there for every CoreMotion-backed sensor (Accelerometer, Gyroscope,
Magnetometer, DeviceMotion) and for `CMPedometer`-backed Pedometer.** A subscription still
succeeds (`addListener` doesn't throw), it just never fires — indistinguishable from "still
waiting for the first reading" unless the UI checks `isAvailableAsync()` separately (verified
2026-07-16 against the sensors pilot's demo screen: every sensor reported `false` on an iPhone
17 / iOS 26.5 Simulator). This is expected, not a wiring bug — real readings require a physical
device. Any demo/smoke screen for a sensor should render the availability check as its own
state, not conflate it with "no reading yet" (see `frontend-ux-best-practices`'s "render every
async state" rule) — otherwise a real bug and this simulator limitation look identical.

## 7. Package shape — mirrors `splash-screen`, not `slider`

Both `splash-screen` and an Expo-native-module wrapper are non-view wrappers; `slider` is a
native-view wrapper and needs ViewConfig/Descriptor bridging that doesn't apply here. Use
`packages/splash-screen/package.json`'s exports map as the literal template:

```
packages/<lib>/
  package.json        exports: "." -> src/core/index.ts, "./react", "./vue", "./angular"
                      dependencies: <upstream-pkg> (native-only, exact version pin),
                                    expo-modules-core
  src/core/           ported base class + per-module class + native-module resolution
                      one-liners, framework-agnostic
  src/react/hooks/    thin lifecycle wrapper (useEffect + addListener/remove)
  src/vue/composables/  thin lifecycle wrapper (ref + onUnmounted)
  src/angular/services/ thin lifecycle wrapper (Injectable, subscribe/unsubscribe)
```

For `@symbiote-native/sensors` specifically: hooks/composables/services ship from day one (not
deferred to a later pass — decided explicitly over a core-only-v1 alternative), iOS+Android only
(upstream's `.web.ts` variants are not ported). First adapter to verify end-to-end (native
linking + hooks on a real/simulated device) is `.examples/react`, per this repo's "prove the
pattern in React first" convention (see the Workstream B pilot-order precedent for
`core/components`); Vue/Angular are wired and demoed afterward using the hooks/composables/
services that already exist from day one.

When porting several sensor families from the same upstream package in one pass, dispatch one
agent per sensor and have none of them touch the shared `core/index.ts`/`react/index.ts`/
`vue/index.ts`/`angular/index.ts` barrels — merge those by hand afterward, otherwise concurrent
agents conflict on the same file.

Beyond the uniform `DeviceSensor` subclass + `addListener`/`setUpdateInterval` recipe, two shape
variants can show up — read these before wrapping the next Expo sensor-shaped module:

- **Platform-split native module (`LightSensor`)**: when upstream ships a real native module on
  one platform and a JS-level stub on the other (`ExpoLightSensor.ts` vs `ExpoLightSensor.ios.ts`
  always reporting unavailable), port it as a FOLDER under `core/native/` following this repo's
  folder-as-module convention (`exponent-light-sensor/{index.ts,index.ios.ts,index.android.ts}`),
  not a flat file — `index.ts` re-exports the stub variant so headless/vitest resolution never
  calls `requireNativeModule` outside a real RN runtime, while Metro still picks the real
  per-platform file at bundle time.
- **Free-function module, not a `DeviceSensor` subclass (`Pedometer`)**: not every Expo sensor
  fits the `addListener`/`setUpdateInterval`/`isAvailableAsync` class shape — `Pedometer` upstream
  is a set of free functions (`watchStepCount`, `getStepCountAsync`, plain permission functions)
  with no shared instance to hang state off. Port it as free functions in `core/pedometer.ts`
  (do NOT force it to extend `DeviceSensor`), and give it a reactive hook/composable/service that
  wraps `watchStepCount` in the same subscribe-on-mount/unsubscribe-on-unmount shape as every
  other sensor's hook, for cross-framework consistency, while leaving the one-shot async functions
  (`getStepCountAsync`, `isAvailableAsync`, permission functions) as plain re-exports from the
  barrel — no adapter-specific wrapping needed since they're already framework-agnostic.

## 8. Resolved — `DeviceMotion` on Android needed NO native fix; three debugging-methodology
   traps caused the whole illusion of a bug

**tl;dr: the original, completely unpatched `expo-sensors` DeviceMotion module works fine,
including nested fields (`rotation`, `acceleration`, …).** After a very long live investigation
(2026-07-16) that patched away half the Kotlin module across 7 rebuild iterations chasing phantom
causes, then built and A/B-tested a full native fork over a real (but ultimately unrelated)
upstream bug, a clean-slate control test (`adb uninstall` + fresh `installDebug`, fully reverted
to upstream's unpatched `DeviceMotionModule.kt`) rendered **perfectly** — nested fields included.
Nothing needed fixing in `expo-sensors` itself, and no native fork was needed either. All three
things that actually mattered were debugging-methodology bugs on our side (two in how we tested
the device, one in the demo's own JS), documented below so nobody repeats them.

### Trap 1 — `adb shell dumpsys window windows`'s `surface=[…]` line is NOT a reliable signal here

Do not use it. Early in the investigation, `surface=[0,0][0,0]` under a window's `Frames:` block
was treated as proof of a corrupted window. Directly disproven: the SAME field reads
`surface=[0,0][0,0]` on a build that renders **perfectly fine** (full colored UI, confirmed by
screenshot) — it is apparently always zero in this dump format/Android version regardless of
actual window state. **The only trustworthy signal is an actual screenshot**
(`mobile_take_screenshot` or equivalent). Never cite this dumpsys field as evidence again.

### Trap 2 — `./gradlew installDebug` does NOT clear app/task state; `adb uninstall` does

This is the big one, and it's why the investigation spent hours chasing native-code causes that
didn't exist. `installDebug` performs an incremental reinstall — it does NOT wipe the app's
persistent data or Android's cached Activity/task state, unlike a genuine `adb uninstall` +
fresh install. Across ~7 rebuild-and-`installDebug` cycles (each testing a different Kotlin
change: interval-unit fix, removing Choreographer, removing the legacy UIManager bridge hop,
stubbing `getOrientation()`, cutting 5 sensors down to 1, renaming the module, lazy-vs-eager
`Gravity` read), the demo screen kept rendering blank regardless of which change was live —
because whatever corrupted state got created by the FIRST test run never got cleared, and every
subsequent `terminate + launch` cycle just resumed from that same stale state. The moment a
genuine `adb uninstall com.canary` was run before reinstalling, the ORIGINAL, fully unpatched
upstream module rendered correctly first try. **Any Android UI/rendering bug investigation in
this project must start with `adb uninstall <package>` before the first test, and repeat it
before trusting any "still broken" or "now fixed" result** — an `installDebug`-only cycle can
give false results in both directions for a long time.

### Trap 3 (the real culprit) — reading a nested DeviceMotion field without a null-check throws,
   and that throw somehow produces a blank screen with ZERO visible exception anywhere

A third differential looked, at first, like a genuine native-layer bug: rendering
`deviceMotion.interval` (a flat field) always worked; rendering `deviceMotion.rotation.alpha` (a
field nested one level, under `rotation`/`acceleration`/`accelerationIncludingGravity`/
`rotationRate`) reliably blanked the screen, with a healthy `pre-completeRoot`/`incremental
created=N` commit log right up to the point of failure and then silence — no JS error, no native
crash, no logcat exception either way.

That evidence pattern led to a real, independently-verified finding: `expo-modules-core`'s
`JSTypeConverterProvider.convertToJSValue` (`android/.../types/JSTypeConverterProvider.kt`)
branches on `useExperimentalConverter` for `Map`/`Collection`/`FormattedRecord` but NOT for
`Bundle`:
```kotlin
is Bundle -> value.toJSValue(containerProvider)   // always legacy — no useExperimentalConverter check
is Map<*, *> -> if (useExperimentalConverter) value.toJSValueExperimental() else value.toJSValue(containerProvider)
```
This inconsistency is real and still present on `expo/expo`'s `main` branch — confirmed by
reading the source directly, not by inference. **But it turned out to be a red herring for this
bug.** A controlled A/B test (2026-07-16, after building a full native fork of
`DeviceMotionModule.kt` that swaps the nested-Bundle event payload for a plain nested `Map` —
which DOES respect the `useExperimentalConverter` branch) showed **no difference**: the ORIGINAL,
fully unpatched, Bundle-based upstream module rendered the nested `rotation` field perfectly, 4
clean trials in a row (fresh `adb uninstall` + `installDebug` each time), identical to the
forked Map-based version. The `Bundle` vs `Map` converter asymmetry is a real, confirmed
upstream bug — but it never actually manifested as this session's blank screen. Don't waste time
forking `DeviceMotionModule.kt` over it; there's no reproducible symptom that requires it.

**The actual cause, confirmed by fixing it and watching the blank screen disappear**: the
JS-side test/demo code read `deviceMotion.rotation.alpha` unconditionally, guarded only by
`deviceMotion && …` — not `deviceMotion?.rotation && …`. Android's `TYPE_ROTATION_VECTOR` sensor
(and, by the same logic, `TYPE_LINEAR_ACCELERATION`/`TYPE_ACCELEROMETER`/`TYPE_GYROSCOPE`) does
not necessarily have a reading ready by the time the very first `deviceMotionDidUpdate` event
fires — `DeviceMotionModule.kt`'s `eventsToMap()` only includes a nested key
(`rotation`/`acceleration`/…) once that underlying sensor has produced at least one event, so the
FIRST emitted event can legitimately arrive without a `rotation` key at all. Reading
`.rotation.alpha` on that first event throws a plain `TypeError: Cannot read property 'alpha' of
undefined` — but in this project's setup that throw is **not visible anywhere**: no LogBox
redbox, no `ReactNativeJS` error line in logcat, no native crash, just a healthy commit log right
up to the throw and then a permanently blank screen. Why the exception is swallowed this
silently was NOT root-caused further (candidate: the event-listener callback path from
`expo-modules-core`'s `EventEmitter`/`emitEvent` into JS may not route through React's normal
error boundary); flagged as an open question for whoever revisits this.

**Fix**: guard the optional-chain all the way to the field actually being read, not just the
top-level object — `deviceMotion?.rotation && …`, not `deviceMotion && …deviceMotion.rotation…`.
Applies to any nested DeviceMotion field, on any adapter, not just this demo screen.

This also retroactively explains the earlier-documented "5-for-5 nested fails vs. 4-for-4 flat
succeeds" pattern from earlier in the same investigation — that trial run almost certainly hit
this exact same unguarded read, not a native marshaling bug. Lesson generalized: a "no exception
anywhere, but the screen goes blank and rendering stops" symptom in this project is NOT proof of
a native-layer bug — check for an unguarded nested-optional read in the JS/TS consumer FIRST,
before spending hours on the native side. The `Bundle`/`Map` converter asymmetry above is real
and worth reporting upstream someday, but treat "screen went blank" as a JS null-safety bug by
default, not a JSI marshaling bug, until proven otherwise by an actual A/B test like this one.

Current demo state (`.examples/react`'s `SensorsScreen.tsx`): `DeviceMotion` is wired in as a
first-class sensor alongside Accelerometer/Gyroscope/Magnetometer/Pedometer, on the fully
unpatched native module — no `pnpm patch`, no native fork. It renders both `interval` (flat) and
`rotation` (nested, `deviceMotion?.rotation`-guarded) live on screen.

### iOS Simulator quirks observed on this same demo — neither is a bug

- **Readings drift on a physically stationary Simulator.** `CMMotionManager` on iOS Simulator
  (since roughly Xcode 11) synthesizes device-motion data with its own noise/drift rather than
  returning frozen zeros — there is no real IMU to read from. Expected simulator behavior, not a
  sign our JS/native wiring is doing anything wrong.
- **`rotation.beta` can read `NaN`, with `alpha`/`gamma` roughly mirrored (`alpha ≈ -gamma`).**
  `expo-sensors`' iOS `DeviceMotionModule.swift` reports `rotation.{alpha,beta,gamma}` straight
  from `CMAttitude.{yaw,pitch,roll}` — Euler angles, which have an inherent gimbal-lock
  singularity as `pitch` (`beta`) approaches ±90°: `yaw`/`roll` become mathematically
  indistinguishable (only their sum/difference is recoverable — hence the mirrored `alpha`/
  `gamma`), and float rounding can push the underlying `asin(...)` argument just past ±1,
  yielding `NaN` for `pitch`. This is inherent to Euler-angle attitude representations (the same
  singularity `DeviceOrientationEvent.beta`/`.gamma` have on the web) — not a bug in
  `expo-sensors` or in this project's wrapper. A consumer that wants to display it defensively
  can check `Number.isNaN(...)`; there is nothing to fix natively.

## Still-open execution checklist (nothing below has shipped yet)

1. `packages/sensors/package.json` + `tsconfig.json`; add to root `tsconfig.json` references
   and `vitest.config.ts` include.
2. Port `core/device-sensor.ts`, per-sensor core class + native-module resolution + types, the
   `react/hooks`/`vue/composables`/`angular/services` lifecycle wrapper per sensor, and tests
   adapting upstream's mock-native-module pattern (§6) — see §7 for the two shape variants.
3. One-time `.examples/react` native wiring: Podfile `use_expo_modules!`, Android Gradle
   autolinking apply, `NSMotionUsageDescription` in Info.plist, AppDelegate/MainApplication
   bootstrap, Android runtime permission — see §4 (`SymbioteExpoModulesFactory` on iOS) and the
   dedicated Android section above this checklist.
4. Verify: `pod install` then grep `Pods.xcodeproj/project.pbxproj` for the native module
   class; Android Gradle autolinking generation succeeds; `xcodebuild`/`gradlew assembleDebug`
   both build; simulator install+launch with no crash.
5. Demo screen in `.examples/react`, confirm on simulator/device (final word per ADR-0012 —
   real device, not headless).
6. Wire the same hooks/composables/services into `.examples/vue-*` and `.examples/angular`.

## References

- `symbiote-third-party-native-view` — the native-VIEW sibling skill; read it first if the
  package you're wrapping has a `codegenNativeComponent`. The `.rn-<lib>` vendoring recipe and
  the CocoaPods symlink-glob gotcha it documents do **not** apply to expo-modules-core-based
  packages (§2 above).
- `packages/splash-screen` — the package-shape template (exports map, core/adapter split) for
  a non-view wrapper.
- `symbiote-dev-examples` — why native wiring goes in `.examples/<app>`, never the public
  `examples/<app>`.
- `symbiote-sfc-style-compiler` / root CLAUDE.md Build & platform section — this repo's own
  Metro pipeline, the reason `expo`'s own Metro config/babel preset must never be installed.
- `.vendors/expo` — shared git checkout across projects via the `.vendors` symlink; read a
  specific SDK's files with `git -C .vendors/expo show origin/sdk-57:<path>` (fetch the ref
  first if missing), never `git checkout`/switch its branch.
