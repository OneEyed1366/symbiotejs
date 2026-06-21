// Headless proof of the responder system end-to-end: a View carrying PanResponder's
// panHandlers, driven through the REAL event layer (topTouchStart/Move/End on the
// node's instanceHandle, exactly how Fabric delivers touches). Asserts the
// negotiation grants the responder, routes moves with correct gestureState deltas,
// and releases on end. This is the path the device drag exercises — a failure here
// is the responder dispatch in events.ts, not PanResponder itself.

import { type ReactElement } from 'react'
import { mount, View, PanResponder } from '@symbiote/react'

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

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    return { tag, viewName, props, children: [], instanceHandle }
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

// ---- a View wired with PanResponder -------------------------------------

const seen: string[] = []
let moveDx = 0
let moveDy = 0
const responder = PanResponder.create({
  onStartShouldSetPanResponder: () => true,
  onPanResponderGrant: () => {
    seen.push('grant')
  },
  onPanResponderMove: (_event, gesture) => {
    seen.push('move')
    moveDx = gesture.dx
    moveDy = gesture.dy
  },
  onPanResponderRelease: () => {
    seen.push('release')
  },
})

function App(): ReactElement {
  return <View {...responder.panHandlers} style={{ width: 50, height: 50 }} />
}

mount(7, <App />)

if (committed.length !== 1) throw new Error(`expected one root, got ${JSON.stringify(committed)}`)
const viewNode = committed[0].children[0]
const handle = viewNode.instanceHandle
if (eventHandler === undefined) throw new Error('event handler was never registered')
const dispatch = eventHandler

// One finger: down at (10,10), drag to (40,55), lift. Touches carry pageX/pageY/
// timestamp, the shape PanResponder reads for centroid + velocity.
function touch(pageX: number, pageY: number, timestamp: number): Record<string, unknown> {
  const point = { pageX, pageY, locationX: pageX, locationY: pageY, identifier: 1, timestamp }
  return { touches: [point], changedTouches: [point], target: viewNode.tag, timestamp }
}

dispatch(handle, 'topTouchStart', touch(10, 10, 1000))
dispatch(handle, 'topTouchMove', touch(40, 55, 1016))
dispatch(handle, 'topTouchEnd', touch(40, 55, 1032))

if (seen.join(',') !== 'grant,move,release') {
  throw new Error(`expected grant,move,release through the event layer, got ${seen.join(',')}`)
}
// dx/dy are the delta from the grant point: 40-10=30, 55-10=45.
if (moveDx !== 30 || moveDy !== 45) {
  throw new Error(`move gestureState should carry dx=30 dy=45, got dx=${moveDx} dy=${moveDy}`)
}

console.log('responder: grant -> move(dx=30,dy=45) -> release through the event layer')
console.log('responder.smoke OK')
