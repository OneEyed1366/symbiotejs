// Twin of inject-stack-navigation.ts, narrowing to a Tab handle instead.

import type { ITabNavigatorHandle } from '../../core';
import { isTabNavigatorHandle } from '../../core';
import { injectNavigation } from './inject-navigation';
import type { INavigationHandle } from './inject-navigation';

export type ITabNavigationHandle = ITabNavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function injectTabNavigation(): ITabNavigationHandle {
  const navigation = injectNavigation();
  if (!isTabNavigatorHandle(navigation)) {
    throw new Error(
      'injectTabNavigation() was called from a component whose nearest navigator is not a Tab. ' +
        'Use injectNavigation() instead if this component can render under more than one navigator kind.',
    );
  }
  return navigation;
}
