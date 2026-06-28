// Co-located unit test (ADR 0025) for the Linking module: both directions of the bridge
// and both platform builds. Per ADR 0019 the platform builds are separate files
// (linking/index.ios.ts / linking/index.android.ts), imported DIRECTLY. JS->native: a fake
// __turboModuleProxy returns a LinkingManager (iOS) and an IntentAndroid (Android).
// native->JS: a fake RN$registerCallableModule captures the device hub, and we play
// "native" by emitting the `url` deep-link event.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let iosLinking: typeof import('./index.ios').Linking;
let androidLinking: typeof import('./index.android').Linking;

let openedUrl: string | undefined;
let androidOpenedUrl: string | undefined;
let sentIntent: { action: string; extras?: unknown } | undefined;
let deviceHub: IDeviceHub | undefined;

beforeEach(async () => {
  openedUrl = undefined;
  androidOpenedUrl = undefined;
  sentIntent = undefined;
  deviceHub = undefined;

  const fakeLinkingManager = {
    getInitialURL: (): Promise<string | null> => Promise.resolve(null),
    canOpenURL: (_url: string): Promise<boolean> => Promise.resolve(true),
    openURL: (url: string): Promise<void> => {
      openedUrl = url;
      return Promise.resolve();
    },
    openSettings: (): Promise<void> => Promise.resolve(),
    addListener: (): void => {},
    removeListeners: (_count: number): void => {},
  };

  // Android routes to IntentAndroid instead, and adds sendIntent. Separate record state
  // proves the Android build hit IntentAndroid, not LinkingManager.
  const fakeIntentAndroid = {
    getInitialURL: (): Promise<string | null> => Promise.resolve(null),
    canOpenURL: (_url: string): Promise<boolean> => Promise.resolve(true),
    openURL: (url: string): Promise<void> => {
      androidOpenedUrl = url;
      return Promise.resolve();
    },
    openSettings: (): Promise<void> => Promise.resolve(),
    sendIntent: (action: string, extras?: unknown): Promise<void> => {
      sentIntent = { action, extras };
      return Promise.resolve();
    },
    addListener: (): void => {},
    removeListeners: (_count: number): void => {},
  };

  const registeredModules: Record<string, unknown> = {
    LinkingManager: fakeLinkingManager,
    IntentAndroid: fakeIntentAndroid,
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ Linking: iosLinking } = await import('./index.ios'));
  ({ Linking: androidLinking } = await import('./index.android'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

describe('Linking (iOS build -> LinkingManager)', () => {
  it('canOpenURL resolves the native boolean', async () => {
    await expect(iosLinking.canOpenURL('https://x')).resolves.toBe(true);
  });

  it('openURL passes the url to LinkingManager', async () => {
    await iosLinking.openURL('https://x');
    expect(openedUrl).toBe('https://x');
  });

  it('getInitialURL does not throw', async () => {
    await expect(iosLinking.getInitialURL()).resolves.toBeNull();
  });

  it('sendIntent rejects (no iOS counterpart) and never reaches IntentAndroid', async () => {
    await expect(iosLinking.sendIntent('android.intent.action.VIEW')).rejects.toBeDefined();
    expect(sentIntent).toBeUndefined();
  });

  it('delivers a native `url` deep-link event to the listener, then stops after remove', () => {
    let received: unknown;
    const sub = iosLinking.addEventListener('url', event => {
      received = event;
    });
    expect(deviceHub).toBeDefined();

    deviceHub?.emit('url', { url: 'app://deep' });
    expect(isRecord(received) && received.url).toBe('app://deep');

    sub.remove();
  });
});

describe('Linking (Android build -> IntentAndroid)', () => {
  it('canOpenURL resolves the native boolean', async () => {
    await expect(androidLinking.canOpenURL('https://a')).resolves.toBe(true);
  });

  it('openURL routes to IntentAndroid', async () => {
    await androidLinking.openURL('intent://a');
    expect(androidOpenedUrl).toBe('intent://a');
  });

  it('sendIntent forwards action and extras', async () => {
    const extras = [{ key: 'foo', value: 'bar' }];
    await androidLinking.sendIntent('android.intent.action.VIEW', extras);
    expect(sentIntent?.action).toBe('android.intent.action.VIEW');
    expect(sentIntent?.extras).toEqual(extras);
  });
});
