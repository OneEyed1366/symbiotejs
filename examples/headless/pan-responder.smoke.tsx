/** @jsxRuntime automatic */
// Headless proof of PanResponder — pure JS, no mounting. PanResponder.create
// produces a panHandlers object of responder props; we call those props directly
// with synthetic touch events (the same shape shared synthesizes onto
// event.nativeEvent), driving one finger through grant -> moves -> release, and
// assert the gestureState the config callbacks receive: dx/dy is the total delta
// from the grant point, numberActiveTouches tracks the live touch count, and
// vx/vy is a plausible non-zero velocity after movement. No simulator — a
// failure here is in the gesture math.

// Not on the barrel yet (the integrator wires exports), so reach the source.
import PanResponder, {
  type PanResponderGestureState,
} from '../../adapters/react/src/pan-responder'
import { createElement, type SymbioteEvent } from '@symbiote/engine'

// ---- synthetic events ---------------------------------------------------
// shared puts touches on event.nativeEvent.touches with pageX/pageY/locationX/
// locationY/identifier/timestamp; we forge that shape directly.

const TOUCH_IDENTIFIER = 1
const TARGET_TAG = 1
// One touch is "located" at a fixed offset inside the element; page coords drive
// the gesture, location coords ride along to prove the event shape is realistic.
const LOCATION_OFFSET = 5

interface SyntheticTouch {
  pageX: number
  pageY: number
  locationX: number
  locationY: number
  identifier: number
  timestamp: number
}

function makeTouch(pageX: number, pageY: number, timestamp: number): SyntheticTouch {
  return {
    pageX,
    pageY,
    locationX: pageX - LOCATION_OFFSET,
    locationY: pageY - LOCATION_OFFSET,
    identifier: TOUCH_IDENTIFIER,
    timestamp,
  }
}

// A single-touch GestureResponderEvent: the one touch is both the current touch
// and the changed touch, matching how shared dispatches a one-finger gesture.
// PanResponder reads only event.nativeEvent.touches; target/currentTarget exist
// to honor the SymbioteEvent contract and are a real branded RCTView node so no
// cast is needed — the gesture never reads them.
const targetNode = createElement('RCTView')

function buildEvent(pageX: number, pageY: number, timestamp: number): SymbioteEvent {
  const touch = makeTouch(pageX, pageY, timestamp)
  const nativeEvent: Record<string, unknown> = {
    touches: [touch],
    changedTouches: [touch],
    target: TARGET_TAG,
    timestamp,
  }
  return {
    type: 'touch',
    target: targetNode,
    currentTarget: targetNode,
    nativeEvent,
    stopPropagation: () => {},
  }
}

function fail(message: string): never {
  throw new Error(`pan-responder.smoke FAILED: ${message}`)
}

function approx(actual: number, expected: number, label: string): void {
  const epsilon = 1e-9
  if (Math.abs(actual - expected) > epsilon) {
    fail(`${label}: expected ${expected}, got ${actual}`)
  }
}

// ---- drive the gesture --------------------------------------------------

// Capture the gestureState handed to each config callback. The object is mutated
// in place across the gesture, so snapshot the fields we assert at call time.
interface Snapshot {
  dx: number
  dy: number
  vx: number
  vy: number
  numberActiveTouches: number
}

function snapshot(gestureState: PanResponderGestureState): Snapshot {
  return {
    dx: gestureState.dx,
    dy: gestureState.dy,
    vx: gestureState.vx,
    vy: gestureState.vy,
    numberActiveTouches: gestureState.numberActiveTouches,
  }
}

let grantSnapshot: Snapshot | undefined
const moveSnapshots: Snapshot[] = []
let releaseSnapshot: Snapshot | undefined

const responder = PanResponder.create({
  onStartShouldSetPanResponder: () => true,
  onPanResponderGrant: (_event, gestureState) => {
    grantSnapshot = snapshot(gestureState)
  },
  onPanResponderMove: (_event, gestureState) => {
    moveSnapshots.push(snapshot(gestureState))
  },
  onPanResponderRelease: (_event, gestureState) => {
    releaseSnapshot = snapshot(gestureState)
  },
})

const { panHandlers } = responder

// Grant at (100, 200) at t=1000ms. A drag of +30 px in x and +45 px in y over
// three 16ms frames; page coords increase, timestamps increase.
const GRANT_X = 100
const GRANT_Y = 200
const GRANT_T = 1000
const FRAME_MS = 16

const STEP_X = 10
const STEP_Y = 15
const MOVE_COUNT = 3

// 1) The View would only become responder if onStartShouldSetResponder returns
//    true — assert the gate before granting.
if (panHandlers.onStartShouldSetResponder(buildEvent(GRANT_X, GRANT_Y, GRANT_T)) !== true) {
  fail('onStartShouldSetResponder must return true when configured to')
}

// 2) Grant: dx/dy reset to 0, one active touch.
panHandlers.onResponderGrant(buildEvent(GRANT_X, GRANT_Y, GRANT_T))
if (grantSnapshot === undefined) fail('onPanResponderGrant was never called')
approx(grantSnapshot.dx, 0, 'grant dx')
approx(grantSnapshot.dy, 0, 'grant dy')
if (grantSnapshot.numberActiveTouches !== 1) {
  fail(`grant numberActiveTouches: expected 1, got ${grantSnapshot.numberActiveTouches}`)
}

// 3) Moves: each frame advances the finger by (STEP_X, STEP_Y) and FRAME_MS.
for (let frame = 1; frame <= MOVE_COUNT; frame++) {
  const x = GRANT_X + STEP_X * frame
  const y = GRANT_Y + STEP_Y * frame
  const t = GRANT_T + FRAME_MS * frame
  panHandlers.onResponderMove(buildEvent(x, y, t))
}

if (moveSnapshots.length !== MOVE_COUNT) {
  fail(`expected ${MOVE_COUNT} move callbacks, got ${moveSnapshots.length}`)
}

// After every move, dx/dy is the TOTAL delta from the grant point.
moveSnapshots.forEach((snap, index) => {
  const frame = index + 1
  approx(snap.dx, STEP_X * frame, `move[${frame}] dx`)
  approx(snap.dy, STEP_Y * frame, `move[${frame}] dy`)
  if (snap.numberActiveTouches !== 1) {
    fail(`move[${frame}] numberActiveTouches: expected 1, got ${snap.numberActiveTouches}`)
  }
})

// Velocity is the per-frame delta over the per-frame time: STEP/FRAME_MS,
// non-zero and in the dragged direction.
const lastMove = moveSnapshots[moveSnapshots.length - 1]
if (lastMove === undefined) fail('no move snapshot captured')
approx(lastMove.vx, STEP_X / FRAME_MS, 'last move vx')
approx(lastMove.vy, STEP_Y / FRAME_MS, 'last move vy')
if (lastMove.vx <= 0 || lastMove.vy <= 0) {
  fail(`velocity must be non-zero positive after a forward drag, got vx=${lastMove.vx} vy=${lastMove.vy}`)
}

// 4) Release: the final dx/dy still reflects the full drag, then the state resets.
const releaseX = GRANT_X + STEP_X * MOVE_COUNT
const releaseY = GRANT_Y + STEP_Y * MOVE_COUNT
const releaseT = GRANT_T + FRAME_MS * (MOVE_COUNT + 1)
panHandlers.onResponderRelease(buildEvent(releaseX, releaseY, releaseT))
if (releaseSnapshot === undefined) fail('onPanResponderRelease was never called')
approx(releaseSnapshot.dx, STEP_X * MOVE_COUNT, 'release dx')
approx(releaseSnapshot.dy, STEP_Y * MOVE_COUNT, 'release dy')

// 5) A fresh single-touch start re-initializes the accumulator, so the next
//    gesture starts clean — assert dx/dy is zeroed after release + new grant.
let secondGrant: Snapshot | undefined
const second = PanResponder.create({
  onStartShouldSetPanResponder: () => true,
  onPanResponderGrant: (_event, gestureState) => {
    secondGrant = snapshot(gestureState)
  },
})
second.panHandlers.onStartShouldSetResponderCapture(buildEvent(0, 0, 2000))
second.panHandlers.onResponderGrant(buildEvent(0, 0, 2000))
if (secondGrant === undefined) fail('second gesture grant was never called')
approx(secondGrant.dx, 0, 'second gesture grant dx')
approx(secondGrant.dy, 0, 'second gesture grant dy')

console.log('pan-responder.smoke OK')
