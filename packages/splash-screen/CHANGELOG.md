# @symbiote-native/splash-screen

## 0.1.3

### Patch Changes

- Updated dependencies [706e52f]
  - @symbiote-native/components@0.2.3
  - @symbiote-native/engine@0.1.4
  - @symbiote-native/react@0.2.4
  - @symbiote-native/vue@0.3.3
  - @symbiote-native/angular@0.3.3

## 0.1.2

### Patch Changes

- 471e14b: Fix RN codegen failing with `ENOENT: no such file or directory, lstat '.../splash-screen/node_modules/react-native-bootsplash/src/specs'` for any real npm/pnpm install of this package. `codegenConfig.jsSrcsDir` pointed at `node_modules/react-native-bootsplash/src/specs`, assuming react-native-bootsplash is nested inside this package's own `node_modules` — true for a pnpm workspace member (which gets a real nested `node_modules`), but never true for a package installed from the registry (pnpm places its dependencies as siblings in the enclosing store directory, not nested inside it). Fixed by vendoring the spec files into this package's own `codegen-specs/` at `prepare` time (a new `vendor-codegen-specs.cjs` step) and pointing `jsSrcsDir` there instead.
- 3908234: Fix `symbiote-splash-screen.podspec` failing `pod install` under pnpm with `Invalid Podfile file` / `No such file or directory @ rb_check_realpath_internal - ./ios`. The podspec resolved `react-native-bootsplash` from `__dir__`, which under pnpm is the app-facing `node_modules` symlink, not the real `.pnpm` store directory where `react-native-bootsplash` actually sits as a flat sibling — walking up from the symlink never reaches it. Fixed by resolving from `File.realpath(__dir__)` instead.

## 0.1.1

### Patch Changes

- d738bc5: Add `@symbiote-native/splash-screen`, wrapping `react-native-bootsplash` behind the one-dependency native proxy pattern with framework-agnostic core plus React, Vue, and Angular bindings.
  - @symbiote-native/angular@0.3.2
  - @symbiote-native/react@0.2.3
  - @symbiote-native/vue@0.3.2
  - @symbiote-native/engine@0.1.3
