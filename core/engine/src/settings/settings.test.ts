// Co-located unit test (ADR 0025) for the Settings module: the snapshot seeds from native
// getConstants().settings, `set` writes through to native setValues AND updates the snapshot,
// and a `watchKeys` watcher fires only when its key's value actually changes. A fake
// nativeModuleProxy (bridgeless host-object form) provides SettingsManager; a fake
// RN$registerCallableModule captures the device hub.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface INativeCall {
  method: string;
  args: unknown[];
}
interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let Settings: typeof import('./index').Settings;

let nativeCalls: INativeCall[];
let deviceHub: IDeviceHub | undefined;

beforeEach(async () => {
  nativeCalls = [];
  deviceHub = undefined;

  const fakeSettingsManager = {
    getConstants() {
      return { settings: { foo: 1 } };
    },
    setValues(values: Record<string, unknown>) {
      nativeCalls.push({ method: 'setValues', args: [values] });
    },
    deleteValues(keys: string[]) {
      nativeCalls.push({ method: 'deleteValues', args: [keys] });
    },
    addListener() {},
    removeListeners() {},
  };

  globalThis.nativeModuleProxy = { SettingsManager: fakeSettingsManager };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ Settings } = await import('./index'));
});

afterEach(() => {
  globalThis.nativeModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function setValuesCalls(): INativeCall[] {
  return nativeCalls.filter(call => call.method === 'setValues');
}

describe('Settings', () => {
  it('seeds the snapshot from native getConstants().settings', () => {
    expect(Settings.get('foo')).toBe(1);
  });

  it('set writes through to native setValues and updates the snapshot', () => {
    Settings.set({ foo: 2 });

    const calls = setValuesCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toEqual({ foo: 2 });
    expect(Settings.get('foo')).toBe(2);
  });

  it('a watcher fires only when its key changes, never for an unrelated key or an unchanged value', () => {
    let fooFires = 0;
    Settings.watchKeys('foo', () => {
      fooFires += 1;
    });

    Settings.set({ bar: 'x' });
    expect(fooFires).toBe(0);

    Settings.set({ foo: 3 });
    expect(fooFires).toBe(1);
    expect(Settings.get('foo')).toBe(3);

    // Setting the SAME value again is not a change.
    Settings.set({ foo: 3 });
    expect(fooFires).toBe(1);
  });

  it('a native settingsUpdated event feeds the snapshot and fires watchers', () => {
    let fooFires = 0;
    Settings.watchKeys('foo', () => {
      fooFires += 1;
    });
    expect(deviceHub).toBeDefined();

    deviceHub?.emit('settingsUpdated', { foo: 4 });
    expect(Settings.get('foo')).toBe(4);
    expect(fooFires).toBe(1);
  });
});
