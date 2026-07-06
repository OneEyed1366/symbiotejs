// @symbiote-native/splash-screen/react: the React entry over the framework-agnostic core.
// hide/isVisible carry zero lifecycle and are re-exported verbatim; useHideAnimation wraps
// HideAnimationController + computeHideAnimationStyles with React's own lifecycle
// (hooks/use-hide-animation.ts) — mirrors the lifecycle-bucket naming convention of
// adapters/react/src/hooks (never `composables`, that's Vue's term).

export { hide, isVisible } from '../core';
export { useHideAnimation } from './hooks/use-hide-animation';
export type { IHideAnimationConfig, IHideAnimationResult, IManifest, IHideConfig } from '../core';
