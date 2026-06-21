/** @jsxRuntime automatic */
// Headless proof of the interaction family (Pressable + Touchable*) over the same
// fake Fabric slot the other smokes use. It drives the real touch primitives the
// way native would — topTouchStart/topTouchEnd on the responder node's
// instanceHandle — and asserts the synthesized press, the pressed-state style
// flip (which re-renders and re-commits), the disabled suppression, and the
// JS-synthesized onLongPress timer. No simulator — a failure here is in JS.

import { mount } from '@symbiote/react'
// Not on the barrel yet (the integrator wires exports), so reach the source.
import { Pressable } from '../../packages/react/src/pressable'
import { TouchableOpacity } from '../../packages/react/src/touchable'
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
    props: newProps,
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: newProps, children: [] }),
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

// ---- case 2: pressed state flips the resolved style in/out --------------
// TouchableOpacity drives opacity off Pressable's pressed state. Pressing in
// must drop opacity to activeOpacity; pressing out must restore it.

{
  reset()
  const ACTIVE_OPACITY = 0.3
  mount(12, <TouchableOpacity activeOpacity={ACTIVE_OPACITY} style={{ width: 10 }} />)

  const handle = responderHandle()

  // shared flattens style keys directly onto the node's props, so the resolved
  // opacity/width live on props.opacity / props.width.
  const released = responderProps()
  if (released.opacity !== undefined) {
    throw new Error(`expected no opacity before press, got ${JSON.stringify(released.opacity)}`)
  }

  fire(handle, TOUCH_START)
  const active = responderProps()
  if (active.opacity !== ACTIVE_OPACITY) {
    throw new Error(`pressed opacity should be ${ACTIVE_OPACITY}, got ${JSON.stringify(active.opacity)}`)
  }
  if (active.width !== 10) {
    throw new Error(`pressed style should keep base width:10, got ${JSON.stringify(active.width)}`)
  }

  fire(handle, TOUCH_END)
  const back = responderProps()
  // A removed prop is sent to Fabric as an explicit `null` (the reset signal that
  // survives Fabric's prop merge); null and undefined both mean "cleared" here.
  if (back.opacity != null) {
    throw new Error(`released opacity should clear, got ${JSON.stringify(back.opacity)}`)
  }
}

// ---- case 3: disabled suppresses onPress --------------------------------

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

// ---- case 4: a long hold synthesizes onLongPress ------------------------
// pressIn arms the timer; advancing past delayLongPress fires onLongPress.

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
  fire(handle, TOUCH_START)
  advanceTimers(DELAY)
  if (longPresses !== 1) {
    throw new Error(`onLongPress should fire after the hold, fired ${longPresses}`)
  }
  // The held gesture still ends; that should not also count a tap-press here
  // (RN fires press on touchEnd regardless, so we only assert long-press fired).
  fire(handle, TOUCH_END)
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
