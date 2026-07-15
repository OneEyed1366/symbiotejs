# @symbiote-native/test-utils

## 0.1.6

### Patch Changes

- 56ef0d9: Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
  `LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
  into a package's tarball at pack/publish time when the package has none of its own — confirmed
  against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
  `package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
  own license check was missing on all eleven packages.

## 0.1.5

### Patch Changes

- d738bc5: Fix the published `build/index.js` re-exporting `./fake-fabric` without a `.js` extension, which Node's ESM loader rejects outside a bundler (`Cannot find module '.../build/fake-fabric'`) — the compiled package has never worked when imported from a real npm install, only when Metro/Vitest resolved `src/*.ts` directly. `core/test-utils/build` was missing from the `fix-esm-extensions` script's argument list; every other publishable package with build output was already covered.

## 0.1.4

### Patch Changes

- f0589ae: Fix the published `build/index.js` re-exporting `./fake-fabric` without a `.js` extension, which Node's ESM loader rejects outside a bundler (`Cannot find module '.../build/fake-fabric'`) — the compiled package has never worked when imported from a real npm install, only when Metro/Vitest resolved `src/*.ts` directly. `core/test-utils/build` was missing from the `fix-esm-extensions` script's argument list; every other publishable package with build output was already covered.

## 0.1.3

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.

## 0.1.2

### Patch Changes

- ec8036e: Republish with the `build/` directory actually included — the currently published `0.1.1` tarball is missing it entirely (only `package.json`/`README.md`/`LICENSE` shipped), breaking module resolution for every consumer. `pnpm pack` against the current source confirms `build/` is produced correctly; this was a one-off publish gap, not a config bug.

## 0.1.1

### Patch Changes

- e2ba63c: Publish the shared fake-Fabric test harness to npm so examples can depend on it directly instead of a workspace link.
