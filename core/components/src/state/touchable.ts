// Touchable*: the shared logic half (framework-agnostic). The Touchable family is built on
// Pressable; what is identical across adapters is the press-timing config RN's Pressability reads
// (delayPressIn/delayPressOut/minPressDuration) and the deactivation floor math. The Animated
// feedback itself is framework (each adapter's Animated namespace), so it stays in the adapter;
// only the timing constants + the pure wait computation live here.

import { dlog, type ISymbioteEvent } from '@symbiote-native/engine';

// TouchableOpacity.js: _opacityActive(150)/_opacityInactive(250), activeOpacity 0.2.
export const DEFAULT_ACTIVE_OPACITY = 0.2;
export const OPACITY_ACTIVE_DURATION_MS = 150;
export const OPACITY_INACTIVE_DURATION_MS = 250;
export const RESTING_OPACITY = 1;
// TouchableHighlight.js: child opacity 0.85, underlay 'black' when unset.
export const DEFAULT_HIGHLIGHT_CHILD_OPACITY = 0.85;
export const DEFAULT_UNDERLAY_COLOR = 'black';
// RN's Pressability DEFAULT_MIN_PRESS_DURATION, the floor a press visual is held, so a very fast
// tap still flashes the active feedback (Pressability.js).
export const DEFAULT_MIN_PRESS_DURATION_MS = 130;

export type ITouchableHandler = (event: ISymbioteEvent) => void;

// The press-timing props RN's TouchableOpacity forwards to its Pressability config
// (_createPressabilityConfig). Pressable does not own these, so the Touchable layers the
// delay/floor scheduling on top of its own onPressIn/onPressOut.
export interface IPressTimingProps {
  delayPressIn?: number;
  delayPressOut?: number;
  minPressDuration?: number;
}

// RN's _deactivate floor: the press-out waits at least minPressDuration past activation (so a fast
// tap holds the active visual) and at least delayPressOut, whichever is longer. `heldFor` is how
// long the visual has already been active (0 when it never activated).
export function computePressOutWait(
  heldFor: number,
  minPressDuration: number,
  delayPressOut: number,
): number {
  return Math.max(minPressDuration - heldFor, delayPressOut);
}

// ---- the TouchableOpacity press-feedback machine ----------------------------------------------

// The mutable runtime the adapter holds across renders (React: refs; Vue: setup scope; Angular:
// class fields). Exactly the two cells TouchableOpacity carried per-adapter, now in one object so
// the shared handlers can mutate them. Twin of Pressable's createPressRuntime.
export interface ITouchableFeedbackRuntime {
  // Cancels the in-flight delayPressIn timer (armed while the active visual is deferred), or
  // undefined when none is pending. A canceller (not a raw handle) so the timer SCHEDULING stays in
  // the adapter — core/components has no DOM/Node timer globals.
  pressInTimerCancel: (() => void) | undefined;
  // When the active visual actually started, to floor onPressOut by minPressDuration. Undefined
  // when the press never activated.
  activatedAt: number | undefined;
}

export function createTouchableFeedbackRuntime(): ITouchableFeedbackRuntime {
  return { pressInTimerCancel: undefined, activatedAt: undefined };
}

// The lifecycle seam the adapter fills: the imperative Animated animation + the framework's own
// event emit. `activate` fires the press-in opacity fade and onPressIn; `deactivate` fires the
// press-out fade and onPressOut. The native seam (Animated.timing) and the emit shape (React
// callback vs Vue emit vs Angular EventEmitter) both stay in the adapter — the machine only decides
// WHEN each runs. Twin of Pressable's IPressHost.
export interface ITouchableFeedbackCallbacks {
  activate: (event: ISymbioteEvent) => void;
  deactivate: (event: ISymbioteEvent) => void;
}

export interface ITouchableFeedbackConfig {
  delayPressIn: number;
  delayPressOut: number;
  minPressDuration: number;
  // Schedule a one-shot timer, returning its canceller. The adapter owns the real setTimeout /
  // clearTimeout (timer scheduling is lifecycle); tests inject a fake clock.
  schedule: (callback: () => void, ms: number) => () => void;
  // The activation clock (RN reads Date.now()). Injected so the min-press-duration hold is testable
  // without real time.
  now: () => number;
}

export interface ITouchableFeedbackHandlers {
  handlePressIn: ITouchableHandler;
  handlePressOut: ITouchableHandler;
}

// Build the two press handlers over config + runtime + the adapter's activate/deactivate callbacks.
// The whole TouchableOpacity press-scheduling dance (delayPressIn defer, flush-on-early-release,
// activatedAt tracking, the minPressDuration/delayPressOut hold) lives here, shared by every
// adapter. The adapter rebuilds/holds the callbacks (they capture live config + the Animated Value)
// while the runtime persists across renders. Twin of Pressable's createPressHandlers.
export function createTouchableFeedbackHandlers(
  config: ITouchableFeedbackConfig,
  runtime: ITouchableFeedbackRuntime,
  callbacks: ITouchableFeedbackCallbacks,
): ITouchableFeedbackHandlers {
  const { delayPressIn, delayPressOut, minPressDuration, schedule, now } = config;
  const { activate, deactivate } = callbacks;

  function clearPressInTimer(): void {
    if (runtime.pressInTimerCancel !== undefined) {
      runtime.pressInTimerCancel();
      runtime.pressInTimerCancel = undefined;
    }
  }

  // The real activation: stamp the activation clock (for the press-out floor) then run the adapter's
  // opacity fade + onPressIn. Split out so delayPressIn can defer it behind a timer that an early
  // release still flushes.
  function doActivate(event: ISymbioteEvent): void {
    runtime.activatedAt = now();
    activate(event);
  }

  function doDeactivate(event: ISymbioteEvent): void {
    runtime.activatedAt = undefined;
    deactivate(event);
  }

  return {
    // RN's _createPressabilityConfig forwards delayPressIn: defer the active visual and onPressIn
    // behind the delay (a release before it elapses flushes it synchronously).
    handlePressIn(event: ISymbioteEvent): void {
      if (delayPressIn > 0) {
        dlog(`TouchableOpacity pressIn deferred ${delayPressIn}ms`);
        runtime.pressInTimerCancel = schedule(() => {
          runtime.pressInTimerCancel = undefined;
          doActivate(event);
        }, delayPressIn);
        return;
      }
      doActivate(event);
    },
    // delayPressOut + minPressDuration (RN _deactivate): the press-out waits at least
    // minPressDuration past activation (so a fast tap holds the active visual) and at least
    // delayPressOut, whichever is longer.
    handlePressOut(event: ISymbioteEvent): void {
      if (runtime.pressInTimerCancel !== undefined) {
        clearPressInTimer();
        doActivate(event);
      }
      const heldFor = runtime.activatedAt === undefined ? 0 : now() - runtime.activatedAt;
      const wait = computePressOutWait(heldFor, minPressDuration, delayPressOut);
      if (wait > 0) {
        dlog(`TouchableOpacity pressOut deferred ${wait}ms`);
        schedule(() => doDeactivate(event), wait);
        return;
      }
      doDeactivate(event);
    },
  };
}
