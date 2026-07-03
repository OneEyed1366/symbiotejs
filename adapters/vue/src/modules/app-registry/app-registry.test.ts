// Co-located Vue-driven test (ADR 0025), Vue twin of adapters/react/src/modules/app-registry/
// app-registry.test.tsx. Proves the AppRegistry entry point: `registerComponent(appKey, () =>
// App)` stores a runnable that calls `mount` (driving @symbiotejs/engine) AND bridges it to the
// host registrar (RN's own AppRegistry, injected via `setHostRegistrar`) so native can find it
// by key. Asserts the bridge fires on registration and that invoking the runnable, from the host
// or via `runApplication`, mounts the tree onto the given rootTag.

import { h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppRegistry, setHostRegistrar, unmount, type IAppParameters, type IRunnable } from '../..';
import { installFabric } from '@symbiotejs/test-utils';
import { Text, View } from '../../components';

const APP_KEY = 'canary';
const ROOT_TAG = 211;

const App = () => h(View, { style: { flex: 1 } }, () => h(Text, null, () => 'hi'));

const fabric = installFabric();
// Vue's mount() requestCommit()s on a microtask (vue-adapter-reactivity Gotcha 2), unlike
// React's synchronous commit, so assertions on the committed tree need one tick.
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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
  AppRegistry.registerComponent(APP_KEY, () => App);
});
afterEach(() => unmount(ROOT_TAG));

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
});
