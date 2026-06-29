// Co-located unit test (ADR 0025) for the PermissionsAndroid module: it resolves the native
// module lazily and routes check / request / requestMultiple / shouldShowRequestPermission-
// Rationale to it, narrowing each native return at the trust boundary, and exposes the frozen
// PERMISSIONS / RESULTS maps. It MUST degrade gracefully (Android-only, symbiote is
// iOS-first): with no module, check resolves false and request resolves RESULTS.DENIED
// without throwing. The native module is faked on `nativeModuleProxy` (bridgeless host-object
// form).

import { afterEach, describe, expect, it, vi } from 'vitest';

interface INativeCall {
  method: string;
  args: unknown[];
}

let nativeCalls: INativeCall[];

function record(method: string, ret: unknown): (...args: unknown[]) => Promise<unknown> {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
    return Promise.resolve(ret);
  };
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

afterEach(() => {
  globalThis.nativeModuleProxy = undefined;
});

describe('PermissionsAndroid (no native module)', () => {
  it('degrades gracefully: check resolves false and request resolves DENIED, no throw', async () => {
    globalThis.nativeModuleProxy = undefined;
    vi.resetModules();
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await import('./index');

    await expect(PermissionsAndroid.check(PERMISSIONS.CAMERA)).resolves.toBe(false);
    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA)).resolves.toBe(RESULTS.DENIED);
  });
});

describe('PermissionsAndroid (native module present)', () => {
  async function loadWithFake(): Promise<typeof import('./index')> {
    nativeCalls = [];
    const fakePermissionsAndroid = {
      checkPermission: record('checkPermission', true),
      requestPermission: record('requestPermission', 'granted'),
      shouldShowRequestPermissionRationale: record('shouldShowRequestPermissionRationale', false),
      requestMultiplePermissions: record('requestMultiplePermissions', {
        'android.permission.CAMERA': 'granted',
        'android.permission.ACCESS_FINE_LOCATION': 'denied',
      }),
    };
    globalThis.nativeModuleProxy = { PermissionsAndroid: fakePermissionsAndroid };
    vi.resetModules();
    return import('./index');
  }

  it('exposes the PERMISSIONS / RESULTS constants on the module and the instance', async () => {
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await loadWithFake();

    expect(RESULTS.GRANTED).toBe('granted');
    expect(RESULTS.DENIED).toBe('denied');
    expect(RESULTS.NEVER_ASK_AGAIN).toBe('never_ask_again');
    expect(PERMISSIONS.CAMERA).toBe('android.permission.CAMERA');
    expect(PERMISSIONS.ACCESS_FINE_LOCATION).toBe('android.permission.ACCESS_FINE_LOCATION');
    expect(PermissionsAndroid.PERMISSIONS.CAMERA).toBe('android.permission.CAMERA');
    expect(PermissionsAndroid.RESULTS.GRANTED).toBe('granted');
  });

  it('check resolves the native boolean and calls checkPermission once', async () => {
    const { PermissionsAndroid, PERMISSIONS } = await loadWithFake();

    await expect(PermissionsAndroid.check(PERMISSIONS.CAMERA)).resolves.toBe(true);
    const calls = callsOf('checkPermission');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('android.permission.CAMERA');
  });

  it('request resolves the native RESULTS string and calls requestPermission once', async () => {
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await loadWithFake();

    await expect(PermissionsAndroid.request(PERMISSIONS.CAMERA)).resolves.toBe(RESULTS.GRANTED);
    const calls = callsOf('requestPermission');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('android.permission.CAMERA');
  });

  it('requestMultiple resolves the per-permission map', async () => {
    const { PermissionsAndroid, PERMISSIONS, RESULTS } = await loadWithFake();

    const map = await PermissionsAndroid.requestMultiple([
      PERMISSIONS.CAMERA,
      PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    expect(map[PERMISSIONS.CAMERA]).toBe(RESULTS.GRANTED);
    expect(map[PERMISSIONS.ACCESS_FINE_LOCATION]).toBe(RESULTS.DENIED);
  });
});
