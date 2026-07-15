---
paths:
  - "adapters/vue/src/**/*.ts"
  - "packages/*/src/vue/**/*.ts"
---

# Vue lifecycle components — attrs must go through `normalizeVueAttrs`

Vue does NOT camelCase `$attrs` (only declared `props`, which this codebase never
declares). Reading a multi-word option (`drawerPosition`, `screenOptions`, `initialRouteName`,
`contentContainerStyle`, ...) off raw `attrs` silently drops any kebab-case-authored SFC
template value. Before reading anything off a setup context's `attrs`, invoke the
`vue-adapter-attrs-normalization` skill — the fix is one line:
`const attrs = normalizeVueAttrs(rawAttrs);` right after destructuring, imported from
`@symbiote-native/vue`.
