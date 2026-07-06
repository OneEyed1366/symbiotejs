import { hide } from './hide';
import type { IHideAnimationConfig } from './types';

type IReadinessState = {
  layoutReady: boolean;
  logoReady: boolean;
  brandReady: boolean;
  userReady: boolean;
  animate: () => void;
  animateHasBeenCalled: boolean;
};

// Faithful port of react-native-bootsplash's useHideAnimation readiness gate (its
// src/index.ts): hide() fires exactly once, after layout + both images (if requested) +
// the caller all report ready, then the caller's own fade-out `animate()` runs. logoReady/
// brandReady are captured ONCE at construction (mirrors the original's useRef factory,
// evaluated only on first render) — a config that later drops its logo/brand source does
// NOT retroactively flip readiness back on, only updateConfig's animate/userReady do.
export class HideAnimationController {
  private readonly readiness: IReadinessState;

  constructor(config: IHideAnimationConfig) {
    this.readiness = {
      layoutReady: false,
      logoReady: config.logo == null,
      brandReady: config.manifest.brand == null || config.brand == null,
      userReady: config.ready ?? true,
      animate: config.animate,
      animateHasBeenCalled: false,
    };
  }

  updateConfig(config: IHideAnimationConfig): void {
    this.readiness.animate = config.animate;
    this.readiness.userReady = config.ready ?? true;
    this.maybeRunAnimate();
  }

  readonly onContainerLayout = (): void => {
    this.readiness.layoutReady = true;
    this.maybeRunAnimate();
  };

  readonly onLogoLoadEnd = (): void => {
    this.readiness.logoReady = true;
    this.maybeRunAnimate();
  };

  readonly onBrandLoadEnd = (): void => {
    this.readiness.brandReady = true;
    this.maybeRunAnimate();
  };

  private maybeRunAnimate(): void {
    const state = this.readiness;

    if (
      state.layoutReady &&
      state.logoReady &&
      state.brandReady &&
      state.userReady &&
      !state.animateHasBeenCalled
    ) {
      state.animateHasBeenCalled = true;
      hide({ fade: false })
        .then(() => state.animate())
        .catch(() => {});
    }
  }
}
