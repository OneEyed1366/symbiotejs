---
"@symbiote-native/engine": patch
---

Split `commit.ts` into three modules by responsibility: `platform-color.ts` (color processing), `fabric-props.ts` (generic Fabric-prop translation), and `commit.ts` itself (reconciler + imperative instance API). Also breaks the real `commit.ts <-> process-*` dependency cycle by having `process-box-shadow`/`process-filter`/`process-background-image` import `processColor` from `platform-color.ts` directly, and consolidates the `ActionSheetManager` native-module contract so `share/index.ios.ts` imports it from `action-sheet-ios/index.ts` instead of redeclaring it. No behavior change.
