# @symbiote-native/navigation

## 2.0.1

### Patch Changes

- 465c9e8: Clean the ngc output dir before every Angular build, and move the anchor-host registry into a leaf module.

  Composed Angular components (app screens mounted via `NgComponentOutlet`, and statically-tagged
  navigation components like `Stack`) rendered blank on iOS / redboxed on Android
  (`Can't find ViewManager '<selector>'`) under the `.examples/angular` workspace harness, while the
  freshly-built npm/canary `examples/angular` worked. Root cause: `ngc -p` never deletes orphaned outputs,
  so after the renderer moved `src/renderer.ts` → `src/renderer/index.ts` the stale `build/angular/renderer.js`
  lingered and — because a file shadows a folder in Node/Metro resolution — was loaded instead of
  `build/angular/renderer/index.js`. It carried its own inline `ANCHOR_HOST_COMPONENTS` Set, so the bundle had
  two registry modules: `registerComposedComponent` wrote one, `createElement` read the stale other, and every
  composed selector fell through to a raw native view name.

  Every Angular-shipping package (`@symbiote-native/angular`, `@symbiote-native/slider`,
  `@symbiote-native/navigation`, `@symbiote-native/splash-screen`) now runs `rm -rf build` before `ngc`, so a
  stale output can never shadow the current one again. The anchor-host registry
  (`ANCHOR_HOST_COMPONENTS` + `registerComposedComponent` + `isAnchorHostComponent`) also moved out of
  `renderer/index.ts` into a dependency-free leaf module `anchor-host-registry.ts`, reached by a single relative
  import route, as cheap cycle-safety hygiene. Public API unchanged.

- Updated dependencies [465c9e8]
- Updated dependencies [465c9e8]
- Updated dependencies [465c9e8]
- Updated dependencies [465c9e8]
  - @symbiote-native/angular@0.6.1
  - @symbiote-native/components@0.3.0
  - @symbiote-native/react@0.2.8
  - @symbiote-native/vue@0.3.8

## 2.0.0

### Patch Changes

- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- db8ac8e: Add the package README, following the `@symbiote-native/slider`/`@symbiote-native/splash-screen`
  template: what the package wraps and why it can't be a third-party-view wrapper (the
  `react-navigation` UI is React-only, so this is a genuine new shared component instead), install
  instructions, the `core`/`register`/`react`/`vue`/`angular` shape, a `Stack` usage example per
  adapter, and the documented drawer-parity gaps against `@react-navigation/drawer`
  (`react-native-gesture-handler`/`react-native-reanimated` not being dependencies of this
  codebase). The package previously shipped with no README at all.
- 6010442: Fix `package.json`'s `files` allowlist omitting `react-native.config.cjs` and `symbiote-navigation.podspec`, so a real npm/pkg.pr.new install shipped zero native-linking files — CocoaPods autolinking never saw the pod, `RCTThirdPartyComponentsProvider.mm` never got `RNSScreen`/`RNSScreenStack`'s entries, and Fabric fell back to `Unimplemented component: <RNSScreenStack>` at runtime with no build-time error. Now matches the `symbiote-slider`/`symbiote-splash-screen` precedent of listing both files explicitly.

  Also fix `codegenConfig.jsSrcsDir` pointing at `node_modules/react-native-screens/src/fabric` — codegen resolves that path with a plain `lstat` relative to the package's own root, but pnpm never nests a real dependency inside its own package's `node_modules` (it's a symlinked sibling in the `.pnpm` store), so the path never existed and `pod install` died with `ENOENT ... /src` during the codegen step. `jsSrcsDir` now points at a package-local `codegen-specs/` vendored from `react-native-screens` at `prepare` time via the shared `scripts/vendor-codegen-specs.cjs`, matching `symbiote-slider`/`symbiote-splash-screen`.

  Also fix a `react-native-screens` version-skew bug in the vendoring pipeline itself: the catalog entry was a caret range (`^4.25.2`), so this workspace's own `prepare`-time vendoring baked `codegen-specs/` from whatever patch happened to be installed here (4.25.2), while a standalone `npm install` consumer (`examples/*`, outside the pnpm workspace) resolved the newest matching release on the registry (4.26.0) for the _native_ side compiled fresh from their own `node_modules/react-native-screens`. The two silently drifted — our vendored spec never generated `RNSSplitHostColorScheme` (a prop added between 4.25.2 and 4.26.0), but the consumer's native `RNSSplitHostComponentView.mm` referenced it unconditionally, so `pod install`/`xcodebuild` failed with `error: no type named 'RNSSplitHostColorScheme' in namespace 'facebook::react'` — no warning at either version's own install. Fixed by pinning the catalog entry to an exact version (`4.26.0`, no caret) so the vendored snapshot and the version baked into the published `dependencies` field can never diverge again.

  Also modernize `codegenConfig.ios` from the old 7-entry `componentProvider` flat map to the full 26-entry `components` map `react-native-screens@4.26.0` itself now declares, and `react-native.config.cjs`'s Android `componentDescriptors` from 5 stale entries to the current 17, both copied verbatim from `react-native-screens`' own package metadata — the old format under-registered enough of the native surface that Fabric's `RCTThirdPartyComponentsProvider`/`ComponentDescriptor` maps were missing entries a full-tree-vendored build now emits code for.

- 56ef0d9: Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
  `LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
  into a package's tarball at pack/publish time when the package has none of its own — confirmed
  against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
  `package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
  own license check was missing on all eleven packages.
- Updated dependencies [f9569fb]
- Updated dependencies [a2cadf6]
- Updated dependencies [09feeb9]
- Updated dependencies [ad17e8f]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [56ef0d9]
- Updated dependencies [f43fe5b]
  - @symbiote-native/angular@0.6.0
  - @symbiote-native/engine@0.1.7
  - @symbiote-native/components@0.2.6
  - @symbiote-native/react@0.2.7
  - @symbiote-native/vue@0.3.7

## 1.0.0

### Patch Changes

- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- 6010442: Fix `package.json`'s `files` allowlist omitting `react-native.config.cjs` and `symbiote-navigation.podspec`, so a real npm/pkg.pr.new install shipped zero native-linking files — CocoaPods autolinking never saw the pod, `RCTThirdPartyComponentsProvider.mm` never got `RNSScreen`/`RNSScreenStack`'s entries, and Fabric fell back to `Unimplemented component: <RNSScreenStack>` at runtime with no build-time error. Now matches the `symbiote-slider`/`symbiote-splash-screen` precedent of listing both files explicitly.

  Also fix `codegenConfig.jsSrcsDir` pointing at `node_modules/react-native-screens/src/fabric` — codegen resolves that path with a plain `lstat` relative to the package's own root, but pnpm never nests a real dependency inside its own package's `node_modules` (it's a symlinked sibling in the `.pnpm` store), so the path never existed and `pod install` died with `ENOENT ... /src` during the codegen step. `jsSrcsDir` now points at a package-local `codegen-specs/` vendored from `react-native-screens` at `prepare` time via the shared `scripts/vendor-codegen-specs.cjs`, matching `symbiote-slider`/`symbiote-splash-screen`.

  Also fix a `react-native-screens` version-skew bug in the vendoring pipeline itself: the catalog entry was a caret range (`^4.25.2`), so this workspace's own `prepare`-time vendoring baked `codegen-specs/` from whatever patch happened to be installed here (4.25.2), while a standalone `npm install` consumer (`examples/*`, outside the pnpm workspace) resolved the newest matching release on the registry (4.26.0) for the _native_ side compiled fresh from their own `node_modules/react-native-screens`. The two silently drifted — our vendored spec never generated `RNSSplitHostColorScheme` (a prop added between 4.25.2 and 4.26.0), but the consumer's native `RNSSplitHostComponentView.mm` referenced it unconditionally, so `pod install`/`xcodebuild` failed with `error: no type named 'RNSSplitHostColorScheme' in namespace 'facebook::react'` — no warning at either version's own install. Fixed by pinning the catalog entry to an exact version (`4.26.0`, no caret) so the vendored snapshot and the version baked into the published `dependencies` field can never diverge again.

  Also modernize `codegenConfig.ios` from the old 7-entry `componentProvider` flat map to the full 26-entry `components` map `react-native-screens@4.26.0` itself now declares, and `react-native.config.cjs`'s Android `componentDescriptors` from 5 stale entries to the current 17, both copied verbatim from `react-native-screens`' own package metadata — the old format under-registered enough of the native surface that Fabric's `RCTThirdPartyComponentsProvider`/`ComponentDescriptor` maps were missing entries a full-tree-vendored build now emits code for.

- Updated dependencies [f9569fb]
- Updated dependencies [a2cadf6]
- Updated dependencies [09feeb9]
- Updated dependencies [ad17e8f]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [f43fe5b]
  - @symbiote-native/angular@0.5.0
  - @symbiote-native/engine@0.1.6
  - @symbiote-native/components@0.2.5
  - @symbiote-native/react@0.2.6
  - @symbiote-native/vue@0.3.6
