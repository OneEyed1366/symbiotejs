// Twin of use-stack-navigation.ts, narrowing to a Tab handle instead.

import { computed } from '@vue/runtime-core';
import type { ComputedRef } from '@vue/runtime-core';
import type { ITabNavigatorHandle } from '../../core';
import { isTabNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation';
import type { INavigationHandle } from './use-navigation';

export type ITabNavigationHandle = ITabNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useTabNavigation(): ComputedRef<ITabNavigationHandle> {
  const navigation = useNavigation();
  return computed(() => {
    const value = navigation.value;
    if (!isTabNavigatorHandle(value)) {
      throw new Error(
        'useTabNavigation() was called from a component whose nearest navigator is not a Tab. ' +
          'Use useNavigation() instead if this component can render under more than one navigator kind.',
      );
    }
    return value;
  });
}
