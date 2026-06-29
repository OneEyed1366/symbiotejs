// Co-located unit test (ADR 0025): PanResponder gesture math, pure JS, no mounting.
// PanResponder.create produces panHandlers (responder props); we call them directly with
// synthetic touch events (the shape the engine synthesizes onto event.nativeEvent), driving one
// finger through grant -> moves -> release, and assert the gestureState: dx/dy is the total delta
// from the grant point, numberActiveTouches tracks the live count, and vx/vy is a plausible
// non-zero velocity. Ported from the headless `pan-responder.smoke.tsx`.

import { beforeAll, describe, expect, it } from 'vitest';
import PanResponder, { type IPanResponderGestureState } from './index';
import { createElement, type ISymbioteEvent } from '@symbiote/engine';

const TOUCH_IDENTIFIER = 1;
const TARGET_TAG = 1;
// One touch is "located" at a fixed offset inside the element; page coords drive the gesture,
// location coords ride along to prove the event shape is realistic.
const LOCATION_OFFSET = 5;

interface ISyntheticTouch {
  pageX: number;
  pageY: number;
  locationX: number;
  locationY: number;
  identifier: number;
  timestamp: number;
}

function makeTouch(pageX: number, pageY: number, timestamp: number): ISyntheticTouch {
  return {
    pageX,
    pageY,
    locationX: pageX - LOCATION_OFFSET,
    locationY: pageY - LOCATION_OFFSET,
    identifier: TOUCH_IDENTIFIER,
    timestamp,
  };
}

// A real branded RCTView node so no cast is needed; the gesture never reads it.
const targetNode = createElement('RCTView');

function buildEvent(pageX: number, pageY: number, timestamp: number): ISymbioteEvent {
  const touch = makeTouch(pageX, pageY, timestamp);
  const nativeEvent: Record<string, unknown> = {
    touches: [touch],
    changedTouches: [touch],
    target: TARGET_TAG,
    timestamp,
  };
  return {
    type: 'touch',
    target: targetNode,
    currentTarget: targetNode,
    nativeEvent,
    stopPropagation: () => {},
  };
}

interface ISnapshot {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  numberActiveTouches: number;
}

function snapshot(gestureState: IPanResponderGestureState): ISnapshot {
  return {
    dx: gestureState.dx,
    dy: gestureState.dy,
    vx: gestureState.vx,
    vy: gestureState.vy,
    numberActiveTouches: gestureState.numberActiveTouches,
  };
}

const GRANT_X = 100;
const GRANT_Y = 200;
const GRANT_T = 1_000;
const FRAME_MS = 16;
const STEP_X = 10;
const STEP_Y = 15;
const MOVE_COUNT = 3;
const PRECISION = 9;

let gateResult: boolean;
let grantSnapshot: ISnapshot | undefined;
const moveSnapshots: ISnapshot[] = [];
let releaseSnapshot: ISnapshot | undefined;

beforeAll(() => {
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (_event, gestureState) => {
      grantSnapshot = snapshot(gestureState);
    },
    onPanResponderMove: (_event, gestureState) => {
      moveSnapshots.push(snapshot(gestureState));
    },
    onPanResponderRelease: (_event, gestureState) => {
      releaseSnapshot = snapshot(gestureState);
    },
  });
  const { panHandlers } = responder;

  gateResult = panHandlers.onStartShouldSetResponder(buildEvent(GRANT_X, GRANT_Y, GRANT_T));
  panHandlers.onResponderGrant(buildEvent(GRANT_X, GRANT_Y, GRANT_T));

  for (let frame = 1; frame <= MOVE_COUNT; frame++) {
    const x = GRANT_X + STEP_X * frame;
    const y = GRANT_Y + STEP_Y * frame;
    const t = GRANT_T + FRAME_MS * frame;
    panHandlers.onResponderMove(buildEvent(x, y, t));
  }

  const releaseX = GRANT_X + STEP_X * MOVE_COUNT;
  const releaseY = GRANT_Y + STEP_Y * MOVE_COUNT;
  const releaseT = GRANT_T + FRAME_MS * (MOVE_COUNT + 1);
  panHandlers.onResponderRelease(buildEvent(releaseX, releaseY, releaseT));
});

describe('PanResponder', () => {
  it('only becomes responder when onStartShouldSetPanResponder returns true', () => {
    expect(gateResult).toBe(true);
  });

  it('zeroes dx/dy with one active touch on grant', () => {
    expect(grantSnapshot).toBeDefined();
    expect(grantSnapshot?.dx).toBeCloseTo(0, PRECISION);
    expect(grantSnapshot?.dy).toBeCloseTo(0, PRECISION);
    expect(grantSnapshot?.numberActiveTouches).toBe(1);
  });

  it('reports the total delta from the grant point after every move', () => {
    expect(moveSnapshots).toHaveLength(MOVE_COUNT);
    moveSnapshots.forEach((snap, index) => {
      const frame = index + 1;
      expect(snap.dx).toBeCloseTo(STEP_X * frame, PRECISION);
      expect(snap.dy).toBeCloseTo(STEP_Y * frame, PRECISION);
      expect(snap.numberActiveTouches).toBe(1);
    });
  });

  it('reports a non-zero velocity in the dragged direction', () => {
    const lastMove = moveSnapshots[moveSnapshots.length - 1];
    expect(lastMove).toBeDefined();
    expect(lastMove.vx).toBeCloseTo(STEP_X / FRAME_MS, PRECISION);
    expect(lastMove.vy).toBeCloseTo(STEP_Y / FRAME_MS, PRECISION);
    expect(lastMove.vx).toBeGreaterThan(0);
    expect(lastMove.vy).toBeGreaterThan(0);
  });

  it('still reflects the full drag on release', () => {
    expect(releaseSnapshot).toBeDefined();
    expect(releaseSnapshot?.dx).toBeCloseTo(STEP_X * MOVE_COUNT, PRECISION);
    expect(releaseSnapshot?.dy).toBeCloseTo(STEP_Y * MOVE_COUNT, PRECISION);
  });

  it('re-initializes the accumulator for a fresh gesture', () => {
    let secondGrant: ISnapshot | undefined;
    const second = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (_event, gestureState) => {
        secondGrant = snapshot(gestureState);
      },
    });
    second.panHandlers.onStartShouldSetResponderCapture(buildEvent(0, 0, 2_000));
    second.panHandlers.onResponderGrant(buildEvent(0, 0, 2_000));
    expect(secondGrant).toBeDefined();
    expect(secondGrant?.dx).toBeCloseTo(0, PRECISION);
    expect(secondGrant?.dy).toBeCloseTo(0, PRECISION);
  });
});
