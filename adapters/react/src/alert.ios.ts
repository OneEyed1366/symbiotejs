// Alert — iOS build. The native module is `AlertManager`
// (RN's TurboModuleRegistry.get('AlertManager')); `alertWithArgs(args, callback)` pops the
// native alert, and the native `callback(id, value)` reports which button (by numeric id)
// the user tapped plus any text-input value. `alert` delegates to `prompt` — the same
// AlertManager path RN uses. Metro picks this file on an iOS host; the base alert.ts
// re-exports it for web/headless.
//
// The native contract is confirmed from RN's TurboModule spec:
//   .vendors/.../specs_DEPRECATED/modules/NativeAlertManager.js
//     alertWithArgs(args: Args, callback: (id: number, value: string) => void)
//
// Non-throwing, like StatusBar: a missing native module is a no-op, never a crash (on a
// device the module may be absent).

import { dlog, getNativeModule } from '@symbiote/engine'

import type {
  AlertButtons,
  AlertOptions,
  AlertStatic,
  AlertType,
} from './alert-shared'

export type {
  AlertButton,
  AlertButtonStyle,
  AlertButtons,
  AlertOptions,
  AlertType,
} from './alert-shared'

const ALERT_MANAGER = 'AlertManager'

// The native `Args` the spec accepts. Each entry in `buttons` is a single-key map of
// `{ [index]: label }` — RN's wire shape (the native side assigns the tapped button's
// index back as the callback `id`).
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

// The native module typed as the interface we vouch for — only `alertWithArgs`. The
// single point that accepts the native shape (no per-call `as`); the generic on
// getNativeModule carries it. The callback `id`/`value` arrive typed because we declare
// them here, so they cross the trust boundary already narrowed.
interface NativeAlertManager {
  alertWithArgs(args: AlertArgs, callback: (id: number, value: string) => void): void
}

type PromptCallbackOrButtons = ((text: string) => void) | AlertButtons

// prompt builds the native args, assigns each button its array index as id, and dispatches
// the matching button's onPress when the native callback returns that id. Non-throwing: no
// native module -> dlog + no-op.
function prompt(
  title?: string,
  message?: string,
  callbackOrButtons?: PromptCallbackOrButtons,
  type: AlertType = 'plain-text',
  defaultValue?: string,
  keyboardType?: string,
  options?: AlertOptions,
): void {
  dlog('Alert.prompt')

  // callbacks[id] is the onPress for the button at that index — the id->onPress map the
  // native callback indexes into. The native always supplies a real string value, so the
  // element accepts `string`; a button's `onPress` (`value?: string`) is contravariantly
  // assignable to it.
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
    // The native callback crossing back: `id` is the tapped button's index, `value` the
    // text-input contents. Index into callbacks and fire onPress.
    (id, value) => {
      dlog(`Alert callback id=${id}`)
      callbacks[id]?.(value)
    },
  )
}

// The static imperative API RN exposes, mirrored as a static-method object. `prompt` is
// iOS-only, so it lives beyond AlertStatic on this build.
export const Alert: AlertStatic & { prompt: typeof prompt } = {
  // alert delegates to prompt (same AlertManager path), exactly as RN does on iOS.
  alert(title?: string, message?: string, buttons?: AlertButtons, options?: AlertOptions): void {
    prompt(title, message, buttons, 'default', undefined, undefined, options)
  },

  prompt,
}
