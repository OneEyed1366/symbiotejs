// Co-located Vue-driven test for useStackNavigation/useTabNavigation/useDrawerNavigation - the
// narrowed twins of useNavigation() that hide the union guard. Vue twin of
// react/hooks/use-typed-navigation.test.tsx.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource, Dimensions } from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import { Tab } from '../tabs';
import { Drawer } from '../drawer';
import { useDrawerNavigation, useStackNavigation, useTabNavigation } from './index';

const ROOT_TAG = 4613;
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
// headless has no DeviceInfo native module, so seed a concrete width once - same fixture as
// drawer.test.ts.
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function textScreen(label: string) {
  return () => h('symbiote-text', {}, label);
}

describe('useStackNavigation', () => {
  it('returns a concretely-typed Stack handle with push, no narrowing needed', async () => {
    let canPush = false;
    const TrackedHomeScreen = defineComponent(() => {
      const navigation = useStackNavigation();
      return () => {
        canPush = typeof navigation.value.push === 'function';
        return h('symbiote-text', {}, 'home');
      };
    });

    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
            h(Stack.Screen, { name: 'Details', component: textScreen('details') }),
          ]),
      }),
    );
    await tick();
    expect(canPush).toBe(true);
  });

  it('throws when the nearest navigator is a Tab, not a Stack', () => {
    const TrackedHomeTab = defineComponent(() => {
      const navigation = useStackNavigation();
      return () => {
        void navigation.value;
        return h('symbiote-text', {}, 'home');
      };
    });

    expect(() =>
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { initialRouteName: 'Home' }, () => [
              h(Tab.Screen, { name: 'Home', component: TrackedHomeTab }),
              h(Tab.Screen, { name: 'Search', component: textScreen('search') }),
            ]),
        }),
      ),
    ).toThrow(/nearest navigator is not a Stack/);
  });
});

describe('useTabNavigation', () => {
  it('returns a concretely-typed Tab handle with jumpTo, no narrowing needed', async () => {
    let canJumpTo = false;
    const TrackedHomeTab = defineComponent(() => {
      const navigation = useTabNavigation();
      return () => {
        canJumpTo = typeof navigation.value.jumpTo === 'function';
        return h('symbiote-text', {}, 'home');
      };
    });

    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Tab, { initialRouteName: 'Home' }, () => [
            h(Tab.Screen, { name: 'Home', component: TrackedHomeTab }),
            h(Tab.Screen, { name: 'Search', component: textScreen('search') }),
          ]),
      }),
    );
    await tick();
    expect(canJumpTo).toBe(true);
  });

  it('throws when the nearest navigator is a Stack, not a Tab', () => {
    const TrackedHomeScreen = defineComponent(() => {
      const navigation = useTabNavigation();
      return () => {
        void navigation.value;
        return h('symbiote-text', {}, 'home');
      };
    });

    expect(() =>
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
              h(Stack.Screen, { name: 'Details', component: textScreen('details') }),
            ]),
        }),
      ),
    ).toThrow(/nearest navigator is not a Tab/);
  });
});

describe('useDrawerNavigation', () => {
  it('returns a concretely-typed Drawer handle with openDrawer, no narrowing needed', async () => {
    let canOpenDrawer = false;
    const TrackedHomeScreen = defineComponent(() => {
      const navigation = useDrawerNavigation();
      return () => {
        canOpenDrawer = typeof navigation.value.openDrawer === 'function';
        return h('symbiote-text', {}, 'home');
      };
    });

    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Drawer, { initialRouteName: 'Home' }, () => [
            h(Drawer.Screen, { name: 'Home', component: TrackedHomeScreen }),
            h(Drawer.Screen, { name: 'Profile', component: textScreen('profile') }),
          ]),
      }),
    );
    await tick();
    expect(canOpenDrawer).toBe(true);
  });

  it('throws when the nearest navigator is a Stack, not a Drawer', () => {
    const TrackedHomeScreen = defineComponent(() => {
      const navigation = useDrawerNavigation();
      return () => {
        void navigation.value;
        return h('symbiote-text', {}, 'home');
      };
    });

    expect(() =>
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
              h(Stack.Screen, { name: 'Details', component: textScreen('details') }),
            ]),
        }),
      ),
    ).toThrow(/nearest navigator is not a Drawer/);
  });
});
