---
"@symbiote-native/react": patch
---

Rewrite Switch and ActivityIndicator's React lifecycle from a `createX(platform)`
factory returning an anonymous closure into a top-level `useXLogic` hook plus a
top-level named component per platform file. The factory shape defeats React
Compiler's component/hook detection, which only walks top-level declarations;
this rewrite has no effect on props, behavior, or exports, but lets `Activity-
Indicator` compile cleanly under `babel-plugin-react-compiler` and lets `Switch`'s
own wrapper compile (its stateful hook still can't, due to a ref flowing through
`passthrough` into a cross-package render call — see the `symbiote-add-component`
skill §7 for the full investigation).
