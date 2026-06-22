// Alert — a JS->native imperative module, no Fabric view, no React. Two native
// backends, picked by Platform.OS in this one file (ADR 0018 — a Platform.OS branch,
// not a .ios/.android Metro split, so the tsx/Node smoke harness resolves it):
//
//   iOS     → `AlertManager.alertWithArgs(args, callback)` pops the native alert;
//             the native `callback(id, value)` reports which button (by numeric id)
//             the user tapped and any text-input value.
//   Android → `DialogManagerAndroid.showAlert(config, onError, onAction)` pops the
//             native dialog; `onAction(action, buttonKey)` reports the action and the
//             tapped button's key constant, both read from `getConstants()`.
//
// The native contracts are confirmed from RN's TurboModule specs:
//   .vendors/.../specs_DEPRECATED/modules/NativeAlertManager.js
//     alertWithArgs(args: Args, callback: (id: number, value: string) => void)
//   .vendors/.../specs_DEPRECATED/modules/NativeDialogManagerAndroid.js
//     getConstants(): { buttonClicked, dismissed, buttonPositive, buttonNegative,
//                       buttonNeutral }
//     showAlert(config, onError: (msg) => void, onAction: (action, buttonKey?) => void)
//
// Non-throwing, like StatusBar: a missing native module is a no-op, never a crash
// (on a device the module may be absent).

import { dlog, getNativeModule, Platform } from '@symbiote/shared'

// The native module name per platform. iOS hits AlertManager; Android does NOT use
// it — Android's dialog lives in DialogManagerAndroid (DialogManagerAndroid is
// device-verify-pending: headless fakes resolve any name, so the Android name is
// proven only on a real host — see .docs/native-module-platform-routing.md).
const ALERT_MODULE = {
  ios: 'AlertManager',
  android: 'DialogManagerAndroid',
} as const

const ALERT_MANAGER = ALERT_MODULE.ios

// RN's hardwired Android fallbacks for the button-key constants (NativeDialogManager-
// Android documents buttonPositive=-1, buttonNegative=-2, buttonNeutral=-3, and the
// 'buttonClicked'/'dismissed' actions). Used when getConstants() omits a key.
const ANDROID_DIALOG_CONSTANTS = {
  buttonClicked: 'buttonClicked',
  dismissed: 'dismissed',
  buttonPositive: -1,
  buttonNegative: -2,
  buttonNeutral: -3,
} as const

// The default positive label RN uses when an Android button carries no text.
const DEFAULT_POSITIVE_TEXT = 'OK'

// The alert `type` strings the spec documents (iOS), as a closed union so a typo
// can't reach the native call. 'default' = no text input; the rest prompt.
export type AlertType = 'default' | 'plain-text' | 'secure-text' | 'login-password'

// The iOS button styles RN documents.
export type AlertButtonStyle = 'default' | 'cancel' | 'destructive'

export interface AlertButton {
  text?: string
  onPress?: (value?: string) => void
  isPreferred?: boolean
  style?: AlertButtonStyle
}

export type AlertButtons = AlertButton[]

export interface AlertOptions {
  cancelable?: boolean
  userInterfaceStyle?: 'unspecified' | 'light' | 'dark'
  onDismiss?: () => void
}

// The native `Args` the spec accepts. Each entry in `buttons` is a single-key map
// of `{ [index]: label }` — RN's wire shape (the native side assigns the tapped
// button's index back as the callback `id`).
interface AlertArgs {
  title: string
  message?: string
  buttons: Array<Record<number, string>>
  type?: AlertType
  defaultValue?: string
  cancelButtonKey?: string
  destructiveButtonKey?: string
  preferredButtonKey?: string
  keyboardType?: string
  userInterfaceStyle?: string
}

// The native module typed as the interface we vouch for — only `alertWithArgs`.
// This is the single point that accepts the native shape (no per-call `as`); the
// generic on getNativeModule carries it. The callback `id`/`value` arrive typed
// because we declare them here, so they cross the trust boundary already narrowed.
interface NativeAlertManager {
  alertWithArgs(args: AlertArgs, callback: (id: number, value: string) => void): void
}

// The Android dialog config — RN's DialogOptions. At most three buttons map onto the
// positive/negative/neutral slots; `cancelable` controls dismiss-on-outside-tap.
interface DialogConfig {
  title: string
  message: string
  cancelable: boolean
  buttonPositive?: string
  buttonNegative?: string
  buttonNeutral?: string
}

// The button-key constants getConstants() returns: the two action strings and the
// three numeric button keys. We narrow them at the trust boundary below.
interface AndroidDialogConstants {
  buttonClicked: string
  dismissed: string
  buttonPositive: number
  buttonNegative: number
  buttonNeutral: number
}

// The Android native module: getConstants() for the button-key constants plus
// showAlert. `buttonKey` is optional on dismiss (no button was tapped).
interface NativeDialogManagerAndroid {
  getConstants(): unknown
  showAlert(
    config: DialogConfig,
    onError: (error: string) => void,
    onAction: (action: string, buttonKey?: number) => void,
  ): void
}

// The trust boundary for getConstants(): native sends an untyped HostObject. Read each
// key with a typeof guard and fall back to RN's documented default when it's missing.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readDialogConstants(raw: unknown): AndroidDialogConstants {
  if (!isRecord(raw)) {
    dlog('Alert: DialogManagerAndroid.getConstants() returned a non-object — using defaults')
    return ANDROID_DIALOG_CONSTANTS
  }
  const action = (key: 'buttonClicked' | 'dismissed'): string =>
    typeof raw[key] === 'string' ? raw[key] : ANDROID_DIALOG_CONSTANTS[key]
  const buttonKey = (key: 'buttonPositive' | 'buttonNegative' | 'buttonNeutral'): number =>
    typeof raw[key] === 'number' ? raw[key] : ANDROID_DIALOG_CONSTANTS[key]
  return {
    buttonClicked: action('buttonClicked'),
    dismissed: action('dismissed'),
    buttonPositive: buttonKey('buttonPositive'),
    buttonNegative: buttonKey('buttonNegative'),
    buttonNeutral: buttonKey('buttonNeutral'),
  }
}

type PromptCallbackOrButtons = ((text: string) => void) | AlertButtons

// The static imperative API RN exposes, mirrored as a static-method object.
export const Alert = {
  // alert delegates to prompt on iOS (same AlertManager path); on Android it builds
  // the DialogManagerAndroid config and dispatches via onAction — exactly as RN does.
  alert(title?: string, message?: string, buttons?: AlertButtons, options?: AlertOptions): void {
    if (Platform.OS === 'android') {
      Alert.alertAndroid(title, message, buttons, options)
      return
    }
    Alert.prompt(title, message, buttons, 'default', undefined, undefined, options)
  },

  // The Android dialog path. RN keeps at most three buttons and maps them, last-to-
  // first, onto positive/negative/neutral; onAction reads the native button-key
  // constant back and fires that button's onPress. Non-throwing: no module -> no-op.
  alertAndroid(title?: string, message?: string, buttons?: AlertButtons, options?: AlertOptions): void {
    dlog('Alert.alert (android)')

    const manager = getNativeModule<NativeDialogManagerAndroid>(ALERT_MODULE.android)
    if (manager === null) {
      dlog(`Alert.alert: "${ALERT_MODULE.android}" unresolved — no-op`)
      return
    }
    const constants = readDialogConstants(manager.getConstants())

    const config: DialogConfig = {
      title: title || '',
      message: message || '',
      cancelable: options?.cancelable ?? false,
    }

    // At most three buttons (neutral, negative, positive). Ignore the rest. RN pops
    // last-to-first, so the LAST button becomes positive and the FIRST neutral.
    const validButtons: AlertButtons = buttons ? buttons.slice(0, 3) : [{ text: DEFAULT_POSITIVE_TEXT }]
    const buttonPositive = validButtons.pop()
    const buttonNegative = validButtons.pop()
    const buttonNeutral = validButtons.pop()

    if (buttonNeutral) {
      config.buttonNeutral = buttonNeutral.text || ''
    }
    if (buttonNegative) {
      config.buttonNegative = buttonNegative.text || ''
    }
    if (buttonPositive) {
      config.buttonPositive = buttonPositive.text || DEFAULT_POSITIVE_TEXT
    }

    // onAction maps the returned button-key constant back to the matching button's
    // onPress; the dismiss action fires options.onDismiss.
    const onAction = (action: string, buttonKey?: number): void => {
      dlog(`Alert onAction action=${action} buttonKey=${String(buttonKey)}`)
      if (action === constants.buttonClicked) {
        if (buttonKey === constants.buttonNeutral) {
          buttonNeutral?.onPress?.()
        } else if (buttonKey === constants.buttonNegative) {
          buttonNegative?.onPress?.()
        } else if (buttonKey === constants.buttonPositive) {
          buttonPositive?.onPress?.()
        }
      } else if (action === constants.dismissed) {
        options?.onDismiss?.()
      }
    }
    const onError = (errorMessage: string): void => {
      dlog(`Alert onError: ${errorMessage}`)
    }
    manager.showAlert(config, onError, onAction)
  },

  // prompt builds the native args, assigns each button its array index as id, and
  // dispatches the matching button's onPress when the native callback returns that
  // id. Non-throwing: no native module -> dlog + no-op.
  prompt(
    title?: string,
    message?: string,
    callbackOrButtons?: PromptCallbackOrButtons,
    type: AlertType = 'plain-text',
    defaultValue?: string,
    keyboardType?: string,
    options?: AlertOptions,
  ): void {
    dlog('Alert.prompt')

    // callbacks[id] is the onPress for the button at that index — the id->onPress
    // map the native callback indexes into. The native always supplies a real
    // string value, so the element accepts `string`; a button's `onPress`
    // (`value?: string`) is contravariantly assignable to it.
    let callbacks: Array<((value: string) => void) | undefined> = []
    const buttons: Array<Record<number, string>> = []
    let cancelButtonKey: string | undefined
    let destructiveButtonKey: string | undefined
    let preferredButtonKey: string | undefined

    if (typeof callbackOrButtons === 'function') {
      callbacks = [callbackOrButtons]
    } else if (Array.isArray(callbackOrButtons)) {
      callbackOrButtons.forEach((btn, index) => {
        callbacks[index] = btn.onPress
        if (btn.style === 'cancel') {
          cancelButtonKey = String(index)
        } else if (btn.style === 'destructive') {
          destructiveButtonKey = String(index)
        }
        if (btn.isPreferred) {
          preferredButtonKey = String(index)
        }
        if (btn.text !== undefined || index < callbackOrButtons.length - 1) {
          buttons.push({ [index]: btn.text ?? '' })
        }
      })
    }

    const manager = getNativeModule<NativeAlertManager>(ALERT_MANAGER)
    if (manager === null) {
      dlog(`Alert.prompt: "${ALERT_MANAGER}" unresolved — no-op`)
      return
    }

    manager.alertWithArgs(
      {
        title: title ?? '',
        message: message || undefined,
        buttons,
        type: type || undefined,
        defaultValue,
        cancelButtonKey,
        destructiveButtonKey,
        preferredButtonKey,
        keyboardType,
        userInterfaceStyle: options?.userInterfaceStyle || undefined,
      },
      // The native callback crossing back: `id` is the tapped button's index,
      // `value` the text-input contents. Index into callbacks and fire onPress.
      (id, value) => {
        dlog(`Alert callback id=${id}`)
        callbacks[id]?.(value)
      },
    )
  },
}
