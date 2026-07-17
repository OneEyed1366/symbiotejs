---
"@symbiote-native/components": minor
"@symbiote-native/react": patch
"@symbiote-native/vue": patch
"@symbiote-native/angular": patch
---

Extract the VirtualizedList orchestration into a shared, framework-agnostic `reduceList` state
machine in `@symbiote-native/components`. Every list adapter (React, Vue, Angular) previously
re-implemented the same after-commit effect skeleton — window recompute, `onEndReached`/
`onStartReached` gating, viewability, batch fill, `maintainVisibleContentPosition`, the imperative
scrolls — in its own reactive dialect, so the decision predicates (`last === count - 1`,
`first === 0`, the batch-fill catch-up test, the viewability guards) lived three times and could
drift. That logic is now one pure `reduceList(state, action) -> { state, effects }`; each adapter
only maps native events to actions, holds one state cell, and executes the returned effects. Adds
`reduceList`, `createInitialListState`, and `listEffectSignature` (plus their types) to the public
`@symbiote-native/components` surface. Adapter prop surfaces and runtime behavior are unchanged —
the rewrite is structural.
