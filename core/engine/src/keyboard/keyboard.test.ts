// Co-located unit test (ADR 0025) for the Keyboard module's secondary surface. A fake
// __turboModuleProxy returns a KeyboardObserver (observe-counters only); a fake
// RN$registerCallableModule captures the device hub so the test can play "native" and emit
// keyboardDidShow / keyboardDidHide.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IKeyboardEvent } from './index';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let Keyboard: typeof import('./index').Keyboard;

let observerAdded: number;
let observerRemoved: number;
let deviceHub: IDeviceHub | undefined;

const showEvent: IKeyboardEvent = {
  duration: 250,
  easing: 'keyboard',
  endCoordinates: { screenX: 0, screenY: 300, width: 390, height: 346 },
};

beforeEach(async () => {
  observerAdded = 0;
  observerRemoved = 0;
  deviceHub = undefined;

  const fakeKeyboardObserver = {
    addListener: (): void => {
      observerAdded += 1;
    },
    removeListeners: (count: number): void => {
      observerRemoved += count;
    },
  };
  const registeredModules: Record<string, unknown> = { KeyboardObserver: fakeKeyboardObserver };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ Keyboard } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('Keyboard', () => {
  it('a tracked listener fires and the cache tracks show then hide; remove() pings the observer', () => {
    let received: unknown;
    const sub = Keyboard.addListener('keyboardDidShow', payload => {
      received = payload;
    });
    expect(deviceHub).toBeDefined();
    expect(observerAdded).toBeGreaterThanOrEqual(1);
    expect(Keyboard.isVisible()).toBe(false);

    deviceHub?.emit('keyboardDidShow', showEvent);
    expect(received).toBe(showEvent);
    expect(Keyboard.isVisible()).toBe(true);

    const metrics = Keyboard.metrics();
    expect(metrics?.height).toBe(346);
    expect(metrics?.screenY).toBe(300);

    deviceHub?.emit('keyboardDidHide', showEvent);
    expect(Keyboard.isVisible()).toBe(false);
    expect(Keyboard.metrics()).toBeUndefined();

    const removedBefore = observerRemoved;
    sub.remove();
    expect(observerRemoved).toBe(removedBefore + 1);
  });

  it('removeAllListeners tears down callers but the cache self-subscription survives', () => {
    let firstCount = 0;
    let secondCount = 0;
    Keyboard.addListener('keyboardDidShow', () => {
      firstCount += 1;
    });
    Keyboard.addListener('keyboardDidShow', () => {
      secondCount += 1;
    });
    expect(deviceHub).toBeDefined();

    deviceHub?.emit('keyboardDidShow', showEvent);
    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1);

    Keyboard.removeAllListeners('keyboardDidShow');
    deviceHub?.emit('keyboardDidShow', showEvent);
    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1);

    // The internal cache feed is untracked, so it still updated on that last emit.
    expect(Keyboard.isVisible()).toBe(true);
  });
});
