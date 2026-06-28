// Co-located React-driven test (ADR 0025), ported from `app-registry.smoke.tsx`.
// Proves the AppRegistry entry point: `registerComponent(appKey, () => App)` stores a
// runnable that calls `mount` (driving @symbiote/engine) AND bridges it to the host
// registrar (RN's own AppRegistry, injected via `setHostRegistrar`) so native can find
// it by key. Asserts the bridge fires on registration and that invoking the runnable,
// from the host or via `runApplication`, mounts the tree onto the given rootTag.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AppRegistry,
  setHostRegistrar,
  Text,
  View,
  mount,
  unmount,
  type IAppParameters,
  type IRunnable,
} from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';

const APP_KEY = 'canary';
const ROOT_TAG = 210;

function App(): ReactElement {
  return (
    <View style={{ flex: 1 }}>
      <Text>hi</Text>
    </View>
  );
}

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
  AppRegistry.registerComponent(APP_KEY, () => App);
});
afterEach(() => unmount(ROOT_TAG));

describe('AppRegistry', () => {
  it('exposes the app key and bridges the runnable to the host registrar', () => {
    expect(AppRegistry.getAppKeys()).toContain(APP_KEY);
    expect(hostRunnables.get(APP_KEY)).toBeDefined();
  });

  it('mounts the tree when the host invokes the runnable with a rootTag', () => {
    const hostRun = hostRunnables.get(APP_KEY);
    expect(hostRun).toBeDefined();

    const nativeParams: IAppParameters = { rootTag: ROOT_TAG };
    hostRun!(nativeParams);

    expect(fabric.find(n => n.viewName === 'RCTText')).toBeDefined();
  });

  it('runApplication drives the same runnable locally', () => {
    AppRegistry.runApplication(APP_KEY, { rootTag: ROOT_TAG });

    expect(fabric.find(n => n.viewName === 'RCTText')).toBeDefined();
  });
});
