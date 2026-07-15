// Co-located Angular-driven test proving the DI "parent" chain: NavigationContextService reads
// the ambient (parent-scope) instance via `@Optional() @SkipSelf() inject(...)` in its own
// constructor (navigation-context.service.ts) BEFORE NavigationScopeDirective re-provides a fresh
// one for its own content, so when one navigator's screen renders ANOTHER navigator (here, a Stack
// screen renders a Tab), a screen deep inside the nested Tab can call injectNavigation().getParent()
// to reach the enclosing Stack's handle - with ZERO manual threading (unlike react/
// nested-navigation.test.tsx, which needs an explicit `ambientContext` read + re-provide in every
// navigator; Angular's own hierarchical DI does this automatically, see navigation-context.
// service.ts's header comment). Mirrors stack.test.ts's fixture since a real Stack is part of
// this composition; Tab needs no ViewConfig of its own.

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, Input, ViewChild, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from './stack';
import { ScreenDirective } from './screen.directive';
import { Tab } from './tabs';
import { TabScreenDirective } from './tab-screen.directive';
import { injectNavigation } from './injectors';
import type { IAnyNavigatorHandle } from './navigation-context.service';

const ROOT_TAG = 5140;
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

@Component({
  selector: 'root-plain-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>root</symbiote-text>`,
})
class RootPlainScreenComponent {}

@Component({
  selector: 'stack-details-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>stack-details</symbiote-text>`,
})
class StackDetailsScreenComponent {}

let capturedParent: IAnyNavigatorHandle | undefined;
let getParentCalled = false;

@Component({
  selector: 'root-getparent-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>root</symbiote-text>`,
})
class RootGetParentScreenComponent {
  constructor() {
    capturedParent = injectNavigation().getParent();
    getParentCalled = true;
  }
}

@Component({
  selector: 'nested-tab-home-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>tab-home</symbiote-text>`,
})
class NestedTabHomeScreenComponent {
  constructor() {
    capturedParent = injectNavigation().getParent();
  }
}

// The Stack screen's own content: a Tab navigator, nested exactly the way a real app composes
// navigators (a Stack screen's content IS another navigator). Angular's DI naturally threads the
// `parent` chain - this component does NOT need to read or forward any ambient context itself.
@Component({
  selector: 'root-renders-tab-screen',
  standalone: true,
  imports: [Tab, TabScreenDirective],
  template: `
    <Tab initialRouteName="TabHome">
      <ng-template symbioteTabScreen name="TabHome" [component]="tabHomeComponent"></ng-template>
    </Tab>
  `,
})
class RootRendersTabScreenComponent {
  tabHomeComponent = NestedTabHomeScreenComponent;
}

let capturedHost: NestedTestHost | undefined;

@Component({
  selector: 'nested-test-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Root">
      <ng-template symbioteScreen name="Root" [component]="rootComponent"></ng-template>
      <ng-template symbioteScreen name="Details" [component]="detailsComponent"></ng-template>
    </Stack>
  `,
})
class NestedTestHost {
  @ViewChild('nav') nav!: Stack;

  @Input() rootComponent: Type<unknown> = RootPlainScreenComponent;
  detailsComponent = StackDetailsScreenComponent;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

describe('Angular nested navigators (DI parent chain)', () => {
  it("a root Stack screen's injectNavigation().getParent() is undefined (no ambient navigator above it)", async () => {
    capturedParent = undefined;
    getParentCalled = false;
    capturedHost = undefined;
    mount(ROOT_TAG, NestedTestHost, {
      initialProps: { rootComponent: RootGetParentScreenComponent },
    });
    await tick();

    expect(getParentCalled).toBe(true);
    expect(capturedParent).toBeUndefined();
  });

  it('injectNavigation().getParent() from inside a Tab screen nested in a Stack screen reaches the enclosing Stack, and pushing through it adds a Stack route', async () => {
    capturedParent = undefined;
    capturedHost = undefined;
    mount(ROOT_TAG, NestedTestHost, {
      initialProps: { rootComponent: RootRendersTabScreenComponent },
    });
    await tick();

    expect(findAllText(fabric.committed)).toContain('tab-home');

    if (!capturedParent) throw new Error('getParent() returned undefined');
    if (!('push' in capturedParent)) {
      throw new Error('parent handle is not a Stack handle (missing push)');
    }
    // capturedParent is now narrowed to INavigatorHandle by the 'push in' guard above.
    capturedParent.push('Details');
    await tick();

    expect(findAllText(fabric.committed)).toContain('stack-details');
    expect(capturedHost!.nav.canGoBack()).toBe(true);
  });
});
