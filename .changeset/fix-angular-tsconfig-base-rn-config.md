---
"@symbiote-native/angular": patch
---

Fix `tsconfig.angular.base.json` to extend `@react-native/typescript-config` (now a real dependency of this package), restoring RN-specific compiler settings that were dropped when this base config was first packaged. The AOT build itself already worked without them, but consumers extending this base config for their own tsconfig lost the RN TypeScript baseline every React Native + Angular app needs.
