// Co-located React-driven test (ADR 0025) for useStackNavigation/useTabNavigation/
// useDrawerNavigation - the narrowed twins of useNavigation() that hide the union guard.

import { act, createElement, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource, Dimensions } from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import type { INavigatorHandle } from '../stack';
import { Tab } from '../tabs';
import { Drawer } from '../drawer';
import { useDrawerNavigation, useStackNavigation, useTabNavigation } from './index';

const ROOT_TAG = 613;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {
      topAppear: { registrationName: 'onAppear' },
      topDisappear: { registrationName: 'onDisappear' },
      topWillAppear: { registrationName: 'onWillAppear' },
      topWillDisappear: { registrationName: 'onWillDisappear' },
      topDismissed: { registrationName: 'onDismissed' },
      topHeaderBackButtonClicked: { registrationName: 'onHeaderBackButtonClicked' },
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
    directEventTypes: { topFinishTransitioning: { registrationName: 'onFinishTransitioning' } },
    validAttributes: {},
  },
};

// Drawer reads the screen width off useWindowDimensions() to resolve its swipe edge zone;
// headless has no DeviceInfo native module, so seed a concrete width once (Dimensions is a
// module-level singleton) - same fixture as drawer.test.tsx.
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function textScreen(label: string) {
  return () => createElement('symbiote-text', {}, label);
}

describe('useStackNavigation', () => {
  it('returns a concretely-typed Stack handle with push, no narrowing needed', () => {
    let canPush = false;
    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      const navigation = useStackNavigation();
      canPush = typeof navigation.push === 'function';
      return createElement('symbiote-text', {}, 'home');
    }

    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: textScreen('details') }),
      ),
    );
    expect(canPush).toBe(true);
  });

  it('throws when the nearest navigator is a Tab, not a Stack', () => {
    function TrackedHomeTab(): ReturnType<typeof createElement> {
      useStackNavigation();
      return createElement('symbiote-text', {}, 'home');
    }

    expect(() => {
      act(() => {
        mount(
          ROOT_TAG,
          createElement(
            Tab,
            { initialRouteName: 'Home' },
            createElement(Tab.Screen, { name: 'Home', component: TrackedHomeTab }),
            createElement(Tab.Screen, { name: 'Search', component: textScreen('search') }),
          ),
        );
      });
    }).toThrow(/nearest navigator is not a Stack/);
  });
});

describe('useTabNavigation', () => {
  it('returns a concretely-typed Tab handle with jumpTo, no narrowing needed', () => {
    let canJumpTo = false;
    function TrackedHomeTab(): ReturnType<typeof createElement> {
      const navigation = useTabNavigation();
      canJumpTo = typeof navigation.jumpTo === 'function';
      return createElement('symbiote-text', {}, 'home');
    }

    mount(
      ROOT_TAG,
      createElement(
        Tab,
        { initialRouteName: 'Home' },
        createElement(Tab.Screen, { name: 'Home', component: TrackedHomeTab }),
        createElement(Tab.Screen, { name: 'Search', component: textScreen('search') }),
      ),
    );
    expect(canJumpTo).toBe(true);
  });

  it('throws when the nearest navigator is a Stack, not a Tab', () => {
    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      useTabNavigation();
      return createElement('symbiote-text', {}, 'home');
    }

    expect(() => {
      act(() => {
        mount(
          ROOT_TAG,
          createElement(
            Stack,
            { initialRouteName: 'Home' },
            createElement(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
            createElement(Stack.Screen, { name: 'Details', component: textScreen('details') }),
          ),
        );
      });
    }).toThrow(/nearest navigator is not a Tab/);
  });
});

describe('useDrawerNavigation', () => {
  it('returns a concretely-typed Drawer handle with openDrawer, no narrowing needed', () => {
    let canOpenDrawer = false;
    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      const navigation = useDrawerNavigation();
      canOpenDrawer = typeof navigation.openDrawer === 'function';
      return createElement('symbiote-text', {}, 'home');
    }

    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: TrackedHomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: textScreen('profile') }),
      ),
    );
    expect(canOpenDrawer).toBe(true);
  });

  it('throws when the nearest navigator is a Stack, not a Drawer', () => {
    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      useDrawerNavigation();
      return createElement('symbiote-text', {}, 'home');
    }

    expect(() => {
      act(() => {
        mount(
          ROOT_TAG,
          createElement(
            Stack,
            { initialRouteName: 'Home' },
            createElement(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
            createElement(Stack.Screen, { name: 'Details', component: textScreen('details') }),
          ),
        );
      });
    }).toThrow(/nearest navigator is not a Drawer/);
  });
});
