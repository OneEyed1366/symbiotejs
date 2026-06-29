// Co-located unit test (ADR 0025): the Platform API, no simulator. A fake PlatformConstants
// native module sits behind BOTH bridge paths getNativeModule reads (__turboModuleProxy the
// function, and nativeModuleProxy[name] the HostObject); Platform must mirror RN's iOS shape:
// OS is the static 'ios', select follows ios -> native -> default precedence, and Version/isPad
// reflect the faked getConstants() payload.

import { beforeAll, describe, expect, it } from 'vitest';
import { Platform, type IPlatformConstantsIOS } from './index';

const FAKE_OS_VERSION = '17.4';
const FAKE_IDIOM = 'pad';

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

const fakeConstants: IPlatformConstantsIOS = {
  forceTouchAvailable: false,
  interfaceIdiom: FAKE_IDIOM,
  isTesting: false,
  osVersion: FAKE_OS_VERSION,
  systemName: 'iOS',
  reactNativeVersion: { major: 0, minor: 0, patch: 0, prerelease: null },
};

const fakePlatformConstants = {
  getConstants: (): IPlatformConstantsIOS => fakeConstants,
};

const registeredModules: Record<string, unknown> = { PlatformConstants: fakePlatformConstants };

beforeAll(() => {
  Object.assign(globalThis, {
    // Non-bridgeless: the function proxy.
    __turboModuleProxy: <T>(name: string): T | null => {
      const module = registeredModules[name];
      return isType<T>(module) ? module : null;
    },
    // Bridgeless fallback: the HostObject keyed by module name. Both faked so the test
    // exercises whichever getNativeModule resolves first.
    nativeModuleProxy: registeredModules,
  });
});

describe('Platform (iOS)', () => {
  it("OS is the static 'ios'", () => {
    expect(Platform.OS).toBe('ios');
  });

  describe('select', () => {
    it('picks the ios branch', () => {
      expect(Platform.select({ ios: 'A', android: 'B' })).toBe('A');
    });

    it('falls back to default when no platform branch matches', () => {
      expect(Platform.select({ android: 'B', default: 'D' })).toBe('D');
    });

    it('prefers native over default', () => {
      expect(Platform.select({ native: 'N', default: 'D' })).toBe('N');
    });
  });

  it('Version reflects the faked osVersion', () => {
    expect(Platform.Version).toBe(FAKE_OS_VERSION);
  });

  it("isPad is true for interfaceIdiom 'pad'", () => {
    expect(Platform.isPad).toBe(true);
  });

  it("isTV is false for interfaceIdiom 'pad'", () => {
    expect(Platform.isTV).toBe(false);
  });
});
