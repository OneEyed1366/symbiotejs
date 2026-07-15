// Angular injection function: returns the current screen's route as a live Signal - mirrors
// @react-navigation's useRoute, reactive rather than a one-shot read because a setParams call
// swaps in a new route object (same key) while the screen stays mounted (see
// navigation-context.service.ts's comment on why `route` is a signal there). Zero logic of its
// own beyond that signal read.

import { computed, type Signal } from '@angular/core';
import type { IRoute } from '../../core';
import { requireNavigationContext } from '../navigation-context.service';

export function injectRoute(): Signal<IRoute<unknown>> {
  const context = requireNavigationContext('injectRoute');
  // A `computed` (not the raw context.route signal) so the return type narrows to
  // `IRoute<unknown>` structurally - NavigationScopeDirective always assigns a route before any
  // content (and therefore any injectRoute() caller) exists, so this only ever throws on misuse.
  return computed(() => {
    const current = context.route();
    if (current === undefined) {
      throw new Error(
        "injectRoute: no route has been assigned to this screen's navigation scope yet",
      );
    }
    return current;
  });
}
