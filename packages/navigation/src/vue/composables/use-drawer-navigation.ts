// Twin of use-stack-navigation.ts, narrowing to a Drawer handle instead.

import { computed } from '@vue/runtime-core';
import type { ComputedRef } from '@vue/runtime-core';
import type { IDrawerNavigatorHandle } from '../../core';
import { isDrawerNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation';
import type { INavigationHandle } from './use-navigation';

export type IDrawerNavigationHandle = IDrawerNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useDrawerNavigation(): ComputedRef<IDrawerNavigationHandle> {
  const navigation = useNavigation();
  return computed(() => {
    const value = navigation.value;
    if (!isDrawerNavigatorHandle(value)) {
      throw new Error(
        'useDrawerNavigation() was called from a component whose nearest navigator is not a Drawer. ' +
          'Use useNavigation() instead if this component can render under more than one navigator kind.',
      );
    }
    return value;
  });
}
