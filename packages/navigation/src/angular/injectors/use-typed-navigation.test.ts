// Co-located Angular-driven test for injectStackNavigation/injectTabNavigation/
// injectDrawerNavigation - the narrowed twins of injectNavigation() that hide the union guard.
// Angular twin of react/hooks/use-typed-navigation.test.tsx.

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, Input } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource, Dimensions } from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import { ScreenDirective } from '../screen.directive';
import { Tab } from '../tabs';
import { TabScreenDirective } from '../tab-screen.directive';
import { Drawer } from '../drawer';
import { DrawerScreenDirective } from '../drawer-screen.directive';
import { injectDrawerNavigation, injectStackNavigation, injectTabNavigation } from './index';

const ROOT_TAG = 5613;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {
      topAppear: { registrationName: 'onAppear' },
      topDisappear: { registrationName: 'onDisappear' },
    },
    validAttributes: { screenId: true, activityState: true },
  },
  [STACK_VIEW]: { directEventTypes: {}, validAttributes: {} },
};

// Drawer reads the screen width off WindowDimensionsService; headless has no DeviceInfo native
// module, so seed a concrete width once - same fixture as drawer.test.ts.
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

@Component({
  selector: 'plain-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>plain</symbiote-text>`,
})
class PlainScreenComponent {}

let canPush = false;

@Component({
  selector: 'stack-tracked-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class StackTrackedScreenComponent {
  constructor() {
    const navigation = injectStackNavigation();
    canPush = typeof navigation.push === 'function';
  }
}

@Component({
  selector: 'stack-throwing-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class StackThrowingScreenComponent {
  constructor() {
    injectStackNavigation();
  }
}

let canJumpTo = false;

@Component({
  selector: 'tab-tracked-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class TabTrackedScreenComponent {
  constructor() {
    const navigation = injectTabNavigation();
    canJumpTo = typeof navigation.jumpTo === 'function';
  }
}

@Component({
  selector: 'tab-throwing-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class TabThrowingScreenComponent {
  constructor() {
    injectTabNavigation();
  }
}

let canOpenDrawer = false;

@Component({
  selector: 'drawer-tracked-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class DrawerTrackedScreenComponent {
  constructor() {
    const navigation = injectDrawerNavigation();
    canOpenDrawer = typeof navigation.openDrawer === 'function';
  }
}

@Component({
  selector: 'drawer-throwing-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class DrawerThrowingScreenComponent {
  constructor() {
    injectDrawerNavigation();
  }
}

@Component({
  selector: 'stack-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack initialRouteName="Home">
      <ng-template symbioteScreen name="Home" [component]="homeComponent"></ng-template>
      <ng-template symbioteScreen name="Details" [component]="plainComponent"></ng-template>
    </Stack>
  `,
})
class StackHost {
  @Input() homeComponent: unknown = PlainScreenComponent;
  readonly plainComponent = PlainScreenComponent;
}

@Component({
  selector: 'tab-host',
  standalone: true,
  imports: [Tab, TabScreenDirective],
  template: `
    <Tab initialRouteName="Home">
      <ng-template symbioteTabScreen name="Home" [component]="homeComponent"></ng-template>
      <ng-template symbioteTabScreen name="Search" [component]="plainComponent"></ng-template>
    </Tab>
  `,
})
class TabHost {
  @Input() homeComponent: unknown = PlainScreenComponent;
  readonly plainComponent = PlainScreenComponent;
}

@Component({
  selector: 'drawer-host',
  standalone: true,
  imports: [Drawer, DrawerScreenDirective],
  template: `
    <Drawer initialRouteName="Home">
      <ng-template symbioteDrawerScreen name="Home" [component]="homeComponent"></ng-template>
      <ng-template symbioteDrawerScreen name="Profile" [component]="plainComponent"></ng-template>
    </Drawer>
  `,
})
class DrawerHost {
  @Input() homeComponent: unknown = PlainScreenComponent;
  readonly plainComponent = PlainScreenComponent;
}

describe('injectStackNavigation', () => {
  it('returns a concretely-typed Stack handle with push, no narrowing needed', async () => {
    canPush = false;
    mount(ROOT_TAG, StackHost, { initialProps: { homeComponent: StackTrackedScreenComponent } });
    await tick();
    expect(canPush).toBe(true);
  });

  it('throws when the nearest navigator is a Tab, not a Stack', () => {
    expect(() =>
      mount(ROOT_TAG, TabHost, { initialProps: { homeComponent: StackThrowingScreenComponent } }),
    ).toThrow(/nearest navigator is not a Stack/);
  });
});

describe('injectTabNavigation', () => {
  it('returns a concretely-typed Tab handle with jumpTo, no narrowing needed', async () => {
    canJumpTo = false;
    mount(ROOT_TAG, TabHost, { initialProps: { homeComponent: TabTrackedScreenComponent } });
    await tick();
    expect(canJumpTo).toBe(true);
  });

  it('throws when the nearest navigator is a Stack, not a Tab', () => {
    expect(() =>
      mount(ROOT_TAG, StackHost, { initialProps: { homeComponent: TabThrowingScreenComponent } }),
    ).toThrow(/nearest navigator is not a Tab/);
  });
});

describe('injectDrawerNavigation', () => {
  it('returns a concretely-typed Drawer handle with openDrawer, no narrowing needed', async () => {
    canOpenDrawer = false;
    mount(ROOT_TAG, DrawerHost, {
      initialProps: { homeComponent: DrawerTrackedScreenComponent },
    });
    await tick();
    expect(canOpenDrawer).toBe(true);
  });

  it('throws when the nearest navigator is a Stack, not a Drawer', () => {
    expect(() =>
      mount(ROOT_TAG, StackHost, {
        initialProps: { homeComponent: DrawerThrowingScreenComponent },
      }),
    ).toThrow(/nearest navigator is not a Drawer/);
  });
});
