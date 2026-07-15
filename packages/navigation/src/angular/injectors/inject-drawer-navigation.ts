// Twin of inject-stack-navigation.ts, narrowing to a Drawer handle instead.

import type { IDrawerNavigatorHandle } from '../../core';
import { isDrawerNavigatorHandle } from '../../core';
import { injectNavigation } from './inject-navigation';
import type { INavigationHandle } from './inject-navigation';

export type IDrawerNavigationHandle = IDrawerNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function injectDrawerNavigation(): IDrawerNavigationHandle {
  const navigation = injectNavigation();
  if (!isDrawerNavigatorHandle(navigation)) {
    throw new Error(
      'injectDrawerNavigation() was called from a component whose nearest navigator is not a ' +
        'Drawer. Use injectNavigation() instead if this component can render under more than one ' +
        'navigator kind.',
    );
  }
  return navigation;
}
