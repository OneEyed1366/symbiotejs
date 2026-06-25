/** @jsxRuntime automatic */
// Headless proof of the gesture-responder NEGOTIATION in shared/events.ts, driven
// over the same fake Fabric slot as the other smokes. It emits raw touch primitives
// (topTouchStart/Move/End) on a node's instanceHandle the way native would and asserts
// the two-phase negotiation that responder.smoke (PanResponder grant/move/release)
// doesn't cover: capture beats bubble, the grant/start/move/end/release lifecycle, a
// mid-gesture claim via onMoveShouldSetResponder, and the transfer handoff
// (onResponderTerminationRequest yes -> terminate+grant, no -> reject). No simulator —
// a failure here is in the negotiation logic, not native.

import { mount } from '@symbiote/react'
import { View } from '../../adapters/react/src/components'

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
    props: { ...node.props, ...newProps },
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: { ...node.props, ...newProps }, children: [] }),
  createChildSet: (): FakeNode[] => [],
  appendChild(parent: FakeNode, child: FakeNode): FakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(childSet: FakeNode[], child: FakeNode): void {
    childSet.push(child)
  },
  completeRoot(): void {},
  registerEventHandler(handler: EventHandler): void {
    eventHandler = handler
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ------------------------------------------------------------

const TOUCH_START = 'topTouchStart'
const TOUCH_MOVE = 'topTouchMove'
const TOUCH_END = 'topTouchEnd'

// The stable SymbioteNode (event target) for the View created with this testID. Clones
// reuse the same instanceHandle, and only createNode pushes to allCreated, so the first
// (and only) match is the live node.
function handleFor(testID: string): unknown {
  const node = allCreated.find((n) => n.props.testID === testID)
  if (!node) throw new Error(`no View created with testID=${testID}`)
  return node.instanceHandle
}

function fire(handle: unknown, type: string, nativeEvent: Record<string, unknown> = {}): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(handle, type, nativeEvent)
}

function reset(): void {
  allCreated.length = 0
}

// Counters are bumped inside JSX closures TS can't see run across fire(); comparing
// them inline would let an earlier `!== 0` guard narrow the let to a literal and trip
// a false "no overlap" on the next check. Routing through a `number` param strips that.
function expect(actual: number, want: number, label: string): void {
  if (actual !== want) throw new Error(`${label}: got ${actual}, want ${want}`)
}

// ---- case 1: capture beats bubble ---------------------------------------
// Parent claims via onStartShouldSetResponderCapture (capture, root->target); the
// child's onStartShouldSetResponder (bubble) must never be consulted.

{
  reset()
  let parentCapture = 0
  let parentGrant = 0
  let childBubble = 0
  let childGrant = 0
  mount(
    21,
    <View
      testID="cap-parent"
      onStartShouldSetResponderCapture={() => { parentCapture++; return true }}
      onResponderGrant={() => { parentGrant++ }}
    >
      <View
        testID="cap-child"
        onStartShouldSetResponder={() => { childBubble++; return true }}
        onResponderGrant={() => { childGrant++ }}
      />
    </View>,
  )

  fire(handleFor('cap-child'), TOUCH_START)
  expect(parentCapture, 1, 'capture should run once')
  expect(parentGrant, 1, 'capturing parent should be granted')
  expect(childBubble, 0, 'bubble must not run after capture wins')
  expect(childGrant, 0, 'child must not be granted')
  // End the gesture so the held responder doesn't leak into the next case — a real
  // touch always ends, and start negotiation is now LCA-scoped (a stale cross-tree
  // responder would otherwise null the LCA and drop the next grant).
  fire(handleFor('cap-child'), TOUCH_END)
}

// ---- case 2: grant / start / move / end / release lifecycle --------------

{
  reset()
  let grant = 0, start = 0, move = 0, end = 0, release = 0
  mount(
    22,
    <View
      testID="life"
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => { grant++ }}
      onResponderStart={() => { start++ }}
      onResponderMove={() => { move++ }}
      onResponderEnd={() => { end++ }}
      onResponderRelease={() => { release++ }}
    />,
  )
  const h = handleFor('life')
  fire(h, TOUCH_START)
  expect(grant, 1, 'grant on touch start')
  expect(start, 1, 'responderStart on touch start')
  fire(h, TOUCH_MOVE)
  expect(move, 1, 'move should fire once')
  fire(h, TOUCH_END)
  expect(end, 1, 'responderEnd on touch end')
  expect(release, 1, 'release on touch end')
}

// ---- case 3: a node claims the responder MID-GESTURE via move-should-set --
// Nobody claims on start; on the first move the parent's onMoveShouldSetResponder
// wins and is granted, then keeps receiving moves (re-negotiation skips the holder).

{
  reset()
  let parentGrant = 0
  let parentMove = 0
  mount(
    23,
    <View
      testID="move-parent"
      onMoveShouldSetResponder={() => true}
      onResponderGrant={() => { parentGrant++ }}
      onResponderMove={() => { parentMove++ }}
    >
      <View testID="move-child" />
    </View>,
  )
  const child = handleFor('move-child')
  fire(child, TOUCH_START)
  expect(parentGrant, 0, 'nobody claims on start')
  fire(child, TOUCH_MOVE)
  expect(parentGrant, 1, 'parent should claim on first move')
  expect(parentMove, 1, 'granted parent should get the move')
  fire(child, TOUCH_MOVE)
  expect(parentGrant, 1, 'holder must not be re-granted')
  expect(parentMove, 2, 'holder should keep getting moves')
  fire(child, TOUCH_END)
}

// ---- case 4: transfer — incumbent consents, responder hands over ---------
// Child holds the responder; parent wants it on move; child's termination-request
// returns true -> child terminate + parent grant.

{
  reset()
  let childGrant = 0, childTerminate = 0, parentGrant = 0
  mount(
    24,
    <View
      testID="xfer-parent"
      onMoveShouldSetResponder={() => true}
      onResponderGrant={() => { parentGrant++ }}
    >
      <View
        testID="xfer-child"
        onStartShouldSetResponder={() => true}
        onResponderGrant={() => { childGrant++ }}
        onResponderTerminationRequest={() => true}
        onResponderTerminate={() => { childTerminate++ }}
      />
    </View>,
  )
  const child = handleFor('xfer-child')
  fire(child, TOUCH_START)
  expect(childGrant, 1, 'child should hold first')
  fire(child, TOUCH_MOVE)
  expect(childTerminate, 1, 'consenting child should terminate')
  expect(parentGrant, 1, 'parent should be granted on transfer')
  fire(child, TOUCH_END)
}

// ---- case 5: transfer rejected — incumbent refuses, taker is rejected -----

{
  reset()
  let childTerminate = 0, parentGrant = 0, parentReject = 0
  mount(
    25,
    <View
      testID="rej-parent"
      onMoveShouldSetResponder={() => true}
      onResponderGrant={() => { parentGrant++ }}
      onResponderReject={() => { parentReject++ }}
    >
      <View
        testID="rej-child"
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderTerminate={() => { childTerminate++ }}
      />
    </View>,
  )
  const child = handleFor('rej-child')
  fire(child, TOUCH_START)
  fire(child, TOUCH_MOVE)
  expect(childTerminate, 0, 'refusing child must keep responder')
  expect(parentGrant, 0, 'rejected parent must not be granted')
  expect(parentReject, 1, 'rejected taker should get onResponderReject')
  fire(child, TOUCH_END)
}

// ---- case 6: LCA scoping — a node BELOW the responder can't steal mid-gesture ----
// Parent grabs on start; its grandchild has onMoveShouldSetResponder. RN scopes the
// move walk to the lowest common ancestor of responder+target upward, never below the
// responder — so the grandchild is never consulted and the parent keeps the gesture.

{
  reset()
  let parentGrant = 0
  let parentMove = 0
  let childMoveShouldSet = 0
  let childGrant = 0
  mount(
    26,
    <View
      testID="lca-parent"
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => { parentGrant++ }}
      onResponderMove={() => { parentMove++ }}
    >
      <View testID="lca-mid">
        <View
          testID="lca-child"
          onMoveShouldSetResponder={() => { childMoveShouldSet++; return true }}
          onResponderGrant={() => { childGrant++ }}
        />
      </View>
    </View>,
  )
  const child = handleFor('lca-child')
  fire(child, TOUCH_START)
  expect(parentGrant, 1, 'parent grabs on start (bubble)')
  fire(child, TOUCH_MOVE)
  expect(childMoveShouldSet, 0, 'a node below the responder is never asked on move')
  expect(childGrant, 0, 'the grandchild must not steal the responder')
  expect(parentMove, 1, 'the parent keeps the gesture and gets the move')
  fire(child, TOUCH_END)
}

// ---- case 7: multi-touch — lifting one finger ends but does NOT release ----------
// Two touches inside the responder. Lifting the first while the second (its target is
// still the responder) remains down fires responderEnd but NOT responderRelease, and
// keeps the responder; lifting the last one finally releases. (ResponderEventPlugin
// responderEnd unconditional, responderRelease gated on noResponderTouches.)

{
  reset()
  let grant = 0, end = 0, release = 0
  mount(
    27,
    <View
      testID="multi"
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => { grant++ }}
      onResponderEnd={() => { end++ }}
      onResponderRelease={() => { release++ }}
    />,
  )
  const h = handleFor('multi')
  // Two fingers down on the responder.
  fire(h, TOUCH_START)
  fire(h, TOUCH_START)
  expect(grant, 1, 'responder granted once on first touch')
  // Lift the first finger; the second is still down with its target on the responder.
  fire(h, TOUCH_END, { touches: [{ target: h }] })
  expect(end, 1, 'responderEnd fires on the first finger-up')
  expect(release, 0, 'responderRelease must NOT fire while a touch remains inside')
  // Lift the last finger; no touches remain -> release.
  fire(h, TOUCH_END, { touches: [] })
  expect(end, 2, 'responderEnd fires again on the last finger-up')
  expect(release, 1, 'responderRelease fires when the last responder touch lifts')
}

// ---- case 8: transfer ordering — taker is GRANTED before incumbent terminates -----
// RN's setResponderAndExtractTransfer grants the taker before terminating the incumbent.
// We assert the consent-path order grant -> terminate (the safe, RN-faithful ordering
// change); the incumbent's terminationRequest still gates the outcome unchanged.

{
  reset()
  const order: string[] = []
  mount(
    28,
    <View
      testID="ord-parent"
      onMoveShouldSetResponder={() => true}
      onResponderGrant={() => { order.push('grant') }}
    >
      <View
        testID="ord-child"
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => true}
        onResponderTerminate={() => { order.push('terminate') }}
      />
    </View>,
  )
  const child = handleFor('ord-child')
  fire(child, TOUCH_START)
  fire(child, TOUCH_MOVE)
  const expectedOrder = 'grant,terminate'
  if (order.join(',') !== expectedOrder)
    throw new Error(`transfer order: got ${order.join(',')}, want ${expectedOrder}`)
  fire(child, TOUCH_END)
}

console.log('responder-negotiation.smoke OK')
