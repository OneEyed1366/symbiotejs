// Co-located unit test (ADR 0025) for the pure tab-router reducer, targeting the params-merge
// behavior of jumpTo/setParams directly, framework-free - twin of navigator-state.test.ts's
// setParams coverage.

import { describe, expect, it } from 'vitest';
import { tabRouterReducer } from './index';
import type { ITabRouterState } from './index';

const FEED = { key: 'feed-1', name: 'Feed', params: { sort: 'new' } };
const PROFILE = { key: 'profile-1', name: 'Profile', params: { id: 1 } };

function twoRouteState(): ITabRouterState {
  return { routes: [FEED, PROFILE], index: 0 };
}

describe('tabRouterReducer — params merge guards against array params', () => {
  it('jumpTo replaces (not merges) params when incoming params is an array', () => {
    const next = tabRouterReducer(twoRouteState(), {
      type: 'jumpTo',
      name: 'Profile',
      params: [1, 2, 3],
    });
    expect(next.routes[1].params).toEqual([1, 2, 3]);
  });

  it('setParams replaces (not merges) params when incoming params is an array', () => {
    const next = tabRouterReducer(twoRouteState(), {
      type: 'setParams',
      key: 'profile-1',
      params: [1, 2, 3],
    });
    expect(next.routes[1].params).toEqual([1, 2, 3]);
  });
});
