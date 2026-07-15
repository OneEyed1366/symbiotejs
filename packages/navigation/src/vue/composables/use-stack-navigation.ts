// useNavigation() returns a union (IAnyNavigatorHandle) since it doesn't know which navigator
// mounted the calling component. When a component genuinely knows it only ever renders under a
// Stack, this composable narrows that union ONCE, here, so call sites never write their own
// 'push' in navigation check. Vue twin of react/hooks/use-stack-navigation.ts.

import { computed } from '@vue/runtime-core';
import type { ComputedRef } from '@vue/runtime-core';
import type { INavigatorHandle } from '../../core';
import { isStackNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation';
import type { INavigationHandle } from './use-navigation';

export type IStackNavigationHandle = INavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useStackNavigation(): ComputedRef<IStackNavigationHandle> {
  const navigation = useNavigation();
  return computed(() => {
    const value = navigation.value;
    if (!isStackNavigatorHandle(value)) {
      throw new Error(
        'useStackNavigation() was called from a component whose nearest navigator is not a Stack. ' +
          'Use useNavigation() instead if this component can render under more than one navigator kind.',
      );
    }
    return value;
  });
}
