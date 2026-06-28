// Co-located unit test (ADR 0025) for the Vibration module: JS->native only. Per ADR 0019
// the platform builds are separate files (vibration/index.ios.ts / vibration/index.android.ts),
// imported DIRECTLY. A fake __turboModuleProxy returns a Vibration module that records
// vibrate / vibrateByPattern / cancel.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVibration } from './shared';

let iosVibration: typeof import('./index.ios').Vibration;
let androidVibration: typeof import('./index.android').Vibration;

let vibrateArg: number | undefined;
let patternArg: number[] | undefined;
let patternRepeatArg: number | undefined;
let canceled: boolean;

beforeEach(async () => {
  vibrateArg = undefined;
  patternArg = undefined;
  patternRepeatArg = undefined;
  canceled = false;

  const fakeVibration = {
    vibrate: (pattern: number): void => {
      vibrateArg = pattern;
    },
    vibrateByPattern: (pattern: number[], repeat: number): void => {
      patternArg = pattern;
      patternRepeatArg = repeat;
    },
    cancel: (): void => {
      canceled = true;
    },
  };

  const registeredModules: Record<string, unknown> = { Vibration: fakeVibration };
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };

  vi.resetModules();
  ({ Vibration: iosVibration } = await import('./index.ios'));
  ({ Vibration: androidVibration } = await import('./index.android'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('Vibration (iOS build -> JS scheduler)', () => {
  it('a default (number) call dispatches to native vibrate(400)', () => {
    iosVibration.vibrate();
    expect(vibrateArg).toBe(400);
  });

  it('an array buzzes the first segment via native vibrate, NOT vibrateByPattern', () => {
    iosVibration.vibrate([0, 100, 200]);
    expect(vibrateArg).toBe(400);
    expect(patternArg).toBeUndefined();
  });

  it('cancel() reaches native cancel()', () => {
    iosVibration.cancel();
    expect(canceled).toBe(true);
  });
});

describe('Vibration (Android build -> native vibrateByPattern)', () => {
  it('an array without repeat calls vibrateByPattern(pattern, -1)', () => {
    androidVibration.vibrate([0, 100, 200]);
    expect(patternArg).toEqual([0, 100, 200]);
    expect(patternRepeatArg).toBe(-1);
  });

  it('an array with repeat=true passes repeat 0', () => {
    androidVibration.vibrate([0, 100, 200], true);
    expect(patternRepeatArg).toBe(0);
  });

  it('cancel() reaches native cancel()', () => {
    androidVibration.cancel();
    expect(canceled).toBe(true);
  });
});

describe('Vibration (no native module)', () => {
  it('is a silent no-op and never runs the pattern strategy', () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    const nullProxyVibration = createVibration({
      vibratePattern: () => {
        throw new Error('vibratePattern must not run when the native module is absent');
      },
    });
    expect(() => {
      nullProxyVibration.vibrate(50);
      nullProxyVibration.vibrate([0, 100]);
      nullProxyVibration.cancel();
    }).not.toThrow();
  });
});
