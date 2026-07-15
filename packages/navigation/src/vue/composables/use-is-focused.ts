// Mirrors @react-navigation's useIsFocused; Vue twin of react/hooks/use-is-focused.ts.
// Starts `false` rather than guessing from stack position: the route's emitter only fires 'focus'
// once RNSScreen's native onAppear lands (stack.ts) or the screen mounts focused (tabs.ts/drawer.ts) -
// a screen genuinely isn't focused at the instant it mounts, the same async gap real native
// transitions have.

import { onMounted, onUnmounted, ref } from '@vue/runtime-core';
import type { Ref } from '@vue/runtime-core';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function useIsFocused(): Ref<boolean> {
  const scope = requireNavigationScope('useIsFocused');
  const isFocused = ref(false);
  let unsubscribeFocus: (() => void) | undefined;
  let unsubscribeBlur: (() => void) | undefined;

  onMounted(() => {
    const { emitter } = scope.value;
    unsubscribeFocus = emitter.addListener(NAVIGATION_EVENT_FOCUS, () => {
      isFocused.value = true;
    });
    unsubscribeBlur = emitter.addListener(NAVIGATION_EVENT_BLUR, () => {
      isFocused.value = false;
    });
  });

  onUnmounted(() => {
    unsubscribeFocus?.();
    unsubscribeBlur?.();
  });

  return isFocused;
}
