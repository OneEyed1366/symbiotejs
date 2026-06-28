// Co-located unit test (ADR 0025) for the AppState module. A fake __turboModuleProxy returns
// an AppState native module (getConstants -> { initialAppState: 'active' } plus
// observe-counters); a fake RN$registerCallableModule captures the device hub so the test can
// play "native" and emit `appStateDidChange`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let AppState: typeof import('./index').AppState;

let appStateAdded: number;
let appStateRemoved: number;
let deviceHub: IDeviceHub | undefined;

beforeEach(async () => {
  appStateAdded = 0;
  appStateRemoved = 0;
  deviceHub = undefined;

  const fakeAppState = {
    getConstants: (): { initialAppState: string } => ({ initialAppState: 'active' }),
    addListener: (): void => {
      appStateAdded += 1;
    },
    removeListeners: (count: number): void => {
      appStateRemoved += count;
    },
  };
  const registeredModules: Record<string, unknown> = { AppState: fakeAppState };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ AppState } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('AppState', () => {
  it('isAvailable reflects the resolved native module', () => {
    expect(AppState.isAvailable).toBe(true);
  });

  it('seeds the initial currentState from getConstants', () => {
    expect(AppState.currentState).toBe('active');
  });

  it("the 'change' listener and currentState track a native change, and remove() unsubscribes", () => {
    let received: unknown;
    const sub = AppState.addEventListener('change', state => {
      received = state;
    });
    expect(deviceHub).toBeDefined();
    expect(appStateAdded).toBeGreaterThanOrEqual(1);

    deviceHub?.emit('appStateDidChange', { app_state: 'background' });
    expect(received).toBe('background');
    expect(AppState.currentState).toBe('background');

    const removedBefore = appStateRemoved;
    received = undefined;
    sub.remove();
    expect(appStateRemoved).toBe(removedBefore + 1);

    deviceHub?.emit('appStateDidChange', { app_state: 'active' });
    expect(received).toBeUndefined();
  });
});
