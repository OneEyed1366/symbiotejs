// Thin useEffect wrapper: runs `effect` while the route is focused and runs its own returned
// cleanup on blur - exactly React.useEffect's contract, just re-armed on every focus/blur pair
// instead of once on mount - mirrors @react-navigation's useFocusEffect. Callers should memoize
// `effect` (React.useCallback), same requirement the upstream hook documents, since a new
// `effect` identity re-subscribes here like any other useEffect dependency change.

import { useEffect } from 'react';
import type { EffectCallback } from 'react';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { useRequiredNavigationContext } from '../navigation-context';

export function useFocusEffect(effect: EffectCallback): void {
  const context = useRequiredNavigationContext('useFocusEffect');
  const { emitter } = context;

  useEffect(() => {
    let cleanup: ReturnType<EffectCallback> | undefined;

    const runEffect = (): void => {
      cleanup = effect();
    };
    const runCleanup = (): void => {
      cleanup?.();
      cleanup = undefined;
    };

    const unsubscribeFocus = emitter.addListener(NAVIGATION_EVENT_FOCUS, runEffect);
    const unsubscribeBlur = emitter.addListener(NAVIGATION_EVENT_BLUR, runCleanup);

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
      runCleanup();
    };
  }, [emitter, effect]);
}
