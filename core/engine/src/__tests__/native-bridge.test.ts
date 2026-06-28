// Co-located unit test (ADR 0025): the native-module bridge primitives, both directions, no
// simulator. JS->native: a fake __turboModuleProxy returns fake modules; assert getNativeModule /
// getEnforcingNativeModule. native->JS: a fake RN$registerCallableModule captures the hub
// installDeviceEventHub registers; play "native" by calling hub.emit and assert NativeEventEmitter
// delivers the payload and drives the module's addListener/removeListeners counters.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  getNativeModule,
  getEnforcingNativeModule,
  installDeviceEventHub,
  NativeEventEmitter,
} from '../index';

interface IFakeStatusBar {
  setHidden(hidden: boolean): void;
}

type IDeviceHub = { emit: (eventType: string, ...args: unknown[]) => void };

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const fakeStatusBar: IFakeStatusBar = { setHidden: () => {} };
const registeredModules: Record<string, unknown> = { StatusBarManager: fakeStatusBar };

// The device hub our code registers, captured so a test can act as "native".
let deviceHub: IDeviceHub | undefined;

beforeAll(() => {
  Object.assign(globalThis, {
    __turboModuleProxy: <T>(name: string): T | null => {
      const module = registeredModules[name];
      return isType<T>(module) ? module : null;
    },
    RN$registerCallableModule: (name: string, factory: () => IDeviceHub): void => {
      if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
    },
  });
});

describe('getNativeModule', () => {
  it('resolves a registered module with its methods', () => {
    const statusBar = getNativeModule<IFakeStatusBar>('StatusBarManager');
    expect(statusBar).not.toBeNull();
    expect(typeof statusBar?.setHidden).toBe('function');
  });

  it('resolves an unregistered module to null', () => {
    expect(getNativeModule('NopeManager')).toBeNull();
  });

  it('falls back to global.nativeModuleProxy on a bridgeless host (no __turboModuleProxy)', () => {
    const savedTurbo = globalThis.__turboModuleProxy;
    Object.assign(globalThis, {
      __turboModuleProxy: undefined,
      nativeModuleProxy: { StatusBarManager: fakeStatusBar },
    });

    expect(getNativeModule<IFakeStatusBar>('StatusBarManager')).not.toBeNull();
    expect(getNativeModule('NopeManager')).toBeNull();

    Object.assign(globalThis, { __turboModuleProxy: savedTurbo, nativeModuleProxy: undefined });
  });
});

describe('getEnforcingNativeModule', () => {
  it('throws on a missing module', () => {
    expect(() => getEnforcingNativeModule('NopeManager')).toThrow();
  });
});

describe('device events flow native -> JS through the hub', () => {
  it('delivers a native payload and drives the module observe-counters', () => {
    installDeviceEventHub();
    expect(deviceHub).toBeDefined();
    if (deviceHub === undefined) throw new Error('hub not registered');

    let added = 0;
    let removed = 0;
    const observer = {
      addListener: () => {
        added += 1;
      },
      removeListeners: (count: number) => {
        removed += count;
      },
    };
    const emitter = new NativeEventEmitter(observer);

    let received: unknown;
    const sub = emitter.addListener('keyboardDidShow', payload => {
      received = payload;
    });
    expect(added).toBe(1);

    deviceHub.emit('keyboardDidShow', { endCoordinates: { height: 336 } });
    expect(isRecord(received) && isRecord(received.endCoordinates)).toBe(true);
    if (isRecord(received) && isRecord(received.endCoordinates)) {
      expect(received.endCoordinates.height).toBe(336);
    }

    received = undefined;
    sub.remove();
    expect(removed).toBe(1);
    deviceHub.emit('keyboardDidShow', { endCoordinates: { height: 0 } });
    expect(received).toBeUndefined();
  });
});
