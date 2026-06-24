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

// The soft-keyboard frame in screen coordinates. RN's KeyboardMetrics — the shape
// carried by a KeyboardEvent's endCoordinates (and iOS startCoordinates).
export interface KeyboardMetrics {
  screenX: number
  screenY: number
  width: number
  height: number
}

// The payload native delivers with each keyboard notification. RN's KeyboardEvent;
// the iOS-only fields (startCoordinates / isEventFromThisApp) are optional so the one
// type covers both platforms. The consumer narrows beyond endCoordinates as needed.
export interface KeyboardEvent {
  duration: number
  easing: string
  endCoordinates: KeyboardMetrics
  startCoordinates?: KeyboardMetrics
  isEventFromThisApp?: boolean
}

function isKeyboardEvent(payload: unknown): payload is KeyboardEvent {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'endCoordinates' in payload &&
    typeof payload.endCoordinates === 'object' &&
    payload.endCoordinates !== null
  )
}

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

// The latest keyboardDidShow event, or null when the keyboard is hidden — RN's
// `_currentlyShowing`. Kept fresh by an internal self-subscription (see getEmitter):
// Keyboard listens to its OWN show/hide events and caches the event so the synchronous
// isVisible() / metrics() reads need no native round-trip.
let currentlyShowing: KeyboardEvent | null = null

// Every live subscription this module handed out, grouped by event type, so
// removeAllListeners(eventType) can tear them all down — the shared NativeEventEmitter
// exposes only per-listener remove(), so Keyboard tracks the set itself (mirrors RN's
// _emitter.removeAllListeners, which we cannot reach through the shared emitter).
const subscriptions = new Map<KeyboardEventName, Set<EventSubscription>>()

function trackSubscription(
  eventType: KeyboardEventName,
  subscription: EventSubscription,
): EventSubscription {
  let set = subscriptions.get(eventType)
  if (set === undefined) {
    set = new Set()
    subscriptions.set(eventType, set)
  }
  set.add(subscription)
  return {
    remove(): void {
      subscription.remove()
      set.delete(subscription)
    },
  }
}

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
    // Self-subscription: cache the latest show event, clear on hide (RN's constructor).
    // Bypasses trackSubscription so removeAllListeners never tears down the cache feed.
    emitter.addListener(KEYBOARD_EVENT.didShow, (payload) => {
      if (isKeyboardEvent(payload)) currentlyShowing = payload
    })
    emitter.addListener(KEYBOARD_EVENT.didHide, () => {
      currentlyShowing = null
    })
  }
  return emitter
}

export const Keyboard = {
  addListener(eventType: KeyboardEventName, listener: NativeEventListener): EventSubscription {
    dlog(`Keyboard.addListener -> ${eventType}`)
    return trackSubscription(eventType, getEmitter().addListener(eventType, listener))
  },

  // Tear down every listener this module added for one event type. The self-subscription
  // that feeds the cache is untracked, so it survives (RN parity: removeAllListeners only
  // clears caller subscriptions). No-op when nobody's listening for that event.
  removeAllListeners(eventType: KeyboardEventName): void {
    dlog(`Keyboard.removeAllListeners -> ${eventType}`)
    const set = subscriptions.get(eventType)
    if (set === undefined) return
    for (const subscription of set) subscription.remove()
    set.clear()
  },

  // Whether the keyboard is last known to be visible — reads the cached show event.
  isVisible(): boolean {
    return currentlyShowing !== null
  },

  // The soft-keyboard frame if visible (the cached event's endCoordinates), else
  // undefined. RN's metrics().
  metrics(): KeyboardMetrics | undefined {
    return currentlyShowing?.endCoordinates
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
