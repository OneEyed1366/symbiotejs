// Co-located unit test (ADR 0025) for the I18nManager module: it reads the native RTL
// constants eagerly at module load, exposes them via getConstants() and the plain `isRTL` /
// `doLeftAndRightSwapInRTL` fields, and routes the allow/force/swap setters straight to the
// native module. Constants are read at import time, so the fake native module is installed
// BEFORE the (fresh) import.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface INativeCall {
  method: string;
  args: unknown[];
}

let I18nManager: typeof import('./index').I18nManager;

let nativeCalls: INativeCall[];

beforeEach(async () => {
  nativeCalls = [];

  const record =
    (method: string) =>
    (...args: unknown[]): void => {
      nativeCalls.push({ method, args });
    };

  const fakeI18nManager = {
    getConstants: () => ({
      isRTL: true,
      doLeftAndRightSwapInRTL: false,
      localeIdentifier: 'ar-EG',
    }),
    allowRTL: record('allowRTL'),
    forceRTL: record('forceRTL'),
    swapLeftAndRightInRTL: record('swapLeftAndRightInRTL'),
  };

  globalThis.nativeModuleProxy = { I18nManager: fakeI18nManager };

  vi.resetModules();
  ({ I18nManager } = await import('./index'));
});

afterEach(() => {
  globalThis.nativeModuleProxy = undefined;
});

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

describe('I18nManager', () => {
  it('mirrors the native RTL constants on the plain fields', () => {
    expect(I18nManager.isRTL).toBe(true);
    expect(I18nManager.doLeftAndRightSwapInRTL).toBe(false);
  });

  it('getConstants() returns the native constants including localeIdentifier', () => {
    const constants = I18nManager.getConstants();
    expect(constants.isRTL).toBe(true);
    expect(constants.doLeftAndRightSwapInRTL).toBe(false);
    expect(constants.localeIdentifier).toBe('ar-EG');
  });

  it('allowRTL routes to the native module', () => {
    I18nManager.allowRTL(true);
    const calls = callsOf('allowRTL');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe(true);
  });

  it('forceRTL routes to the native module', () => {
    I18nManager.forceRTL(false);
    const calls = callsOf('forceRTL');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe(false);
  });

  it('swapLeftAndRightInRTL routes to the native module', () => {
    I18nManager.swapLeftAndRightInRTL(true);
    const calls = callsOf('swapLeftAndRightInRTL');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe(true);
  });
});
