// Mirrors @react-navigation's useFocusEffect; Vue twin of react/hooks/use-focus-effect.ts.
// React's version requires memoizing `effect` (useCallback) since a new identity re-subscribes
// it like any other useEffect dependency. That doesn't apply here: Vue's setup() runs once, so
// `effect` is read once at composable-call time and closed over directly by onMounted/onUnmounted -
// there's no dependency array to go stale.

import { onMounted, onUnmounted } from '@vue/runtime-core';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function useFocusEffect(effect: () => (() => void) | void): void {
  const scope = requireNavigationScope('useFocusEffect');

  let cleanup: (() => void) | void;
  let unsubscribeFocus: (() => void) | undefined;
  let unsubscribeBlur: (() => void) | undefined;

  const runEffect = (): void => {
    cleanup = effect();
  };
  const runCleanup = (): void => {
    cleanup?.();
    cleanup = undefined;
  };

  onMounted(() => {
    const { emitter } = scope.value;
    unsubscribeFocus = emitter.addListener(NAVIGATION_EVENT_FOCUS, runEffect);
    unsubscribeBlur = emitter.addListener(NAVIGATION_EVENT_BLUR, runCleanup);
  });

  onUnmounted(() => {
    unsubscribeFocus?.();
    unsubscribeBlur?.();
    runCleanup();
  });
}
