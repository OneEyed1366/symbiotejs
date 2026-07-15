// Co-located unit test (ADR 0025) for the pure serialize/deserialize passthrough. No framework,
// no wiring - just the JSON-safe round trip and the deserialize-side runtime guard rejecting
// malformed persisted data (a corrupted AsyncStorage entry, a schema change across app versions).

import { describe, expect, it } from 'vitest';
import { deserializeNavigatorState, serializeNavigatorState } from './index';
import type { INavigatorState } from '../navigator-state';

describe('serializeNavigatorState / deserializeNavigatorState', () => {
  it('round-trips a navigator state through JSON', () => {
    const state: INavigatorState = {
      routes: [{ key: 'home-1', name: 'Home', params: { tab: 'feed' } }],
    };
    const roundTripped = deserializeNavigatorState(
      JSON.parse(JSON.stringify(serializeNavigatorState(state))),
    );
    expect(roundTripped).toEqual(state);
  });

  it('rejects a payload missing the routes array', () => {
    expect(() => deserializeNavigatorState({ notRoutes: [] })).toThrow();
  });

  it('rejects a payload whose routes are not route-shaped', () => {
    expect(() => deserializeNavigatorState({ routes: [{ key: 'r1' }] })).toThrow();
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeNavigatorState('not a state')).toThrow();
    expect(() => deserializeNavigatorState(null)).toThrow();
  });

  it('round-trips a route pushed without params (JSON.stringify drops the undefined key)', () => {
    const state: INavigatorState = {
      routes: [{ key: 'menu-1', name: 'Menu', params: undefined }],
    };
    const roundTripped = deserializeNavigatorState(
      JSON.parse(JSON.stringify(serializeNavigatorState(state))),
    );
    expect(roundTripped).toEqual(state);
  });
});
