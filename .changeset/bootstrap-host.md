---
"@symbiote-native/components": minor
"@symbiote-native/react": minor
"@symbiote-native/vue": minor
"@symbiote-native/angular": minor
---

Add a zero-config host bootstrap (`bootstrapHost` in `@symbiote-native/components`, plus `registerApp` / `createApp` / `bootstrapApplication` per adapter) that wires the native-host seams and AppRegistry in one call, collapsing the manual per-app wiring every canary previously repeated.
