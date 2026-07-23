---
paths:
  - "packages/*/package.json"
---

# Wrapping an expo-modules-core package is NOT the native-proxy-view recipe

If the wrapped upstream library is built on `expo-modules-core` (an Expo Module —
`expo-sensors`, `expo-camera`, etc.) rather than a plain RN NativeModule or a
`codegenNativeComponent` view: depend on **`expo-modules-core` only**, never the
`expo` meta-package (it drags its own CLI/Metro-config/babel-preset). Do **not**
apply the `.rn-<lib>` native-vendoring workaround from `native-proxy-package-files.md`
— `expo-modules-autolinking` resolves pnpm symlinks to their real path itself, so
the wrapped package's native folder autolinks straight from `node_modules`,
untouched. Port the JS into the wrapper's own `core/` instead of importing
upstream's (it hard-imports from `expo`, which is never installed here). Full
mechanics, verified source citations, and the open execution checklist: the
`symbiote-expo-native-module` skill.
