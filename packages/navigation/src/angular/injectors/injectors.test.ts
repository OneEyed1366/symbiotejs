// Co-located Angular-driven test for the navigation injectors layer (./index). Mirrors
// ../stack.test.ts's fixture (an injected codegen-shaped RNSScreen ViewConfig exposing
// onAppear/onDisappear) and drives the same native events stack.ts wires to emit 'focus'/'blur' -
// proving the injectors react to the real RNS lifecycle, not to a synthetic shortcut. Each
// injector calls `inject()`, so it is called once per screen component's own constructor (the
// natural Angular injection-context call site).

import '@angular/compiler';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Input,
  ViewChild,
  type Signal,
  type Type,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import { ScreenDirective } from '../screen.directive';
import type { IRoute, INavigatorState } from '../../core';
import {
  injectFocusEffect,
  injectIsFocused,
  injectNavigation,
  injectNavigationState,
  injectRoute,
} from './index';
import type { INavigationHandle } from './index';

const ROOT_TAG = 5130;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';

function directEvent(registrationName: string): { registrationName: string } {
  return { registrationName };
}

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {
      topAppear: directEvent('onAppear'),
      topDisappear: directEvent('onDisappear'),
    },
    validAttributes: { screenId: true, activityState: true },
  },
  [STACK_VIEW]: { directEventTypes: {}, validAttributes: {} },
  [HEADER_CONFIG_VIEW]: { directEventTypes: {}, validAttributes: {} },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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

@Component({
  selector: 'plain-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>plain</symbiote-text>`,
})
class PlainScreenComponent {}

let capturedIsFocused: Signal<boolean> | undefined;

@Component({
  selector: 'is-focused-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class IsFocusedScreenComponent {
  constructor() {
    capturedIsFocused = injectIsFocused();
  }
}

const focusEffectEvents: string[] = [];

@Component({
  selector: 'focus-effect-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class FocusEffectScreenComponent {
  constructor() {
    injectFocusEffect(() => {
      focusEffectEvents.push('effect');
      return () => focusEffectEvents.push('cleanup');
    });
  }
}

let capturedNavigation: INavigationHandle | undefined;
let capturedRoute: Signal<IRoute<unknown>> | undefined;
const focusListenerEvents: string[] = [];

@Component({
  selector: 'navigation-route-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>details</symbiote-text>`,
})
class NavigationRouteScreenComponent {
  constructor() {
    capturedNavigation = injectNavigation();
    capturedRoute = injectRoute();
    capturedNavigation.addListener('focus', () => focusListenerEvents.push('focus'));
  }
}

let capturedRouteCount: Signal<number> | undefined;

@Component({
  selector: 'navigation-state-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class NavigationStateScreenComponent {
  constructor() {
    capturedRouteCount = injectNavigationState((state: INavigatorState) => state.routes.length);
  }
}

let capturedHost: InjectorsTestHost | undefined;

@Component({
  selector: 'injectors-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Home">
      <ng-template symbioteScreen name="Home" [component]="homeComponent"></ng-template>
      <ng-template symbioteScreen name="Details" [component]="detailsComponent"></ng-template>
    </Stack>
  `,
})
class InjectorsTestHost {
  @ViewChild('nav') nav!: Stack;

  @Input() homeComponent: Type<unknown> = PlainScreenComponent;
  @Input() detailsComponent: Type<unknown> = PlainScreenComponent;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

describe('Angular navigation injectors', () => {
  it("injectIsFocused reflects the route's native appear/disappear events", async () => {
    capturedIsFocused = undefined;
    capturedHost = undefined;
    mount(ROOT_TAG, InjectorsTestHost, {
      initialProps: { homeComponent: IsFocusedScreenComponent },
    });
    await tick();
    expect(capturedIsFocused?.()).toBe(false);

    const home = screenNodes()[0];
    fabric.fireEvent(home.instanceHandle, 'topAppear', {});
    await tick();
    expect(capturedIsFocused?.()).toBe(true);

    fabric.fireEvent(home.instanceHandle, 'topDisappear', {});
    await tick();
    expect(capturedIsFocused?.()).toBe(false);
  });

  it('injectFocusEffect runs its effect on focus and its cleanup on blur', async () => {
    focusEffectEvents.length = 0;
    capturedHost = undefined;
    mount(ROOT_TAG, InjectorsTestHost, {
      initialProps: { homeComponent: FocusEffectScreenComponent },
    });
    await tick();
    expect(focusEffectEvents).toEqual([]);

    const home = screenNodes()[0];
    fabric.fireEvent(home.instanceHandle, 'topAppear', {});
    await tick();
    expect(focusEffectEvents).toEqual(['effect']);

    fabric.fireEvent(home.instanceHandle, 'topDisappear', {});
    await tick();
    expect(focusEffectEvents).toEqual(['effect', 'cleanup']);
  });

  it('injectNavigation().addListener fires on focus and injectRoute exposes name/params', async () => {
    capturedNavigation = undefined;
    capturedRoute = undefined;
    focusListenerEvents.length = 0;
    capturedHost = undefined;
    mount(ROOT_TAG, InjectorsTestHost, {
      initialProps: { detailsComponent: NavigationRouteScreenComponent },
    });
    await tick();

    capturedHost!.nav.push('Details', { id: 7 });
    await tick();
    expect(capturedRoute?.().name).toBe('Details');
    expect(capturedRoute?.().params).toEqual({ id: 7 });

    const details = screenNodes()[1];
    fabric.fireEvent(details.instanceHandle, 'topAppear', {});
    await tick();
    expect(focusListenerEvents).toEqual(['focus']);
  });

  it('injectNavigationState reflects the route stack growing/shrinking across push/pop', async () => {
    capturedRouteCount = undefined;
    capturedHost = undefined;
    mount(ROOT_TAG, InjectorsTestHost, {
      initialProps: { homeComponent: NavigationStateScreenComponent },
    });
    await tick();
    expect(capturedRouteCount?.()).toBe(1);

    capturedHost!.nav.push('Details');
    await tick();
    expect(capturedRouteCount?.()).toBe(2);

    capturedHost!.nav.pop();
    await tick();
    expect(capturedRouteCount?.()).toBe(1);
  });
});
