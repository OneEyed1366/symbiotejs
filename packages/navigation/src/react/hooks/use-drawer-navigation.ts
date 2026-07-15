// Twin of use-stack-navigation.ts, narrowing to a Drawer handle instead. See that file's header
// for why this exists: it hides the union-narrowing guard inside the library instead of every call site.

import type { IDrawerNavigatorHandle } from '../../core';
import { isDrawerNavigatorHandle } from '../../core';
import { useNavigation } from './use-navigation';
import type { INavigationHandle } from './use-navigation';

export type IDrawerNavigationHandle = IDrawerNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function useDrawerNavigation(): IDrawerNavigationHandle {
  const navigation = useNavigation();
  if (!isDrawerNavigatorHandle(navigation)) {
    throw new Error(
      'useDrawerNavigation() was called from a component whose nearest navigator is not a Drawer. ' +
        'Use useNavigation() instead if this component can render under more than one navigator kind.',
    );
  }
  return navigation;
}
