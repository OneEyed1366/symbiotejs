// Co-located Angular-driven test for the @symbiote-native/navigation Angular Tab navigator.
// Proves: registry building from @ContentChildren, tab switching via jumpTo, focus/blur
// synthesis, tab bar item painting (label/icon/badge/tint), and press wiring. Tab is imported from
// its own module (NOT the package barrel) so the ../register side-effect never loads headless -
// Tab needs no react-native-screens ViewConfig at all (pure-JS UI).

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, ViewChild, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, registerComposedComponent } from '@symbiote-native/angular';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Tab } from './index';
import type { ITabNavigatorHandle } from './index';
import { TabScreenDirective } from '../tab-screen.directive';
import { injectIsFocused } from '../injectors/inject-is-focused';

const ROOT_TAG = 5121;
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const fabric = installFabric();
// On a real Metro build, adapters/angular's babel-register-composed.cjs auto-registers `Tab`
// as an anchor host by scanning the AOT-compiled @Component's selector - vitest never runs that
// pipeline, so this test drives the same self-registration entry point by hand (mirrors
// renderer.test.ts's 'RefApiDemo' convention). Without it, `<Tab>` falls through to a raw
// Fabric createNode('Tab') call instead of a non-painting anchor.
registerComposedComponent('Tab');

beforeEach(() => {
  fabric.reset();
  capturedFeedInstance = undefined;
  capturedProfileInstance = undefined;
});
afterEach(() => unmount(ROOT_TAG));

function findInTree(
  predicate: (node: IFakeNode) => boolean,
  nodes = fabric.committed,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const found = findInTree(predicate, node.children);
    if (found) return found;
  }
  return undefined;
}

let capturedFeedInstance: FeedScreenComponent | undefined;
let capturedProfileInstance: ProfileScreenComponent | undefined;

@Component({
  selector: 'feed-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>feed</symbiote-text>`,
})
class FeedScreenComponent {
  // Real screens (e.g. .examples/angular's TabHomeScreen) call injectIsFocused() - see the
  // regression test below for why this matters.
  readonly isFocused: Signal<boolean> = injectIsFocused();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedFeedInstance = this;
  }
}

@Component({
  selector: 'profile-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>profile</symbiote-text>`,
})
class ProfileScreenComponent {
  readonly isFocused: Signal<boolean> = injectIsFocused();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedProfileInstance = this;
  }
}

let capturedHost: TabTestHost | undefined;

@Component({
  selector: 'tab-test-host',
  standalone: true,
  imports: [Tab, TabScreenDirective],
  template: `
    <Tab #nav initialRouteName="Feed">
      <ng-template
        symbioteTabScreen
        name="Feed"
        [component]="feedComponent"
        [options]="feedOptions"
      ></ng-template>
      <ng-template
        symbioteTabScreen
        name="Profile"
        [component]="profileComponent"
        [options]="profileOptions"
      ></ng-template>
    </Tab>
  `,
})
class TabTestHost {
  @ViewChild('nav') nav!: Tab;

  feedComponent = FeedScreenComponent;
  profileComponent = ProfileScreenComponent;
  feedOptions: Record<string, unknown> = { title: 'Feed', tabBarBadge: 3 };
  profileOptions: Record<string, unknown> = { tabBarLabel: 'Me' };

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

async function mountTab(): Promise<ITabNavigatorHandle> {
  capturedHost = undefined;
  mount(ROOT_TAG, TabTestHost);
  await tick();
  const host = capturedHost;
  if (!host) throw new Error('TabTestHost never mounted');
  return host.nav;
}

function tabItemNodes(): IFakeNode[] {
  const found: IFakeNode[] = [];
  const collect = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.props.accessibilityRole === 'tab') found.push(node);
      collect(node.children);
    }
  };
  collect(fabric.committed);
  return found;
}

describe('Angular Tab navigator', () => {
  it("mounts only the initial route's content and marks it focused in the tab bar", async () => {
    await mountTab();
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'feed')).toBeDefined();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'profile'),
    ).toBeUndefined();
    const items = tabItemNodes();
    expect(items).toHaveLength(2);
    expect(items[0].props.accessibilityState).toEqual({ selected: true });
    expect(items[1].props.accessibilityState).toEqual({ selected: false });
  });

  it('jumpTo() switches the mounted content and the focused tab bar item', async () => {
    const handle = await mountTab();
    handle.jumpTo('Profile');
    await tick();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'profile'),
    ).toBeDefined();
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'feed')).toBeUndefined();
    const items = tabItemNodes();
    expect(items[0].props.accessibilityState).toEqual({ selected: false });
    expect(items[1].props.accessibilityState).toEqual({ selected: true });
  });

  it('resolves tabBarLabel/title fallback and paints a badge', async () => {
    await mountTab();
    const items = tabItemNodes();
    // Feed: no tabBarLabel, falls back to title 'Feed'; badge '3' painted as a child text.
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'Feed')).toBeDefined();
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === '3')).toBeDefined();
    // Profile: explicit tabBarLabel 'Me' wins over the route name.
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'Me')).toBeDefined();
    expect(items).toHaveLength(2);
  });

  it('tapping a tab bar item calls jumpTo via the wired onPress passthrough', async () => {
    // onPress is synthesized by the engine from a touchStart/touchEnd pair on the node (no direct
    // native 'press' event - see render-tabs.ts's own comment on ITabBarItemView.passthrough).
    await mountTab();
    const items = tabItemNodes();
    const profileItem = items[1];
    const nativeEvent = {
      target: profileItem.tag,
      identifier: 1,
      pageX: 0,
      pageY: 0,
      locationX: 0,
      locationY: 0,
      timestamp: Date.now(),
    };
    fabric.fireEvent(profileItem.instanceHandle, 'topTouchStart', nativeEvent);
    fabric.fireEvent(profileItem.instanceHandle, 'topTouchEnd', nativeEvent);
    await tick();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'profile'),
    ).toBeDefined();
  });

  // Regression test: focusedRouteEmitter() runs as a TEMPLATE EXPRESSION
  // ([emitter]="focusedRouteEmitter()"), evaluated inside Angular's reactive-read tracking
  // context for the current CD pass. It synchronously calls emitter.emit(FOCUS/BLUR), which
  // fan-out-calls every listener on that route's emitter synchronously too - including
  // injectIsFocused()'s `isFocused.set(...)`, since every real screen (TabHomeScreen,
  // TabSearchScreen, TabProfileScreen in .examples/angular) calls injectIsFocused(). Angular
  // throws NG600 ("signal write during a template execution") the instant that set() runs
  // inside a tracked read - not gated behind ngDevMode, so this reproduces in every build,
  // not just dev. jumpTo() is exactly what a tab-bar tap fires (see the test above), so this
  // threw on literally every tab switch. drawer.ts's focusedRouteEmitter() has the identical
  // shape and its own regression test in drawer.test.ts.
  it('switching tabs does not throw when the newly-focused screen calls injectIsFocused()', async () => {
    const handle = await mountTab();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      handle.jumpTo('Profile');
      await tick();
      handle.jumpTo('Feed');
      await tick();
    } finally {
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    }
  });

  // injectIsFocused() reads context.emitter at CALL time (during the screen's own constructor),
  // which runs as part of *ngComponentOutlet creating the screen - nested INSIDE the same
  // <ng-container [emitter]="focusedRouteEmitter()"> whose input evaluation is what actually
  // fires the FOCUS emit. If Angular evaluates the ng-container's OWN inputs (calling
  // focusedRouteEmitter(), firing FOCUS) before creating/refreshing the nested ngComponentOutlet
  // child (running the screen's constructor, registering the injectIsFocused() listener), the
  // FOCUS event fires to zero listeners and is lost forever - isFocused stays false permanently,
  // exactly as reported ("focused: false", never changes, even after switching tabs back to it).
  it('the initially-focused screen actually observes isFocused() becoming true', async () => {
    await mountTab();
    await tick();
    expect(capturedFeedInstance).toBeDefined();
    expect(capturedFeedInstance?.isFocused()).toBe(true);
  });

  it('switching tabs toggles isFocused() true/false on the exiting/entering screens', async () => {
    const handle = await mountTab();
    await tick();
    handle.jumpTo('Profile');
    await tick();
    expect(capturedFeedInstance?.isFocused()).toBe(false);
    expect(capturedProfileInstance).toBeDefined();
    expect(capturedProfileInstance?.isFocused()).toBe(true);
  });
});
