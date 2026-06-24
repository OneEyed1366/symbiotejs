/** @jsxRuntime automatic */
// Headless proof of Pressable over the same fake Fabric slot the other smokes
// use. It drives the real touch primitives the way native would —
// topTouchStart/topTouchEnd on the responder node's instanceHandle — and asserts
// the synthesized press, the disabled suppression, and the JS-synthesized
// onLongPress timer. No simulator — a failure here is in JS. (The Touchable*
// Animated feedback lives in touchable.smoke.tsx.)

import { mount } from '@symbiote/react'
// Not on the barrel yet (the integrator wires exports), so reach the source.
import { Pressable } from '../../packages/react/src/pressable'
import { Button } from '../../packages/react/src/button'

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
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ------------------------------------------------------------

const TOUCH_START = 'topTouchStart'
const TOUCH_END = 'topTouchEnd'

function reset(): void {
  committed = []
  allCreated.length = 0
  timers = []
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

restoreTimers()

console.log('pressable.smoke OK')
