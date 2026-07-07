---
"@symbiote-native/slider": patch
---

Fix iOS/Android codegen failing under pnpm with `ENOENT ... @react-native-community/slider/src`. `codegenConfig.jsSrcsDir` pointed at `node_modules/@react-native-community/slider/src`, a nested path that pnpm's isolated store never creates (the native slider is a symlinked sibling, not nested). Vendor the native component's spec sources into a package-local `codegen-specs/` at `prepare` time and point `jsSrcsDir` there — the same fix already applied to `@symbiote-native/splash-screen`.
