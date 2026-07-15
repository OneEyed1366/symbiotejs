// Co-located React-driven test (ADR 0025) for the @symbiote-native/navigation React Stack. Proves
// the shared core drives React correctly against an INJECTED codegen-shaped ViewConfig (mirrors
// packages/slider/src/react/slider/slider.test.tsx): push/pop mount and unmount RNSScreen
// children with the right activityState, the header title reaches RNSScreenStackHeaderConfig,
// and the native onDismissed/onHeaderBackButtonClicked events drive a pop through the imperative
// handle. Stack is imported from './stack' (NOT the package barrel, '.') so the third-party
// native-spec side-effect (../register) never loads headless.

import { act, createElement, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { INavigatorHandle } from './index';
import { useRoute } from '../hooks';
import type { INavigatorState, ISearchBarCommands } from '../../core';

const ROOT_TAG = 512;
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
  directEventTypes: {
    topFinishTransitioning: directEvent('onFinishTransitioning'),
  },
  validAttributes: {},
};

const RNS_HEADER_CONFIG_VIEW_CONFIG = {
  directEventTypes: {
    topPressHeaderBarButtonItem: directEvent('onPressHeaderBarButtonItem'),
  },
  validAttributes: {
    title: true,
    hidden: true,
    backTitle: true,
    backTitleVisible: true,
  },
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
  validAttributes: {
    placeholder: true,
  },
};

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: RNS_SCREEN_VIEW_CONFIG,
  [STACK_VIEW]: RNS_SCREEN_STACK_VIEW_CONFIG,
  [HEADER_CONFIG_VIEW]: RNS_HEADER_CONFIG_VIEW_CONFIG,
  [SEARCH_BAR_VIEW]: RNS_SEARCH_BAR_VIEW_CONFIG,
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

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

function HomeScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'home');
}

function DetailsScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'details');
}

describe('React Stack navigator', () => {
  it('mounts only the initial route as an RNSScreen, focused', () => {
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: HomeScreen,
          options: { title: 'Home' },
        }),
        createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ),
    );
    const screens = screenNodes();
    expect(screens).toHaveLength(1);
    expect(screens[0].props.activityState).toBe(2);
    expect(fabric.find(n => n.viewName === STACK_VIEW)).toBeDefined();
    expect(headerConfigOf(screens[0]).props.title).toBe('Home');
  });

  it('push() mounts a second RNSScreen and keeps the first at activityState 2', () => {
    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Stack.Screen, {
          name: 'Details',
          component: DetailsScreen,
          options: { title: 'Details' },
        }),
      ),
    );
    act(() => ref.current?.push('Details'));
    const screens = screenNodes();
    expect(screens).toHaveLength(2);
    // Both stay FOCUSED (2): react-native-screens' native RNSScreen asserts an already-mounted
    // NativeStack screen's activityState can never decrease, and @react-navigation/native-stack's
    // real algorithm never demotes a route below the focused index to anything but 0 - see
    // computeActivityState's comment in navigator-state.ts.
    expect(screens[0].props.activityState).toBe(2);
    expect(screens[1].props.activityState).toBe(2);
    expect(headerConfigOf(screens[1]).props.title).toBe('Details');
    expect(ref.current?.canGoBack()).toBe(true);
  });

  it('pop() unmounts back down to the previous route', () => {
    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ),
    );
    act(() => ref.current?.push('Details'));
    expect(screenNodes()).toHaveLength(2);
    act(() => ref.current?.pop());
    expect(screenNodes()).toHaveLength(1);
    expect(ref.current?.canGoBack()).toBe(false);
  });

  it('refuses to pop the last route', () => {
    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
      ),
    );
    act(() => ref.current?.pop());
    expect(screenNodes()).toHaveLength(1);
  });

  it('drives a pop from the native onDismissed event (iOS swipe/interactive dismiss)', () => {
    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ),
    );
    act(() => ref.current?.push('Details'));
    expect(screenNodes()).toHaveLength(2);
    const top = screenNodes()[1];
    act(() => fabric.fireEvent(top.instanceHandle, 'topDismissed', { dismissCount: 1 }));
    expect(screenNodes()).toHaveLength(1);
  });

  it('drives a pop from the native onHeaderBackButtonClicked event', () => {
    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ),
    );
    act(() => ref.current?.push('Details'));
    const top = screenNodes()[1];
    act(() => fabric.fireEvent(top.instanceHandle, 'topHeaderBackButtonClicked', {}));
    expect(screenNodes()).toHaveLength(1);
  });

  it('mounts the registered screen component as the RNSScreen content', () => {
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
      ),
    );
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home')).toBeDefined();
  });

  it('exposes route.params to the screen component via useRoute() after navigation.push', () => {
    let receivedParams: unknown;
    function ParamsScreen(): ReturnType<typeof createElement> {
      receivedParams = useRoute().params;
      return createElement('symbiote-text', {}, 'params');
    }
    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: ParamsScreen }),
      ),
    );
    act(() => ref.current?.push('Details', { id: 42 }));
    expect(receivedParams).toEqual({ id: 42 });
  });

  it('setParams() merges onto the focused route without changing the stack shape', () => {
    let receivedParams: unknown;
    function ParamsScreen(): ReturnType<typeof createElement> {
      receivedParams = useRoute().params;
      return createElement('symbiote-text', {}, 'params');
    }
    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Stack.Screen, { name: 'Details', component: ParamsScreen }),
      ),
    );
    act(() => ref.current?.push('Details', { id: 1 }));
    act(() => ref.current?.setParams({ id: 2 }));
    expect(receivedParams).toEqual({ id: 2 });
    expect(screenNodes()).toHaveLength(2);
  });

  it('setParams() targets a route by key when given, not just the focused one', () => {
    let homeKey: string | undefined;
    let homeParams: unknown;
    function HomeTrackingScreen(): ReturnType<typeof createElement> {
      const route = useRoute();
      homeKey = route.key;
      homeParams = route.params;
      return createElement('symbiote-text', {}, 'home');
    }
    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: HomeTrackingScreen,
          initialParams: { tab: 'feed' },
        }),
        createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
      ),
    );
    act(() => ref.current?.push('Details'));
    if (homeKey === undefined) throw new Error('home route key was never captured');
    act(() => ref.current?.setParams({ tab: 'search' }, homeKey));
    expect(homeParams).toEqual({ tab: 'search' });
  });

  it('reset() replaces the whole stack with the given state', () => {
    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Stack.Screen, {
          name: 'Details',
          component: DetailsScreen,
          options: { title: 'Details' },
        }),
      ),
    );
    act(() => ref.current?.push('Details'));
    expect(screenNodes()).toHaveLength(2);

    const nextState: INavigatorState = {
      routes: [{ key: 'reset-1', name: 'Details', params: { id: 7 } }],
    };
    act(() => ref.current?.reset(nextState));

    const screens = screenNodes();
    expect(screens).toHaveLength(1);
    expect(screens[0].props.activityState).toBe(2);
    expect(headerConfigOf(screens[0]).props.title).toBe('Details');
    expect(ref.current?.canGoBack()).toBe(false);
  });

  it('nests an RNSSearchBar child, wrapped in an RNSScreenStackHeaderSubview, when headerSearchBarOptions is set', () => {
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: HomeScreen,
          options: { headerSearchBarOptions: { placeholder: 'Search' } },
        }),
      ),
    );
    const header = headerConfigOf(screenNodes()[0]);
    expect(header.children).toHaveLength(1);
    const subview = header.children[0];
    expect(subview.viewName).toBe(HEADER_SUBVIEW_VIEW);
    expect(subview.props.type).toBe('searchBar');
    expect(subview.children).toHaveLength(1);
    expect(subview.children[0].viewName).toBe(SEARCH_BAR_VIEW);
    expect(subview.children[0].props.placeholder).toBe('Search');
  });

  it('forwards search bar text changes to the app-supplied onChangeText callback', () => {
    let receivedText: string | undefined;
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: HomeScreen,
          options: {
            headerSearchBarOptions: {
              placeholder: 'Search',
              onChangeText: text => {
                receivedText = text;
              },
            },
          },
        }),
      ),
    );
    const searchBar = headerConfigOf(screenNodes()[0]).children[0].children[0];
    act(() => fabric.fireEvent(searchBar.instanceHandle, 'topChangeText', { text: 'asdf' }));
    expect(receivedText).toBe('asdf');
  });

  it('forwards every other native search bar event to its app-supplied callback', () => {
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
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: HomeScreen,
          options: {
            headerSearchBarOptions: {
              placeholder: 'Search',
              onFocus: () => received.focus++,
              onBlur: () => received.blur++,
              onCancelButtonPress: () => received.cancelButtonPress++,
              onSearchButtonPress: text => {
                received.searchButtonPressText = text;
              },
              onClose: () => received.close++,
              onOpen: () => received.open++,
            },
          },
        }),
      ),
    );
    const searchBar = headerConfigOf(screenNodes()[0]).children[0].children[0];
    act(() => fabric.fireEvent(searchBar.instanceHandle, 'topSearchFocus', {}));
    act(() => fabric.fireEvent(searchBar.instanceHandle, 'topSearchBlur', {}));
    act(() => fabric.fireEvent(searchBar.instanceHandle, 'topCancelButtonPress', {}));
    act(() => fabric.fireEvent(searchBar.instanceHandle, 'topSearchButtonPress', { text: 'qwer' }));
    act(() => fabric.fireEvent(searchBar.instanceHandle, 'topClose', {}));
    act(() => fabric.fireEvent(searchBar.instanceHandle, 'topOpen', {}));
    expect(received).toEqual({
      focus: 1,
      blur: 1,
      cancelButtonPress: 1,
      close: 1,
      open: 1,
      searchButtonPressText: 'qwer',
    });
  });

  it('drives imperative SearchBarCommands (focus/setText/…) through the app-supplied ref', () => {
    const searchBarRef = createRef<ISearchBarCommands>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: HomeScreen,
          options: { headerSearchBarOptions: { placeholder: 'Search', ref: searchBarRef } },
        }),
      ),
    );
    const searchBar = headerConfigOf(screenNodes()[0]).children[0].children[0];

    searchBarRef.current?.focus();
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'focus', args: [] });
    expect(fabric.commands.at(-1)?.node.tag).toBe(searchBar.tag);

    searchBarRef.current?.setText('preset');
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'setText', args: ['preset'] });

    searchBarRef.current?.toggleCancelButton(false);
    expect(fabric.commands.at(-1)).toMatchObject({
      commandName: 'toggleCancelButton',
      args: [false],
    });

    searchBarRef.current?.clearText();
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'clearText', args: [] });

    searchBarRef.current?.cancelSearch();
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'cancelSearch', args: [] });

    searchBarRef.current?.blur();
    expect(fabric.commands.at(-1)).toMatchObject({ commandName: 'blur', args: [] });
  });

  it('renders the header config with zero children when there is no search bar', () => {
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
      ),
    );
    const header = headerConfigOf(screenNodes()[0]);
    expect(header.children).toHaveLength(0);
  });
});
