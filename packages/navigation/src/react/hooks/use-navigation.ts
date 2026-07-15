// Thin lifecycle wrapper: returns the current screen's navigator handle (push/pop/replace/... for a
// Stack screen, jumpTo/setParams for a Tab screen, openDrawer/... for a Drawer screen) plus
// addListener bound to that route's own emitter - mirrors @react-navigation's
// `navigation.addListener('focus', cb)` surface. All pub/sub logic lives in
// ../../core/navigation-events; this hook only reads NavigationContext and binds identity.

import { useMemo } from 'react';
import type { INavigationEventListener, INavigationEventName } from '../../core';
import { useRequiredNavigationContext } from '../navigation-context';
import type { IAnyNavigatorHandle } from '../navigation-context';

export type INavigationHandle = IAnyNavigatorHandle & {
  addListener: (event: INavigationEventName, listener: INavigationEventListener) => () => void;
  // Walks exactly ONE hop up navigation-context.ts's `parent` chain to the enclosing navigator's
  // handle - e.g. a Tab screen nested inside a Stack screen calling getParent() to push a new
  // Stack route. Callers narrow the union themselves ('push' in parent, etc.). Deliberately NOT
  // react-navigation's getParent(id) (named/targeted ancestor lookup) or a target-based dispatch
  // to a specific nested navigator by name - plain immediate-parent walking is v1 scope; multi-hop
  // ancestry would need each returned handle to carry its own getParent, which the plain
  // per-navigator handle types (INavigatorHandle/ITabNavigatorHandle/IDrawerNavigatorHandle) don't.
  getParent: () => IAnyNavigatorHandle | undefined;
};

export function useNavigation(): INavigationHandle {
  const context = useRequiredNavigationContext('useNavigation');
  const { navigation, emitter, parent } = context;

  return useMemo(
    () => ({
      ...navigation,
      addListener: emitter.addListener,
      getParent: () => parent?.navigation,
    }),
    [navigation, emitter, parent],
  );
}
