---
"@symbiote-native/vue": patch
---

Fix the Metro SFC transformer crashing on a type-only `defineProps<X>()` where `X` is imported from another file (relative or bare-specifier) — `compileScript` had no `fs` access and no registered TypeScript resolver, so it threw "No fs option provided" / "TypeScript is required" instead of resolving the prop type.
