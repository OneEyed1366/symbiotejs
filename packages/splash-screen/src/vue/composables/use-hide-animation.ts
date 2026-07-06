// Vue lifecycle wiring over the framework-agnostic HideAnimationController + style
// computation (core/). A Vue composable's setup body runs ONCE (unlike a React hook,
// which re-runs every render), so this takes a config GETTER, not a plain value — Vue's
// reactivity tracks whatever reactive refs the getter reads internally and re-runs the
// watchEffect/computed below on their change, mirroring how a React consumer would pass a
// fresh config object on every render.
//
// The controller is a plain local, not a Vue ref: nothing needs Vue to react to the
// controller reference itself (only its methods are called), so wrapping it would only
// add an unnecessary reactive Proxy — same identity discipline as
// `use-color-scheme.ts`'s subscription handle.
import { computed, watchEffect, type ComputedRef } from '@vue/runtime-core';
import {
  computeHideAnimationStyles,
  getHideAnimationConstants,
  HideAnimationController,
  type IHideAnimationConfig,
  type IHideAnimationResult,
} from '../../core';

export function useHideAnimation(
  getConfig: () => IHideAnimationConfig,
): ComputedRef<IHideAnimationResult> {
  const controller = new HideAnimationController(getConfig());
  const constants = getHideAnimationConstants();

  watchEffect(() => {
    controller.updateConfig(getConfig());
  });

  return computed(() => computeHideAnimationStyles(getConfig(), constants, controller));
}
