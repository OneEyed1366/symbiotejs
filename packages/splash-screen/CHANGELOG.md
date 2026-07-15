# @symbiote-native/splash-screen

## 3.0.0

### Patch Changes

- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

- 56ef0d9: Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
  `LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
  into a package's tarball at pack/publish time when the package has none of its own — confirmed
  against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
  `package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
  own license check was missing on all eleven packages.
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
- Updated dependencies [56ef0d9]
- Updated dependencies [f43fe5b]
  - @symbiote-native/angular@0.6.0
  - @symbiote-native/engine@0.1.7
  - @symbiote-native/components@0.2.6
  - @symbiote-native/react@0.2.7
  - @symbiote-native/vue@0.3.7

## 2.0.0

### Patch Changes

- 6010442: Move `@symbiote-native/engine` from `dependencies` to `peerDependencies` (`>=0.1.0`) in every adapter and every package that imports engine internals, matching the existing `react`/`react-native` singleton-peer treatment. Engine holds module-scope singleton state — the node-identity `BRAND` symbol `isSymbioteNode`/`createElement` share, and the WeakMap-based commit mirror — that MUST be the same module instance everywhere it's touched. As a regular `dependencies` entry, each package independently resolved (and, once published via pkg.pr.new at a different point in the same session, independently pinned) its own copy of engine; inside a standalone `npm install` outside the pnpm workspace (`examples/*`), npm cannot dedupe distinct commit-pinned canary URLs, so multiple copies of engine landed side by side in `node_modules`, each with its own `BRAND` symbol.

  This surfaced as Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/`cancelSearch`) silently no-op'ing: `SearchBarRefDirective` reads the native node via `ElementRef.nativeElement` (created by `@symbiote-native/angular`'s own copy of `createElement`) and checks it with `@symbiote-native/navigation`'s own copy of `isSymbioteNode` — a genuine cross-package identity check that only Angular's ref-attachment shape happens to make (React/Vue's search-bar ref is a callback-prop resolved inside the SAME `createElement` call, so it never crosses a package boundary). `isSymbioteNode` returned `false` despite the object being a real, correctly-shaped native node — a different engine module's `BRAND` symbol, not a missing one — so the ref's `.current` stayed `null` forever, silently.

  Root-caused live via `mobile-mcp` device interaction (native search-bar tap fired `onFocus` correctly; imperative ref-driven buttons did not) plus a throwaway diagnostic patch of the installed `node_modules` copy dumping `Object.getOwnPropertySymbols(node).length` — confirmed exactly one (foreign) symbol present, not zero. `@symbiote-native/engine` now resolves to one singleton instance per consuming app, the same way `react`/`react-native` already do.

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

## 1.0.0

### Patch Changes

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

## 0.1.4

### Patch Changes

- Updated dependencies [090c789]
  - @symbiote-native/vue@0.3.4

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
