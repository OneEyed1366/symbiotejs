// Co-located unit test (ADR 0025) for the Appearance module. A fake __turboModuleProxy
// returns an Appearance native module (getColorScheme -> 'light' plus observe-counters); a
// fake RN$registerCallableModule captures the device hub so the test can play "native" and
// emit `appearanceChanged`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let Appearance: typeof import('./index').Appearance;

let appearanceAdded: number;
let appearanceRemoved: number;
let currentNativeScheme: 'light' | 'dark';
let deviceHub: IDeviceHub | undefined;

beforeEach(async () => {
  appearanceAdded = 0;
  appearanceRemoved = 0;
  currentNativeScheme = 'light';
  deviceHub = undefined;

  const fakeAppearance = {
    getColorScheme: (): 'light' | 'dark' => currentNativeScheme,
    setColorScheme: (scheme: 'light' | 'dark' | 'unspecified'): void => {
      if (scheme !== 'unspecified') currentNativeScheme = scheme;
    },
    addListener: (): void => {
      appearanceAdded += 1;
    },
    removeListeners: (count: number): void => {
      appearanceRemoved += count;
    },
  };
  const registeredModules: Record<string, unknown> = { Appearance: fakeAppearance };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ Appearance } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('Appearance', () => {
  it('reads the initial color scheme from native', () => {
    expect(Appearance.getColorScheme()).toBe('light');
  });

  it('the change listener and the cached read track a native change, then stop after remove', () => {
    let received: unknown;
    const sub = Appearance.addChangeListener(preferences => {
      received = preferences.colorScheme;
    });
    expect(deviceHub).toBeDefined();
    expect(appearanceAdded).toBeGreaterThanOrEqual(1);

    deviceHub?.emit('appearanceChanged', { colorScheme: 'dark' });
    expect(received).toBe('dark');
    // The cached read must also reflect the system change.
    expect(Appearance.getColorScheme()).toBe('dark');

    const removedBefore = appearanceRemoved;
    received = undefined;
    sub.remove();
    expect(appearanceRemoved).toBe(removedBefore + 1);

    deviceHub?.emit('appearanceChanged', { colorScheme: 'light' });
    expect(received).toBeUndefined();
  });
});
