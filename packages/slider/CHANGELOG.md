# @symbiote-native/slider

## 4.0.0

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- 4e02c48: Angular's `Slider` no longer self-registers as an anchor host at module load — `@symbiote-native/angular/babel-register-composed` now covers it automatically, the same as every other composed Angular component. A consuming app must wire that Babel plugin into its `babel.config.js` (see the `angular-adapter-build` skill) for `Slider` to render correctly under Angular.
- 6010442: Pin the wrapped native library (`@react-native-community/slider`, `react-native-bootsplash`) to an exact version instead of a caret range in the workspace catalog these packages publish with. Both vendor that library's codegen JS specs into a published `codegen-specs/` snapshot at `prepare` time (`scripts/vendor-codegen-specs.cjs`); a caret range let a standalone consumer's own `npm install` silently resolve a newer native side than whatever version the snapshot was baked from, risking the exact class of build failure already hit and fixed for `@symbiote-native/navigation`/`react-native-screens` (`error: no type named 'RNS...' in namespace 'facebook::react'`) — no drift observed yet for these two, but the pin closes the gap before it happens.
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

## 3.0.0

### Patch Changes

- f9569fb: Fix `adapters/angular/src/renderer.ts` hardcoding `examples/angular`'s own demo-component selectors (and the third-party `Slider`) into its `ANCHOR_HOST_COMPONENTS` set — an infra layer knowing app/third-party names is a layer-direction violation. `registerComposedComponent` (now exported from the public barrel) is the existing self-registration escape hatch; `Slider` and the affected demo components now call it themselves instead of the adapter hardcoding their names.
- 4e02c48: Angular's `Slider` no longer self-registers as an anchor host at module load — `@symbiote-native/angular/babel-register-composed` now covers it automatically, the same as every other composed Angular component. A consuming app must wire that Babel plugin into its `babel.config.js` (see the `angular-adapter-build` skill) for `Slider` to render correctly under Angular.
- Updated dependencies [f9569fb]
- Updated dependencies [a2cadf6]
- Updated dependencies [09feeb9]
- Updated dependencies [ad17e8f]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [1791d13]
- Updated dependencies [f43fe5b]
  - @symbiote-native/angular@0.4.0
  - @symbiote-native/engine@0.1.5
  - @symbiote-native/components@0.2.4
  - @symbiote-native/react@0.2.5
  - @symbiote-native/vue@0.3.5

## 2.0.6

### Patch Changes

- Updated dependencies [090c789]
  - @symbiote-native/vue@0.3.4

## 2.0.5

### Patch Changes

- b68dfdb: Fix iOS/Android codegen failing under pnpm with `ENOENT ... @react-native-community/slider/src`. `codegenConfig.jsSrcsDir` pointed at `node_modules/@react-native-community/slider/src`, a nested path that pnpm's isolated store never creates (the native slider is a symlinked sibling, not nested). Vendor the native component's spec sources into a package-local `codegen-specs/` at `prepare` time and point `jsSrcsDir` there — the same fix already applied to `@symbiote-native/splash-screen`.

## 2.0.4

### Patch Changes

- Updated dependencies [706e52f]
  - @symbiote-native/components@0.2.3
  - @symbiote-native/engine@0.1.4
  - @symbiote-native/react@0.2.4
  - @symbiote-native/vue@0.3.3
  - @symbiote-native/angular@0.3.3

## 2.0.3

### Patch Changes

- d738bc5: Fix the published package missing `react-native.config.cjs` and `symbiote-slider.podspec` (omitted from `files`), which left iOS with no native `RNCSliderComponentView` to autolink and rendered the slider as `Unimplemented component: <RNCSlider>` in any app installing the package from npm.
  - @symbiote-native/angular@0.3.2
  - @symbiote-native/react@0.2.3
  - @symbiote-native/vue@0.3.2
  - @symbiote-native/engine@0.1.3

## 2.0.2

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.
- Updated dependencies [46a4f27]
  - @symbiote-native/angular@0.3.2
  - @symbiote-native/react@0.2.3
  - @symbiote-native/vue@0.3.2
  - @symbiote-native/components@0.2.2
  - @symbiote-native/engine@0.1.3

## 2.0.1

### Patch Changes

- Updated dependencies [204901b]
- Updated dependencies [c66082c]
  - @symbiote-native/angular@0.3.1
  - @symbiote-native/react@0.2.2
  - @symbiote-native/vue@0.3.1
  - @symbiote-native/engine@0.1.2
  - @symbiote-native/components@0.2.1

## 2.0.0

### Patch Changes

- Updated dependencies [b0f2568]
  - @symbiote-native/vue@0.3.0
  - @symbiote-native/angular@0.3.0
  - @symbiote-native/react@0.2.1

## 1.0.0

### Patch Changes

- Updated dependencies [ab42ee8]
  - @symbiote-native/components@0.2.0
  - @symbiote-native/react@0.2.0
  - @symbiote-native/vue@0.2.0
  - @symbiote-native/angular@0.2.0

## 0.1.1

### Patch Changes

- Update package descriptions to the SymbioteNative brand name.
- Updated dependencies
  - @symbiote-native/engine@0.1.1
  - @symbiote-native/components@0.1.1
  - @symbiote-native/react@0.1.1
  - @symbiote-native/vue@0.1.1
  - @symbiote-native/angular@0.1.1

## 0.1.0

### Minor Changes

- First public release under the @symbiote-native npm scope.

### Patch Changes

- Updated dependencies
  - @symbiote-native/engine@0.1.0
  - @symbiote-native/components@0.1.0
  - @symbiote-native/react@0.1.0
  - @symbiote-native/vue@0.1.0
  - @symbiote-native/angular@0.1.0
