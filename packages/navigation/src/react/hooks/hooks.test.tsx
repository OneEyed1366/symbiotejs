// Co-located React-driven test (ADR 0025) for the focus/event hooks layer. Mirrors
// ../stack.test.tsx's fixture (an injected codegen-shaped RNSScreen ViewConfig exposing
// onAppear/onDisappear/onWillAppear/onWillDisappear) and drives the same native events stack.ts
// wires to emit 'focus'/'blur' - proving the hooks react to the real RNS lifecycle, not to a
// synthetic shortcut.

import { act, createElement, createRef, useCallback, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import type { INavigatorHandle } from '../stack';
import { useFocusEffect, useIsFocused, useNavigation, useNavigationState, useRoute } from './index';

const ROOT_TAG = 513;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';

function directEvent(registrationName: string) {
  return { registrationName };
}

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {
      topAppear: directEvent('onAppear'),
      topDisappear: directEvent('onDisappear'),
      topWillAppear: directEvent('onWillAppear'),
      topWillDisappear: directEvent('onWillDisappear'),
      topDismissed: directEvent('onDismissed'),
      topHeaderBackButtonClicked: directEvent('onHeaderBackButtonClicked'),
    },
    validAttributes: {
      screenId: true,
      activityState: true,
      gestureEnabled: true,
      stackAnimation: true,
      stackPresentation: true,
      transitionDuration: true,
    },
  },
  [STACK_VIEW]: {
    directEventTypes: { topFinishTransitioning: directEvent('onFinishTransitioning') },
    validAttributes: {},
  },
  [HEADER_CONFIG_VIEW]: {
    directEventTypes: { topPressHeaderBarButtonItem: directEvent('onPressHeaderBarButtonItem') },
    validAttributes: { title: true, hidden: true, backTitle: true, backTitleVisible: true },
  },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function screenNodes(): IFakeNode[] {
  const found: IFakeNode[] = [];
  const collect = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName === SCREEN_VIEW) found.push(node);
      collect(node.children);
    }
  };
  collect(fabric.committed);
  return found;
}

function HomeScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'home');
}

function DetailsScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'details');
}

describe('navigation hooks', () => {
  it("useIsFocused reflects the route's native appear/disappear events", () => {
    let latestIsFocused: boolean | undefined;
    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      latestIsFocused = useIsFocused();
      return createElement('symbiote-text', {}, 'home');
    }

    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ),
    );
    expect(latestIsFocused).toBe(false);

    const home = screenNodes()[0];
    act(() => fabric.fireEvent(home.instanceHandle, 'topAppear', {}));
    expect(latestIsFocused).toBe(true);

    act(() => fabric.fireEvent(home.instanceHandle, 'topDisappear', {}));
    expect(latestIsFocused).toBe(false);
  });

  it('useFocusEffect runs its effect on focus and its cleanup on blur', () => {
    const events: string[] = [];
    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      useFocusEffect(
        useCallback(() => {
          events.push('effect');
          return () => events.push('cleanup');
        }, []),
      );
      return createElement('symbiote-text', {}, 'home');
    }

    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ),
    );
    expect(events).toEqual([]);

    const home = screenNodes()[0];
    act(() => fabric.fireEvent(home.instanceHandle, 'topAppear', {}));
    expect(events).toEqual(['effect']);

    act(() => fabric.fireEvent(home.instanceHandle, 'topDisappear', {}));
    expect(events).toEqual(['effect', 'cleanup']);
  });

  it('useNavigation().addListener fires on focus and useRoute exposes name/params', () => {
    let capturedName: string | undefined;
    let capturedParams: unknown;
    const focusEvents: string[] = [];

    function TrackedDetailsScreen(): ReturnType<typeof createElement> {
      const navigation = useNavigation();
      const route = useRoute();
      capturedName = route.name;
      capturedParams = route.params;
      useEffect(
        () => navigation.addListener('focus', () => focusEvents.push('focus')),
        [navigation],
      );
      return createElement('symbiote-text', {}, 'details');
    }

    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: TrackedDetailsScreen }),
      ),
    );
    act(() => ref.current?.push('Details', { id: 7 }));
    expect(capturedName).toBe('Details');
    expect(capturedParams).toEqual({ id: 7 });

    const details = screenNodes()[1];
    act(() => fabric.fireEvent(details.instanceHandle, 'topAppear', {}));
    expect(focusEvents).toEqual(['focus']);
  });

  it('useNavigationState reflects the route stack growing across a push', () => {
    let routeCount: number | undefined;
    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      routeCount = useNavigationState(state => state.routes.length);
      return createElement('symbiote-text', {}, 'home');
    }

    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ),
    );
    expect(routeCount).toBe(1);

    act(() => ref.current?.push('Details'));
    expect(routeCount).toBe(2);

    act(() => ref.current?.pop());
    expect(routeCount).toBe(1);
  });
});
