// hide()/isVisible() carry zero framework dependency — re-exported verbatim from core, same as
// every other adapter. HideAnimationService is the Angular-only lifecycle half; the state
// machine, style computation, and native-constants read all live in core, shared with React/Vue.
export { hide, isVisible } from '../core';
export { HideAnimationService } from './services/hide-animation.service';
export type { IHideAnimationConfig, IHideAnimationResult, IManifest, IHideConfig } from '../core';
