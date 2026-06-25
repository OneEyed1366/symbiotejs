/** @jsxRuntime automatic */
// Headless proof of Pressable over the same fake Fabric slot the other smokes
// use. It drives the real touch primitives the way native would —
// topTouchStart/topTouchEnd on the responder node's instanceHandle — and asserts
// the synthesized press, the disabled suppression, and the JS-synthesized
// onLongPress timer. No simulator — a failure here is in JS. (The Touchable*
// Animated feedback lives in touchable.smoke.tsx.)

import { mount } from '@symbiote/react'
// Not on the barrel yet (the integrator wires exports), so reach the source.
import { Pressable } from '../../adapters/react/src/pressable'
import { Button } from '../../adapters/react/src/button'

// ---- controllable fake timers (for the long-press path) -----------------
// Replace setTimeout/clearTimeout with a manual queue so the long-press timer
// can be advanced deterministically without real time.

interface FakeTimer {
  id: number
  fire: () => void
  delay: number
}

let timers: FakeTimer[] = []
let nextTimerId = 1
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout

function installFakeTimers(): void {
  Object.assign(globalThis, {
    setTimeout: (fire: () => void, delay: number): number => {
      const id = nextTimerId++
      timers.push({ id, fire, delay })
      return id
    },
    clearTimeout: (id: number): void => {
      timers = timers.filter((t) => t.id !== id)
    },
  })
}
function restoreTimers(): void {
  Object.assign(globalThis, { setTimeout: realSetTimeout, clearTimeout: realClearTimeout })
}
// Fire every timer whose delay is <= elapsed, in order.
function advanceTimers(elapsed: number): void {
  const due = timers.filter((t) => t.delay <= elapsed)
  timers = timers.filter((t) => t.delay > elapsed)
  due.forEach((t) => t.fire())
}

// ---- fake Fabric slot ---------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

type EventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void

let committed: FakeNode[] = []
let eventHandler: EventHandler | undefined
const allCreated: FakeNode[] = []

// Fabric's clone*WithNewProps MERGES the diff payload onto the node's existing props
// (it does not replace them), and a key sent as `null` resets to default — which is how
// shared's diffProps signals a removed prop. Model both, or a minimal diff (e.g. only the
// changed `opacity` on press) would drop unchanged base props like `width`.
function mergeFabricProps(
  previous: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...previous, ...patch }
  for (const key of Object.keys(patch)) {
    if (patch[key] === null) delete merged[key]
  }
  return merged
}

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    const node: FakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNodeWithNewProps: (node: FakeNode, newProps: Record<string, unknown>): FakeNode => ({
    ...node,
    props: mergeFabricProps(node.props, newProps),
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: mergeFabricProps(node.props, newProps), children: [] }),
  createChildSet: (): FakeNode[] => [],
  appendChild(parent: FakeNode, child: FakeNode): FakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(childSet: FakeNode[], child: FakeNode): void {
    childSet.push(child)
  },
  completeRoot(_rootTag: number, childSet: FakeNode[]): void {
    committed = childSet
  },
  registerEventHandler(handler: EventHandler): void {
    eventHandler = handler
  },
  // The Pressable measures its responder rect on grant to drive the retention region
  // (RN's _measureResponderRegion). Report a fixed frame so the rect-based test runs
  // off-device; the configured frame is set by `measuredFrame` before each case.
  measure(
    _handle: unknown,
    callback: (x: number, y: number, w: number, h: number, px: number, py: number) => void,
  ): void {
    const f = measuredFrame
    if (f === undefined) return
    callback(0, 0, f.width, f.height, f.pageX, f.pageY)
  },
}

// The frame slot.measure reports; undefined disables measure (the radius fallback path).
let measuredFrame: { width: number; height: number; pageX: number; pageY: number } | undefined

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ------------------------------------------------------------

const TOUCH_START = 'topTouchStart'
const TOUCH_MOVE = 'topTouchMove'
const TOUCH_END = 'topTouchEnd'
const TOUCH_IDENTIFIER = 1

function reset(): void {
  committed = []
  allCreated.length = 0
  timers = []
  // Default: no measured frame, so existing cases keep exercising the radius fallback.
  measuredFrame = undefined
}

// The responder is the View the Pressable renders — the first (and here only)
// RCTView committed. Its instanceHandle is the stable SymbioteNode that
// round-trips through Fabric as the event target.
function responderHandle(): unknown {
  // Skip the synthetic AppContainer root (RCTView, pointerEvents box-none) that now
  // wraps every commit — the responder is the Pressable's own RCTView.
  const view = allCreated.find(
    (n) => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
  )
  if (!view) throw new Error('no RCTView (Pressable responder) was created')
  return view.instanceHandle
}

// The latest committed props of the responder View (re-read after each commit,
// since clone-on-write produces a fresh FakeNode tree).
function responderProps(): Record<string, unknown> {
  function find(node: FakeNode): FakeNode | undefined {
    // Skip the synthetic AppContainer root (box-none); the responder is the app's RCTView.
    if (node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none') return node
    for (const child of node.children) {
      const hit = find(child)
      if (hit) return hit
    }
    return undefined
  }
  for (const root of committed) {
    const hit = find(root)
    if (hit) return hit.props
  }
  throw new Error('no committed RCTView found')
}

function fire(handle: unknown, type: string): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(handle, type, {})
}

// A single-touch native event at a page coordinate — the shape shared's responder
// negotiation and the Pressable's retention drift check both read (touches +
// changedTouches carry pageX/pageY; the bare event also carries them for
// readTouchPoint). The Pressable claims the responder (onStartShouldSetResponder
// => true), so a move with coords reaches its onResponderMove.
function fireAt(handle: unknown, type: string, x: number, y: number): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  const touch = { pageX: x, pageY: y, identifier: TOUCH_IDENTIFIER, timestamp: 0 }
  // topTouchEnd reports the lifted finger only in changedTouches (touches is now
  // empty); start/move keep it in both so shared sees a live touch.
  const touches = type === TOUCH_END ? [] : [touch]
  eventHandler(handle, type, { pageX: x, pageY: y, touches, changedTouches: [touch] })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Reads accessibilityState.disabled off a node's committed props without a cast.
function accessibilityDisabled(props: Record<string, unknown>): unknown {
  const state = props.accessibilityState
  return isRecord(state) ? state.disabled : undefined
}

installFakeTimers()

// ---- case 1: topTouchStart + topTouchEnd synthesizes onPress ------------

{
  reset()
  let presses = 0
  mount(11, <Pressable onPress={() => { presses++ }} />)

  const handle = responderHandle()
  fire(handle, TOUCH_START)
  fire(handle, TOUCH_END)
  if (presses !== 1) {
    throw new Error(`onPress should fire once on start+end, fired ${presses}`)
  }
}

// ---- case 2: disabled suppresses onPress --------------------------------

{
  reset()
  let presses = 0
  mount(13, <Pressable disabled onPress={() => { presses++ }} />)

  const handle = responderHandle()
  fire(handle, TOUCH_START)
  fire(handle, TOUCH_END)
  if (presses !== 0) {
    throw new Error(`disabled Pressable must not fire onPress, fired ${presses}`)
  }
}

// ---- case 4: a long hold fires onLongPress once and suppresses the tap ----
// pressIn arms the timer; advancing past delayLongPress fires onLongPress. On
// release RN cancels the tap when a long press fired (Pressability.js:
// isPressCanceledByLongPress), so onPress must stay at zero. A second quick tap
// after the hold must still fire — proving the suppression flag reset.

{
  reset()
  const DELAY = 500
  let longPresses = 0
  let presses = 0
  mount(
    14,
    <Pressable
      delayLongPress={DELAY}
      onLongPress={() => { longPresses++ }}
      onPress={() => { presses++ }}
    />,
  )

  const handle = responderHandle()

  // (a) full hold cycle: long press fires once, the release does NOT count a tap.
  fire(handle, TOUCH_START)
  advanceTimers(DELAY)
  if (longPresses !== 1) {
    throw new Error(`onLongPress should fire after the hold, fired ${longPresses}`)
  }
  fire(handle, TOUCH_END)
  if (presses !== 0) {
    throw new Error(`a fired longPress must suppress the tap on release, onPress fired ${presses}`)
  }
  if (longPresses !== 1) {
    throw new Error(`onLongPress must not re-fire on release, fired ${longPresses}`)
  }

  // (b) a second quick tap (released before DELAY) still fires onPress — the
  // suppression flag was rearmed on the new pressIn, not stuck on from the hold.
  fire(handle, TOUCH_START)
  fire(handle, TOUCH_END)
  if (presses !== 1) {
    throw new Error(`a quick tap after a long press must fire onPress, fired ${presses}`)
  }
  if (longPresses !== 1) {
    throw new Error(`the quick tap must not long-press, fired ${longPresses}`)
  }
}

// ---- case 5: releasing before the delay does NOT long-press -------------

{
  reset()
  const DELAY = 500
  let longPresses = 0
  mount(15, <Pressable delayLongPress={DELAY} onLongPress={() => { longPresses++ }} />)

  const handle = responderHandle()
  fire(handle, TOUCH_START)
  fire(handle, TOUCH_END)
  advanceTimers(DELAY)
  if (longPresses !== 0) {
    throw new Error(`a short tap must not long-press, fired ${longPresses}`)
  }
}

// ---- case 6: a disabled Pressable reports accessibilityState.disabled ----
// RN merges disabled into the resolved accessibilityState even when the caller
// passed none (Pressable.js: disabled != null ? {...state, disabled} : state).

{
  reset()
  mount(16, <Pressable disabled accessibilityLabel="save" testID="save-btn" />)

  const props = responderProps()
  if (accessibilityDisabled(props) !== true) {
    throw new Error(
      `disabled Pressable must carry accessibilityState.disabled=true, got ${JSON.stringify(props.accessibilityState)}`,
    )
  }
  if (props.accessibilityLabel !== 'save') {
    throw new Error(`accessibilityLabel must pass through, got ${JSON.stringify(props.accessibilityLabel)}`)
  }
  if (props.testID !== 'save-btn') {
    throw new Error(`testID must pass through, got ${JSON.stringify(props.testID)}`)
  }
}

// ---- case 7: Button carries role=button and disabled a11y state ---------

{
  reset()
  mount(17, <Button title="OK" disabled accessibilityLabel="confirm" />)

  const props = responderProps()
  if (props.accessibilityRole !== 'button') {
    throw new Error(`Button must carry accessibilityRole='button', got ${JSON.stringify(props.accessibilityRole)}`)
  }
  if (props.accessible !== true) {
    throw new Error(`Button must be accessible, got ${JSON.stringify(props.accessible)}`)
  }
  if (accessibilityDisabled(props) !== true) {
    throw new Error(
      `disabled Button must carry accessibilityState.disabled=true, got ${JSON.stringify(props.accessibilityState)}`,
    )
  }
  if (props.accessibilityLabel !== 'confirm') {
    throw new Error(`Button accessibilityLabel must pass through, got ${JSON.stringify(props.accessibilityLabel)}`)
  }
}

// ---- case 8: an enabled Button keeps role=button and is NOT disabled -----

{
  reset()
  mount(18, <Button title="Go" onPress={() => {}} />)

  const props = responderProps()
  if (props.accessibilityRole !== 'button') {
    throw new Error(`enabled Button must still carry role=button, got ${JSON.stringify(props.accessibilityRole)}`)
  }
  if (accessibilityDisabled(props) === true) {
    throw new Error(
      `enabled Button must not report disabled, got ${JSON.stringify(props.accessibilityState)}`,
    )
  }
}

// ---- case 9: pressRetentionOffset keeps the press active on a small move ----
// A press starts; the finger drifts a SMALL amount (inside hitSlop+retention) then
// releases on the responder. Without retention the drift would cancel the tap; with
// pressRetentionOffset the press stays active, so onPress still fires. A large drift
// (past the region) must, by contrast, suppress the tap and fire onPressOut early.

{
  reset()
  let presses = 0
  let pressOuts = 0
  // hitSlop 0 + retention 30 → threshold 30. A 10pt move retains; a 100pt move drops.
  mount(
    19,
    <Pressable
      hitSlop={0}
      pressRetentionOffset={30}
      onPress={() => { presses++ }}
      onPressOut={() => { pressOuts++ }}
    />,
  )

  const handle = responderHandle()

  // (a) small drift inside the retention region → press still fires on release.
  fireAt(handle, TOUCH_START, 100, 100)
  fireAt(handle, TOUCH_MOVE, 108, 106) // hypot(8,6) = 10 < 30 → retained
  fireAt(handle, TOUCH_END, 108, 106)
  if (presses !== 1) {
    throw new Error(`a small move inside pressRetentionOffset must keep the press, onPress fired ${presses}`)
  }
  if (pressOuts !== 1) {
    throw new Error(`onPressOut should fire exactly once on release, fired ${pressOuts}`)
  }

  // (b) large drift past the region → tap suppressed, early pressOut fired.
  presses = 0
  pressOuts = 0
  fireAt(handle, TOUCH_START, 100, 100)
  fireAt(handle, TOUCH_MOVE, 200, 100) // 100 > 30 → drifted out
  if (pressOuts !== 1) {
    throw new Error(`a drift past pressRetentionOffset must fire an early onPressOut, fired ${pressOuts}`)
  }
  fireAt(handle, TOUCH_END, 200, 100)
  if (presses !== 0) {
    throw new Error(`a drift past pressRetentionOffset must suppress the tap, onPress fired ${presses}`)
  }
}

// ---- case 10: unstable_pressDelay defers the pressed state ----------------
// With unstable_pressDelay set, pressIn (and the pressed state) must NOT activate on
// touch-down — only after the delay elapses. A release before the delay still flushes
// the deferred activation so the press registers (RN behavior).

{
  reset()
  const DELAY = 120
  let pressIns = 0
  let presses = 0
  mount(
    20,
    <Pressable
      unstable_pressDelay={DELAY}
      onPressIn={() => { pressIns++ }}
      onPress={() => { presses++ }}
    />,
  )

  const handle = responderHandle()

  // (a) touch-down alone does NOT activate pressIn — it is deferred behind the timer.
  fireAt(handle, TOUCH_START, 50, 50)
  if (pressIns !== 0) {
    throw new Error(`unstable_pressDelay must defer onPressIn, fired ${pressIns} before the delay`)
  }
  // (b) advancing past the delay fires the deferred pressIn.
  advanceTimers(DELAY)
  if (pressIns !== 1) {
    throw new Error(`onPressIn should fire after unstable_pressDelay, fired ${pressIns}`)
  }
  fireAt(handle, TOUCH_END, 50, 50)
  if (presses !== 1) {
    throw new Error(`onPress should fire on release after the delay, fired ${presses}`)
  }

  // (c) a release BEFORE the delay still flushes the deferred press (RN: a quick tap
  // under the delay registers — the activation runs synchronously on pressOut).
  pressIns = 0
  presses = 0
  fireAt(handle, TOUCH_START, 50, 50)
  if (pressIns !== 0) {
    throw new Error(`pressIn must stay deferred until the delay, fired ${pressIns}`)
  }
  fireAt(handle, TOUCH_END, 50, 50) // released before advancing the timer
  if (pressIns !== 1) {
    throw new Error(`a release before the delay must flush the deferred pressIn, fired ${pressIns}`)
  }
  if (presses !== 1) {
    throw new Error(`a quick tap under unstable_pressDelay must still fire onPress, fired ${presses}`)
  }
}

// ---- case 11: retention tests the MEASURED rect, per-edge (not a radius) ----------
// With a measured frame 0..100 x 0..40 and pressRetentionOffset {right:40} (other edges
// default to RN's DEFAULT_PRESS_RECT_OFFSETS {top20,left20,bottom30,right20}), the live
// region's right edge is 100+40 = 140. A move to x=130 stays INSIDE (retained), proving
// the asymmetric per-edge rect — a symmetric radius from the press start at (50,20) would
// have dropped it. A move down to y=80 (past bottom 40+30 = 70) drops it.
{
  reset()
  measuredFrame = { width: 100, height: 40, pageX: 0, pageY: 0 }
  let presses = 0
  let pressOuts = 0
  mount(
    21,
    <Pressable
      pressRetentionOffset={{ right: 40 }}
      onPress={() => { presses++ }}
      onPressOut={() => { pressOuts++ }}
    />,
  )

  const handle = responderHandle()

  // (a) x=130 is inside the right edge (140) → retained, tap fires on release.
  fireAt(handle, TOUCH_START, 50, 20)
  fireAt(handle, TOUCH_MOVE, 130, 20)
  fireAt(handle, TOUCH_END, 130, 20)
  if (presses !== 1) {
    throw new Error(`a move inside the measured rect's right edge must retain, onPress fired ${presses}`)
  }

  // (b) y=80 is past the bottom edge (70) → drifted out, early pressOut, tap suppressed.
  presses = 0
  pressOuts = 0
  fireAt(handle, TOUCH_START, 50, 20)
  fireAt(handle, TOUCH_MOVE, 50, 80)
  if (pressOuts !== 1) {
    throw new Error(`a move past the measured bottom edge must fire an early onPressOut, fired ${pressOuts}`)
  }
  fireAt(handle, TOUCH_END, 50, 80)
  if (presses !== 0) {
    throw new Error(`a drift past the measured rect must suppress the tap, onPress fired ${presses}`)
  }
}

// ---- case 12: cancelable wires onResponderTerminationRequest ----------------------
// cancelable === false registers a termination-request gate returning false (the press
// refuses to yield); cancelable === true returns true; unset registers no gate (RN's
// implicit yes). The gate is a listener on the responder node, not a Fabric prop.
{
  const TERMINATION_REQUEST = 'responderTerminationRequest'
  function terminationGate(handle: unknown): ((event: unknown) => unknown) | undefined {
    if (!isRecord(handle)) return undefined
    const listeners = handle.listeners
    if (!(listeners instanceof Map)) return undefined
    const gate = listeners.get(TERMINATION_REQUEST)
    return typeof gate === 'function' ? gate : undefined
  }

  reset()
  mount(22, <Pressable cancelable={false} onPress={() => {}} />)
  const noGate = terminationGate(responderHandle())
  if (noGate === undefined || noGate({ nativeEvent: {} }) !== false) {
    throw new Error('cancelable={false} must register a termination gate returning false')
  }

  reset()
  mount(23, <Pressable cancelable onPress={() => {}} />)
  const yesGate = terminationGate(responderHandle())
  if (yesGate === undefined || yesGate({ nativeEvent: {} }) !== true) {
    throw new Error('cancelable must register a termination gate returning true')
  }

  reset()
  mount(24, <Pressable onPress={() => {}} />)
  if (terminationGate(responderHandle()) !== undefined) {
    throw new Error('unset cancelable must not register a termination gate (RN implicit yes)')
  }
}

// ---- case 13: onPressMove fires on every responder move while the press is live ----
{
  reset()
  let moves = 0
  mount(25, <Pressable onPressMove={() => { moves++ }} onPress={() => {}} />)

  const handle = responderHandle()
  fireAt(handle, TOUCH_START, 50, 50)
  fireAt(handle, TOUCH_MOVE, 51, 50)
  fireAt(handle, TOUCH_MOVE, 52, 50)
  fireAt(handle, TOUCH_END, 52, 50)
  if (moves !== 2) {
    throw new Error(`onPressMove should fire once per move, fired ${moves}`)
  }
}

restoreTimers()

console.log('pressable.smoke OK')
