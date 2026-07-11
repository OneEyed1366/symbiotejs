---
"@symbiote-native/react": patch
---

Fix React's `StatusBar` duplicating `core/engine`'s native-module driving logic (`applyStatusBarProps`, `statusBarImperative`, `statusBarCurrentHeight`) instead of calling it, same as Vue and Angular already do. The iOS and Android modules now delegate to the shared engine functions — same public behavior, ~150 fewer lines of duplicated `getNativeModule`/setter-call logic.
