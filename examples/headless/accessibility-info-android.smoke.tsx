// Headless proof of the Android AccessibilityInfo event dispatch — no emulator. A fake
// nativeFabricUIManager records sendAccessibilityEvent(handle, eventType) calls; we mount a
// View, capture its host ref, and assert AccessibilityInfo.sendAccessibilityEvent routes the
// node's COMMITTED Fabric handle and the STRING eventType (focus / click / windowStateChange)
// through the slot — matching RN's Fabric path, not the old UIManager int-map crutch. We
// import the .android build directly because the base re-export resolves to iOS under tsx.
// A failure here is in the JS routing, not native.

import { type ReactElement } from 'react'
import { mount, View, findNodeHandle } from '@symbiote/react'
import { AccessibilityInfo } from '../../packages/react/src/accessibility-info.android'

// ---- fake Fabric slot ---------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
}

interface AccessibilityCall {
  node: FakeNode
  eventType: string
}

let committed: FakeNode[] = []
const a11yEvents: AccessibilityCall[] = []
const slot = {
  createNode: (
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
  ): FakeNode => ({ tag, viewName, props, children: [] }),
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
  appendChild: (parent: FakeNode, child: FakeNode): FakeNode => {
    parent.children.push(child)
    return parent
  },
  appendChildToSet: (childSet: FakeNode[], child: FakeNode): void => {
    childSet.push(child)
  },
  completeRoot: (_rootTag: number, childSet: FakeNode[]): void => {
    committed = childSet
  },
  registerEventHandler: (): void => {},
  dispatchCommand: (): void => {},
  sendAccessibilityEvent: (node: FakeNode, eventType: string): void => {
    a11yEvents.push({ node, eventType })
  },
}
Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- mount a View and capture its host ref -------------------------------

let box: unknown
function App(): ReactElement {
  return <View ref={(instance) => { box = instance }} style={{ width: 10, height: 10 }} />
}
mount(7, <App />)

if (box == null) throw new Error('host ref handed back nothing')
const boxTag = findNodeHandle(box)
if (typeof boxTag !== 'number') throw new Error('findNodeHandle(ref) returned no tag')

function lastEvent(): AccessibilityCall {
  const call = a11yEvents[a11yEvents.length - 1]
  if (!call) throw new Error('expected a slot.sendAccessibilityEvent call')
  return call
}

// ---- case 1: sendAccessibilityEvent('focus') routes node + string through the slot ----

{
  AccessibilityInfo.sendAccessibilityEvent(box, 'focus')
  const call = lastEvent()
  if (call.node.tag !== boxTag || call.eventType !== 'focus') {
    throw new Error(
      `sendAccessibilityEvent('focus') should route the committed node (tag ${boxTag}) with 'focus', got ${JSON.stringify({ tag: call.node.tag, eventType: call.eventType })}`,
    )
  }
}

// ---- case 2: the STRING eventType passes through unmapped (no int translation) ----

{
  AccessibilityInfo.sendAccessibilityEvent(box, 'click')
  const click = lastEvent()
  if (click.node.tag !== boxTag || click.eventType !== 'click') {
    throw new Error(`sendAccessibilityEvent('click') should route 'click', got ${JSON.stringify({ tag: click.node.tag, eventType: click.eventType })}`)
  }

  AccessibilityInfo.sendAccessibilityEvent(box, 'windowStateChange')
  const windowState = lastEvent()
  if (windowState.eventType !== 'windowStateChange') {
    throw new Error(`sendAccessibilityEvent('windowStateChange') should route the string, got ${windowState.eventType}`)
  }
}

// ---- case 3: a non-node handle is a no-op (nothing reaches the slot) ------

{
  const before = a11yEvents.length
  // A bare tag can't be resolved back to a node, so it must not reach the slot.
  AccessibilityInfo.sendAccessibilityEvent(123, 'focus')
  if (a11yEvents.length !== before) {
    throw new Error('a non-node handle must not route to the slot')
  }

  // setAccessibilityFocus is tag-only (no node to route) — a documented no-op.
  AccessibilityInfo.setAccessibilityFocus(boxTag)
  if (a11yEvents.length !== before) {
    throw new Error('setAccessibilityFocus(tag) must be a no-op on the Fabric slot path')
  }
}

// ---- case 4: iOS-only getters resolve false on Android (RN parity) --------

{
  const darker = await AccessibilityInfo.isDarkerSystemColorsEnabled()
  if (darker !== false) throw new Error('isDarkerSystemColorsEnabled must be false on Android')

  const crossFade = await AccessibilityInfo.prefersCrossFadeTransitions()
  if (crossFade !== false) throw new Error('prefersCrossFadeTransitions must be false on Android')
}

console.log('accessibility-info-android.smoke OK')
