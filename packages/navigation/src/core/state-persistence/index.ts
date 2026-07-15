// Lightweight state persistence: pure serialize/deserialize for INavigatorState, the primitive
// @react-navigation's `initialState`/`onStateChange` persistence recipe is built on. Routes are
// already `{key, name, params}` - plain data, no functions/refs/class instances - so a JSON-safe
// passthrough is sufficient; no framework wiring lives here yet (that's an adapter-level task).

import type { INavigatorState } from '../navigator-state';
import type { IRoute } from '../navigator-state';
import { isRecord } from '../guards';

// No `'params' in value` check: a route pushed with no params serializes to `{key, name,
// params: undefined}`, and JSON.stringify drops undefined-valued keys - a JSON round trip of a
// perfectly valid route legitimately arrives here without a `params` key at all.
function isRoute(value: unknown): value is IRoute<unknown> {
  return isRecord(value) && typeof value.key === 'string' && typeof value.name === 'string';
}

function isNavigatorState(value: unknown): value is INavigatorState {
  return isRecord(value) && Array.isArray(value.routes) && value.routes.every(isRoute);
}

export function serializeNavigatorState(state: INavigatorState): unknown {
  return state;
}

export function deserializeNavigatorState(raw: unknown): INavigatorState {
  if (!isNavigatorState(raw)) {
    throw new Error('deserializeNavigatorState: persisted value is not a valid navigator state');
  }
  return raw;
}
