---
"@symbiote-native/engine": patch
---

Extract a shared `type-guards.ts` (`isRecord`/`isBoolean`/`isNumber`/`isString`) out of roughly twenty independently-reimplemented copies scattered across the engine, standardizing on the stricter, array-excluding `isRecord` definition. No call site's runtime behavior changes - no input previously relied on the looser, array-permissive check.
