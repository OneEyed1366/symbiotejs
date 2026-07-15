// Co-located Vue-driven test, the Vue twin of react/nested-navigation.test.tsx. Proves the
// scope "parent" chain: a navigator reads the ambient scope BEFORE establishing its own, so when
// one navigator's screen renders ANOTHER navigator (here, a Stack screen renders a Tab), a screen
// deep inside the nested Tab can call useNavigation().getParent() to reach the enclosing Stack's
// handle. Mirrors stack.test.ts's fixture (an injected codegen-shaped RNSScreen ViewConfig) since
// a real Stack is part of this composition; Tab needs no ViewConfig of its own (tabs.test.ts).

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from './stack';
import type { INavigatorHandle } from './stack';
import { Tab } from './tabs';
import { useNavigation } from './composables';
import type { IAnyNavigatorHandle } from './navigation-context';

const ROOT_TAG = 4768;
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
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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

function StackDetailsScreen() {
  return h('symbiote-text', {}, 'stack-details');
}

describe('nested navigators (scope parent chain)', () => {
  it("a root Stack screen's useNavigation().getParent() is undefined (no ambient navigator above it)", async () => {
    let capturedParent: IAnyNavigatorHandle | undefined;
    let getParentCalled = false;
    // Plain functions used as `component:` are stateless functional components - Vue calls them
    // fresh on every render and treats their return value as vnodes directly, NOT as a "setup
    // returns a render fn" component. A screen calling a composable needs a real setup-based
    // component, hence defineComponent here instead of a bare function.
    const RootScreen = defineComponent(() => {
      const navigation = useNavigation();
      capturedParent = navigation.value.getParent();
      getParentCalled = true;
      return () => h('symbiote-text', {}, 'root');
    });

    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { initialRouteName: 'Root' }, () => [
            h(Stack.Screen, { name: 'Root', component: RootScreen }),
          ]),
      }),
    );
    await tick();

    expect(getParentCalled).toBe(true);
    expect(capturedParent).toBeUndefined();
  });

  it('useNavigation().getParent() from inside a Tab screen nested in a Stack screen reaches the enclosing Stack, and pushing through it adds a Stack route', async () => {
    let capturedParent: IAnyNavigatorHandle | undefined;

    const NestedTabHomeScreen = defineComponent(() => {
      const navigation = useNavigation();
      capturedParent = navigation.value.getParent();
      return () => h('symbiote-text', {}, 'tab-home');
    });

    // The Stack screen's own component: a Tab navigator, nested exactly the way a real app
    // composes navigators (a Stack screen's content IS another navigator). No composable of its
    // own, so a plain function (returning vnodes directly) is fine here.
    function RootScreenRendersTab() {
      return h(Tab, { initialRouteName: 'TabHome' }, () => [
        h(Tab.Screen, { name: 'TabHome', component: NestedTabHomeScreen }),
      ]);
    }

    const handleRef = ref<INavigatorHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Stack, { ref: handleRef, initialRouteName: 'Root' }, () => [
            h(Stack.Screen, { name: 'Root', component: RootScreenRendersTab }),
            h(Stack.Screen, { name: 'Details', component: StackDetailsScreen }),
          ]),
      }),
    );
    await tick();

    expect(findAllText(fabric.committed)).toContain('tab-home');

    if (!capturedParent) throw new Error('getParent() returned undefined');
    if (!('push' in capturedParent)) {
      throw new Error('parent handle is not a Stack handle (missing push)');
    }
    capturedParent.push('Details');
    await tick();

    expect(findAllText(fabric.committed)).toContain('stack-details');
    expect(handleRef.value?.canGoBack()).toBe(true);
  });
});
