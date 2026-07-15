// Co-located React-driven test (ADR 0025) proving the Context "parent" chain: a navigator reads
// the ambient NavigationContext BEFORE establishing its own, so when one navigator's screen
// renders ANOTHER navigator (here, a Stack screen renders a Tab), a screen deep inside the nested
// Tab can call useNavigation().getParent() to reach the enclosing Stack's handle. Mirrors
// stack.test.tsx's fixture (an injected codegen-shaped RNSScreen ViewConfig) since a real Stack is
// part of this composition; Tab needs no ViewConfig of its own (tabs.test.tsx).

import { act, createElement, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from './stack';
import type { INavigatorHandle } from './stack';
import { Tab } from './tabs';
import { useNavigation } from './hooks';
import type { IAnyNavigatorHandle } from './navigation-context';

const ROOT_TAG = 768;
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

function findAllText(nodes: readonly IFakeNode[]): string[] {
  const found: string[] = [];
  const collect = (list: readonly IFakeNode[]): void => {
    for (const node of list) {
      if (node.viewName === 'RCTRawText' && typeof node.props.text === 'string') {
        found.push(node.props.text);
      }
      collect(node.children);
    }
  };
  collect(nodes);
  return found;
}

function StackDetailsScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'stack-details');
}

describe('nested navigators (Context parent chain)', () => {
  it("a root Stack screen's useNavigation().getParent() is undefined (no ambient navigator above it)", () => {
    let capturedParent: IAnyNavigatorHandle | undefined;
    let getParentCalled = false;
    function RootScreen(): ReturnType<typeof createElement> {
      capturedParent = useNavigation().getParent();
      getParentCalled = true;
      return createElement('symbiote-text', {}, 'root');
    }

    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Root' },
        createElement(Stack.Screen, { name: 'Root', component: RootScreen }),
      ),
    );

    expect(getParentCalled).toBe(true);
    expect(capturedParent).toBeUndefined();
  });

  it('useNavigation().getParent() from inside a Tab screen nested in a Stack screen reaches the enclosing Stack, and pushing through it adds a Stack route', () => {
    let capturedParent: IAnyNavigatorHandle | undefined;

    function NestedTabHomeScreen(): ReturnType<typeof createElement> {
      capturedParent = useNavigation().getParent();
      return createElement('symbiote-text', {}, 'tab-home');
    }

    // The Stack screen's own component: a Tab navigator, nested exactly the way a real app
    // composes navigators (a Stack screen's content IS another navigator).
    function RootScreenRendersTab(): ReturnType<typeof createElement> {
      return createElement(
        Tab,
        { initialRouteName: 'TabHome' },
        createElement(Tab.Screen, { name: 'TabHome', component: NestedTabHomeScreen }),
      );
    }

    const ref = createRef<INavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { ref, initialRouteName: 'Root' },
        createElement(Stack.Screen, { name: 'Root', component: RootScreenRendersTab }),
        createElement(Stack.Screen, { name: 'Details', component: StackDetailsScreen }),
      ),
    );

    expect(findAllText(fabric.committed)).toContain('tab-home');

    if (!capturedParent) throw new Error('getParent() returned undefined');
    if (!('push' in capturedParent)) {
      throw new Error('parent handle is not a Stack handle (missing push)');
    }
    // capturedParent is now narrowed to INavigatorHandle by the 'push in' guard above.
    act(() => capturedParent.push('Details'));

    expect(findAllText(fabric.committed)).toContain('stack-details');
    expect(ref.current?.canGoBack()).toBe(true);
  });
});
