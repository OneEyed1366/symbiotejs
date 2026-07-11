// Keyboard module: the first consumer of the native->JS event bridge. Native
// emits keyboard notifications (show/hide/changeFrame) into the device hub; this
// subscribes through a NativeEventEmitter bound to the KeyboardObserver native
// module, which RN keys its keyboard events off of. Mirrors RN's
// Libraries/Components/Keyboard/Keyboard.js, slimmed to the parts we need.

import { createDeviceEventModule } from '../native-modules';
import {
  type IEventEmitterModule,
  type IEventSubscription,
  type INativeEventListener,
} from '../native-events';
import { dlog } from '../debug';
import { blurTextInput, currentlyFocusedInput } from '../text-input-state';
import { LayoutAnimation } from '../layout-animation';

// The native module name RN registers the keyboard observer under, confirmed
// from its spec (specs_DEPRECATED/modules/INativeKeyboardObserver.js:20,
// `TurboModuleRegistry.get('KeyboardObserver')`).
const KEYBOARD_OBSERVER_MODULE = 'KeyboardObserver';

// The keyboard notification names native emits. RN's KeyboardEventDefinitions.
export const KEYBOARD_EVENT = {
  willShow: 'keyboardWillShow',
  didShow: 'keyboardDidShow',
  willHide: 'keyboardWillHide',
  didHide: 'keyboardDidHide',
  willChangeFrame: 'keyboardWillChangeFrame',
  didChangeFrame: 'keyboardDidChangeFrame',
} as const;

export type IKeyboardEventName = (typeof KEYBOARD_EVENT)[keyof typeof KEYBOARD_EVENT];

// The soft-keyboard frame in screen coordinates. RN's IKeyboardMetrics: the shape
// carried by a IKeyboardEvent's endCoordinates (and iOS startCoordinates).
export interface IKeyboardMetrics {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
}

// The payload native delivers with each keyboard notification. RN's IKeyboardEvent;
// the iOS-only fields (startCoordinates / isEventFromThisApp) are optional so the one
// type covers both platforms. The consumer narrows beyond endCoordinates as needed.
export interface IKeyboardEvent {
  duration: number;
  easing: string;
  endCoordinates: IKeyboardMetrics;
  startCoordinates?: IKeyboardMetrics;
  isEventFromThisApp?: boolean;
}

function isKeyboardEvent(payload: unknown): payload is IKeyboardEvent {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'endCoordinates' in payload &&
    typeof payload.endCoordinates === 'object' &&
    payload.endCoordinates !== null
  );
}

// The KeyboardObserver native module. Its only methods are the observe-counters
// (so native starts/stops watching the keyboard as JS subscribes); it satisfies
// EventEmitterModule. The spec carries no dismiss() (RN dismisses via a separate
// utility), so dismiss() here is a no-op for the first cut (see Keyboard.dismiss).
interface INativeKeyboardObserver extends IEventEmitterModule {
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

// The latest keyboardDidShow event, or null when the keyboard is hidden. RN's
// `_currentlyShowing`. Kept fresh by an internal self-subscription (see getEmitter):
// Keyboard listens to its OWN show/hide events and caches the event so the synchronous
// isVisible() / metrics() reads need no native round-trip.
let currentlyShowing: IKeyboardEvent | null = null;

// Every live subscription this module handed out, grouped by event type, so
// removeAllListeners(eventType) can tear them all down. The shared NativeEventEmitter
// exposes only per-listener remove(), so Keyboard tracks the set itself (mirrors RN's
// _emitter.removeAllListeners, which we cannot reach through the shared emitter).
const subscriptions = new Map<IKeyboardEventName, Set<IEventSubscription>>();

function trackSubscription(
  eventType: IKeyboardEventName,
  subscription: IEventSubscription,
): IEventSubscription {
  let set = subscriptions.get(eventType);
  if (set === undefined) {
    set = new Set();
    subscriptions.set(eventType, set);
  }
  set.add(subscription);
  return {
    remove(): void {
      subscription.remove();
      set.delete(subscription);
    },
  };
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on the
// first addListener. Null when the module isn't linked.
//
// The self-subscription policy that diverges from a plain lazy-resolve+emitter:
// Keyboard caches the latest show event, clearing on hide (RN's constructor), so
// isVisible()/metrics() read synchronously with no native round-trip. Bypasses
// trackSubscription so removeAllListeners never tears down the cache feed.
const deviceEventModule = createDeviceEventModule<INativeKeyboardObserver>({
  moduleName: KEYBOARD_OBSERVER_MODULE,
  moduleLogPrefix: 'Keyboard: KeyboardObserver module',
  onEmitterCreated: emitter => {
    emitter.addListener(KEYBOARD_EVENT.didShow, payload => {
      if (isKeyboardEvent(payload)) currentlyShowing = payload;
    });
    emitter.addListener(KEYBOARD_EVENT.didHide, () => {
      currentlyShowing = null;
    });
  },
});

function getEmitter() {
  return deviceEventModule.getEmitter();
}

export const Keyboard = {
  addListener(eventType: IKeyboardEventName, listener: INativeEventListener): IEventSubscription {
    dlog(`Keyboard.addListener -> ${eventType}`);
    return trackSubscription(eventType, getEmitter().addListener(eventType, listener));
  },

  // Tear down every listener this module added for one event type. The self-subscription
  // that feeds the cache is untracked, so it survives (RN parity: removeAllListeners only
  // clears caller subscriptions). No-op when nobody's listening for that event.
  removeAllListeners(eventType: IKeyboardEventName): void {
    dlog(`Keyboard.removeAllListeners -> ${eventType}`);
    const set = subscriptions.get(eventType);
    if (set === undefined) return;
    for (const subscription of set) subscription.remove();
    set.clear();
  },

  // Whether the keyboard is last known to be visible. Reads the cached show event.
  isVisible(): boolean {
    return currentlyShowing !== null;
  },

  // The soft-keyboard frame if visible (the cached event's endCoordinates), else
  // undefined. RN's metrics().
  metrics(): IKeyboardMetrics | undefined {
    return currentlyShowing?.endCoordinates;
  },

  // Syncs an accessory view's layout with the keyboard transition: configure the next
  // commit to animate over the keyboard's own duration/easing. RN's
  // scheduleLayoutAnimation (Keyboard.js:193). Skipped when duration is absent or 0,
  // since a zero-length animation is a no-op.
  scheduleLayoutAnimation(event: IKeyboardEvent): void {
    const { duration, easing } = event;
    if (duration === 0) return;
    dlog(`Keyboard.scheduleLayoutAnimation -> duration ${duration}, easing ${easing}`);
    LayoutAnimation.configureNext({
      duration,
      update: { duration, type: LayoutAnimation.coerceType(easing) },
    });
  },

  // RN's dismissKeyboard blurs the currently-focused input (TextInputState); blurring
  // an input is what actually retracts the keyboard, so we do the same. A no-op when
  // nothing holds focus, like RN.
  dismiss(): void {
    const focused = currentlyFocusedInput();
    dlog(`Keyboard.dismiss -> ${focused ? 'blur focused input' : 'no focused input (no-op)'}`);
    blurTextInput(focused);
  },
};
