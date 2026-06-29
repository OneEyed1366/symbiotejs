// Co-located unit test (ADR 0025) for the BackHandler module. A fake __turboModuleProxy
// returns a DeviceEventManager native module (invokeDefaultBackPressHandler, counted); a
// fake RN$registerCallableModule captures the device hub so the test can play "native" and
// emit `hardwareBackPress`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let BackHandler: typeof import('./index').BackHandler;

let exitAppCount: number;
let deviceHub: IDeviceHub | undefined;

beforeEach(async () => {
  exitAppCount = 0;
  deviceHub = undefined;

  const fakeDeviceEventManager = {
    invokeDefaultBackPressHandler: (): void => {
      exitAppCount += 1;
    },
    addListener: (): void => {},
    removeListeners: (): void => {},
  };
  const registeredModules: Record<string, unknown> = {
    DeviceEventManager: fakeDeviceEventManager,
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ BackHandler } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

function emitBack(): void {
  if (deviceHub === undefined) throw new Error('BackHandler must install the device hub');
  deviceHub.emit('hardwareBackPress');
}

describe('BackHandler', () => {
  it('a handler returning true consumes the press; the lower handler and native default stay untouched', () => {
    const calls: string[] = [];
    const subFirst = BackHandler.addEventListener('hardwareBackPress', () => {
      calls.push('first');
      return false;
    });
    const subSecond = BackHandler.addEventListener('hardwareBackPress', () => {
      calls.push('second');
      return true;
    });

    const exitsBefore = exitAppCount;
    emitBack();

    // Only the last-registered handler runs (it consumed the press).
    expect(calls).toEqual(['second']);
    expect(exitAppCount).toBe(exitsBefore);

    subFirst.remove();
    subSecond.remove();
  });

  it('runs handlers last-registered-first and fires the native default once when nobody consumes', () => {
    const calls: string[] = [];
    const subA = BackHandler.addEventListener('hardwareBackPress', () => {
      calls.push('a');
      return false;
    });
    const subB = BackHandler.addEventListener('hardwareBackPress', () => {
      calls.push('b');
      return false;
    });

    const exitsBefore = exitAppCount;
    emitBack();

    expect(calls).toEqual(['b', 'a']);
    expect(exitAppCount).toBe(exitsBefore + 1);

    subA.remove();
    subB.remove();
  });

  it('remove() unsubscribes; the native default still fires with no consumer left', () => {
    let received = false;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      received = true;
      return true;
    });

    sub.remove();
    const exitsBefore = exitAppCount;
    emitBack();

    expect(received).toBe(false);
    expect(exitAppCount).toBe(exitsBefore + 1);
  });
});
