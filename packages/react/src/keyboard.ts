// Keyboard module — the first consumer of the native->JS event bridge. Native
// emits keyboard notifications (show/hide/changeFrame) into the device hub; this
// subscribes through a NativeEventEmitter bound to the KeyboardObserver native
// module, which RN keys its keyboard events off of. Mirrors RN's
// Libraries/Components/Keyboard/Keyboard.js, slimmed to the parts we need.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  type EventEmitterModule,
  type EventSubscription,
  type NativeEventListener,
  dlog,
} from '@symbiote/shared'
import { blurTextInput, currentlyFocusedInput } from './text-input-state'

// The native module name RN registers the keyboard observer under — confirmed
// from its spec (specs_DEPRECATED/modules/NativeKeyboardObserver.js:20,
// `TurboModuleRegistry.get('KeyboardObserver')`).
const KEYBOARD_OBSERVER_MODULE = 'KeyboardObserver'

// The keyboard notification names native emits. RN's KeyboardEventDefinitions.
export const KEYBOARD_EVENT = {
  willShow: 'keyboardWillShow',
  didShow: 'keyboardDidShow',
  willHide: 'keyboardWillHide',
  didHide: 'keyboardDidHide',
  willChangeFrame: 'keyboardWillChangeFrame',
  didChangeFrame: 'keyboardDidChangeFrame',
} as const

export type KeyboardEventName = (typeof KEYBOARD_EVENT)[keyof typeof KEYBOARD_EVENT]

// The KeyboardObserver native module. Its only methods are the observe-counters
// (so native starts/stops watching the keyboard as JS subscribes); it satisfies
// EventEmitterModule. The spec carries no dismiss() — RN dismisses via a separate
// utility — so dismiss() here is a no-op for the first cut (see Keyboard.dismiss).
interface NativeKeyboardObserver extends EventEmitterModule {
  addListener(eventType: string): void
  removeListeners(count: number): void
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on the
// first addListener. Null when the module isn't linked.
let observer: NativeKeyboardObserver | null | undefined
let emitter: NativeEventEmitter | undefined

function getEmitter(): NativeEventEmitter {
  if (emitter === undefined) {
    if (observer === undefined) {
      observer = getNativeModule<NativeKeyboardObserver>(KEYBOARD_OBSERVER_MODULE)
      dlog(`Keyboard: KeyboardObserver module ${observer ? 'resolved' : 'NOT resolved (null)'}`)
    }
    // WHY lazy: install on the first subscribe rather than at module load, so the
    // hub exists before native emits without a hard bootstrap-order dependency for
    // this first cut. Idempotent, so repeated subscribes cost one boolean check.
    installDeviceEventHub()
    emitter = new NativeEventEmitter(observer ?? undefined)
  }
  return emitter
}

export const Keyboard = {
  addListener(eventType: KeyboardEventName, listener: NativeEventListener): EventSubscription {
    dlog(`Keyboard.addListener -> ${eventType}`)
    return getEmitter().addListener(eventType, listener)
  },

  // RN's dismissKeyboard blurs the currently-focused input (TextInputState); blurring
  // an input is what actually retracts the keyboard, so we do the same. A no-op when
  // nothing holds focus, like RN.
  dismiss(): void {
    const focused = currentlyFocusedInput()
    dlog(`Keyboard.dismiss -> ${focused ? 'blur focused input' : 'no focused input (no-op)'}`)
    blurTextInput(focused)
  },
}
