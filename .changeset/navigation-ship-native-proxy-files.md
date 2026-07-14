---
"@symbiote-native/navigation": patch
---

Fix `package.json`'s `files` allowlist omitting `react-native.config.cjs` and `symbiote-navigation.podspec`, so a real npm/pkg.pr.new install shipped zero native-linking files — CocoaPods autolinking never saw the pod, `RCTThirdPartyComponentsProvider.mm` never got `RNSScreen`/`RNSScreenStack`'s entries, and Fabric fell back to `Unimplemented component: <RNSScreenStack>` at runtime with no build-time error. Now matches the `symbiote-slider`/`symbiote-splash-screen` precedent of listing both files explicitly.

Also fix `codegenConfig.jsSrcsDir` pointing at `node_modules/react-native-screens/src/fabric` — codegen resolves that path with a plain `lstat` relative to the package's own root, but pnpm never nests a real dependency inside its own package's `node_modules` (it's a symlinked sibling in the `.pnpm` store), so the path never existed and `pod install` died with `ENOENT ... /src` during the codegen step. `jsSrcsDir` now points at a package-local `codegen-specs/` vendored from `react-native-screens` at `prepare` time via the shared `scripts/vendor-codegen-specs.cjs`, matching `symbiote-slider`/`symbiote-splash-screen`.
