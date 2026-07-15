// Angular injection function: subscribes to the route's focus/blur pair and returns a Signal of
// whether it's currently focused - mirrors @react-navigation's useIsFocused. Starts `false` rather
// than guessing from stack position: a route's emitter only fires 'focus' once the navigator's own
// appear/mount signal lands (Stack: RNSScreen's native onAppear; Tab/Drawer: the synthesized
// mount-time emit), so a screen genuinely isn't focused yet at the instant it's constructed.

import { DestroyRef, inject, signal, type Signal } from '@angular/core';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { requireNavigationContext } from '../navigation-context.service';

export function injectIsFocused(): Signal<boolean> {
  const context = requireNavigationContext('injectIsFocused');
  const destroyRef = inject(DestroyRef);
  const isFocused = signal(false);

  const unsubscribeFocus = context.emitter.addListener(NAVIGATION_EVENT_FOCUS, () =>
    isFocused.set(true),
  );
  const unsubscribeBlur = context.emitter.addListener(NAVIGATION_EVENT_BLUR, () =>
    isFocused.set(false),
  );
  destroyRef.onDestroy(() => {
    unsubscribeFocus();
    unsubscribeBlur();
  });

  return isFocused.asReadonly();
}
