# @symbiote-native/angular

## 0.5.0

### Minor Changes

- ad17e8f: Add `@symbiote-native/angular/babel-register-composed`, a Babel plugin (composes into Metro's `babel.config.js`, ahead of `babel-linker`) that reads `selector` off every compiled `ɵɵngDeclareComponent(...)` and auto-calls `registerComposedComponent` for every composed component in the bundle, skipping the closed set of real Fabric intrinsics. Makes manual `registerComposedComponent(...)` calls at each composed component's own definition unnecessary going forward — `ANCHOR_HOST_COMPONENTS` no longer needs a hand-maintained entry for every new composed component, adapter-owned, third-party, or app-authored.

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- a2cadf6: Extract `AnimatedImage`'s ~100 lines of duplicated leaf-lifecycle orchestration (`reconcile`/`bindNode`/`attachEvents`/`detachEvents`) — copy-pasted from `AnimatedComponentBase` because `AnimatedImage` must extend `ImageBase` instead — into a shared `AnimatedLeafBinder` (composition instead of inheritance). Both classes now hold one as a field and delegate to it; no behavior change.
- 09feeb9: Fix Angular's `AnimatedScrollView` never applying `ScrollView`'s base style (`overflow: 'scroll'` + per-axis `flexDirection`) - its bespoke template built props by hand instead of going through `selectScrollIntrinsics`, so on iOS Fabric never clipped the scroll view's content to its own frame (Android was unaffected since its native `ViewGroup` clips regardless of the style prop). The inner content view now also gets `contentStyle` from the same intrinsics selection, mirroring the real `ScrollView`'s `contentProps` getter.
- 6010442: Fix `symbiote-angular-dev.cjs` spawning `ngc --watch` against a tsconfig whose `angularCompilerOptions.basePath` chokidar recursively watches — previously the project root, a sibling of `ios`/`android`'s tens of thousands of generated files, crashing with `EMFILE: too many open files, watch`. The script now resolves the real tsconfig's `basePath` and, if it's relative, writes a throwaway absolute-basePath override config into the app's own `build/` directory before spawning watch mode — `@angular/compiler-cli`'s incremental-recompile path throws `TS500: ... path is not absolute` otherwise on the second file change onward, even though the cold compile tolerates a relative `basePath` fine.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- Updated dependencies [39bcaaf]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [6010442]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
  - @symbiote-native/css-parser@0.2.2
  - @symbiote-native/engine@0.1.6
  - @symbiote-native/components@0.2.5

## 0.4.0

### Minor Changes

- ad17e8f: Add `@symbiote-native/angular/babel-register-composed`, a Babel plugin (composes into Metro's `babel.config.js`, ahead of `babel-linker`) that reads `selector` off every compiled `ɵɵngDeclareComponent(...)` and auto-calls `registerComposedComponent` for every composed component in the bundle, skipping the closed set of real Fabric intrinsics. Makes manual `registerComposedComponent(...)` calls at each composed component's own definition unnecessary going forward — `ANCHOR_HOST_COMPONENTS` no longer needs a hand-maintained entry for every new composed component, adapter-owned, third-party, or app-authored.

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- a2cadf6: Extract `AnimatedImage`'s ~100 lines of duplicated leaf-lifecycle orchestration (`reconcile`/`bindNode`/`attachEvents`/`detachEvents`) — copy-pasted from `AnimatedComponentBase` because `AnimatedImage` must extend `ImageBase` instead — into a shared `AnimatedLeafBinder` (composition instead of inheritance). Both classes now hold one as a field and delegate to it; no behavior change.
- 09feeb9: Fix Angular's `AnimatedScrollView` never applying `ScrollView`'s base style (`overflow: 'scroll'` + per-axis `flexDirection`) - its bespoke template built props by hand instead of going through `selectScrollIntrinsics`, so on iOS Fabric never clipped the scroll view's content to its own frame (Android was unaffected since its native `ViewGroup` clips regardless of the style prop). The inner content view now also gets `contentStyle` from the same intrinsics selection, mirroring the real `ScrollView`'s `contentProps` getter.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
  - @symbiote-native/engine@0.1.5
  - @symbiote-native/components@0.2.4

## 0.3.3

### Patch Changes

- Updated dependencies [706e52f]
  - @symbiote-native/components@0.2.3
  - @symbiote-native/engine@0.1.4

## 0.3.2

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.
- Updated dependencies [46a4f27]
  - @symbiote-native/components@0.2.2
  - @symbiote-native/css-parser@0.2.1
  - @symbiote-native/engine@0.1.3

## 0.3.1

### Patch Changes

- 204901b: Fix `tsconfig.angular.base.json` to extend `@react-native/typescript-config` (now a real dependency of this package), restoring RN-specific compiler settings that were dropped when this base config was first packaged. The AOT build itself already worked without them, but consumers extending this base config for their own tsconfig lost the RN TypeScript baseline every React Native + Angular app needs.
- Updated dependencies [c66082c]
  - @symbiote-native/engine@0.1.2
  - @symbiote-native/components@0.2.1

## 0.3.0

### Minor Changes

- b0f2568: Package Metro/Babel/tsconfig build tooling that previously only lived in the example apps, so a consuming app no longer copies files out of this repo to use these adapters.

  - `@symbiote-native/css-parser`'s `createCssMetroTransformer()` now resolves `@react-native/metro-babel-transformer` itself (a real dependency of this package) instead of requiring the caller to pass it in.
  - `@symbiote-native/vue` ships its `.vue` SFC Metro transformer as `./metro-vue-transformer` (previously only a copy-pasted file in `examples/vue-sfc`).
  - `@symbiote-native/angular` ships `./babel-linker` (wraps `@angular/compiler-cli/linker/babel`), `./tsconfig.angular.base.json` (a base config for a consumer's own `tsconfig.angular.json` to extend), `./metro-config`'s `withSymbioteAngularMetroConfig` (CSS sourceExts + the ngc-outDir style-import redirect), and a `symbiote-angular-dev` bin (a cross-platform replacement for the old per-app `dev-with-watch.sh`, running `ngc --watch` alongside `react-native start`).

### Patch Changes

- Updated dependencies [b0f2568]
  - @symbiote-native/css-parser@0.2.0

## 0.2.0

### Minor Changes

- ab42ee8: Add a zero-config host bootstrap (`bootstrapHost` in `@symbiote-native/components`, plus `registerApp` / `createApp` / `bootstrapApplication` per adapter) that wires the native-host seams and AppRegistry in one call, collapsing the manual per-app wiring every canary previously repeated.

### Patch Changes

- Updated dependencies [ab42ee8]
  - @symbiote-native/components@0.2.0

## 0.1.1

### Patch Changes

- Update package descriptions to the SymbioteNative brand name.
- Updated dependencies
  - @symbiote-native/engine@0.1.1
  - @symbiote-native/components@0.1.1
  - @symbiote-native/css-parser@0.1.1

## 0.1.0

### Minor Changes

- First public release under the @symbiote-native npm scope.

### Patch Changes

- Updated dependencies
  - @symbiote-native/engine@0.1.0
  - @symbiote-native/components@0.1.0
  - @symbiote-native/css-parser@0.1.0
