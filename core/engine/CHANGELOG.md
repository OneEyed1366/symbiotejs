# @symbiote-native/engine

## 0.1.6

### Patch Changes

- 1791d13: Consolidate `Animated`'s duplicated boilerplate: `interpolate()` now has a single real implementation on `AnimatedNode` (`graph.ts`), injected into `interpolation-node.ts` via a registered factory, removing seven duplicate overrides across `value.ts`/`operators.ts`/etc. `AnimatedAddition`/`Subtraction`/`Multiplication`/`Division` now share a private `AnimatedBinaryOp` base for their `__attach`/`__detach`/`__makeNative` wiring instead of each reimplementing it. No behavior change. Existing tests pass unmodified, with added coverage for the shared boilerplate itself.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- 1791d13: Fix `LayoutAnimation`'s `resolveUIManager` carrying a dead fallback native-module name (`'FabricUIManager'`) that can never resolve on a real device: RN never registers a TurboModule under that name. It now mirrors React Native's actual two-mechanism resolution: read `globalThis.nativeFabricUIManager`'s layout-animation capability directly first (Fabric's JSI global slot, not a TurboModule), then fall back to the single correctly-named `getNativeModule('UIManager')`.
- 1791d13: Extract a shared `type-guards.ts` (`isRecord`/`isBoolean`/`isNumber`/`isString`) out of roughly twenty independently-reimplemented copies scattered across the engine, standardizing on the stricter, array-excluding `isRecord` definition. No call site's runtime behavior changes - no input previously relied on the looser, array-permissive check.
- 1791d13: Split `commit.ts` into three modules by responsibility: `platform-color.ts` (color processing), `fabric-props.ts` (generic Fabric-prop translation), and `commit.ts` itself (reconciler + imperative instance API). Also breaks the real `commit.ts <-> process-*` dependency cycle by having `process-box-shadow`/`process-filter`/`process-background-image` import `processColor` from `platform-color.ts` directly, and consolidates the `ActionSheetManager` native-module contract so `share/index.ios.ts` imports it from `action-sheet-ios/index.ts` instead of redeclaring it. No behavior change.

## 0.1.5

### Patch Changes

- 1791d13: Consolidate `Animated`'s duplicated boilerplate: `interpolate()` now has a single real implementation on `AnimatedNode` (`graph.ts`), injected into `interpolation-node.ts` via a registered factory, removing seven duplicate overrides across `value.ts`/`operators.ts`/etc. `AnimatedAddition`/`Subtraction`/`Multiplication`/`Division` now share a private `AnimatedBinaryOp` base for their `__attach`/`__detach`/`__makeNative` wiring instead of each reimplementing it. No behavior change. Existing tests pass unmodified, with added coverage for the shared boilerplate itself.
- 1791d13: Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

  - `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
  - `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
  - A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
  - `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
  - `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter - this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.

- 1791d13: Fix `LayoutAnimation`'s `resolveUIManager` carrying a dead fallback native-module name (`'FabricUIManager'`) that can never resolve on a real device: RN never registers a TurboModule under that name. It now mirrors React Native's actual two-mechanism resolution: read `globalThis.nativeFabricUIManager`'s layout-animation capability directly first (Fabric's JSI global slot, not a TurboModule), then fall back to the single correctly-named `getNativeModule('UIManager')`.
- 1791d13: Extract a shared `type-guards.ts` (`isRecord`/`isBoolean`/`isNumber`/`isString`) out of roughly twenty independently-reimplemented copies scattered across the engine, standardizing on the stricter, array-excluding `isRecord` definition. No call site's runtime behavior changes - no input previously relied on the looser, array-permissive check.
- 1791d13: Split `commit.ts` into three modules by responsibility: `platform-color.ts` (color processing), `fabric-props.ts` (generic Fabric-prop translation), and `commit.ts` itself (reconciler + imperative instance API). Also breaks the real `commit.ts <-> process-*` dependency cycle by having `process-box-shadow`/`process-filter`/`process-background-image` import `processColor` from `platform-color.ts` directly, and consolidates the `ActionSheetManager` native-module contract so `share/index.ios.ts` imports it from `action-sheet-ios/index.ts` instead of redeclaring it. No behavior change.

## 0.1.4

### Patch Changes

- 706e52f: Fix `scripts/fix-esm-extensions.mjs` baking a literal `/index.js` extension folder-as-module directory imports (`component-names/`, `share/`, `alert/`, `platform/`, `status-bar/`, `accessibility-info/`, `linking/`, ...) that also carry `index.ios.js`/`index.android.js` siblings. Once the specifier is explicit, Metro's platform-extension layering never runs, so every platform silently resolved to the same (iOS-hardcoded, headless-fallback) file — on Android this surfaced as `Can't find ViewManager 'PullToRefreshView' nor 'RCTPullToRefreshView'` and similar wrong-native-name crashes. The script now detects platform-specific siblings and leaves those specifiers extensionless, matching react-native-builder-bob's own accepted approach for the same tension (Node ESM needs explicit extensions; Metro needs them omitted to layer `.ios`/`.android`/`.native`). Known tradeoff, same as bob: a plain headless Node/ESM import reaching one of these folders directly (bypassing Metro) will fail to resolve — nothing in this repo currently does that.

## 0.1.3

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.

## 0.1.2

### Patch Changes

- c66082c: Fix relative imports missing file extensions in the published `build/` output, which broke every published package for real Node ESM consumers (Vitest, plain `node`, non-Metro bundlers) — `import('@symbiote-native/vue')` failed outright with `ERR_MODULE_NOT_FOUND`. Metro's own resolver is lenient about missing extensions, which is why this went unnoticed until a published package's compiled output was consumed directly through Node's native ESM loader for the first time.

  The fix runs as a post-build step (`scripts/fix-esm-extensions.mjs`, wired into the root `build` script right after `typecheck`) that rewrites relative import specifiers in the already-compiled `build/**/*.js` files. It does not touch `src/*.ts` — Metro's resolver treats an explicit extension as literal (it only layers `.ios`/`.android`/`.native` suffixes on top, unlike `tsc`/Node's `.js`-maps-to-`.ts` resolution), so adding `.js` extensions directly in the TypeScript source breaks Metro's dev-mode resolution of the unbuilt source. Confirmed by reverting an earlier source-level attempt after it broke the local Vue example apps' bundling.

## 0.1.1

### Patch Changes

- Update package descriptions to the SymbioteNative brand name.

## 0.1.0

### Minor Changes

- First public release under the @symbiote-native npm scope.
