---
"@symbiote-native/splash-screen": patch
---

Fix `symbiote-splash-screen.podspec` failing `pod install` under pnpm with `Invalid Podfile file` / `No such file or directory @ rb_check_realpath_internal - ./ios`. The podspec resolved `react-native-bootsplash` from `__dir__`, which under pnpm is the app-facing `node_modules` symlink, not the real `.pnpm` store directory where `react-native-bootsplash` actually sits as a flat sibling — walking up from the symlink never reaches it. Fixed by resolving from `File.realpath(__dir__)` instead.
