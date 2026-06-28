// Pressable, the logic half (framework-agnostic, zero render, zero framework imports). The
// press lifecycle RN's Pressability runs in JS (pressIn/pressOut/press synthesis, the
// long-press timer, unstable_pressDelay deferral, and the pressRetentionOffset drift test)
// lives here as a pure state machine over a mutable runtime plus an adapter-supplied host. The
// adapter owns only the lifecycle wiring: React holds the runtime in a ref and flips `pressed`
// via setState; Vue holds it in setup scope and flips a ref. Both call the SAME handlers.
//
// Framework-specific, stays in the adapter: the `pressed` state cell (it drives a
// re-render, so each framework owns its reactive primitive) and the raw frame-measure (the host
// node plus its measure call). The rest (the timers, the geometry, the suppression flags,
// the decision of when each callback fires) is here, shared by every adapter.

import { dlog, Platform, type ISymbioteEvent } from '@symbiote/engine';

export const DEFAULT_DELAY_LONG_PRESS_MS = 500;
// RN's default extra slop kept around a press once it is active, before a drift fires pressOut.
// The PressRect extension (Pressability.js DEFAULT_PRESS_RECT_OFFSETS). Per-edge, deeper bottom.
export const DEFAULT_PRESS_RECT_OFFSETS = { top: 20, left: 20, bottom: 30, right: 20 };

// Per-edge inset rect, the normalized shape every edge test reads (RN's Rect).
export interface IEdgeInsets {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

// The measured on-screen frame the retention test runs against: left/top/right/bottom page
// coordinates, mirrors Pressability.js `_responderRegion`.
export interface IResponderRegion {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

// The state object the user's render callback receives (style/children as a function of it).
export interface IPressState {
  pressed: boolean;
}

export type IPressHandler = (event: ISymbioteEvent) => void;

// A scalar expands all four edges; the object form sets them per-edge. RN's hitSlop / pressRect.
export type IRectOffset = number | { top?: number; left?: number; bottom?: number; right?: number };

// Native ripple config Android's ReactViewManager reads off the inner View (nativeBackground-
// Android). `foreground` routes it to the foreground slot. Inert on iOS. RN's
// PressableAndroidRippleConfig (Pressable.js / useAndroidRippleForView).
export interface IPressableAndroidRippleConfig {
  color?: string;
  borderless?: boolean;
  radius?: number;
  foreground?: boolean;
}

// The RippleAndroid background dict Android resolves: the same shape TouchableNativeFeedback's
// Ripple factory produces.
export interface IRippleBackground {
  type: 'RippleAndroid';
  color: string | null;
  borderless: boolean;
  rippleRadius?: number;
}

// ---- geometry (pure) --------------------------------------------------------------------------

// A rect offset is a per-edge object (not the scalar shorthand). Reads the asymmetric form
// without a cast.
function isEdgeInsets(
  value: IRectOffset,
): value is { top?: number; left?: number; bottom?: number; right?: number } {
  return typeof value === 'object';
}

// Normalize a scalar-or-rect offset to a per-edge rect: a number expands all four edges,
// mirroring RN's normalizeRect (StyleSheet/Rect.js). Absent edges read 0.
export function normalizeRect(offset: IRectOffset | undefined): IEdgeInsets {
  if (offset === undefined) return { top: 0, left: 0, bottom: 0, right: 0 };
  if (isEdgeInsets(offset)) {
    const { top = 0, left = 0, bottom = 0, right = 0 } = offset;
    return { top, left, bottom, right };
  }
  return { top: offset, left: offset, bottom: offset, right: offset };
}

// The widest single edge, for the radius fallback when no measured rect is available (headless).
export function maxEdge(insets: IEdgeInsets): number {
  return Math.max(insets.top, insets.left, insets.bottom, insets.right);
}

// Is a touch page-point inside the measured responder region, expanded per-edge by hitSlop then
// pressRectOffset? Direct port of Pressability.js `_isTouchWithinResponderRegion`: left/top
// shrink the bound, right/bottom grow it; strict inequalities.
export function isTouchWithinRegion(
  point: { x: number; y: number },
  region: IResponderRegion,
  hitSlop: IEdgeInsets,
  pressRectOffset: IEdgeInsets,
): boolean {
  const left = region.left - hitSlop.left - pressRectOffset.left;
  const right = region.right + hitSlop.right + pressRectOffset.right;
  const top = region.top - hitSlop.top - pressRectOffset.top;
  const bottom = region.bottom + hitSlop.bottom + pressRectOffset.bottom;
  return point.x > left && point.x < right && point.y > top && point.y < bottom;
}

// Page coordinate of a single-touch native event, or undefined when it carried no numeric coords
// (then the retention drift check is skipped, never guessed).
export function readPoint(event: ISymbioteEvent): { x: number; y: number } | undefined {
  const { pageX, pageY } = event.nativeEvent;
  if (typeof pageX === 'number' && typeof pageY === 'number') return { x: pageX, y: pageY };
  return undefined;
}

// Build the responder region from a measured frame, or undefined for an all-zero frame (the view
// is not laid out, RN's _measureCallback ignores it).
export function computeRegion(
  width: number,
  height: number,
  pageX: number,
  pageY: number,
): IResponderRegion | undefined {
  if (!width && !height && !pageX && !pageY) return undefined;
  return { left: pageX, top: pageY, right: pageX + width, bottom: pageY + height };
}

// Build the Android native-feedback prop the inner View carries from the ripple config. RN runs
// the color through processColor → a native int; we have no native bridge in JS, so we keep the
// string and let Android resolve it (a null color is the documented "no tint"). Inert on iOS.
export function rippleProps(
  config: IPressableAndroidRippleConfig,
): Record<string, IRippleBackground> | undefined {
  if (Platform.OS !== 'android') return undefined;
  const background: IRippleBackground = {
    type: 'RippleAndroid',
    color: config.color ?? null,
    borderless: config.borderless === true,
    rippleRadius: config.radius,
  };
  return config.foreground === true
    ? { nativeForegroundAndroid: background }
    : { nativeBackgroundAndroid: background };
}

// ---- the press state machine ------------------------------------------------------------------

// The mutable runtime the adapter holds across renders (React: a ref; Vue: setup scope). Holds
// the in-flight timers, the suppression flags, and the measured region: exactly the React
// adapter's refs, now in one object so the shared handlers can mutate them.
export interface IPressRuntime {
  // Cancels the in-flight long-press timer (between pressIn and pressOut/press), or undefined when
  // none is armed. A canceller (not a raw handle) so the timer SCHEDULING (setTimeout/clear-
  // Timeout) stays in the adapter (core/components has no DOM/Node timer globals).
  longPressCancel: (() => void) | undefined;
  // True once the long-press timer fired, until the next pressIn rearms. RN skips onPress when a
  // long press fired (Pressability isPressCanceledByLongPress).
  longPressFired: boolean;
  // Cancels the in-flight unstable_pressDelay timer; the activation runs inside it.
  pressDelayCancel: (() => void) | undefined;
  // Page coordinate the active press started at: the radius-fallback origin (headless only).
  pressOrigin: { x: number; y: number } | undefined;
  // True once a drift past hitSlop+retention deactivated the press; suppresses the tap on release
  // until the finger returns inside the region.
  driftedOut: boolean;
  // The measured frame from the latest grant; undefined until measure resolves (or on a host
  // where measure is a no-op), which drops the test to the radius fallback.
  region: IResponderRegion | undefined;
}

export function createPressRuntime(): IPressRuntime {
  return {
    longPressCancel: undefined,
    longPressFired: false,
    pressDelayCancel: undefined,
    pressOrigin: undefined,
    driftedOut: false,
    region: undefined,
  };
}

// The per-frame frame-measure signature RN's UIManager.measure callback uses.
export type IFrameCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number,
) => void;

// The lifecycle seam the adapter fills: flip the reactive `pressed` cell, and expose the raw
// frame-measure of the responder node (or undefined when no node / no measure is available).
// Everything else the machine does itself.
export interface IPressHost {
  setPressed: (pressed: boolean) => void;
  getMeasureFn: () => ((callback: IFrameCallback) => void) | undefined;
  // Schedule a one-shot timer and return its canceller. The adapter owns the actual setTimeout /
  // clearTimeout (timer scheduling is lifecycle); the machine only decides when to arm/cancel.
  schedule: (callback: () => void, ms: number) => () => void;
}

export interface IPressMachineConfig {
  onPress?: IPressHandler;
  onPressIn?: IPressHandler;
  onPressOut?: IPressHandler;
  onPressMove?: IPressHandler;
  onLongPress?: IPressHandler;
  delayLongPress: number;
  unstable_pressDelay: number;
  hitSlop?: IRectOffset;
  pressRetentionOffset?: IRectOffset;
}

export interface IPressHandlers {
  handlePressIn: IPressHandler;
  handlePressOut: IPressHandler;
  handlePress: IPressHandler;
  handleResponderMove: IPressHandler;
}

// Measure the responder's on-screen frame and cache it as the retention region for the life of
// the press (RN measures on responder grant, _measureResponderRegion). When measure is
// unavailable (no node yet, an uncommitted node, or a host slot without a measure method,
// headless) the region stays undefined and the move test falls back to the radius bound. The
// try/catch guards that last case: a slot lacking measure throws rather than no-opping.
function measureRegion(
  runtime: IPressRuntime,
  measureFn: ((callback: IFrameCallback) => void) | undefined,
): void {
  runtime.region = undefined;
  if (measureFn === undefined) return;
  dlog('Pressable measuring responder region');
  try {
    measureFn((_x, _y, width, height, pageX, pageY) => {
      const region = computeRegion(width, height, pageX, pageY);
      if (region === undefined) return;
      runtime.region = region;
      dlog('Pressable responder region measured');
    });
  } catch {
    dlog('Pressable measure unavailable — retention falls back to radius');
  }
}

// Build the four responder handlers over the config + runtime + host. The whole press lifecycle
// (the React adapter's useMemo body) lives here, shared by every adapter. The adapter rebuilds
// these per render (the closures capture the live config) while the runtime persists across them.
export function createPressHandlers(
  config: IPressMachineConfig,
  runtime: IPressRuntime,
  host: IPressHost,
): IPressHandlers {
  const {
    onPress,
    onPressIn,
    onPressOut,
    onPressMove,
    onLongPress,
    delayLongPress,
    unstable_pressDelay,
  } = config;

  // Per-edge offsets for the measured-rect retention test (RN's hitSlop + pressRectOffset).
  // pressRetentionOffset defaults to RN's DEFAULT_PRESS_RECT_OFFSETS when unset; hitSlop to zero.
  const hitSlopRect = normalizeRect(config.hitSlop);
  const pressRectOffset =
    config.pressRetentionOffset === undefined
      ? DEFAULT_PRESS_RECT_OFFSETS
      : normalizeRect(config.pressRetentionOffset);
  // Radius fallback bound (headless): widest hitSlop edge + widest retention edge.
  const fallbackThreshold = maxEdge(hitSlopRect) + maxEdge(pressRectOffset);

  // True iff the touch still belongs to the active press: against the measured rect when we have
  // one (the RN-faithful path), else the symmetric radius fallback.
  function isWithinRetention(point: { x: number; y: number }): boolean {
    const region = runtime.region;
    if (region !== undefined) {
      return isTouchWithinRegion(point, region, hitSlopRect, pressRectOffset);
    }
    const origin = runtime.pressOrigin;
    if (origin === undefined) return true;
    return Math.hypot(point.x - origin.x, point.y - origin.y) <= fallbackThreshold;
  }

  function clearLongPress(): void {
    if (runtime.longPressCancel !== undefined) {
      runtime.longPressCancel();
      runtime.longPressCancel = undefined;
    }
  }

  // The real activation: flip pressed-state on, arm the long-press timer, fire onPressIn. Split
  // out so unstable_pressDelay can defer it behind a timer while an early release flushes it.
  function activate(event: ISymbioteEvent): void {
    dlog('Pressable pressIn');
    host.setPressed(true);
    runtime.longPressFired = false;
    if (onLongPress) {
      runtime.longPressCancel = host.schedule(() => {
        runtime.longPressCancel = undefined;
        runtime.longPressFired = true;
        dlog('Pressable longPress timer fired');
        onLongPress(event);
      }, delayLongPress);
    }
    onPressIn?.(event);
  }

  // Flush a still-pending pressDelay timer immediately, so a pressOut/press that arrives before
  // the delay elapsed still sees an activated press.
  function flushPressDelay(event: ISymbioteEvent): void {
    if (runtime.pressDelayCancel !== undefined) {
      runtime.pressDelayCancel();
      runtime.pressDelayCancel = undefined;
      activate(event);
    }
  }

  return {
    handlePressIn(event: ISymbioteEvent): void {
      runtime.pressOrigin = readPoint(event);
      runtime.driftedOut = false;
      // Measure now so the move stream tests against the real frame, not a press-start radius.
      measureRegion(runtime, host.getMeasureFn());
      if (unstable_pressDelay > 0) {
        dlog(`Pressable pressIn deferred ${unstable_pressDelay}ms`);
        runtime.pressDelayCancel = host.schedule(() => {
          runtime.pressDelayCancel = undefined;
          activate(event);
        }, unstable_pressDelay);
        return;
      }
      activate(event);
    },
    handlePressOut(event: ISymbioteEvent): void {
      dlog('Pressable pressOut');
      flushPressDelay(event);
      clearLongPress();
      runtime.pressOrigin = undefined;
      runtime.region = undefined;
      host.setPressed(false);
      onPressOut?.(event);
    },
    handlePress(event: ISymbioteEvent): void {
      dlog('Pressable press');
      flushPressDelay(event);
      clearLongPress();
      // A drift past the retention region cancels the tap (RN); reset and suppress.
      if (runtime.driftedOut) {
        runtime.driftedOut = false;
        dlog('Pressable press suppressed by drift past retention region');
        return;
      }
      // A fired long press cancels the tap: reset the flag and suppress onPress.
      if (runtime.longPressFired) {
        runtime.longPressFired = false;
        dlog('Pressable press suppressed by prior longPress');
        return;
      }
      onPress?.(event);
    },
    // Responder-move stream of the Pressable's own View. onPressMove fires on every move while
    // the press is live (RN). Then the retention test: a move outside the measured region
    // (expanded by hitSlop+pressRectOffset) fires an early pressOut and marks the tap suppressed;
    // a move back inside re-activates.
    handleResponderMove(event: ISymbioteEvent): void {
      onPressMove?.(event);
      const here = readPoint(event);
      if (!here) return;
      if (!isWithinRetention(here)) {
        if (!runtime.driftedOut) {
          dlog('Pressable drifted past retention region — deactivating');
          runtime.driftedOut = true;
          clearLongPress();
          host.setPressed(false);
          onPressOut?.(event);
        }
      } else if (runtime.driftedOut) {
        dlog('Pressable returned inside retention region — reactivating');
        runtime.driftedOut = false;
        activate(event);
      }
    },
  };
}
