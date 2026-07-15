// Co-located Vue-driven pipeline test, the Vue twin of react/tabs.test.tsx. Unlike Stack (which
// drives real native RNSScreen views and needs an injected codegen-shaped ViewConfig - see
// stack.test.ts), the tab bar is a PURE-JS UI painted from ordinary `symbiote-view`/`symbiote-text`
// primitives, so no ViewConfig source is needed here at all. Proves: only the focused route's
// screen mounts, jumpTo() moves focus, a tap (synthesized by the engine from a
// topTouchStart/topTouchEnd pair on the tab button) drives the same jumpTo, and per-tab options
// (label/badge/tint) reach the tab bar.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Tab } from './index';
import type { ITabNavigatorHandle } from './index';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '../composables';

const ROOT_TAG = 4640;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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
// second - see tabs.ts's final h() call).
function tabBarRow(): IFakeNode {
  const root = fabric.appRoot();
  const tabRoot = root.children[0];
  const bar = tabRoot?.children[1];
  if (!bar) throw new Error('no tab bar row was committed');
  return bar;
}

async function tapItem(index: number): Promise<void> {
  const item = tabBarRow().children[index];
  if (!item) throw new Error(`no tab item at index ${index}`);
  fabric.fireEvent(item.instanceHandle, TOUCH_START, {
    touches: [{ identifier: 1, pageX: 0, pageY: 0 }],
    changedTouches: [{ identifier: 1, pageX: 0, pageY: 0 }],
  });
  fabric.fireEvent(item.instanceHandle, TOUCH_END, {
    touches: [],
    changedTouches: [{ identifier: 1, pageX: 0, pageY: 0 }],
  });
  await tick();
}

function HomeScreen() {
  return h('symbiote-text', {}, 'home');
}

function ProfileScreen() {
  return h('symbiote-text', {}, 'profile');
}

describe('Vue Tab navigator', () => {
  it('mounts only the initial focused route content, and the tab bar for every registered route', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Tab, { initialRouteName: 'Home' }, () => [
            h(Tab.Screen, {
              name: 'Home',
              component: HomeScreen,
              options: { tabBarLabel: 'Home' },
            }),
            h(Tab.Screen, {
              name: 'Profile',
              component: ProfileScreen,
              options: { tabBarLabel: 'Profile' },
            }),
          ]),
      }),
    );
    await tick();
    expect(findAllText(fabric.committed)).toContain('home');
    expect(findAllText(fabric.committed)).not.toContain('profile');
    expect(tabBarRow().children).toHaveLength(2);
    expect(findAllText(tabBarRow().children)).toEqual(['Home', 'Profile']);
  });

  it('jumpTo() switches the focused screen content', async () => {
    const handleRef = ref<ITabNavigatorHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
            h(Tab.Screen, { name: 'Home', component: HomeScreen }),
            h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
          ]),
      }),
    );
    await tick();
    handleRef.value?.jumpTo('Profile');
    await tick();
    expect(findAllText(fabric.committed)).toContain('profile');
    expect(findAllText(fabric.committed)).not.toContain('home');
  });

  it('a tap on a tab bar item drives the same jumpTo as the imperative handle', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Tab, { initialRouteName: 'Home' }, () => [
            h(Tab.Screen, { name: 'Home', component: HomeScreen }),
            h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
          ]),
      }),
    );
    await tick();
    expect(findAllText(fabric.committed)).toContain('home');
    await tapItem(1);
    expect(findAllText(fabric.committed)).toContain('profile');
    expect(findAllText(fabric.committed)).not.toContain('home');
  });

  it('jumpTo() to an unknown route name is a no-op', async () => {
    const handleRef = ref<ITabNavigatorHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
            h(Tab.Screen, { name: 'Home', component: HomeScreen }),
            h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
          ]),
      }),
    );
    await tick();
    handleRef.value?.jumpTo('Nowhere');
    await tick();
    expect(findAllText(fabric.committed)).toContain('home');
  });

  it('exposes route.params to the focused screen via useRoute() after jumpTo', async () => {
    let receivedParams: unknown;
    const ParamsScreen = defineComponent(() => {
      const route = useRoute();
      return () => {
        receivedParams = route.value.params;
        return h('symbiote-text', {}, 'params');
      };
    });
    const handleRef = ref<ITabNavigatorHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
            h(Tab.Screen, { name: 'Home', component: HomeScreen }),
            h(Tab.Screen, { name: 'Profile', component: ParamsScreen }),
          ]),
      }),
    );
    await tick();
    handleRef.value?.jumpTo('Profile', { id: 42 });
    await tick();
    expect(receivedParams).toEqual({ id: 42 });
  });

  it('resolves tabBarBadge onto the focused-agnostic tab item', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Tab, { initialRouteName: 'Home' }, () => [
            h(Tab.Screen, { name: 'Home', component: HomeScreen, options: { tabBarBadge: 3 } }),
            h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
          ]),
      }),
    );
    await tick();
    expect(findAllText(tabBarRow().children)).toContain('3');
  });

  // Before this fix, Tab never wrapped its focused screen in a NavigationScope at all, so every
  // one of these composables threw "must be used within a screen rendered by <Stack>" the moment
  // a Tab screen called them. These cases prove the scope is now provided and the focus semantics
  // are wired.
  it('useNavigation()/useRoute() are usable inside a Tab screen, and useIsFocused() reflects the focused tab', async () => {
    let homeIsFocused: boolean | undefined;
    let homeRouteName: string | undefined;
    let profileIsFocused: boolean | undefined;

    // Plain functions used as `component:` are stateless functional components - Vue calls them
    // fresh on every render and treats their return value as vnodes directly, NOT as a "setup
    // returns a render fn" component. A screen calling a composable needs a real setup-based
    // component (onMounted/inject require a persistent instance across renders), hence
    // defineComponent here instead of a bare function.
    const TrackedHomeScreen = defineComponent(() => {
      const navigation = useNavigation();
      const isFocused = useIsFocused();
      const route = useRoute();
      expect(typeof navigation.value.jumpTo).toBe('function');
      return () => {
        homeIsFocused = isFocused.value;
        homeRouteName = route.value.name;
        return h('symbiote-text', {}, 'home');
      };
    });
    const TrackedProfileScreen = defineComponent(() => {
      const isFocused = useIsFocused();
      return () => {
        profileIsFocused = isFocused.value;
        return h('symbiote-text', {}, 'profile');
      };
    });

    const handleRef = ref<ITabNavigatorHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
            h(Tab.Screen, { name: 'Home', component: TrackedHomeScreen }),
            h(Tab.Screen, { name: 'Profile', component: TrackedProfileScreen }),
          ]),
      }),
    );
    await tick();
    expect(homeIsFocused).toBe(true);
    expect(homeRouteName).toBe('Home');

    handleRef.value?.jumpTo('Profile');
    await tick();
    expect(profileIsFocused).toBe(true);
  });

  it('useFocusEffect runs on Tab focus and its cleanup once jumpTo moves focus away', async () => {
    const events: string[] = [];
    const TrackedHomeScreen = defineComponent(() => {
      useFocusEffect(() => {
        events.push('effect');
        return () => events.push('cleanup');
      });
      return () => h('symbiote-text', {}, 'home');
    });

    const handleRef = ref<ITabNavigatorHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Tab, { ref: handleRef, initialRouteName: 'Home' }, () => [
            h(Tab.Screen, { name: 'Home', component: TrackedHomeScreen }),
            h(Tab.Screen, { name: 'Profile', component: ProfileScreen }),
          ]),
      }),
    );
    await tick();
    // Tab paints no native RNSScreen (unlike Stack), so there is no onAppear to wait for - the
    // focused screen's useFocusEffect runs as soon as it mounts.
    expect(events).toEqual(['effect']);

    handleRef.value?.jumpTo('Profile');
    await tick();
    expect(events).toEqual(['effect', 'cleanup']);
  });
});
