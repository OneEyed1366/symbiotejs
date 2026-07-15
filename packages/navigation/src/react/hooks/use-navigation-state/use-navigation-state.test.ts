// Co-located React-driven test (ADR 0025) for useNavigationState's subscription lifecycle.
// hooks.test.tsx already exercises the hook's OBSERVABLE behavior (state.routes.length tracking a
// real Stack push/pop) - this file targets a narrower, easy-to-miss regression: the call site's
// selector is typically an inline arrow (`useNavigationState(s => s.routes.length)`), a fresh
// function identity every render, so an effect keyed on `selector` unsubscribes/resubscribes on
// every parent re-render instead of once. A fake emitter (rather than a real Stack) isolates
// exactly that churn, independent of any router/native-screen machinery.

import { act, createElement, useReducer } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import type { INavigationEmitter, INavigationEventListener, INavigatorState } from '../../../core';
import { NavigationContext } from '../../navigation-context';
import type { INavigationContextValue } from '../../navigation-context';
import { useNavigationState } from './index';

const ROOT_TAG = 833;

const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('useNavigationState subscription lifecycle', () => {
  it('subscribes to the emitter once, not once per render, across a fresh inline selector', () => {
    let subscribeCount = 0;
    let unsubscribeCount = 0;
    const listeners = new Set<INavigationEventListener>();
    const fakeEmitter: INavigationEmitter = {
      emit: () => {},
      addListener: (_event, listener) => {
        subscribeCount += 1;
        listeners.add(listener);
        return () => {
          unsubscribeCount += 1;
          listeners.delete(listener);
        };
      },
    };
    const contextValue: INavigationContextValue = {
      route: { key: 'home-1', name: 'Home', params: undefined },
      navigation: {
        push: () => {},
        pop: () => {},
        popToTop: () => {},
        popTo: () => {},
        replace: () => {},
        setParams: () => {},
        reset: (_state: INavigatorState) => {},
        canGoBack: () => false,
      },
      emitter: fakeEmitter,
    };

    let triggerRerender: (() => void) | undefined;

    function Child(): null {
      // Deliberately a fresh inline selector on every render - the exact call-site shape
      // (`useNavigationState(s => ...)`) that causes the churn this test guards against.
      useNavigationState(state => state.routes.length);
      return null;
    }

    function Harness(): ReturnType<typeof createElement> {
      const [, dispatch] = useReducer((n: number) => n + 1, 0);
      triggerRerender = () => dispatch();
      return createElement(
        NavigationContext.Provider,
        { value: contextValue },
        createElement(Child),
      );
    }

    act(() => mount(ROOT_TAG, createElement(Harness)));
    expect(subscribeCount).toBe(1);

    act(() => triggerRerender?.());
    act(() => triggerRerender?.());
    act(() => triggerRerender?.());

    expect(subscribeCount).toBe(1);
    expect(unsubscribeCount).toBe(0);
  });
});
