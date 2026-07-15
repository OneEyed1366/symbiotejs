---
"@symbiote-native/slider": patch
"@symbiote-native/splash-screen": patch
---

Pin the wrapped native library (`@react-native-community/slider`, `react-native-bootsplash`) to an exact version instead of a caret range in the workspace catalog these packages publish with. Both vendor that library's codegen JS specs into a published `codegen-specs/` snapshot at `prepare` time (`scripts/vendor-codegen-specs.cjs`); a caret range let a standalone consumer's own `npm install` silently resolve a newer native side than whatever version the snapshot was baked from, risking the exact class of build failure already hit and fixed for `@symbiote-native/navigation`/`react-native-screens` (`error: no type named 'RNS...' in namespace 'facebook::react'`) — no drift observed yet for these two, but the pin closes the gap before it happens.
