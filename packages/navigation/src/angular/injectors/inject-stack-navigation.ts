// injectNavigation() returns a union (IAnyNavigatorHandle) since it doesn't know which navigator
// mounted the calling component. When a component genuinely knows it only ever renders under a
// Stack, this injector narrows that union ONCE, here, so call sites never write their own
// 'push' in navigation check. Angular twin of react/hooks/use-stack-navigation.ts.

import type { INavigatorHandle } from '../../core';
import { isStackNavigatorHandle } from '../../core';
import { injectNavigation } from './inject-navigation';
import type { INavigationHandle } from './inject-navigation';

export type IStackNavigationHandle = INavigatorHandle &
  Pick<INavigationHandle, 'addListener' | 'getParent'>;

export function injectStackNavigation(): IStackNavigationHandle {
  const navigation = injectNavigation();
  if (!isStackNavigatorHandle(navigation)) {
    throw new Error(
      'injectStackNavigation() was called from a component whose nearest navigator is not a ' +
        'Stack. Use injectNavigation() instead if this component can render under more than one ' +
        'navigator kind.',
    );
  }
  return navigation;
}
