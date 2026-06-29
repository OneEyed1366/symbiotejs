// Co-located unit test (ADR 0025) for the Alert imperative module across BOTH native
// backends and both platform builds. Per ADR 0019 the platform builds are separate files
// (alert/index.ios.ts / alert/index.android.ts), imported DIRECTLY here. Fake native
// modules (installed via the New-Architecture `__turboModuleProxy` global, the same global
// getNativeModule reads) stand in for the host.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ICapturedArgs {
  title: string;
  message?: string;
  buttons: Array<Record<number, string>>;
  type?: string;
}

interface IDialogConfig {
  title: string;
  message: string;
  cancelable: boolean;
  buttonPositive?: string;
  buttonNegative?: string;
  buttonNeutral?: string;
}

const ANDROID_CONSTANTS = {
  buttonClicked: 'buttonClicked',
  dismissed: 'dismissed',
  buttonPositive: -1,
  buttonNegative: -2,
  buttonNeutral: -3,
};

let iosAlert: typeof import('./index.ios').Alert;
let androidAlert: typeof import('./index.android').Alert;

let captured: ICapturedArgs | null;
let capturedConfig: IDialogConfig | null;

beforeEach(async () => {
  captured = null;
  capturedConfig = null;

  // iOS: fake AlertManager records the args and immediately invokes the native callback
  // with the id of the SECOND button (index 1).
  const fakeAlertManager = {
    alertWithArgs(args: ICapturedArgs, callback: (id: number, value: string) => void): void {
      captured = args;
      callback(1, '');
    },
  };

  // Android: fake DialogManagerAndroid with getConstants() + showAlert; showAlert records
  // the config and immediately fires onAction with the POSITIVE button key (a tap on it).
  const fakeDialogManagerAndroid = {
    getConstants(): typeof ANDROID_CONSTANTS {
      return ANDROID_CONSTANTS;
    },
    showAlert(
      config: IDialogConfig,
      _onError: (error: string) => void,
      onAction: (action: string, buttonKey?: number) => void,
    ): void {
      capturedConfig = config;
      onAction(ANDROID_CONSTANTS.buttonClicked, ANDROID_CONSTANTS.buttonPositive);
    },
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    if (name === 'AlertManager' && isPresent<T>(fakeAlertManager)) return fakeAlertManager;
    if (name === 'DialogManagerAndroid' && isPresent<T>(fakeDialogManagerAndroid)) {
      return fakeDialogManagerAndroid;
    }
    return null;
  };

  vi.resetModules();
  ({ Alert: iosAlert } = await import('./index.ios'));
  ({ Alert: androidAlert } = await import('./index.android'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('Alert (iOS build -> AlertManager)', () => {
  it('passes title/message and both buttons to native, and dispatches the tapped id', () => {
    let okPressed = false;
    iosAlert.alert('t', 'm', [
      { text: 'Cancel' },
      {
        text: 'OK',
        onPress: () => {
          okPressed = true;
        },
      },
    ]);

    expect(captured).not.toBeNull();
    expect(captured?.title).toBe('t');
    expect(captured?.message).toBe('m');
    // Both buttons must reach native as { [index]: label } entries.
    expect(captured?.buttons).toHaveLength(2);
    expect(captured?.buttons[0][0]).toBe('Cancel');
    expect(captured?.buttons[1][1]).toBe('OK');
    // native returned id=1, so the second button's onPress must have fired.
    expect(okPressed).toBe(true);
  });
});

describe('Alert (Android build -> DialogManagerAndroid)', () => {
  it('maps last/middle/first buttons to positive/negative/neutral and fires only positive', () => {
    let androidPositivePressed = false;
    let androidNeutralPressed = false;

    androidAlert.alert('androidTitle', 'androidMsg', [
      {
        text: 'Neutral',
        onPress: () => {
          androidNeutralPressed = true;
        },
      },
      { text: 'Cancel' },
      {
        text: 'OK',
        onPress: () => {
          androidPositivePressed = true;
        },
      },
    ]);

    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig?.title).toBe('androidTitle');
    expect(capturedConfig?.message).toBe('androidMsg');
    expect(capturedConfig?.buttonPositive).toBe('OK');
    expect(capturedConfig?.buttonNegative).toBe('Cancel');
    expect(capturedConfig?.buttonNeutral).toBe('Neutral');
    // onAction fired buttonPositive, so only OK's onPress must have run.
    expect(androidPositivePressed).toBe(true);
    expect(androidNeutralPressed).toBe(false);
  });
});
