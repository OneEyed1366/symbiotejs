# @symbiote-native/css-parser

## 0.2.3

### Patch Changes

- 39bcaaf: Fix a false `UNRESOLVED` hit in the build's ESM-extension fixer: a doc comment quoting an example import (`` `import styles from './Card.module.css'` ``) matched the same regex the fixer uses to rewrite real relative imports, and since no such file exists on disk it was reported as unresolved and failed the build. The comment now describes the example without the literal import-statement text, so the fixer only ever matches real code.
- 56ef0d9: Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
  `LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
  into a package's tarball at pack/publish time when the package has none of its own — confirmed
  against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
  `package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
  own license check was missing on all eleven packages.

## 0.2.2

### Patch Changes

- 39bcaaf: Fix a false `UNRESOLVED` hit in the build's ESM-extension fixer: a doc comment quoting an example import (`` `import styles from './Card.module.css'` ``) matched the same regex the fixer uses to rewrite real relative imports, and since no such file exists on disk it was reported as unresolved and failed the build. The comment now describes the example without the literal import-statement text, so the fixer only ever matches real code.

## 0.2.1

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.

## 0.2.0

### Minor Changes

- b0f2568: Package Metro/Babel/tsconfig build tooling that previously only lived in the example apps, so a consuming app no longer copies files out of this repo to use these adapters.

  - `@symbiote-native/css-parser`'s `createCssMetroTransformer()` now resolves `@react-native/metro-babel-transformer` itself (a real dependency of this package) instead of requiring the caller to pass it in.
  - `@symbiote-native/vue` ships its `.vue` SFC Metro transformer as `./metro-vue-transformer` (previously only a copy-pasted file in `examples/vue-sfc`).
  - `@symbiote-native/angular` ships `./babel-linker` (wraps `@angular/compiler-cli/linker/babel`), `./tsconfig.angular.base.json` (a base config for a consumer's own `tsconfig.angular.json` to extend), `./metro-config`'s `withSymbioteAngularMetroConfig` (CSS sourceExts + the ngc-outDir style-import redirect), and a `symbiote-angular-dev` bin (a cross-platform replacement for the old per-app `dev-with-watch.sh`, running `ngc --watch` alongside `react-native start`).

## 0.1.1

### Patch Changes

- Update package descriptions to the SymbioteNative brand name.

## 0.1.0

### Minor Changes

- First public release under the @symbiote-native npm scope.
