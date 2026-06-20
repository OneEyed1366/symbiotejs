// Alert — a JS->native imperative module, no Fabric view, no React. It drives the
// `AlertManager` native module: `alertWithArgs(args, callback)` pops the native
// alert, and the native `callback(id, value)` reports which button (by numeric id)
// the user tapped and any text-input value. We mirror RN's arg-building and the
// id->onPress dispatch faithfully.
//
// The native contract is confirmed from RN's TurboModule spec at
// .vendors/react-native/.../src/private/specs_DEPRECATED/modules/NativeAlertManager.js:
//   alertWithArgs(args: Args, callback: (id: number, value: string) => void)
//
// iOS only: RN's Alert.alert delegates to Alert.prompt on iOS and calls
// AlertManager directly; the Android dialog path (NativeDialogManagerAndroid) is
// out of scope here. Non-throwing, like StatusBar: a missing native module is a
// no-op, never a crash (on a device the module may be absent).

import { dlog, getNativeModule } from '@symbiote/shared'

const ALERT_MANAGER = 'AlertManager'

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

type PromptCallbackOrButtons = ((text: string) => void) | AlertButtons

// The static imperative API RN exposes, mirrored as a static-method object.
export const Alert = {
  // alert delegates to prompt on iOS, exactly as RN does — same AlertManager path.
  alert(title?: string, message?: string, buttons?: AlertButtons, options?: AlertOptions): void {
    Alert.prompt(title, message, buttons, 'default', undefined, undefined, options)
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
