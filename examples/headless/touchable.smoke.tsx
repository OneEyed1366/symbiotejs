/** @jsxRuntime automatic */
// Headless proof that TouchableOpacity drives press feedback through the Animated
// engine (not a static style toggle): pressing in runs Animated.timing on an
// Animated.Value toward activeOpacity, pressing out animates it back to 1. The
// frames flow through the Animated.View leaf into shared's scoped commit and land
// on the committed RCTView's opacity. Modeled on pressable.smoke (fake Fabric slot
// + responder event harness) and animated-integration.smoke (rAF polyfill + a real
// timing driver flushed to completion). No simulator — a failure here is in JS.

import { mount } from '@symbiote/react'
// Not on the barrel yet (the integrator wires exports), so reach the source.
import { TouchableOpacity } from '../../packages/react/src/touchable'

// ---- rAF polyfill: drives the timing animation deterministically -----------
// The drivers read requestAnimationFrame from the host at call time; a setTimeout-
// based clock advancing 16ms per frame lets .start() run to completion off-device.

let frameClock = 0
const pendingFrames = new Map<number, (time: number) => void>()
let nextFrameId = 1
Object.assign(globalThis, {
  requestAnimationFrame(callback: (time: number) => void): number {
    const id = nextFrameId++
    pendingFrames.set(id, callback)
    setTimeout(() => {
      const cb = pendingFrames.get(id)
      if (cb !== undefined) {
        pendingFrames.delete(id)
        frameClock += 16
        cb(frameClock)
      }
    }, 0)
    return id
  },
  cancelAnimationFrame(id: number): void {
    pendingFrames.delete(id)
  },
})

// Flush every queued frame callback until the animation settles (or a cap is hit).
async function flushFrames(): Promise<void> {
  let guard = 0
  while (pendingFrames.size > 0 && guard < 1000) {
    guard++
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

// ---- fake Fabric slot ------------------------------------------------------

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
let nextTag = 100

// Fabric's clone*WithNewProps MERGES the diff onto the node's existing props; a key
// sent as `null` resets to default (how shared signals a removed prop). Model both,
// or a minimal per-frame diff (only the changed opacity) would drop base props.
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
    _tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    const node: FakeNode = { tag: nextTag++, viewName, props, children: [], instanceHandle }
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
  // Pressable measures its responder rect on grant (retention region). Report a fixed
  // frame so the measure path runs instead of throwing on a slot without measure.
  measure(
    _handle: unknown,
    callback: (x: number, y: number, w: number, h: number, px: number, py: number) => void,
  ): void {
    callback(0, 0, 100, 40, 0, 0)
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ---------------------------------------------------------------

const TOUCH_START = 'topTouchStart'
const TOUCH_END = 'topTouchEnd'

// The responder is the Pressable's own RCTView — the first non-box-none RCTView
// created. Its instanceHandle round-trips through Fabric as the event target.
function responderHandle(): unknown {
  const view = allCreated.find(
    (n) => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
  )
  if (!view) throw new Error('no RCTView (Pressable responder) was created')
  return view.instanceHandle
}

// The Animated.View carrying the opacity feedback is the deepest committed RCTView
// whose props mention opacity at some point. Walk the committed tree and return the
// last RCTView (the inner Animated.View, child of the Pressable's responder View).
function feedbackProps(): Record<string, unknown> {
  let found: Record<string, unknown> | undefined
  function walk(node: FakeNode): void {
    if (node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none') {
      found = node.props
    }
    for (const child of node.children) walk(child)
  }
  for (const root of committed) walk(root)
  if (found === undefined) throw new Error('no committed RCTView found')
  return found
}

function fire(handle: unknown, type: string): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(handle, type, {})
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number') {
    throw new Error(`${label} should be a number, got ${JSON.stringify(value)}`)
  }
  return value
}

// ---- the animated press-in / press-out feedback ----------------------------

const ACTIVE_OPACITY = 0.3
let pressIns = 0
let pressOuts = 0
let presses = 0

mount(
  21,
  <TouchableOpacity
    activeOpacity={ACTIVE_OPACITY}
    style={{ width: 10 }}
    onPress={() => { presses++ }}
    onPressIn={() => { pressIns++ }}
    onPressOut={() => { pressOuts++ }}
  />,
)

const handle = responderHandle()

// At rest the Animated.View opacity sits at 1 (RESTING_OPACITY) and keeps base style.
const rest = feedbackProps()
if (asNumber(rest.opacity, 'resting opacity') !== 1) {
  throw new Error(`resting opacity should be 1, got ${JSON.stringify(rest.opacity)}`)
}
if (rest.width !== 10) {
  throw new Error(`base style width:10 must survive, got ${JSON.stringify(rest.width)}`)
}

// Press in: the timing animation runs toward activeOpacity. Flush frames to settle.
fire(handle, TOUCH_START)
await flushFrames()
const active = feedbackProps()
const activeOpacity = asNumber(active.opacity, 'pressed opacity')
if (!(activeOpacity < 1)) {
  throw new Error(`press-in must lower opacity below 1, got ${activeOpacity}`)
}
if (Math.abs(activeOpacity - ACTIVE_OPACITY) > 1e-6) {
  throw new Error(`press-in must settle at activeOpacity ${ACTIVE_OPACITY}, got ${activeOpacity}`)
}
if (active.width !== 10) {
  throw new Error(`pressed style must keep base width:10, got ${JSON.stringify(active.width)}`)
}

// Press out: the timing animation runs back to 1. Flush frames to settle.
fire(handle, TOUCH_END)
await flushFrames()
const back = feedbackProps()
const backOpacity = asNumber(back.opacity, 'released opacity')
if (Math.abs(backOpacity - 1) > 1e-6) {
  throw new Error(`press-out must restore opacity to 1, got ${backOpacity}`)
}

// A full start+end synthesizes onPress; pressIn/pressOut each fired once.
if (presses !== 1) {
  throw new Error(`onPress should fire once on start+end, fired ${presses}`)
}
if (pressIns !== 1) {
  throw new Error(`onPressIn should fire once, fired ${pressIns}`)
}
if (pressOuts !== 1) {
  throw new Error(`onPressOut should fire once, fired ${pressOuts}`)
}

// ---- delayPressIn defers onPressIn (and the active visual) past touch-down ----------
// RN's TouchableOpacity._createPressabilityConfig forwards delayPressIn. With it set,
// touch-down must NOT fire onPressIn synchronously — only after the delay elapses. A
// short real delay is awaited (this smoke runs on real timers, not a fake queue).
{
  const DELAY = 30
  let deferredPressIns = 0
  const createdBefore = allCreated.length
  mount(
    22,
    <TouchableOpacity delayPressIn={DELAY} onPressIn={() => { deferredPressIns++ }} onPress={() => {}} />,
  )
  // The responder is the FIRST non-box-none RCTView of this mount (the Pressable's own
  // View, created before its inner Animated.View child).
  const responder = allCreated
    .slice(createdBefore)
    .find((n) => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none')
  if (!responder) throw new Error('no responder RCTView for the delayPressIn case')
  fire(responder.instanceHandle, TOUCH_START)
  if (deferredPressIns !== 0) {
    throw new Error(`delayPressIn must defer onPressIn, fired ${deferredPressIns} on touch-down`)
  }
  await new Promise((resolve) => setTimeout(resolve, DELAY + 20))
  if (deferredPressIns !== 1) {
    throw new Error(`onPressIn should fire after delayPressIn, fired ${deferredPressIns}`)
  }
}

console.log('touchable.smoke OK')
