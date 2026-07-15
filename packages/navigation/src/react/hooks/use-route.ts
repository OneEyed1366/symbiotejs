// Thin lifecycle wrapper: returns the current screen's IRoute from NavigationContext - mirrors
// @react-navigation's useRoute. Zero logic of its own; the route object itself is built by
// stack.ts's render loop from the core reducer's state.

import type { IRoute } from '../../core';
import { useRequiredNavigationContext } from '../navigation-context';

export function useRoute(): IRoute<unknown> {
  const context = useRequiredNavigationContext('useRoute');
  return context.route;
}
