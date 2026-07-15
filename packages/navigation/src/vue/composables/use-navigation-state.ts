// Mirrors @react-navigation's useNavigationState; Vue twin of react/hooks/use-navigation-state.ts.
// The reducer/dispatch machinery lives in core/navigator-state.ts (tab-router-state.ts /
// drawer-router-state.ts for the other two navigators) - this composable only wires the
// subscription to the `state` broadcast each render loop re-emits after commit.
//
// Seeded from a single-route snapshot ({ routes: [route] }) rather than left undefined: the real
// broadcast lands after mount (Stack's render loop; tabs.ts/drawer.ts emit on focus), so a
// selector reading e.g. `state.routes.at(-1)?.name` still resolves correctly on first paint for
// the common single-route case - the same async gap useIsFocused documents.

import { onMounted, onUnmounted, shallowRef } from '@vue/runtime-core';
import type { ShallowRef } from '@vue/runtime-core';
import type { INavigatorState } from '../../core';
import { NAVIGATION_EVENT_STATE, isRecord } from '../../core';
import { requireNavigationScope } from '../navigation-context';

function isNavigatorState(value: unknown): value is INavigatorState {
  return isRecord(value) && Array.isArray(value.routes);
}

export function useNavigationState<TResult>(
  selector: (state: INavigatorState) => TResult,
): ShallowRef<TResult> {
  const scope = requireNavigationScope('useNavigationState');
  const result = shallowRef<TResult>(selector({ routes: [scope.value.route] }));
  let unsubscribe: (() => void) | undefined;

  onMounted(() => {
    unsubscribe = scope.value.emitter.addListener(NAVIGATION_EVENT_STATE, (state: unknown) => {
      if (!isNavigatorState(state)) return;
      result.value = selector(state);
    });
  });

  onUnmounted(() => unsubscribe?.());

  return result;
}
