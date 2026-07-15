// Co-located Vue-driven pipeline test, the Vue twin of react/stack.test.tsx. Proves the shared
// core drives Vue correctly against an INJECTED codegen-shaped ViewConfig: push/pop mount and
// unmount RNSScreen children with the right activityState, the header title reaches
// RNSScreenStackHeaderConfig, and the native onDismissed/onHeaderBackButtonClicked events drive a
// pop through the imperative handle. Stack is imported from './index' (NOT the package barrel,
// '.') so the third-party native-spec side-effect (../register) never loads headless.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { INavigatorHandle } from './index';
import { useRoute } from '../composables';
import type { INavigatorState, ISearchBarCommands } from '../../core';

const ROOT_TAG = 4512;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';
const HEADER_SUBVIEW_VIEW = 'RNSScreenStackHeaderSubview';
const SEARCH_BAR_VIEW = 'RNSSearchBar';

function directEvent(registrationName: string) {
  return { registrationName };
}

const RNS_SCREEN_VIEW_CONFIG = {
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
};

const RNS_SCREEN_STACK_VIEW_CONFIG = {
  directEventTypes: { topFinishTransitioning: directEvent('onFinishTransitioning') },
  validAttributes: {},
};

const RNS_HEADER_CONFIG_VIEW_CONFIG = {
  directEventTypes: { topPressHeaderBarButtonItem: directEvent('onPressHeaderBarButtonItem') },
  validAttributes: { title: true, hidden: true, backTitle: true, backTitleVisible: true },
};

const RNS_SEARCH_BAR_VIEW_CONFIG = {
  directEventTypes: {
    topSearchFocus: directEvent('onSearchFocus'),
    topSearchBlur: directEvent('onSearchBlur'),
    topChangeText: directEvent('onChangeText'),
    topSearchButtonPress: directEvent('onSearchButtonPress'),
    topCancelButtonPress: directEvent('onCancelButtonPress'),
    topClose: directEvent('onClose'),
    topOpen: directEvent('onOpen'),
  },
  validAttributes: { placeholder: true },
};

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: RNS_SCREEN_VIEW_CONFIG,
  [STACK_VIEW]: RNS_SCREEN_STACK_VIEW_CONFIG,
  [HEADER_CONFIG_VIEW]: RNS_HEADER_CONFIG_VIEW_CONFIG,
  [SEARCH_BAR_VIEW]: RNS_SEARCH_BAR_VIEW_CONFIG,
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findInTree(
  predicate: (node: IFakeNode) => boolean,
  nodes = fabric.committed,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const child = findInTree(predicate, node.children);
    if (child) return child;
  }
  return undefined;
}

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

function headerConfigOf(screen: IFakeNode): IFakeNode {
  const header = screen.children.find(child => child.viewName === HEADER_CONFIG_VIEW);
  if (!header) throw new Error('no header config child on screen');
  return header;
}

function HomeScreen() {
  return h('symbiote-text', {}, 'home');
}

function DetailsScreen() {
  return h('symbiote-text', {}, 'details');
}

function mountStack(
  handleRef: ReturnType<typeof ref<INavigatorHandle | null>>,
  children: unknown[],
) {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () => h(Stack, { ref: handleRef, initialRouteName: 'Home' }, () => children),
    }),
  );
}

describe('Vue Stack navigator', () => {
  it('mounts only the initial route as an RNSScreen, focused', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, { name: 'Home', component: HomeScreen, options: { title: 'Home' } }),
            h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
          ]),
      }),
    );
    await tick();
    const screens = screenNodes();
    expect(screens).toHaveLength(1);
    expect(screens[0].props.activityState).toBe(2);
    expect(fabric.find(n => n.viewName === STACK_VIEW)).toBeDefined();
    expect(headerConfigOf(screens[0]).props.title).toBe('Home');
  });

  it('push() mounts a second RNSScreen and keeps the first at activityState 2', async () => {
    const handleRef = ref<INavigatorHandle | null>(null);
    mountStack(handleRef, [
      h(Stack.Screen, { name: 'Home', component: HomeScreen }),
      h(Stack.Screen, { name: 'Details', component: DetailsScreen, options: { title: 'Details' } }),
    ]);
    await tick();
    handleRef.value?.push('Details');
    await tick();
    const screens = screenNodes();
    expect(screens).toHaveLength(2);
    expect(screens[0].props.activityState).toBe(2);
    expect(screens[1].props.activityState).toBe(2);
    expect(headerConfigOf(screens[1]).props.title).toBe('Details');
    expect(handleRef.value?.canGoBack()).toBe(true);
  });

  it('pop() unmounts back down to the previous route', async () => {
    const handleRef = ref<INavigatorHandle | null>(null);
    mountStack(handleRef, [
      h(Stack.Screen, { name: 'Home', component: HomeScreen }),
      h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
    ]);
    await tick();
    handleRef.value?.push('Details');
    await tick();
    expect(screenNodes()).toHaveLength(2);
    handleRef.value?.pop();
    await tick();
    expect(screenNodes()).toHaveLength(1);
    expect(handleRef.value?.canGoBack()).toBe(false);
  });

  it('refuses to pop the last route', async () => {
    const handleRef = ref<INavigatorHandle | null>(null);
    mountStack(handleRef, [h(Stack.Screen, { name: 'Home', component: HomeScreen })]);
    await tick();
    handleRef.value?.pop();
    await tick();
    expect(screenNodes()).toHaveLength(1);
  });

  it('drives a pop from the native onDismissed event (iOS swipe/interactive dismiss)', async () => {
    const handleRef = ref<INavigatorHandle | null>(null);
    mountStack(handleRef, [
      h(Stack.Screen, { name: 'Home', component: HomeScreen }),
      h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
    ]);
    await tick();
    handleRef.value?.push('Details');
    await tick();
    expect(screenNodes()).toHaveLength(2);
    const top = screenNodes()[1];
    fabric.fireEvent(top.instanceHandle, 'topDismissed', { dismissCount: 1 });
    await tick();
    expect(screenNodes()).toHaveLength(1);
  });

  it('drives a pop from the native onHeaderBackButtonClicked event', async () => {
    const handleRef = ref<INavigatorHandle | null>(null);
    mountStack(handleRef, [
      h(Stack.Screen, { name: 'Home', component: HomeScreen }),
      h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
    ]);
    await tick();
    handleRef.value?.push('Details');
    await tick();
    const top = screenNodes()[1];
    fabric.fireEvent(top.instanceHandle, 'topHeaderBackButtonClicked', {});
    await tick();
    expect(screenNodes()).toHaveLength(1);
  });

  it('mounts the registered screen component as the RNSScreen content', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, { name: 'Home', component: HomeScreen }),
          ]),
      }),
    );
    await tick();
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home')).toBeDefined();
  });

  it('exposes route.params to the screen via useRoute() after navigation.push', async () => {
    let receivedParams: unknown;
    const ParamsScreen = defineComponent(() => {
      const route = useRoute();
      return () => {
        receivedParams = route.value.params;
        return h('symbiote-text', {}, 'params');
      };
    });
    const handleRef = ref<INavigatorHandle | null>(null);
    mountStack(handleRef, [
      h(Stack.Screen, { name: 'Home', component: HomeScreen }),
      h(Stack.Screen, { name: 'Details', component: ParamsScreen }),
    ]);
    await tick();
    handleRef.value?.push('Details', { id: 42 });
    await tick();
    expect(receivedParams).toEqual({ id: 42 });
  });

  it('setParams() merges onto the focused route without changing the stack shape', async () => {
    let receivedParams: unknown;
    const ParamsScreen = defineComponent(() => {
      const route = useRoute();
      return () => {
        receivedParams = route.value.params;
        return h('symbiote-text', {}, 'params');
      };
    });
    const handleRef = ref<INavigatorHandle | null>(null);
    mountStack(handleRef, [
      h(Stack.Screen, { name: 'Home', component: HomeScreen }),
      h(Stack.Screen, { name: 'Details', component: ParamsScreen }),
    ]);
    await tick();
    handleRef.value?.push('Details', { id: 1 });
    await tick();
    handleRef.value?.setParams({ id: 2 });
    await tick();
    expect(receivedParams).toEqual({ id: 2 });
    expect(screenNodes()).toHaveLength(2);
  });

  it('setParams() targets a route by key when given, not just the focused one', async () => {
    let homeKey: string | undefined;
    let homeParams: unknown;
    const HomeTrackingScreen = defineComponent(() => {
      const route = useRoute();
      return () => {
        homeKey = route.value.key;
        homeParams = route.value.params;
        return h('symbiote-text', {}, 'home');
      };
    });
    const handleRef = ref<INavigatorHandle | null>(null);
    mountStack(handleRef, [
      h(Stack.Screen, {
        name: 'Home',
        component: HomeTrackingScreen,
        initialParams: { tab: 'feed' },
      }),
      h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
    ]);
    await tick();
    handleRef.value?.push('Details');
    await tick();
    if (homeKey === undefined) throw new Error('home route key was never captured');
    handleRef.value?.setParams({ tab: 'search' }, homeKey);
    await tick();
    expect(homeParams).toEqual({ tab: 'search' });
  });

  it('reset() replaces the whole stack with the given state', async () => {
    const handleRef = ref<INavigatorHandle | null>(null);
    mountStack(handleRef, [
      h(Stack.Screen, { name: 'Home', component: HomeScreen }),
      h(Stack.Screen, { name: 'Details', component: DetailsScreen, options: { title: 'Details' } }),
    ]);
    await tick();
    handleRef.value?.push('Details');
    await tick();
    expect(screenNodes()).toHaveLength(2);

    const nextState: INavigatorState = {
      routes: [{ key: 'reset-1', name: 'Details', params: { id: 7 } }],
    };
    handleRef.value?.reset(nextState);
    await tick();

    const screens = screenNodes();
    expect(screens).toHaveLength(1);
    expect(screens[0].props.activityState).toBe(2);
    expect(headerConfigOf(screens[0]).props.title).toBe('Details');
    expect(handleRef.value?.canGoBack()).toBe(false);
  });

  it('nests an RNSSearchBar child, wrapped in an RNSScreenStackHeaderSubview, when headerSearchBarOptions is set', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, {
              name: 'Home',
              component: HomeScreen,
              options: { headerSearchBarOptions: { placeholder: 'Search' } },
            }),
          ]),
      }),
    );
    await tick();
    const header = headerConfigOf(screenNodes()[0]);
    expect(header.children).toHaveLength(1);
    const subview = header.children[0];
    expect(subview.viewName).toBe(HEADER_SUBVIEW_VIEW);
    expect(subview.props.type).toBe('searchBar');
    expect(subview.children).toHaveLength(1);
    expect(subview.children[0].viewName).toBe(SEARCH_BAR_VIEW);
    expect(subview.children[0].props.placeholder).toBe('Search');
  });

  it('forwards search bar text changes to the app-supplied onChangeText callback', async () => {
    let receivedText: string | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, {
              name: 'Home',
              component: HomeScreen,
              options: {
                headerSearchBarOptions: {
                  placeholder: 'Search',
                  onChangeText: (text: string) => {
                    receivedText = text;
                  },
                },
              },
            }),
          ]),
      }),
    );
    await tick();
    const searchBar = headerConfigOf(screenNodes()[0]).children[0].children[0];
    fabric.fireEvent(searchBar.instanceHandle, 'topChangeText', { text: 'asdf' });
    await tick();
    expect(receivedText).toBe('asdf');
  });

  it('forwards every other native search bar event to its app-supplied callback', async () => {
    const received: {
      focus: number;
      blur: number;
      cancelButtonPress: number;
      close: number;
      open: number;
      searchButtonPressText?: string;
    } = { focus: 0, blur: 0, cancelButtonPress: 0, close: 0, open: 0 };
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, {
              name: 'Home',
              component: HomeScreen,
              options: {
                headerSearchBarOptions: {
                  placeholder: 'Search',
                  onFocus: () => received.focus++,
                  onBlur: () => received.blur++,
                  onCancelButtonPress: () => received.cancelButtonPress++,
                  onSearchButtonPress: (text: string) => {
                    received.searchButtonPressText = text;
                  },
                  onClose: () => received.close++,
                  onOpen: () => received.open++,
                },
              },
            }),
          ]),
      }),
    );
    await tick();
    const searchBar = headerConfigOf(screenNodes()[0]).children[0].children[0];
    fabric.fireEvent(searchBar.instanceHandle, 'topSearchFocus', {});
    fabric.fireEvent(searchBar.instanceHandle, 'topSearchBlur', {});
    fabric.fireEvent(searchBar.instanceHandle, 'topCancelButtonPress', {});
    fabric.fireEvent(searchBar.instanceHandle, 'topSearchButtonPress', { text: 'qwer' });
    fabric.fireEvent(searchBar.instanceHandle, 'topClose', {});
    fabric.fireEvent(searchBar.instanceHandle, 'topOpen', {});
    await tick();
    expect(received).toEqual({
      focus: 1,
      blur: 1,
      cancelButtonPress: 1,
      close: 1,
      open: 1,
      searchButtonPressText: 'qwer',
    });
  });

  it('drives imperative SearchBarCommands (focus/setText/…) through the app-supplied ref', async () => {
    const searchBarRef = ref<ISearchBarCommands | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, {
              name: 'Home',
              component: HomeScreen,
              options: { headerSearchBarOptions: { placeholder: 'Search', ref: searchBarRef } },
            }),
          ]),
      }),
    );
    await tick();
    const searchBar = headerConfigOf(screenNodes()[0]).children[0].children[0];

    searchBarRef.value?.focus();
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'focus', args: [] });
    expect(fabric.commands.at(-1)?.node.tag).toBe(searchBar.tag);

    searchBarRef.value?.setText('preset');
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'setText', args: ['preset'] });

    searchBarRef.value?.toggleCancelButton(false);
    expect(fabric.commands.at(-1)).toMatchObject({
      commandName: 'toggleCancelButton',
      args: [false],
    });

    searchBarRef.value?.clearText();
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'clearText', args: [] });

    searchBarRef.value?.cancelSearch();
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'cancelSearch', args: [] });

    searchBarRef.value?.blur();
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'blur', args: [] });
  });

  it('renders the header config with zero children when there is no search bar', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Home' }, () => [
            h(Stack.Screen, { name: 'Home', component: HomeScreen }),
          ]),
      }),
    );
    await tick();
    const header = headerConfigOf(screenNodes()[0]);
    expect(header.children).toHaveLength(0);
  });
});
