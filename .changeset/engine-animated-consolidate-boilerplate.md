---
"@symbiote-native/engine": patch
---

Consolidate `Animated`'s duplicated boilerplate: `interpolate()` now has a single real implementation on `AnimatedNode` (`graph.ts`), injected into `interpolation-node.ts` via a registered factory, removing seven duplicate overrides across `value.ts`/`operators.ts`/etc. `AnimatedAddition`/`Subtraction`/`Multiplication`/`Division` now share a private `AnimatedBinaryOp` base for their `__attach`/`__detach`/`__makeNative` wiring instead of each reimplementing it. No behavior change. Existing tests pass unmodified, with added coverage for the shared boilerplate itself.
