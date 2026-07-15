// Mirrors @react-navigation's useRoute; Vue twin of react/hooks/use-route.ts (returns a
// ComputedRef instead of a plain value). Zero logic of its own - the route object itself is built
// by stack.ts's/tabs.ts's/drawer.ts's render loop from the shared core reducer's state.

import { computed } from '@vue/runtime-core';
import type { ComputedRef } from '@vue/runtime-core';
import type { IRoute } from '../../core';
import { requireNavigationScope } from '../navigation-context';

export function useRoute(): ComputedRef<IRoute<unknown>> {
  const scope = requireNavigationScope('useRoute');
  return computed(() => scope.value.route);
}
