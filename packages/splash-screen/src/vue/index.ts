// @symbiote-native/splash-screen/vue: the Vue entry over the framework-agnostic core.
// hide/isVisible carry zero lifecycle and are re-exported verbatim; useHideAnimation
// wraps HideAnimationController + computeHideAnimationStyles with Vue's own reactivity
// (composables/use-hide-animation.ts) — mirrors the lifecycle-bucket naming convention
// of adapters/vue/src/composables (never `hooks/`, that's React's term).

export { hide, isVisible } from '../core';
export { useHideAnimation } from './composables/use-hide-animation';
export type { IHideAnimationConfig, IHideAnimationResult, IManifest, IHideConfig } from '../core';
