// Co-located unit test (ADR 0025) for the pure route-stack reducer, covering setParams and reset
// (the react-navigation StackRouter parity pieces) alongside the existing action shapes they sit
// next to. Push/pop/popToTop/popTo/replace are exercised end-to-end through the React lifecycle
// in stack.test.tsx already - this file targets navigatorReducer directly, framework-free.

import { describe, expect, it } from 'vitest';
import { navigatorReducer } from './index';
import type { INavigatorState } from './index';

const HOME = { key: 'home-1', name: 'Home', params: { tab: 'feed' } };
const DETAILS = { key: 'details-1', name: 'Details', params: { id: 1 } };

function twoRouteState(): INavigatorState {
  return { routes: [HOME, DETAILS] };
}

describe('navigatorReducer — setParams', () => {
  it('merges params onto the focused (top) route when no key is given', () => {
    const next = navigatorReducer(twoRouteState(), { type: 'setParams', params: { id: 2 } });
    expect(next.routes).toEqual([HOME, { ...DETAILS, params: { id: 2 } }]);
  });

  it('merges params onto the route matched by key, not the top route', () => {
    const next = navigatorReducer(twoRouteState(), {
      type: 'setParams',
      key: 'home-1',
      params: { tab: 'search' },
    });
    expect(next.routes).toEqual([{ ...HOME, params: { tab: 'search' } }, DETAILS]);
  });

  it('shallow-merges, keeping sibling fields the new params omit', () => {
    const state: INavigatorState = {
      routes: [{ key: 'r1', name: 'Home', params: { a: 1, b: 2 } }],
    };
    const next = navigatorReducer(state, { type: 'setParams', params: { b: 3 } });
    expect(next.routes[0].params).toEqual({ a: 1, b: 3 });
  });

  it('replaces params outright when the existing params are not an object', () => {
    const state: INavigatorState = { routes: [{ key: 'r1', name: 'Home', params: undefined }] };
    const next = navigatorReducer(state, { type: 'setParams', params: { a: 1 } });
    expect(next.routes[0].params).toEqual({ a: 1 });
  });

  it('leaves state untouched when no route matches the given key', () => {
    const state = twoRouteState();
    const next = navigatorReducer(state, { type: 'setParams', key: 'missing', params: { id: 9 } });
    expect(next).toBe(state);
  });

  it('does not change route position or identity', () => {
    const next = navigatorReducer(twoRouteState(), {
      type: 'setParams',
      key: 'home-1',
      params: { tab: 'search' },
    });
    expect(next.routes).toHaveLength(2);
    expect(next.routes[0].key).toBe('home-1');
    expect(next.routes[1]).toBe(DETAILS);
  });
});

describe('navigatorReducer — reset', () => {
  it('replaces the whole state verbatim, mirroring CommonActions.reset', () => {
    const nextState: INavigatorState = {
      routes: [{ key: 'settings-1', name: 'Settings', params: undefined }],
    };
    const next = navigatorReducer(twoRouteState(), { type: 'reset', state: nextState });
    expect(next).toBe(nextState);
  });

  it('supports rehydrating a persisted multi-route state', () => {
    const persisted: INavigatorState = {
      routes: [HOME, DETAILS, { key: 'r3', name: 'Extra', params: undefined }],
    };
    const next = navigatorReducer({ routes: [HOME] }, { type: 'reset', state: persisted });
    expect(next.routes).toHaveLength(3);
  });
});
