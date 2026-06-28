// Inlined from react-reconciler/constants. The package ships CommonJS only, so
// importing the subpath under ESM/bundler resolution is fragile; these values
// are stable.
// https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactRootTags.js
// https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactEventPriorities.js

export const LegacyRoot = 0;
export const ConcurrentRoot = 1;

export const NoEventPriority = 0;
export const DiscreteEventPriority = 2;
export const ContinuousEventPriority = 8;
export const DefaultEventPriority = 32;
export const IdleEventPriority = 268435456;
