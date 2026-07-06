---
"@symbiote-native/test-utils": patch
---

Fix the published `build/index.js` re-exporting `./fake-fabric` without a `.js` extension, which Node's ESM loader rejects outside a bundler (`Cannot find module '.../build/fake-fabric'`) — the compiled package has never worked when imported from a real npm install, only when Metro/Vitest resolved `src/*.ts` directly. `core/test-utils/build` was missing from the `fix-esm-extensions` script's argument list; every other publishable package with build output was already covered.
