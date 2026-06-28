// Co-located unit test (ADR 0025) for the ToastAndroid module: JS->native only. A fake
// __turboModuleProxy returns a ToastAndroid module that records show / showWithGravity /
// showWithGravityAndOffset and exposes getConstants. The module resolves its native module +
// constants at load time, so the fake is installed BEFORE the (fresh) import.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let ToastAndroid: typeof import('./index').ToastAndroid;

let showArgs: [string, number] | undefined;
let gravityArgs: [string, number, number] | undefined;
let offsetArgs: [string, number, number, number, number] | undefined;

beforeEach(async () => {
  showArgs = undefined;
  gravityArgs = undefined;
  offsetArgs = undefined;

  const fakeToast = {
    getConstants: (): Record<string, number> => ({
      SHORT: 0,
      LONG: 1,
      TOP: 48,
      BOTTOM: 80,
      CENTER: 17,
    }),
    show: (message: string, duration: number): void => {
      showArgs = [message, duration];
    },
    showWithGravity: (message: string, duration: number, gravity: number): void => {
      gravityArgs = [message, duration, gravity];
    },
    showWithGravityAndOffset: (
      message: string,
      duration: number,
      gravity: number,
      xOffset: number,
      yOffset: number,
    ): void => {
      offsetArgs = [message, duration, gravity, xOffset, yOffset];
    },
  };

  const registeredModules: Record<string, unknown> = { ToastAndroid: fakeToast };
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };

  vi.resetModules();
  ({ ToastAndroid } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

const CONSTANT_KEYS = ['SHORT', 'LONG', 'TOP', 'BOTTOM', 'CENTER'] as const;

describe('ToastAndroid (module present)', () => {
  it('exposes the constants as numbers', () => {
    for (const key of CONSTANT_KEYS) {
      expect(typeof ToastAndroid[key]).toBe('number');
    }
  });

  it('show forwards (message, duration)', () => {
    ToastAndroid.show('hello', ToastAndroid.SHORT);
    expect(showArgs).toEqual(['hello', ToastAndroid.SHORT]);
  });

  it('showWithGravity forwards all args', () => {
    ToastAndroid.showWithGravity('grav', ToastAndroid.LONG, ToastAndroid.CENTER);
    expect(gravityArgs).toEqual(['grav', ToastAndroid.LONG, ToastAndroid.CENTER]);
  });

  it('showWithGravityAndOffset forwards all args', () => {
    ToastAndroid.showWithGravityAndOffset('off', ToastAndroid.SHORT, ToastAndroid.BOTTOM, 25, 50);
    expect(offsetArgs).toEqual(['off', ToastAndroid.SHORT, ToastAndroid.BOTTOM, 25, 50]);
  });
});

describe('ToastAndroid (no module)', () => {
  it('the show* calls are silent no-ops and the constants are still numbers', async () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    vi.resetModules();
    const fresh = await import('./index');
    const toast = fresh.ToastAndroid;

    expect(() => {
      toast.show('x', toast.SHORT);
      toast.showWithGravity('x', toast.LONG, toast.CENTER);
      toast.showWithGravityAndOffset('x', toast.SHORT, toast.BOTTOM, 1, 2);
    }).not.toThrow();

    for (const key of CONSTANT_KEYS) {
      expect(typeof toast[key]).toBe('number');
    }
  });
});
