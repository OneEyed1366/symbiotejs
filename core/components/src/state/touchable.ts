// Touchable*: the shared logic half (framework-agnostic). The Touchable family is built on
// Pressable; what is identical across adapters is the press-timing config RN's Pressability reads
// (delayPressIn/delayPressOut/minPressDuration) and the deactivation floor math. The Animated
// feedback itself is framework (each adapter's Animated namespace), so it stays in the adapter;
// only the timing constants + the pure wait computation live here.

import type { ISymbioteEvent } from '@symbiotejs/engine';

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
