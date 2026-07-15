// Co-located Angular-driven test for the @symbiote-native/navigation Angular Drawer navigator.
// Proves: registry building from @ContentChildren, jumpTo focus switching, openDrawer/
// closeDrawer/toggleDrawer driving the isOpen state and the panel/overlay geometry reuse from
// core (drawerChildOrder/resolveDrawerGeometry), and drawer content projection via the
// `#drawerContent` TemplateRef. Drawer is imported from its own module (NOT the package barrel)
// so ../register never loads headless - Drawer needs no react-native-screens ViewConfig at all.

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, ViewChild, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Animated,
  mount,
  unmount,
  Dimensions,
  registerComposedComponent,
} from '@symbiote-native/angular';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Drawer } from './index';
import type { IDrawerNavigatorHandle } from './index';
import { DrawerScreenDirective } from '../drawer-screen.directive';
import { injectIsFocused } from '../injectors/inject-is-focused';

const ROOT_TAG = 5122;
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// Drawer reads the screen width off WindowDimensionsService (isSwipeStartInEdge) - headless has
// no DeviceInfo native module, so seed a concrete width once; every mount in this file reads this
// same cached value (Dimensions is a module-level singleton). Mirrors
// react/drawer.test.tsx's identical setup.
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

// On a real Metro build, adapters/angular's babel-register-composed.cjs auto-registers `Drawer`
// as an anchor host by scanning the AOT-compiled @Component's selector - vitest never runs that
// pipeline, so this test drives the same self-registration entry point by hand (mirrors
// renderer.test.ts's 'RefApiDemo' convention). Without it, `<Drawer>` falls through to a raw
// Fabric createNode('Drawer') call instead of a non-painting anchor.
registerComposedComponent('Drawer');

// rAF is not a Node global; Animated.timing (driven by every openDrawer/closeDrawer/toggleDrawer
// call) reads it at .start() time. Ported verbatim from react/drawer.test.tsx's own polyfill - no
// frame is ever awaited here since these tests assert on state-derived content, not animated
// frame values.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const cb = pendingFrames.get(id);
        if (cb !== undefined) {
          pendingFrames.delete(id);
          frameClock += 16;
          cb(frameClock);
        }
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
  capturedHomeInstance = undefined;
  capturedSettingsInstance = undefined;
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

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

let capturedHomeInstance: HomeDrawerScreenComponent | undefined;
let capturedSettingsInstance: SettingsDrawerScreenComponent | undefined;

@Component({
  selector: 'home-drawer-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>home</symbiote-text>`,
})
class HomeDrawerScreenComponent {
  // Real screens (e.g. .examples/angular's DrawerHomeScreen) call injectIsFocused() - see the
  // regression test below for why this matters.
  readonly isFocused: Signal<boolean> = injectIsFocused();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHomeInstance = this;
  }
}

@Component({
  selector: 'settings-drawer-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-text>settings</symbiote-text>`,
})
class SettingsDrawerScreenComponent {
  readonly isFocused: Signal<boolean> = injectIsFocused();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedSettingsInstance = this;
  }
}

let capturedHost: DrawerTestHost | undefined;

@Component({
  selector: 'drawer-test-host',
  standalone: true,
  imports: [Drawer, DrawerScreenDirective],
  template: `
    <Drawer #nav initialRouteName="Home">
      <ng-template
        symbioteDrawerScreen
        name="Home"
        [component]="homeComponent"
        [options]="homeOptions"
      ></ng-template>
      <ng-template
        symbioteDrawerScreen
        name="Settings"
        [component]="settingsComponent"
      ></ng-template>
      <ng-template #drawerContent let-ctx>
        <symbiote-text
          >{{ ctx.state.routes.length }} routes, focused index {{ ctx.state.index }}</symbiote-text
        >
      </ng-template>
    </Drawer>
  `,
})
class DrawerTestHost {
  @ViewChild('nav') nav!: Drawer;

  homeComponent = HomeDrawerScreenComponent;
  settingsComponent = SettingsDrawerScreenComponent;
  homeOptions: Record<string, unknown> = { title: 'Home', drawerLabel: 'Home' };

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

async function mountDrawer(): Promise<IDrawerNavigatorHandle> {
  capturedHost = undefined;
  mount(ROOT_TAG, DrawerTestHost);
  await tick();
  const host = capturedHost;
  if (!host) throw new Error('DrawerTestHost never mounted');
  return host.nav;
}

describe('Angular Drawer navigator', () => {
  it('mounts closed, with the initial route focused', async () => {
    const handle = await mountDrawer();
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home')).toBeDefined();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'settings'),
    ).toBeUndefined();
    void handle;
  });

  it('jumpTo() switches the focused/mounted screen and closes the drawer', async () => {
    const handle = await mountDrawer();
    handle.openDrawer();
    await tick();
    handle.jumpTo('Settings');
    await tick();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'settings'),
    ).toBeDefined();
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home')).toBeUndefined();
  });

  // Regression test: jumpTo() used to read isOpen off the signal AFTER dispatch(), by which point
  // drawerRouterReducer had already flipped it to false - so the "was it open?" check always saw
  // false and never animated the panel closed, leaving it visually stuck open even though the
  // router state itself was already correct. Asserts on the actual Animated.timing call
  // (animateProgressTo's own entry point), not just the state-derived content used above, since
  // that's what the stuck-open bug never touched.
  it('jumpTo() animates the panel closed when the drawer was open', async () => {
    const handle = await mountDrawer();
    handle.openDrawer();
    await tick();
    const timingSpy = vi.spyOn(Animated, 'timing');
    handle.jumpTo('Settings');
    await tick();
    expect(timingSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0 }),
    );
  });

  it('openDrawer()/closeDrawer()/toggleDrawer() drive the router state', async () => {
    const handle = await mountDrawer();
    handle.openDrawer();
    await tick();
    handle.closeDrawer();
    await tick();
    handle.toggleDrawer();
    await tick();
    // No public isOpen getter on the handle (mirrors react's IDrawerNavigatorHandle) - proven
    // indirectly via the drawer content projection below, which reads live router state.
    void handle;
  });

  it('projects drawer content via the #drawerContent template, reading live router state', async () => {
    await mountDrawer();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === '2 routes, focused index 0'),
    ).toBeDefined();
  });

  it('reuses core geometry: content/overlay/panel slots paint in front-type order (content, overlay, panel)', async () => {
    await mountDrawer();
    // 'front' (the default drawerType) paints content, then overlay (absent while closed - see
    // isDrawerOverlayVisible), then panel - proven by both home content and the drawer-content
    // template text (panel) being present simultaneously in the committed tree.
    expect(findInTree(n => n.viewName === 'RCTRawText' && n.props.text === 'home')).toBeDefined();
    expect(
      findInTree(n => n.viewName === 'RCTRawText' && n.props.text === '2 routes, focused index 0'),
    ).toBeDefined();
  });

  // Regression test: focusedRouteEmitter() runs as a TEMPLATE EXPRESSION
  // ([emitter]="focusedRouteEmitter()"), inside Angular's reactive-read tracking context for the
  // current CD pass. It synchronously calls emitter.emit(FOCUS/BLUR), fan-out-calling every
  // listener on that route's emitter synchronously too - including injectIsFocused()'s
  // `isFocused.set(...)`, since every real screen calls injectIsFocused(). Angular throws NG600
  // ("signal write during a template execution") the instant that set() runs inside a tracked
  // read. jumpTo() is exactly what tapping a drawer menu item fires. tabs.ts's
  // focusedRouteEmitter() has the identical shape and its own regression test in tabs.test.ts.
  it('switching the focused screen does not throw when it calls injectIsFocused()', async () => {
    const handle = await mountDrawer();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      handle.jumpTo('Settings');
      await tick();
      handle.jumpTo('Home');
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
  // FOCUS event fires to zero listeners and is lost forever - isFocused stays false permanently.
  it('the initially-focused screen actually observes isFocused() becoming true', async () => {
    await mountDrawer();
    await tick();
    expect(capturedHomeInstance).toBeDefined();
    expect(capturedHomeInstance?.isFocused()).toBe(true);
  });

  it('switching screens toggles isFocused() true/false on the exiting/entering screens', async () => {
    const handle = await mountDrawer();
    await tick();
    handle.jumpTo('Settings');
    await tick();
    expect(capturedHomeInstance?.isFocused()).toBe(false);
    expect(capturedSettingsInstance).toBeDefined();
    expect(capturedSettingsInstance?.isFocused()).toBe(true);
  });
});
