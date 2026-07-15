// Angular injection function: runs `effect` while the route is focused and runs its own returned
// cleanup on blur - exactly a plain effect's contract, just re-armed on every focus/blur pair
// instead of once on construction - mirrors @react-navigation's useFocusEffect. Named `effect` for
// API parity with the React/Vue twins, NOT Angular's own `effect()` reactive primitive (this
// callback re-runs on focus/blur events, not on a signal dependency change) - callers should keep
// `effect` referentially stable across calls they don't intend to change (this function is called
// once per component construction, nothing here re-subscribes automatically otherwise).

import { DestroyRef, inject } from '@angular/core';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { requireNavigationContext } from '../navigation-context.service';

export type IFocusEffectCallback = () => (() => void) | void;

export function injectFocusEffect(effect: IFocusEffectCallback): void {
  const context = requireNavigationContext('injectFocusEffect');
  const destroyRef = inject(DestroyRef);

  let cleanup: ReturnType<IFocusEffectCallback>;

  const runEffect = (): void => {
    cleanup = effect();
  };
  const runCleanup = (): void => {
    cleanup?.();
    cleanup = undefined;
  };

  const unsubscribeFocus = context.emitter.addListener(NAVIGATION_EVENT_FOCUS, runEffect);
  const unsubscribeBlur = context.emitter.addListener(NAVIGATION_EVENT_BLUR, runCleanup);

  destroyRef.onDestroy(() => {
    unsubscribeFocus();
    unsubscribeBlur();
    runCleanup();
  });
}
