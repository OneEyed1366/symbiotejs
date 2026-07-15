// Per-touch position/time tracking, ported from RN's
// react-native-renderer/.../legacy-events/ResponderTouchHistoryStore.js. PanResponder's
// multitouch dx/vx math needs each touch's own previous->current delta (RN counts only
// touches that moved since `_accountsForMovesUpTo`), which a grant-relative centroid of
// ALL live touches cannot reconstruct. We maintain the bank as touches flow and ATTACH
// `touchHistory` onto the nativeEvent reaching responder handlers, exactly how
// ResponderEventPlugin.js sets `*.touchHistory`.
//
// events/index.ts consumes only this file's public surface (recordTouchTrack,
// attachTouchHistory, resetTouchHistory, touchHistory); everything else here is a
// private implementation detail of the bank.

import { isRecord } from '../type-guards';

// One slot per active touch identifier. Mirrors RN's TouchRecord field-for-field.
interface ITouchRecord {
  touchActive: boolean;
  startPageX: number;
  startPageY: number;
  startTimeStamp: number;
  currentPageX: number;
  currentPageY: number;
  currentTimeStamp: number;
  previousPageX: number;
  previousPageY: number;
  previousTimeStamp: number;
}

interface ITouchHistory {
  touchBank: ITouchRecord[];
  numberActiveTouches: number;
  // The single active touch's identifier, so TouchHistoryMath skips the bank scan in
  // the common one-finger case (-1 when not exactly one touch is down).
  indexOfSingleActiveTouch: number;
  mostRecentTimeStamp: number;
}

// RN's bank is indexed by touch identifier and warns above 20; we never warn (headless
// events may carry larger or absent ids), we just skip anything out of a sane range.
const MAX_TOUCH_BANK = 20;

const touchBank: ITouchRecord[] = [];
export const touchHistory: ITouchHistory = {
  touchBank,
  numberActiveTouches: 0,
  indexOfSingleActiveTouch: -1,
  mostRecentTimeStamp: 0,
};

// A raw touch as it arrives inside the untyped nativeEvent. RN reads pageX/pageY/
// identifier/timestamp; we narrow each defensively so a malformed or coordinate-less
// touch (e.g. the negotiation smoke's `{ target }`-only touches) is skipped, never
// throwing; recording must not perturb the responder negotiation.
interface INormalizedTouch {
  identifier: number;
  pageX: number;
  pageY: number;
  timestamp: number;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

// Pull a recordable touch out of an untyped entry. RN's getTouchIdentifier throws on
// a null id; we skip instead, so events without touch geometry leave the bank untouched.
function normalizeTouch(raw: unknown): INormalizedTouch | undefined {
  if (!isRecord(raw)) return undefined;
  const identifier = toFiniteNumber(raw.identifier);
  const pageX = toFiniteNumber(raw.pageX);
  const pageY = toFiniteNumber(raw.pageY);
  if (identifier === undefined || pageX === undefined || pageY === undefined) return undefined;
  if (identifier < 0 || identifier > MAX_TOUCH_BANK) return undefined;
  return { identifier, pageX, pageY, timestamp: toFiniteNumber(raw.timestamp) ?? 0 };
}

// The changed touches for this frame (start/move/end), defensively read.
function changedTouchesOf(nativeEvent: Record<string, unknown>): INormalizedTouch[] {
  const raw = nativeEvent.changedTouches;
  if (!Array.isArray(raw)) return [];
  const out: INormalizedTouch[] = [];
  for (const entry of raw) {
    const touch = normalizeTouch(entry);
    if (touch !== undefined) out.push(touch);
  }
  return out;
}

// Count of all touches still down (RN reads nativeEvent.touches.length directly).
function activeTouchCount(nativeEvent: Record<string, unknown>): number {
  const raw = nativeEvent.touches;
  return Array.isArray(raw) ? raw.length : 0;
}

function recordTouchStart(touch: INormalizedTouch): void {
  const record = touchBank[touch.identifier];
  if (record) {
    record.touchActive = true;
    record.startPageX = touch.pageX;
    record.startPageY = touch.pageY;
    record.startTimeStamp = touch.timestamp;
    record.currentPageX = touch.pageX;
    record.currentPageY = touch.pageY;
    record.currentTimeStamp = touch.timestamp;
    record.previousPageX = touch.pageX;
    record.previousPageY = touch.pageY;
    record.previousTimeStamp = touch.timestamp;
  } else {
    touchBank[touch.identifier] = {
      touchActive: true,
      startPageX: touch.pageX,
      startPageY: touch.pageY,
      startTimeStamp: touch.timestamp,
      currentPageX: touch.pageX,
      currentPageY: touch.pageY,
      currentTimeStamp: touch.timestamp,
      previousPageX: touch.pageX,
      previousPageY: touch.pageY,
      previousTimeStamp: touch.timestamp,
    };
  }
  touchHistory.mostRecentTimeStamp = touch.timestamp;
}

// Move and end share the previous<-current shift; only `touchActive` differs.
function shiftTouchRecord(touch: INormalizedTouch, active: boolean): void {
  const record = touchBank[touch.identifier];
  if (!record) return;
  record.touchActive = active;
  record.previousPageX = record.currentPageX;
  record.previousPageY = record.currentPageY;
  record.previousTimeStamp = record.currentTimeStamp;
  record.currentPageX = touch.pageX;
  record.currentPageY = touch.pageY;
  record.currentTimeStamp = touch.timestamp;
  touchHistory.mostRecentTimeStamp = touch.timestamp;
}

function arrayFirst(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

// Maintain the bank as a touch frame flows. Mirrors RN's recordTouchTrack: moveish
// shifts records, startish records + recomputes numberActiveTouches, endish marks the
// record inactive + rescans for the single remaining touch. `kind` is the touch phase.
export function recordTouchTrack(
  kind: 'start' | 'move' | 'end',
  nativeEvent: Record<string, unknown>,
): void {
  if (kind === 'move') {
    for (const touch of changedTouchesOf(nativeEvent)) shiftTouchRecord(touch, true);
    return;
  }
  if (kind === 'start') {
    for (const touch of changedTouchesOf(nativeEvent)) recordTouchStart(touch);
    touchHistory.numberActiveTouches = activeTouchCount(nativeEvent);
    if (touchHistory.numberActiveTouches === 1) {
      const first = normalizeTouch(arrayFirst(nativeEvent.touches));
      touchHistory.indexOfSingleActiveTouch = first?.identifier ?? -1;
    }
    return;
  }
  for (const touch of changedTouchesOf(nativeEvent)) shiftTouchRecord(touch, false);
  touchHistory.numberActiveTouches = activeTouchCount(nativeEvent);
  if (touchHistory.numberActiveTouches === 1) {
    for (let i = 0; i < touchBank.length; i++) {
      const record = touchBank[i];
      if (record !== undefined && record.touchActive) {
        touchHistory.indexOfSingleActiveTouch = i;
        break;
      }
    }
  }
}

// Drop all touch state. Called on a fully-released / cancelled gesture so a stale bank
// never leaks geometry into the next gesture's first frame.
export function resetTouchHistory(): void {
  touchBank.length = 0;
  touchHistory.numberActiveTouches = 0;
  touchHistory.indexOfSingleActiveTouch = -1;
  touchHistory.mostRecentTimeStamp = 0;
}

// Attach the live touch history onto the event the responder handlers receive, matching
// ResponderEventPlugin.js (`grantEvent.touchHistory = ...`, etc.). PanResponder reads
// it for the per-touch dx/vx math; handlers that ignore it are unaffected.
export function attachTouchHistory(nativeEvent: Record<string, unknown>): void {
  nativeEvent.touchHistory = touchHistory;
}
