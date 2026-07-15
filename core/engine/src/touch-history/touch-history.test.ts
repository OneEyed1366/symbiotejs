// Exercises the touch-history store's public surface directly: record a touch, check
// bank/history state, shift on move/end, reset. Independent of the event-routing layer
// that consumes it (events.test.ts covers that indirectly).

import { beforeEach, describe, expect, it } from 'vitest';
import { attachTouchHistory, recordTouchTrack, resetTouchHistory, touchHistory } from './index';

describe('touch-history store', () => {
  beforeEach(() => {
    resetTouchHistory();
  });

  it('starts empty', () => {
    expect(touchHistory.numberActiveTouches).toBe(0);
    expect(touchHistory.indexOfSingleActiveTouch).toBe(-1);
    expect(touchHistory.mostRecentTimeStamp).toBe(0);
  });

  it('records a touch start into the bank and tracks it as the single active touch', () => {
    recordTouchTrack('start', {
      changedTouches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
      touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
    });
    expect(touchHistory.numberActiveTouches).toBe(1);
    expect(touchHistory.indexOfSingleActiveTouch).toBe(0);
    expect(touchHistory.mostRecentTimeStamp).toBe(100);

    const record = touchHistory.touchBank[0];
    expect(record?.touchActive).toBe(true);
    expect(record?.startPageX).toBe(10);
    expect(record?.currentPageX).toBe(10);
  });

  it('shifts previous<-current on a move without deactivating the touch', () => {
    recordTouchTrack('start', {
      changedTouches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
      touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
    });
    recordTouchTrack('move', {
      changedTouches: [{ identifier: 0, pageX: 15, pageY: 25, timestamp: 110 }],
      touches: [{ identifier: 0, pageX: 15, pageY: 25, timestamp: 110 }],
    });

    const record = touchHistory.touchBank[0];
    expect(record?.touchActive).toBe(true);
    expect(record?.previousPageX).toBe(10);
    expect(record?.currentPageX).toBe(15);
  });

  it('deactivates the touch on end and clears numberActiveTouches', () => {
    recordTouchTrack('start', {
      changedTouches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
      touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
    });
    recordTouchTrack('end', {
      changedTouches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 120 }],
      touches: [],
    });

    const record = touchHistory.touchBank[0];
    expect(record?.touchActive).toBe(false);
    expect(touchHistory.numberActiveTouches).toBe(0);
  });

  it('resetTouchHistory clears the bank and history back to the initial state', () => {
    recordTouchTrack('start', {
      changedTouches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
      touches: [{ identifier: 0, pageX: 10, pageY: 20, timestamp: 100 }],
    });
    resetTouchHistory();

    expect(touchHistory.touchBank.length).toBe(0);
    expect(touchHistory.numberActiveTouches).toBe(0);
    expect(touchHistory.indexOfSingleActiveTouch).toBe(-1);
    expect(touchHistory.mostRecentTimeStamp).toBe(0);
  });

  it('attachTouchHistory puts the live touchHistory object onto nativeEvent', () => {
    const nativeEvent: Record<string, unknown> = {};
    attachTouchHistory(nativeEvent);
    expect(nativeEvent.touchHistory).toBe(touchHistory);
  });
});
