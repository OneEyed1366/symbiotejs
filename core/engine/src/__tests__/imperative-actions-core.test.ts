// Co-located unit test (ADR 0025): the imperative-action modules (Alert / Linking / Vibration)
// reach the native bridge correctly. A fake __turboModuleProxy captures each native call; native
// module NAMES are NOT verified here: a headless fake answers to any name (symbiote invariant);
// this proves only the JS path.

import { beforeAll, describe, expect, it } from 'vitest';
import { Alert } from '../alert';
import { Linking } from '../linking';
import { Vibration } from '../vibration';

interface ICapturedAlert {
  title?: string;
  message?: string;
}

let capturedAlert: ICapturedAlert | null = null;
let capturedOpenUrl: string | null = null;
let capturedVibrate: number | null = null;

const fakeModules: Record<string, unknown> = {
  AlertManager: {
    alertWithArgs(args: ICapturedAlert): void {
      capturedAlert = args;
    },
  },
  LinkingManager: {
    openURL(url: string): Promise<void> {
      capturedOpenUrl = url;
      return Promise.resolve();
    },
    canOpenURL(): Promise<boolean> {
      return Promise.resolve(true);
    },
    getInitialURL(): Promise<string | null> {
      return Promise.resolve(null);
    },
    addListener(): void {},
    removeListeners(): void {},
  },
  Vibration: {
    vibrate(pattern: number): void {
      capturedVibrate = pattern;
    },
    vibrateByPattern(): void {},
  },
};

function isType<T>(value: unknown): value is T {
  return typeof value === 'object' && value !== null;
}

beforeAll(() => {
  Object.assign(globalThis, {
    __turboModuleProxy: <T>(name: string): T | null => {
      const found = fakeModules[name];
      return isType<T>(found) ? found : null;
    },
  });
});

describe('imperative engine modules reach the native bridge', () => {
  it('Alert.alert -> AlertManager.alertWithArgs', () => {
    Alert.alert('Title here', 'Body here', [{ text: 'OK' }]);
    expect(capturedAlert).not.toBeNull();
    expect(capturedAlert?.title).toBe('Title here');
    expect(capturedAlert?.message).toBe('Body here');
  });

  it('Linking.openURL -> LinkingManager.openURL', async () => {
    await Linking.openURL('https://example.com/deep');
    expect(capturedOpenUrl).toBe('https://example.com/deep');
  });

  it('Vibration.vibrate -> Vibration.vibrate', () => {
    Vibration.vibrate(250);
    expect(capturedVibrate).toBe(250);
  });
});
