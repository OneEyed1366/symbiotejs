// Twin of use-stack-navigation.ts, narrowing to a Tab handle instead. See that file's header for
// why this exists: it hides the union-narrowing guard inside the library instead of every call site.

import type { ITabNavigatorHandle } from '../../core';
import { isTabNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation';
import type { INavigationHandle } from './use-navigation';

export type ITabNavigationHandle = ITabNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useTabNavigation(): ITabNavigationHandle {
  const navigation = useNavigation();
  if (!isTabNavigatorHandle(navigation)) {
    throw new Error(
      'useTabNavigation() was called from a component whose nearest navigator is not a Tab. ' +
        'Use useNavigation() instead if this component can render under more than one navigator kind.',
    );
  }
  return navigation;
}
