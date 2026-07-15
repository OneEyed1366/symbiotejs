// Drawer option types + the pure swipe/geometry math. Framework-agnostic (numbers and
// booleans only, per CLAUDE.md <prop_types_split_agnostic_vs_per_adapter>), shared verbatim by
// every adapter. Mirrors react-navigation's Drawer prop surface (confirmed against the current
// @react-navigation/drawer docs): drawerType 'front'/'back'/'slide'/'permanent', drawerPosition,
// drawerWidth, overlayColor, swipeEnabled + the three swipe-tuning knobs. What is NOT ported:
// `configureGestureHandler` - a react-native-gesture-handler-specific escape hatch with no
// PanResponder equivalent (see packages/navigation's README / the drawer feasibility note for the
// full gap list).

import type { IPanResponderGestureState, ISymbioteEvent } from '@symbiote-native/engine';
import { isRecord } from '../guards';
import type { IDrawerSlot } from '../render-drawer';

export type IDrawerType = 'front' | 'back' | 'slide' | 'permanent';
export type IDrawerPosition = 'left' | 'right';

export interface IDrawerOptions {
  drawerType?: IDrawerType;
  drawerPosition?: IDrawerPosition;
  drawerWidth?: number;
  overlayColor?: string;
  swipeEnabled?: boolean;
  // How far from the position edge a closed-drawer swipe must START to count (react-navigation
  // default: 32).
  swipeEdgeWidth?: number;
  // Minimum accumulated drag distance to snap-open/close on release (react-navigation default: 60).
  swipeMinDistance?: number;
  // Minimum release velocity (px/ms, same unit as gestureState.vx) that snaps regardless of
  // distance (react-navigation default: 500 px/s == 0.5 px/ms).
  swipeMinVelocity?: number;
}

// Per-screen options a caller's own renderDrawerContent reads to label its menu entries - the
// drawer navigator has no built-in menu UI (matching react-native-drawer-layout's Drawer
// primitive, which the underlying @react-navigation/drawer itself builds its DrawerItemList on
// top of), so this stays deliberately small next to IScreenOptions's header surface.
export interface IDrawerScreenOptions {
  title?: string;
  drawerLabel?: string;
}

export const DRAWER_DEFAULT_TYPE: IDrawerType = 'front';
export const DRAWER_DEFAULT_POSITION: IDrawerPosition = 'left';
export const DRAWER_DEFAULT_WIDTH = 280;
export const DRAWER_DEFAULT_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.5)';
export const DRAWER_DEFAULT_SWIPE_ENABLED = true;
export const DRAWER_DEFAULT_SWIPE_EDGE_WIDTH = 32;
export const DRAWER_DEFAULT_SWIPE_MIN_DISTANCE = 60;
// react-navigation's 500 is px/second; gestureState.vx is px/ms, so the default converts.
export const DRAWER_DEFAULT_SWIPE_MIN_VELOCITY = 0.5;

// Exported so render-drawer.ts and the adapter can resolve the same defaults without
// re-declaring the `??` fallback (a second copy would drift the instant a default changes).
export function resolveDrawerWidth(options: IDrawerOptions): number {
  return options.drawerWidth ?? DRAWER_DEFAULT_WIDTH;
}

export function resolveDrawerType(options: IDrawerOptions): IDrawerType {
  return options.drawerType ?? DRAWER_DEFAULT_TYPE;
}

export function resolveDrawerPosition(options: IDrawerOptions): IDrawerPosition {
  return options.drawerPosition ?? DRAWER_DEFAULT_POSITION;
}

// The animated outputs a progress value of 0 (closed) -> 1 (open) drives, resolved once per
// drawerType/position/width combination. 'permanent' never animates (no gesture, no snap), so
// callers short-circuit on isDrawerAnimated before reading this.
export type IDrawerGeometry = {
  panelTranslateXClosed: number;
  panelTranslateXOpen: number;
  contentTranslateXClosed: number;
  contentTranslateXOpen: number;
  overlayOpacityClosed: number;
  overlayOpacityOpen: number;
};

export function isDrawerAnimated(options: IDrawerOptions): boolean {
  return resolveDrawerType(options) !== 'permanent';
}

export function isDrawerOverlayVisible(options: IDrawerOptions): boolean {
  const type = resolveDrawerType(options);
  return type === 'front' || type === 'slide';
}

// front: only the panel moves (-width -> 0), content stays put, overlay fades in.
// back: only the content moves, away from the position edge, to reveal the stationary panel;
//   no overlay (the panel sits fully behind the content, nothing to dim).
// slide: panel AND content move together by the same delta, overlay fades in (content still
//   covers the panel partially as they slide in tandem, same as front visually at rest).
// permanent: static, all zero (isDrawerAnimated() gates callers off this path already).
export function resolveDrawerGeometry(options: IDrawerOptions): IDrawerGeometry {
  const width = resolveDrawerWidth(options);
  const type = resolveDrawerType(options);
  const sign = resolveDrawerPosition(options) === 'left' ? 1 : -1;
  const closedPanelX = -sign * width;
  const openContentX = sign * width;

  switch (type) {
    case 'back':
      return {
        panelTranslateXClosed: 0,
        panelTranslateXOpen: 0,
        contentTranslateXClosed: 0,
        contentTranslateXOpen: openContentX,
        overlayOpacityClosed: 0,
        overlayOpacityOpen: 0,
      };
    case 'slide':
      return {
        panelTranslateXClosed: closedPanelX,
        panelTranslateXOpen: 0,
        contentTranslateXClosed: 0,
        contentTranslateXOpen: openContentX,
        overlayOpacityClosed: 0,
        overlayOpacityOpen: 1,
      };
    case 'front':
    case 'permanent':
    default:
      return {
        panelTranslateXClosed: closedPanelX,
        panelTranslateXOpen: 0,
        contentTranslateXClosed: 0,
        contentTranslateXOpen: 0,
        overlayOpacityClosed: 0,
        overlayOpacityOpen: 1,
      };
  }
}

export type IDrawerInterpolationRange = {
  inputRange: readonly [number, number];
  outputRange: readonly [number, number];
};

export type IDrawerContentSlotInterpolation = {
  translateX: IDrawerInterpolationRange;
};

export type IDrawerOverlaySlotInterpolation = {
  opacity: IDrawerInterpolationRange;
  translateX: IDrawerInterpolationRange;
};

export type IDrawerPanelSlotInterpolation = {
  translateX: IDrawerInterpolationRange;
};

const DRAWER_PROGRESS_INPUT_RANGE: readonly [number, number] = [0, 1];

// The pure `{inputRange, outputRange}` half of each slot's `progress.interpolate(...)` call,
// factored out of react/vue/angular drawer.ts (the same literal config recomputed inline in all
// three, including three near-identical spots within angular/drawer.ts's own content/overlay/
// panel style getters) - the adapter still owns the actual `Animated.Value.interpolate()` call
// (the `Animated.Value` instance is adapter-lifecycle-held per CLAUDE.md
// <adapters_stay_thin>), this only computes what to feed it.
//
// The three slots are NOT symmetric: content and panel each drive only their own translateX, but
// overlay drives BOTH its own opacity AND a translateX that deliberately tracks CONTENT's delta,
// not its own - see render-drawer.ts's `drawerChildOrder` header: for `slide`, content itself
// slides away, and an overlay that didn't follow it would stay pinned full-screen instead of
// dimming just the content it's meant to cover. The overload set below reflects that asymmetry in
// the return type per slot, instead of forcing one shape that would leave 'content'/'panel'
// carrying an unused `opacity` field or 'overlay' missing one it needs.
export function resolveDrawerSlotInterpolation(
  geometry: IDrawerGeometry,
  slot: 'content',
): IDrawerContentSlotInterpolation;
export function resolveDrawerSlotInterpolation(
  geometry: IDrawerGeometry,
  slot: 'overlay',
): IDrawerOverlaySlotInterpolation;
export function resolveDrawerSlotInterpolation(
  geometry: IDrawerGeometry,
  slot: 'panel',
): IDrawerPanelSlotInterpolation;
export function resolveDrawerSlotInterpolation(
  geometry: IDrawerGeometry,
  slot: IDrawerSlot,
):
  | IDrawerContentSlotInterpolation
  | IDrawerOverlaySlotInterpolation
  | IDrawerPanelSlotInterpolation {
  switch (slot) {
    case 'content':
      return {
        translateX: {
          inputRange: DRAWER_PROGRESS_INPUT_RANGE,
          outputRange: [geometry.contentTranslateXClosed, geometry.contentTranslateXOpen],
        },
      };
    case 'overlay':
      return {
        opacity: {
          inputRange: DRAWER_PROGRESS_INPUT_RANGE,
          outputRange: [geometry.overlayOpacityClosed, geometry.overlayOpacityOpen],
        },
        translateX: {
          inputRange: DRAWER_PROGRESS_INPUT_RANGE,
          outputRange: [geometry.contentTranslateXClosed, geometry.contentTranslateXOpen],
        },
      };
    case 'panel':
      return {
        translateX: {
          inputRange: DRAWER_PROGRESS_INPUT_RANGE,
          outputRange: [geometry.panelTranslateXClosed, geometry.panelTranslateXOpen],
        },
      };
  }
}

// onStartShouldSetPanResponder gate: while closed, a swipe must START within swipeEdgeWidth of
// the drawer's position edge (mirrors react-navigation's swipeEdgeWidth). While open, the whole
// content + overlay area is fair game to drag-close, matching the intuitive "swipe anywhere to
// dismiss an open drawer" behavior every drawer implementation (including RN's dropped native
// DrawerLayoutAndroid) shares.
export function isSwipeStartInEdge(
  startX: number,
  screenWidth: number,
  isOpen: boolean,
  options: IDrawerOptions,
): boolean {
  if (isOpen) return true;
  const edgeWidth = options.swipeEdgeWidth ?? DRAWER_DEFAULT_SWIPE_EDGE_WIDTH;
  return resolveDrawerPosition(options) === 'left'
    ? startX <= edgeWidth
    : startX >= screenWidth - edgeWidth;
}

// onMoveShouldSetPanResponder gate: only claim the gesture once it reads as a horizontal drag
// (RN's own PanResponder examples use this exact dominant-axis check to stay out of a vertical
// ScrollView's way).
const MOVE_CLAIM_THRESHOLD = 5;

export function isHorizontalDrag(gestureState: IPanResponderGestureState): boolean {
  return (
    Math.abs(gestureState.dx) > MOVE_CLAIM_THRESHOLD &&
    Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
  );
}

export type ISwipeIntent = 'open' | 'close';

// The release-time decision, structurally the same shape as switch.ts's shouldSnapBack: a pure
// predicate over the accumulated gesture plus the option thresholds, no framework. Distance OR
// velocity past its threshold, in the direction that would move the drawer toward the opposite
// of its current state, snaps it there; anything else snaps back to where it started.
export function resolveSwipeIntent(
  gestureState: IPanResponderGestureState,
  isOpen: boolean,
  options: IDrawerOptions,
): ISwipeIntent {
  const sign = resolveDrawerPosition(options) === 'left' ? 1 : -1;
  // Positive `signedDelta` means "dragging toward open" for a left drawer's rightward drag (and
  // symmetrically for a right drawer's leftward drag).
  const signedDx = sign * gestureState.dx;
  const signedVx = sign * gestureState.vx;
  const minDistance = options.swipeMinDistance ?? DRAWER_DEFAULT_SWIPE_MIN_DISTANCE;
  const minVelocity = options.swipeMinVelocity ?? DRAWER_DEFAULT_SWIPE_MIN_VELOCITY;

  const pastDistance = Math.abs(signedDx) >= minDistance;
  const pastVelocity = Math.abs(signedVx) >= minVelocity;
  if (!pastDistance && !pastVelocity) return isOpen ? 'open' : 'close';

  // Velocity wins the direction call when it clears its own threshold (a fast flick can reverse
  // a short drag); otherwise the drag distance's sign decides.
  const towardOpen = pastVelocity ? signedVx > 0 : signedDx > 0;
  return towardOpen ? 'open' : 'close';
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// The touch's real starting page-X, read off the raw event rather than gestureState.x0: the
// engine's capture phase (core/engine/src/pan-responder/index.ts's
// onStartShouldSetResponderCapture/onMoveShouldSetResponderCapture) resets gestureState before
// the bubble-phase onStartShouldSetPanResponder/onMoveShouldSetPanResponder gates run, so x0 is
// only populated later, inside onResponderGrant. Shaped like core/engine/src/events/index.ts's
// readTouchPoint but not the same function: that one requires both pageX AND pageY and returns
// an {x, y} pair for touch-history bookkeeping; this only needs pageX and is private to the
// SET-gate below, so it stays a separate, narrower helper rather than forcing a shared contract
// onto two callers with different needs.
export function startPageXOf(event: ISymbioteEvent): number | undefined {
  const { nativeEvent } = event;
  const direct = toFiniteNumber(nativeEvent.pageX);
  if (direct !== undefined) return direct;
  const touches = nativeEvent.touches;
  if (Array.isArray(touches) && isRecord(touches[0])) return toFiniteNumber(touches[0].pageX);
  return undefined;
}

// onPanResponderMove's drag-to-progress math: how far the touch has traveled, in progress units
// (0..1), added to wherever the drag started from. Mirrors the SAME sign convention as
// resolveSwipeIntent (left drawer: rightward drag is positive-toward-open).
export function resolveDragProgress(
  gestureState: IPanResponderGestureState,
  dragStartProgress: number,
  options: IDrawerOptions,
): number {
  const width = resolveDrawerWidth(options);
  const sign = resolveDrawerPosition(options) === 'right' ? -1 : 1;
  const delta = (sign * gestureState.dx) / width;
  return clamp01(dragStartProgress + delta);
}

// The composed onStartShouldSetPanResponder/onMoveShouldSetPanResponder gate: swipeEnabled ->
// isDrawerAnimated -> isSwipeStartInEdge, then (move only) isHorizontalDrag on top. The start
// gate omits the dominant-axis check on purpose (react-navigation's own edge-swipe idiom: claim
// on entering the edge, confirm direction only once movement exists to measure).
export function shouldClaimDrawerSwipe(
  event: ISymbioteEvent,
  gestureState: IPanResponderGestureState,
  screenWidth: number,
  isOpen: boolean,
  options: IDrawerOptions,
  phase: 'start' | 'move',
): boolean {
  if ((options.swipeEnabled ?? DRAWER_DEFAULT_SWIPE_ENABLED) === false) return false;
  if (!isDrawerAnimated(options)) return false;
  const startX = startPageXOf(event) ?? gestureState.x0;
  if (!isSwipeStartInEdge(startX, screenWidth, isOpen, options)) return false;
  return phase === 'start' ? true : isHorizontalDrag(gestureState);
}
