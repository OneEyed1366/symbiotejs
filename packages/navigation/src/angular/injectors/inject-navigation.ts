// Angular injection function (calls `inject()`, so it must run in an injection context - a
// component/directive constructor or field initializer, same requirement `inject()` itself has).
// Returns the current screen's navigator handle (push/pop/replace/... for a Stack screen,
// jumpTo/setParams for a Tab screen, openDrawer/... for a Drawer screen) plus addListener bound to
// that route's own emitter - mirrors @react-navigation's `navigation.addListener('focus', cb)`
// surface. All pub/sub logic lives in ../../core/navigation-events; this function only reads
// NavigationContextService and binds identity.

import type { INavigationEventListener, INavigationEventName } from '../../core';
import { requireNavigationContext, type IAnyNavigatorHandle } from '../navigation-context.service';

export type INavigationHandle = IAnyNavigatorHandle & {
  addListener: (event: INavigationEventName, listener: INavigationEventListener) => () => void;
  // Walks exactly ONE hop up NavigationContextService's `parent` chain to the enclosing
  // navigator's handle (plain immediate-parent walking, no named/targeted ancestor lookup).
  getParent: () => IAnyNavigatorHandle | undefined;
};

export function injectNavigation(): INavigationHandle {
  const context = requireNavigationContext('injectNavigation');
  return {
    ...context.navigation,
    addListener: context.emitter.addListener,
    getParent: () => context.parent?.navigation,
  };
}
