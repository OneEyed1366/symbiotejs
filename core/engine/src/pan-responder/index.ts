// PanResponder: pure JS gesture recognition layered on the View responder event
// props. It reconciles a stream of touch events into one accumulative gesture and
// exposes a `panHandlers` object the caller spreads onto a View. There is no new
// native view and no core change: it only consumes the responder props shared
// already synthesizes (onStartShouldSetResponder / onResponderGrant /
// onResponderMove / onResponderRelease / onResponderTerminate / ...), exactly
// as RN's PanResponder consumes them.
//
// Ported from react-native/Libraries/Interaction/PanResponder.js. RN sources its
// touch geometry from a global ResponderTouchHistoryStore; symbiote's synthetic
// events instead carry the live touches on `event.nativeEvent.touches` (and the
// changed ones on `changedTouches`), so the centroid/velocity math here reads
// those directly while keeping RN's accumulate-deltas-over-time behavior.

import { dlog } from '../debug';
import type { ISymbioteEvent } from '../node';

// gestureState fields the caller reads; `stateID` is a stable per-gesture id and
// `_accountsForMovesUpTo` is the timestamp every field has been advanced through.
export interface IPanResponderGestureState {
  stateID: number;
  moveX: number;
  moveY: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  numberActiveTouches: number;
  _accountsForMovesUpTo: number;
}

// (event, gestureState) -> boolean: the should-set / termination-request gate.
type IActiveCallback = (event: ISymbioteEvent, gestureState: IPanResponderGestureState) => boolean;
// (event, gestureState) -> void: grant / move / release / terminate side effects.
type IPassiveCallback = (event: ISymbioteEvent, gestureState: IPanResponderGestureState) => void;

export interface IPanResponderCallbacks {
  onStartShouldSetPanResponder?: IActiveCallback;
  onStartShouldSetPanResponderCapture?: IActiveCallback;
  onMoveShouldSetPanResponder?: IActiveCallback;
  onMoveShouldSetPanResponderCapture?: IActiveCallback;
  onPanResponderGrant?: IPassiveCallback;
  onPanResponderStart?: IPassiveCallback;
  onPanResponderMove?: IPassiveCallback;
  onPanResponderEnd?: IPassiveCallback;
  onPanResponderRelease?: IPassiveCallback;
  onPanResponderReject?: IPassiveCallback;
  onPanResponderTerminate?: IPassiveCallback;
  onPanResponderTerminationRequest?: IActiveCallback;
  onShouldBlockNativeResponder?: IActiveCallback;
}

// The responder props PanResponder produces; spread onto a View as `panHandlers`.
export interface IGestureResponderHandlers {
  onStartShouldSetResponder: (event: ISymbioteEvent) => boolean;
  onStartShouldSetResponderCapture: (event: ISymbioteEvent) => boolean;
  onMoveShouldSetResponder: (event: ISymbioteEvent) => boolean;
  onMoveShouldSetResponderCapture: (event: ISymbioteEvent) => boolean;
  onResponderGrant: (event: ISymbioteEvent) => boolean;
  onResponderReject: (event: ISymbioteEvent) => void;
  onResponderStart: (event: ISymbioteEvent) => void;
  onResponderMove: (event: ISymbioteEvent) => void;
  onResponderEnd: (event: ISymbioteEvent) => void;
  onResponderRelease: (event: ISymbioteEvent) => void;
  onResponderTerminate: (event: ISymbioteEvent) => void;
  onResponderTerminationRequest: (event: ISymbioteEvent) => boolean;
}

export interface IPanResponderInstance {
  panHandlers: IGestureResponderHandlers;
  getInteractionHandle: () => number | null;
}

// A single touch as it arrives inside the untyped nativeEvent record.
interface ITouchPoint {
  pageX: number;
  pageY: number;
  timestamp: number;
}

// One slot of the touch-history bank shared synthesizes onto nativeEvent.touchHistory.
// Mirrors RN's ITouchRecord (ResponderTouchHistoryStore); PanResponder reads each touch's
// own previous->current delta from here so multitouch dx/vx counts only moved touches.
interface ITouchRecord {
  touchActive: boolean;
  currentPageX: number;
  currentPageY: number;
  currentTimeStamp: number;
  previousPageX: number;
  previousPageY: number;
}

interface ITouchHistory {
  touchBank: ITouchRecord[];
  numberActiveTouches: number;
  indexOfSingleActiveTouch: number;
  mostRecentTimeStamp: number;
}

const SINGLE_TOUCH_COUNT = 1;
// onShouldBlockNativeResponder defaults to true (RN: block native by default).
const DEFAULT_BLOCK_NATIVE_RESPONDER = true;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// Pull one touch out of an untyped array element, skipping anything that does not
// carry numeric pageX/pageY. `timestamp` falls back to 0 when absent so a touch
// with coordinates but no time still contributes to the centroid.
function toTouchPoint(raw: unknown): ITouchPoint | undefined {
  if (!isRecord(raw)) return undefined;
  const pageX = toFiniteNumber(raw.pageX);
  const pageY = toFiniteNumber(raw.pageY);
  if (pageX === undefined || pageY === undefined) return undefined;
  return { pageX, pageY, timestamp: toFiniteNumber(raw.timestamp) ?? 0 };
}

// All current touches on screen, read off event.nativeEvent.touches.
function readTouches(event: ISymbioteEvent): ITouchPoint[] {
  const raw = event.nativeEvent.touches;
  if (!Array.isArray(raw)) return [];
  const points: ITouchPoint[] = [];
  for (const entry of raw) {
    const point = toTouchPoint(entry);
    if (point !== undefined) points.push(point);
  }
  return points;
}

// Mean of a coordinate across the active touches, the gesture centroid. RN's
// TouchHistoryMath does the same averaging over active touches.
function centroidX(touches: ITouchPoint[]): number {
  if (touches.length === 0) return 0;
  let sum = 0;
  for (const touch of touches) sum += touch.pageX;
  return sum / touches.length;
}

function centroidY(touches: ITouchPoint[]): number {
  if (touches.length === 0) return 0;
  let sum = 0;
  for (const touch of touches) sum += touch.pageY;
  return sum / touches.length;
}

// The most recent touch timestamp in the current frame, the clock PanResponder
// advances `_accountsForMovesUpTo` to and divides the velocity by.
function mostRecentTimestamp(touches: ITouchPoint[]): number {
  let latest = 0;
  for (const touch of touches) {
    if (touch.timestamp > latest) latest = touch.timestamp;
  }
  return latest;
}

// #region touchHistory (RN-faithful multitouch geometry)
// shared attaches a touch-history bank onto nativeEvent (matching RN's
// ResponderEventPlugin). When present, the gesture math runs through RN's
// TouchHistoryMath instead of the all-touch centroid, so dx/vx counts only the touches
// that moved this frame, via each touch's own previous->current delta. Headless callers
// that invoke the handlers directly (no shared, no store) carry no touchHistory and fall
// back to the centroid path below, which keeps single-touch behavior.

function isTouchRecord(value: unknown): value is ITouchRecord {
  return (
    isRecord(value) &&
    typeof value.touchActive === 'boolean' &&
    typeof value.currentPageX === 'number' &&
    typeof value.currentPageY === 'number' &&
    typeof value.currentTimeStamp === 'number' &&
    typeof value.previousPageX === 'number' &&
    typeof value.previousPageY === 'number'
  );
}

function isTouchHistory(value: unknown): value is ITouchHistory {
  return (
    isRecord(value) &&
    Array.isArray(value.touchBank) &&
    typeof value.numberActiveTouches === 'number' &&
    typeof value.indexOfSingleActiveTouch === 'number' &&
    typeof value.mostRecentTimeStamp === 'number'
  );
}

function touchHistoryOf(event: ISymbioteEvent): ITouchHistory | undefined {
  const raw = event.nativeEvent.touchHistory;
  return isTouchHistory(raw) ? raw : undefined;
}

// Ported from RN Interaction/TouchHistoryMath.js:centroidDimension (lines 30-85). Mean
// of one coordinate over the touches that moved after `touchesChangedAfter`, taking each
// touch's current or previous position. The single-active-touch fast path uses a strict
// `>`; the multi-touch scan uses `>=`, both kept from RN.
function centroidDimension(
  touchHistory: ITouchHistory,
  touchesChangedAfter: number,
  isXAxis: boolean,
  ofCurrent: boolean,
): number {
  const { touchBank } = touchHistory;
  let total = 0;
  let count = 0;

  const single =
    touchHistory.numberActiveTouches === SINGLE_TOUCH_COUNT
      ? touchBank[touchHistory.indexOfSingleActiveTouch]
      : undefined;

  if (isTouchRecord(single)) {
    if (single.touchActive && single.currentTimeStamp > touchesChangedAfter) {
      total += dimensionOf(single, isXAxis, ofCurrent);
      count = 1;
    }
  } else {
    for (const record of touchBank) {
      if (
        isTouchRecord(record) &&
        record.touchActive &&
        record.currentTimeStamp >= touchesChangedAfter
      ) {
        total += dimensionOf(record, isXAxis, ofCurrent);
        count++;
      }
    }
  }
  return count > 0 ? total / count : NO_CENTROID;
}

const NO_CENTROID = -1;

function dimensionOf(record: ITouchRecord, isXAxis: boolean, ofCurrent: boolean): number {
  if (ofCurrent) return isXAxis ? record.currentPageX : record.currentPageY;
  return isXAxis ? record.previousPageX : record.previousPageY;
}

function currentCentroidXOfChanged(touchHistory: ITouchHistory, after: number): number {
  return centroidDimension(touchHistory, after, true, true);
}
function currentCentroidYOfChanged(touchHistory: ITouchHistory, after: number): number {
  return centroidDimension(touchHistory, after, false, true);
}
function previousCentroidXOfChanged(touchHistory: ITouchHistory, after: number): number {
  return centroidDimension(touchHistory, after, true, false);
}
function previousCentroidYOfChanged(touchHistory: ITouchHistory, after: number): number {
  return centroidDimension(touchHistory, after, false, false);
}
function currentCentroidXAll(touchHistory: ITouchHistory): number {
  return centroidDimension(touchHistory, 0, true, true);
}
function currentCentroidYAll(touchHistory: ITouchHistory): number {
  return centroidDimension(touchHistory, 0, false, true);
}

// RN PanResponder._updateGestureStateOnMove (Interaction/PanResponder.js lines 330-366):
// accumulate the centroid change of touches that moved after `_accountsForMovesUpTo`,
// rather than tracking the absolute centroid of all touches. This is what makes a
// stopped finger in a multi-finger drag stop contributing to dx.
function updateGestureStateFromHistory(
  gestureState: IPanResponderGestureState,
  touchHistory: ITouchHistory,
): void {
  gestureState.numberActiveTouches = touchHistory.numberActiveTouches;
  const movedAfter = gestureState._accountsForMovesUpTo;
  gestureState.moveX = currentCentroidXOfChanged(touchHistory, movedAfter);
  gestureState.moveY = currentCentroidYOfChanged(touchHistory, movedAfter);

  const prevX = previousCentroidXOfChanged(touchHistory, movedAfter);
  const x = currentCentroidXOfChanged(touchHistory, movedAfter);
  const prevY = previousCentroidYOfChanged(touchHistory, movedAfter);
  const y = currentCentroidYOfChanged(touchHistory, movedAfter);
  const nextDx = gestureState.dx + (x - prevX);
  const nextDy = gestureState.dy + (y - prevY);

  const dt = touchHistory.mostRecentTimeStamp - gestureState._accountsForMovesUpTo;
  if (dt > 0) {
    gestureState.vx = (nextDx - gestureState.dx) / dt;
    gestureState.vy = (nextDy - gestureState.dy) / dt;
  } else {
    gestureState.vx = 0;
    gestureState.vy = 0;
  }

  gestureState.dx = nextDx;
  gestureState.dy = nextDy;
  gestureState._accountsForMovesUpTo = touchHistory.mostRecentTimeStamp;
}
// #endregion

function initializeGestureState(gestureState: IPanResponderGestureState): void {
  gestureState.moveX = 0;
  gestureState.moveY = 0;
  gestureState.x0 = 0;
  gestureState.y0 = 0;
  gestureState.dx = 0;
  gestureState.dy = 0;
  gestureState.vx = 0;
  gestureState.vy = 0;
  gestureState.numberActiveTouches = 0;
  gestureState._accountsForMovesUpTo = 0;
}

// The timestamp this frame advances to: the touch-history clock when shared attached a
// store, else the most recent of the live touches (headless direct-call path).
function frameTimestampOf(event: ISymbioteEvent, touches: ITouchPoint[]): number {
  return touchHistoryOf(event)?.mostRecentTimeStamp ?? mostRecentTimestamp(touches);
}

// Advance the gesture for a move frame. With a touch-history store (the device / shared
// path) this defers to RN's accumulate-per-moved-touch math; without one it falls back to
// the all-touch centroid delta, correct for the single dragging finger the headless
// pan-responder smoke exercises. Guards dt === 0 so a zero-gap frame reports zero
// velocity instead of NaN.
function updateGestureStateOnMove(
  gestureState: IPanResponderGestureState,
  event: ISymbioteEvent,
  touches: ITouchPoint[],
): void {
  const touchHistory = touchHistoryOf(event);
  if (touchHistory !== undefined) {
    updateGestureStateFromHistory(gestureState, touchHistory);
    return;
  }

  const currentX = centroidX(touches);
  const currentY = centroidY(touches);
  const frameTimestamp = mostRecentTimestamp(touches);

  gestureState.numberActiveTouches = touches.length;
  gestureState.moveX = currentX;
  gestureState.moveY = currentY;

  const nextDx = currentX - gestureState.x0;
  const nextDy = currentY - gestureState.y0;
  const dt = frameTimestamp - gestureState._accountsForMovesUpTo;

  if (dt > 0) {
    gestureState.vx = (nextDx - gestureState.dx) / dt;
    gestureState.vy = (nextDy - gestureState.dy) / dt;
  } else {
    gestureState.vx = 0;
    gestureState.vy = 0;
  }

  gestureState.dx = nextDx;
  gestureState.dy = nextDy;
  gestureState._accountsForMovesUpTo = frameTimestamp;
}

const PanResponder = {
  create(config: IPanResponderCallbacks): IPanResponderInstance {
    const gestureState: IPanResponderGestureState = {
      // Random per-gesture id, matching RN. Useful only for debugging.
      stateID: Math.random(),
      moveX: 0,
      moveY: 0,
      x0: 0,
      y0: 0,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      numberActiveTouches: 0,
      _accountsForMovesUpTo: 0,
    };

    const panHandlers: IGestureResponderHandlers = {
      onStartShouldSetResponder(event: ISymbioteEvent): boolean {
        return config.onStartShouldSetPanResponder === undefined
          ? false
          : config.onStartShouldSetPanResponder(event, gestureState);
      },

      onMoveShouldSetResponder(event: ISymbioteEvent): boolean {
        return config.onMoveShouldSetPanResponder === undefined
          ? false
          : config.onMoveShouldSetPanResponder(event, gestureState);
      },

      onStartShouldSetResponderCapture(event: ISymbioteEvent): boolean {
        // A fresh single touch begins a new gesture, so reset the accumulator
        // before any should-set callback inspects it (RN does the same).
        const touches = readTouches(event);
        if (touches.length === SINGLE_TOUCH_COUNT) {
          initializeGestureState(gestureState);
        }
        gestureState.numberActiveTouches =
          touchHistoryOf(event)?.numberActiveTouches ?? touches.length;
        return config.onStartShouldSetPanResponderCapture === undefined
          ? false
          : config.onStartShouldSetPanResponderCapture(event, gestureState);
      },

      onMoveShouldSetResponderCapture(event: ISymbioteEvent): boolean {
        const touches = readTouches(event);
        // Skip a duplicate dispatch of the same frame: when two touches change at
        // once the responder system fires twice, but the geometry was already
        // folded in on the first call.
        if (gestureState._accountsForMovesUpTo === frameTimestampOf(event, touches)) {
          return false;
        }
        updateGestureStateOnMove(gestureState, event, touches);
        return config.onMoveShouldSetPanResponderCapture === undefined
          ? false
          : config.onMoveShouldSetPanResponderCapture(event, gestureState);
      },

      onResponderGrant(event: ISymbioteEvent): boolean {
        dlog('PanResponder grant');
        const touches = readTouches(event);
        const touchHistory = touchHistoryOf(event);
        // x0/y0 is the non-cumulative centroid at grant time (RN: currentCentroid).
        gestureState.x0 = touchHistory ? currentCentroidXAll(touchHistory) : centroidX(touches);
        gestureState.y0 = touchHistory ? currentCentroidYAll(touchHistory) : centroidY(touches);
        gestureState.dx = 0;
        gestureState.dy = 0;
        // The grant frame is already accounted for, so the first move's velocity
        // is measured from here, not from time 0.
        gestureState._accountsForMovesUpTo = frameTimestampOf(event, touches);
        gestureState.numberActiveTouches = touchHistory?.numberActiveTouches ?? touches.length;
        config.onPanResponderGrant?.(event, gestureState);
        return config.onShouldBlockNativeResponder === undefined
          ? DEFAULT_BLOCK_NATIVE_RESPONDER
          : config.onShouldBlockNativeResponder(event, gestureState);
      },

      onResponderReject(event: ISymbioteEvent): void {
        config.onPanResponderReject?.(event, gestureState);
      },

      onResponderStart(event: ISymbioteEvent): void {
        gestureState.numberActiveTouches =
          touchHistoryOf(event)?.numberActiveTouches ?? readTouches(event).length;
        config.onPanResponderStart?.(event, gestureState);
      },

      onResponderMove(event: ISymbioteEvent): void {
        const touches = readTouches(event);
        // Same duplicate-frame guard as the capture path.
        if (gestureState._accountsForMovesUpTo === frameTimestampOf(event, touches)) {
          return;
        }
        updateGestureStateOnMove(gestureState, event, touches);
        config.onPanResponderMove?.(event, gestureState);
      },

      onResponderEnd(event: ISymbioteEvent): void {
        gestureState.numberActiveTouches =
          touchHistoryOf(event)?.numberActiveTouches ?? readTouches(event).length;
        config.onPanResponderEnd?.(event, gestureState);
      },

      onResponderRelease(event: ISymbioteEvent): void {
        dlog('PanResponder release');
        config.onPanResponderRelease?.(event, gestureState);
        initializeGestureState(gestureState);
      },

      onResponderTerminate(event: ISymbioteEvent): void {
        dlog('PanResponder terminate');
        config.onPanResponderTerminate?.(event, gestureState);
        initializeGestureState(gestureState);
      },

      onResponderTerminationRequest(event: ISymbioteEvent): boolean {
        return config.onPanResponderTerminationRequest === undefined
          ? true
          : config.onPanResponderTerminationRequest(event, gestureState);
      },
    };

    return {
      panHandlers,
      // Deprecated in RN; kept for shape parity. No InteractionManager handle.
      getInteractionHandle(): number | null {
        return null;
      },
    };
  },
};

export default PanResponder;
