// Runtime guards shared across the navigation package's core. Centralizes what used to be ~11
// independent copies of the same `typeof value === 'object' && value !== null` check scattered
// across core and every adapter (route-param merges, persisted-JSON validation, vnode-prop
// narrowing, gesture-event field reads) - several of which had silently drifted on array
// handling, one excluding arrays, another not, for the same kind of check.
//
// Excludes arrays: every current call site (route params, persisted navigator-state JSON,
// touch-event objects, vnode props) only ever receives a genuine plain object, never a bare list
// standing in for one - so `Array.isArray` narrows out a real footgun (a malformed persisted
// value shaped like `[]` would otherwise pass this guard and fail confusingly deeper in, on a
// missing `.key`/`.name` field, instead of here) at zero cost to the realistic inputs.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Mirrors @react-navigation's CommonActions.setParams: a shallow merge onto the current params,
// but only when both sides are genuine plain objects - an array (or any other non-record) on
// either side means a clean replace instead, never a numeric-key-mangled merge. Shared by
// navigator-state.ts (Stack) and tab-router-state.ts (Tabs) so the two reducers can't drift on
// this rule independently.
export function mergeParams(current: unknown, incoming: unknown): unknown {
  return isRecord(current) && isRecord(incoming) ? { ...current, ...incoming } : incoming;
}
