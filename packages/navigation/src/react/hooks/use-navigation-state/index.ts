// Thin selector wrapper: subscribes to the router's `state` broadcast (stack.ts's render loop
// re-emits the full INavigatorState to every route's emitter after each commit) and returns
// `selector(state)`, re-rendering only when the emitted state changes - mirrors
// @react-navigation's useNavigationState. The reducer/dispatch machinery it selects over lives in
// core/navigator-state.ts; this hook only wires the subscription + local re-render.
//
// Seeded from a single-route snapshot ({ routes: [route] }) rather than left undefined: the real
// broadcast lands a tick later (post-commit useEffect), so a selector reading e.g.
// `state.routes.at(-1)?.name` still resolves correctly on first paint for the common single-route
// case, closing the same async gap useIsFocused documents.
//
// Live updates currently only arrive under <Stack> - it's the only navigator that emits
// NAVIGATION_EVENT_STATE (its post-commit useEffect in stack.ts); <Tab>/<Drawer> don't broadcast
// it, so under those this hook silently stays on its initial snapshot.

import { useEffect, useRef, useState } from 'react';
import type { INavigatorState } from '../../../core';
import { NAVIGATION_EVENT_STATE, isRecord } from '../../../core';
import { useRequiredNavigationContext } from '../../navigation-context';

export function useNavigationState<TResult>(
  selector: (state: INavigatorState) => TResult,
): TResult {
  const context = useRequiredNavigationContext('useNavigationState');
  const { route, emitter } = context;
  const [result, setResult] = useState(() => selector({ routes: [route] }));

  // selector is typically an inline arrow at the call site (`useNavigationState(s => ...)`), a
  // fresh identity every render - read through a ref so the effect below doesn't need `selector`
  // in its deps, and doesn't unsubscribe/resubscribe on every render because of it (the same trap
  // useFocusEffect's own comment documents for its `effect` argument).
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  useEffect(() => {
    return emitter.addListener(NAVIGATION_EVENT_STATE, (state: unknown) => {
      if (!isNavigatorState(state)) return;
      setResult(selectorRef.current(state));
    });
  }, [emitter]);

  return result;
}

function isNavigatorState(value: unknown): value is INavigatorState {
  return isRecord(value) && Array.isArray(value.routes);
}
