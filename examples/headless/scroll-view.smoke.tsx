// Headless proof of the ScrollView primitive. A fake nativeFabricUIManager
// records the committed tree and captures the global event handler, so we can
// assert the nested RCTScrollView > RCTScrollContentView shape, the
// contentContainerStyle/horizontal -> content-node mapping, and the onScroll
// round-trip — with no simulator. A failure here is in JS, not native.

import { type ReactElement } from 'react'
import { View, mount } from '@symbiote/react'
// ScrollView isn't on the barrel yet (the parent wires exports), so reach the
// source directly — the headless harness has no built dist.
import { ScrollView } from '../../packages/react/src/scroll-view'

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

// ---- the app ------------------------------------------------------------

let scrolled: Record<string, unknown> | undefined

function App(): ReactElement {
  return (
    <ScrollView
      contentContainerStyle={{ padding: 8 }}
      horizontal
      onScroll={(event) => {
        scrolled = event.nativeEvent
      }}
    >
      <View />
    </ScrollView>
  )
}

// ---- assertions ---------------------------------------------------------

function serialize(nodes: FakeNode[]): string {
  return nodes.map(serializeNode).join('')
}
function serializeNode(node: FakeNode): string {
  const kids = node.children.length ? `(${node.children.map(serializeNode).join('')})` : ''
  return `${node.viewName}${kids}`
}

// ---- run ----------------------------------------------------------------

const ROOT_TAG = 11
mount(ROOT_TAG, <App />)

const shape = serialize(committed)
if (shape !== 'RCTScrollView(RCTScrollContentView(RCTView))') {
  throw new Error(`committed tree wrong: ${shape}`)
}

const content = allCreated.find((node) => node.viewName === 'RCTScrollContentView')
if (!content) throw new Error('no RCTScrollContentView was created')
if (content.props.padding !== 8) {
  throw new Error(`content node missing padding:8, got ${JSON.stringify(content.props)}`)
}
if (content.props.flexDirection !== 'row') {
  throw new Error(`content node missing flexDirection:'row', got ${JSON.stringify(content.props)}`)
}

const outer = allCreated.find((node) => node.viewName === 'RCTScrollView')
if (!outer) throw new Error('no RCTScrollView was created')
if ('padding' in outer.props || 'flexDirection' in outer.props) {
  throw new Error(`outer node leaked content style, got ${JSON.stringify(outer.props)}`)
}

if (!eventHandler) throw new Error('no event handler was registered')
const payload = {
  contentOffset: { x: 0, y: 10 },
  contentSize: { width: 100, height: 400 },
  layoutMeasurement: { width: 100, height: 200 },
}
eventHandler(outer.instanceHandle, 'topScroll', payload)
if (!scrolled) throw new Error('onScroll did not fire')
if (scrolled !== payload) {
  throw new Error(`onScroll got wrong payload: ${JSON.stringify(scrolled)}`)
}

console.log('scroll-view.smoke OK')
