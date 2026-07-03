// Co-located Angular-driven test (ADR 0025), Angular twin of adapters/react/src/modules/
// app-registry/app-registry.test.tsx. Proves the AppRegistry entry point:
// `registerComponent(appKey, () => App)` stores a runnable that calls `mount` (driving
// @symbiotejs/engine) AND bridges it to the host registrar (RN's own AppRegistry, injected via
// `setHostRegistrar`) so native can find it by key. Also proves the Angular-specific
// `setWrapperComponentProvider` seam: a pre-authored standalone wrapper receives the root's
// host node as projected `<ng-content>`, the AOT-safe twin of React's
// createElement(Wrapper, null, rootElement).

import '@angular/compiler';
import { Component, Input, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiotejs/test-utils';
import { AppRegistry, setHostRegistrar, type IAppParameters, type IRunnable } from '../..';
import { unmount } from '../../render';

const APP_KEY = 'canary';
const ROOT_TAG = 212;
const WRAPPED_APP_KEY = 'canary-wrapped';
const WRAPPED_ROOT_TAG = 213;

// Angular's mount() batches change detection on a microtask (the `angular-adapter` skill's
// whenCommitted-class gotcha), so assertions on the committed tree need one tick, same as Vue.
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

class TestText {}
Component({
  selector: 'symbiote-text',
  standalone: true,
  template: '<ng-content></ng-content>',
})(TestText);

class SmokeComponent {}
Component({
  selector: 'symbiote-app-registry-smoke',
  standalone: true,
  imports: [TestText],
  template: '<symbiote-text>hi</symbiote-text>',
})(SmokeComponent);

class WrapperComponent {
  @Input() label = '';
}
Component({
  selector: 'symbiote-app-registry-wrapper',
  standalone: true,
  imports: [TestText],
  template: '<symbiote-text>{{ label }}</symbiote-text><ng-content></ng-content>',
})(WrapperComponent);

const fabric = installFabric();

// The host registrar the native side drives (RN's AppRegistry stand-in).
const hostRunnables = new Map<string, IRunnable>();

beforeEach(() => {
  fabric.reset();
  hostRunnables.clear();
  setHostRegistrar({
    registerRunnable: (appKey: string, run: IRunnable): string => {
      hostRunnables.set(appKey, run);
      return appKey;
    },
  });
  AppRegistry.registerComponent(APP_KEY, () => SmokeComponent);
});
afterEach(() => {
  unmount(ROOT_TAG);
  unmount(WRAPPED_ROOT_TAG);
});

describe('AppRegistry', () => {
  it('exposes the app key and bridges the runnable to the host registrar', () => {
    expect(AppRegistry.getAppKeys()).toContain(APP_KEY);
    expect(hostRunnables.get(APP_KEY)).toBeDefined();
  });

  it('mounts the tree when the host invokes the runnable with a rootTag', async () => {
    const hostRun = hostRunnables.get(APP_KEY);
    expect(hostRun).toBeDefined();

    const nativeParams: IAppParameters = { rootTag: ROOT_TAG };
    hostRun!(nativeParams);
    await tick();

    expect(fabric.find(n => n.viewName === 'RCTText')).toBeDefined();
  });

  it('runApplication drives the same runnable locally', async () => {
    AppRegistry.runApplication(APP_KEY, { rootTag: ROOT_TAG });
    await tick();

    expect(fabric.find(n => n.viewName === 'RCTText')).toBeDefined();
  });

  it('projects the root component into a registered wrapper via <ng-content>', async () => {
    AppRegistry.setWrapperComponentProvider(() => WrapperComponent as Type<unknown>);
    AppRegistry.registerComponent(WRAPPED_APP_KEY, () => SmokeComponent);

    AppRegistry.runApplication(WRAPPED_APP_KEY, { rootTag: WRAPPED_ROOT_TAG });
    await tick();

    const texts = fabric.appRoot().children.flatMap(n => fabric.serialize([n]));
    expect(texts.join('')).toContain('hi');
  });
});
