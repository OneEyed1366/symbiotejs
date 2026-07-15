// Thin useEffect wrapper: subscribes to the route's focus/blur pair and returns whether it's
// currently focused, re-rendering on change - mirrors @react-navigation's useIsFocused. Starts
// `false` rather than guessing from stack position: the route's emitter only fires 'focus' once
// RNSScreen's native onAppear actually lands (stack.ts), so a screen genuinely isn't focused yet
// at the instant it mounts - same async gap real native transitions have.

import { useEffect, useState } from 'react';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { useRequiredNavigationContext } from '../navigation-context';

export function useIsFocused(): boolean {
  const context = useRequiredNavigationContext('useIsFocused');
  const { emitter } = context;
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const unsubscribeFocus = emitter.addListener(NAVIGATION_EVENT_FOCUS, () => setIsFocused(true));
    const unsubscribeBlur = emitter.addListener(NAVIGATION_EVENT_BLUR, () => setIsFocused(false));
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [emitter]);

  return isFocused;
}
