# @symbiote-native/slider

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
