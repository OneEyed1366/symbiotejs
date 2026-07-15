// Co-located React-driven test (ADR 0025) for the @symbiote-native/navigation React Tab
// navigator. Unlike Stack (which drives real native RNSScreen views and needs an injected
// codegen-shaped ViewConfig - see stack.test.tsx), the tab bar is a PURE-JS UI painted from
// ordinary `symbiote-view`/`symbiote-text` primitives, so no ViewConfig source is needed here at
// all. Proves: only the focused route's screen mounts, jumpTo() moves focus, a tap (synthesized
// by the engine from a topTouchStart/topTouchEnd pair - core/engine/src/events/index.ts - on the
// tab button) drives the same jumpTo, and per-tab options (label/badge/tint) reach the tab bar.

import { act, createElement, createRef, useCallback } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Tab } from './index';
import type { ITabNavigatorHandle } from './index';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '../hooks';

const ROOT_TAG = 640;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findAllText(nodes: readonly IFakeNode[]): string[] {
  const found: string[] = [];
  const collect = (list: readonly IFakeNode[]): void => {
    for (const node of list) {
      if (node.viewName === 'RCTRawText' && typeof node.props.text === 'string')
        found.push(node.props.text);
      collect(node.children);
    }
  };
  collect(nodes);
  return found;
}

// The tab bar row: the second child of Tab's root `symbiote-view` (content wrapper first, bar
// second - see react/tabs.ts's final createElement).
function tabBarRow(): IFakeNode {
  const root = fabric.appRoot();
  const tabRoot = root.children[0];
  const bar = tabRoot?.children[1];
  if (!bar) throw new Error('no tab bar row was committed');
  return bar;
}

function tapItem(index: number): void {
  const item = tabBarRow().children[index];
  if (!item) throw new Error(`no tab item at index ${index}`);
  act(() => {
    fabric.fireEvent(item.instanceHandle, TOUCH_START, {
      touches: [{ identifier: 1, pageX: 0, pageY: 0 }],
      changedTouches: [{ identifier: 1, pageX: 0, pageY: 0 }],
    });
    fabric.fireEvent(item.instanceHandle, TOUCH_END, {
      touches: [],
      changedTouches: [{ identifier: 1, pageX: 0, pageY: 0 }],
    });
  });
}

function HomeScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'home');
}

function ProfileScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'profile');
}

describe('React Tab navigator', () => {
  it('mounts only the initial focused route content, and the tab bar for every registered route', () => {
    mount(
      ROOT_TAG,
      createElement(
        Tab,
        { initialRouteName: 'Home' },
        createElement(Tab.Screen, {
          name: 'Home',
          component: HomeScreen,
          options: { tabBarLabel: 'Home' },
        }),
        createElement(Tab.Screen, {
          name: 'Profile',
          component: ProfileScreen,
          options: { tabBarLabel: 'Profile' },
        }),
      ),
    );
    expect(findAllText(fabric.committed)).toContain('home');
    expect(findAllText(fabric.committed)).not.toContain('profile');
    expect(tabBarRow().children).toHaveLength(2);
    expect(findAllText(tabBarRow().children)).toEqual(['Home', 'Profile']);
  });

  it('jumpTo() switches the focused screen content', () => {
    const ref = createRef<ITabNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Tab,
        { ref, initialRouteName: 'Home' },
        createElement(Tab.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    act(() => ref.current?.jumpTo('Profile'));
    expect(findAllText(fabric.committed)).toContain('profile');
    expect(findAllText(fabric.committed)).not.toContain('home');
  });

  it('a tap on a tab bar item drives the same jumpTo as the imperative handle', () => {
    mount(
      ROOT_TAG,
      createElement(
        Tab,
        { initialRouteName: 'Home' },
        createElement(Tab.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    expect(findAllText(fabric.committed)).toContain('home');
    tapItem(1);
    expect(findAllText(fabric.committed)).toContain('profile');
    expect(findAllText(fabric.committed)).not.toContain('home');
  });

  it('jumpTo() to an unknown route name is a no-op', () => {
    const ref = createRef<ITabNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Tab,
        { ref, initialRouteName: 'Home' },
        createElement(Tab.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    act(() => ref.current?.jumpTo('Nowhere'));
    expect(findAllText(fabric.committed)).toContain('home');
  });

  it('exposes route.params to the focused screen component via useRoute() after jumpTo', () => {
    let receivedParams: unknown;
    function ParamsScreen(): ReturnType<typeof createElement> {
      receivedParams = useRoute().params;
      return createElement('symbiote-text', {}, 'params');
    }
    const ref = createRef<ITabNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Tab,
        { ref, initialRouteName: 'Home' },
        createElement(Tab.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Tab.Screen, { name: 'Profile', component: ParamsScreen }),
      ),
    );
    act(() => ref.current?.jumpTo('Profile', { id: 42 }));
    expect(receivedParams).toEqual({ id: 42 });
  });

  it('resolves tabBarBadge onto the focused-agnostic tab item', () => {
    mount(
      ROOT_TAG,
      createElement(
        Tab,
        { initialRouteName: 'Home' },
        createElement(Tab.Screen, {
          name: 'Home',
          component: HomeScreen,
          options: { tabBarBadge: 3 },
        }),
        createElement(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    expect(findAllText(tabBarRow().children)).toContain('3');
  });

  // Before this fix, Tab never wrapped its focused screen in NavigationContext.Provider at all,
  // so every one of these hooks threw "must be used within a screen rendered by <Stack>" the
  // moment a Tab screen called them - a real gap, not just a nesting concern (see this package's
  // task notes). These cases prove the context is now provided and the focus semantics are wired.
  it('useNavigation()/useRoute() are usable inside a Tab screen, and useIsFocused() reflects the focused tab', () => {
    let homeIsFocused: boolean | undefined;
    let homeRouteName: string | undefined;
    let profileIsFocused: boolean | undefined;

    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      const navigation = useNavigation();
      homeIsFocused = useIsFocused();
      homeRouteName = useRoute().name;
      // Merely proving the handle is a real ITabNavigatorHandle (jumpTo/setParams), not the
      // Stack-only shape this Context value was hard-typed to before the widened union.
      expect(typeof navigation.jumpTo).toBe('function');
      return createElement('symbiote-text', {}, 'home');
    }
    function TrackedProfileScreen(): ReturnType<typeof createElement> {
      profileIsFocused = useIsFocused();
      return createElement('symbiote-text', {}, 'profile');
    }

    const ref = createRef<ITabNavigatorHandle>();
    // Tab's own focus-emitting effect runs in the same commit as the initial mount, but the
    // setIsFocused(true) it triggers inside useIsFocused's listener lands in a follow-up render -
    // act() is what drains that cascade synchronously (mirrors every other state-changing call in
    // this file already being act()-wrapped).
    act(() => {
      mount(
        ROOT_TAG,
        createElement(
          Tab,
          { ref, initialRouteName: 'Home' },
          createElement(Tab.Screen, { name: 'Home', component: TrackedHomeScreen }),
          createElement(Tab.Screen, { name: 'Profile', component: TrackedProfileScreen }),
        ),
      );
    });
    expect(homeIsFocused).toBe(true);
    expect(homeRouteName).toBe('Home');

    act(() => ref.current?.jumpTo('Profile'));
    expect(profileIsFocused).toBe(true);
  });

  it('useFocusEffect runs on Tab focus and its cleanup once jumpTo moves focus away', () => {
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

    const ref = createRef<ITabNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Tab,
        { ref, initialRouteName: 'Home' },
        createElement(Tab.Screen, { name: 'Home', component: TrackedHomeScreen }),
        createElement(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    // Tab paints no native RNSScreen (unlike Stack), so there is no onAppear to wait for - the
    // focused screen's useFocusEffect runs as soon as it mounts.
    expect(events).toEqual(['effect']);

    act(() => ref.current?.jumpTo('Profile'));
    expect(events).toEqual(['effect', 'cleanup']);
  });
});
