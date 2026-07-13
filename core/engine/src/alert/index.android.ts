// Alert, Android build. The native module is `DialogManagerAndroid`
// (RN's TurboModuleRegistry.get('DialogManagerAndroid')): `showAlert(config, onError,
// onAction)` pops the native dialog, and `onAction(action, buttonKey)` reports the action
// plus the tapped button's key constant. At most three buttons map onto positive/negative/
// neutral, last-to-first as RN does. Everything platform-agnostic is the shared core.
// Metro picks this file on an Android host.
//
// The native contract is confirmed from RN's TurboModule spec for
// `INativeDialogManagerAndroid`:
//   getConstants(): { buttonClicked, dismissed, buttonPositive, buttonNegative,
//                     buttonNeutral }
//   showAlert(config, onError: (msg) => void, onAction: (action, buttonKey?) => void)
//
// device-verify-pending: the `DialogManagerAndroid` name and routing are confirmed from RN
// source but not yet exercised on a real Android host; only a bridgeless resolution log
// there can prove the name.
//
// Non-throwing, like StatusBar: a missing native module is a no-op, never a crash.

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';
import { isRecord } from '../type-guards';

import {
  DEFAULT_POSITIVE_TEXT,
  normalizeButtons,
  type IAlertButtons,
  type IAlertOptions,
  type IAlertStatic,
} from './shared';

export type {
  IAlertButton,
  IAlertButtonStyle,
  IAlertButtons,
  IAlertOptions,
  IAlertType,
} from './shared';

const DIALOG_MANAGER = 'DialogManagerAndroid';

// RN's hardwired Android fallbacks for the button-key constants (NativeDialogManager-
// Android documents buttonPositive=-1, buttonNegative=-2, buttonNeutral=-3, and the
// 'buttonClicked'/'dismissed' actions). Used when getConstants() omits a key.
const ANDROID_DIALOG_CONSTANTS = {
  buttonClicked: 'buttonClicked',
  dismissed: 'dismissed',
  buttonPositive: -1,
  buttonNegative: -2,
  buttonNeutral: -3,
} as const;

// The Android dialog config (RN's DialogOptions). At most three buttons map onto the
// positive/negative/neutral slots; `cancelable` controls dismiss-on-outside-tap.
interface IDialogConfig {
  title: string;
  message: string;
  cancelable: boolean;
  buttonPositive?: string;
  buttonNegative?: string;
  buttonNeutral?: string;
}

// The button-key constants getConstants() returns: the two action strings and the three
// numeric button keys. We narrow them at the trust boundary below.
interface IAndroidDialogConstants {
  buttonClicked: string;
  dismissed: string;
  buttonPositive: number;
  buttonNegative: number;
  buttonNeutral: number;
}

// The Android native module: getConstants() for the button-key constants plus showAlert.
// `buttonKey` is optional on dismiss (no button was tapped).
interface INativeDialogManagerAndroid {
  getConstants(): unknown;
  showAlert(
    config: IDialogConfig,
    onError: (error: string) => void,
    onAction: (action: string, buttonKey?: number) => void,
  ): void;
}

// The trust boundary for getConstants(): native sends an untyped HostObject. Read each key
// with a typeof guard and fall back to RN's documented default when it's missing.

function readDialogConstants(raw: unknown): IAndroidDialogConstants {
  if (!isRecord(raw)) {
    dlog('Alert: DialogManagerAndroid.getConstants() returned a non-object — using defaults');
    return ANDROID_DIALOG_CONSTANTS;
  }
  const action = (key: 'buttonClicked' | 'dismissed'): string =>
    typeof raw[key] === 'string' ? raw[key] : ANDROID_DIALOG_CONSTANTS[key];
  const buttonKey = (key: 'buttonPositive' | 'buttonNegative' | 'buttonNeutral'): number =>
    typeof raw[key] === 'number' ? raw[key] : ANDROID_DIALOG_CONSTANTS[key];
  return {
    buttonClicked: action('buttonClicked'),
    dismissed: action('dismissed'),
    buttonPositive: buttonKey('buttonPositive'),
    buttonNegative: buttonKey('buttonNegative'),
    buttonNeutral: buttonKey('buttonNeutral'),
  };
}

// The static imperative API RN exposes, mirrored as a static-method object. `prompt` has
// no Android counterpart in RN, so it is a dlog'd no-op here (documented below).
export const Alert: IAlertStatic & { prompt: () => void } = {
  // The Android dialog path. RN keeps at most three buttons and maps them, last-to-first,
  // onto positive/negative/neutral; onAction reads the native button-key constant back and
  // fires that button's onPress. Non-throwing: no module -> no-op.
  alert(title?: string, message?: string, buttons?: IAlertButtons, options?: IAlertOptions): void {
    dlog('Alert.alert (android)');

    const manager = getNativeModule<INativeDialogManagerAndroid>(DIALOG_MANAGER);
    if (manager === null) {
      dlog(`Alert.alert: "${DIALOG_MANAGER}" unresolved — no-op`);
      return;
    }
    const constants = readDialogConstants(manager.getConstants());

    const config: IDialogConfig = {
      title: title || '',
      message: message || '',
      cancelable: options?.cancelable ?? false,
    };

    // At most three buttons (neutral, negative, positive). Ignore the rest. RN pops
    // last-to-first, so the LAST button becomes positive and the FIRST neutral.
    const validButtons: IAlertButtons = normalizeButtons(buttons).slice(0, 3);
    const buttonPositive = validButtons.pop();
    const buttonNegative = validButtons.pop();
    const buttonNeutral = validButtons.pop();

    if (buttonNeutral) {
      config.buttonNeutral = buttonNeutral.text || '';
    }
    if (buttonNegative) {
      config.buttonNegative = buttonNegative.text || '';
    }
    if (buttonPositive) {
      config.buttonPositive = buttonPositive.text || DEFAULT_POSITIVE_TEXT;
    }

    // onAction maps the returned button-key constant back to the matching button's onPress;
    // the dismiss action fires options.onDismiss.
    const onAction = (action: string, buttonKey?: number): void => {
      dlog(`Alert onAction action=${action} buttonKey=${String(buttonKey)}`);
      if (action === constants.buttonClicked) {
        if (buttonKey === constants.buttonNeutral) {
          buttonNeutral?.onPress?.();
        } else if (buttonKey === constants.buttonNegative) {
          buttonNegative?.onPress?.();
        } else if (buttonKey === constants.buttonPositive) {
          buttonPositive?.onPress?.();
        }
      } else if (action === constants.dismissed) {
        options?.onDismiss?.();
      }
    };
    const onError = (errorMessage: string): void => {
      dlog(`Alert onError: ${errorMessage}`);
    };
    manager.showAlert(config, onError, onAction);
  },

  // Android has no native `prompt` (RN's Alert.prompt is iOS-only; there is no
  // DialogManagerAndroid equivalent). Keep the symbol so the surface matches, but no-op
  // with a dlog rather than route to a single-input dialog.
  prompt(): void {
    dlog('Alert.prompt: no Android equivalent — no-op');
  },
};
