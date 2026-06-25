// Headless proof of the ScrollView primitive. A fake nativeFabricUIManager
// records the committed tree and captures the global event handler, so we can
// assert the nested RCTScrollView > RCTScrollContentView shape, the
// contentContainerStyle/horizontal -> content-node mapping, and the onScroll
// round-trip — with no simulator. A failure here is in JS, not native.

import { type ReactElement } from 'react'
import { View, mount } from '@symbiote/react'
// ScrollView isn't on the barrel yet (the parent wires exports), so reach the
// source directly — the headless harness has no built dist.
import { ScrollView } from '../../adapters/react/src/scroll-view'

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

// Every commit is now wrapped in RN's AppContainer equivalent: one synthetic RCTView
// root (flex:1 + pointerEvents box-none). Unwrap it before asserting the app's shape.
const [appRoot] = committed
if (committed.length !== 1 || appRoot.props.pointerEvents !== 'box-none') {
  throw new Error(`expected one synthetic box-none root, got ${serialize(committed)}`)
}
const shape = serialize(appRoot.children)
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
// `padding` is a content-container style and must NOT leak onto the scroll view node.
// `flexDirection`, by contrast, is now EXPECTED on the outer node — it is the scroll
// view's own base style, asserted positively below.
if ('padding' in outer.props) {
  throw new Error(`outer node leaked content padding, got ${JSON.stringify(outer.props)}`)
}
// flexDirection:'row' on the scroll view NODE is what makes Yoga size the content child
// along the scroll axis (content-width, unbounded) so the row overflows and scrolls — RN's
// styles.baseHorizontal. Without it the content is cross-axis and clamped to the frame.
if (outer.props.flexDirection !== 'row') {
  throw new Error(`outer node missing baseHorizontal flexDirection:'row', got ${JSON.stringify(outer.props)}`)
}
// overflow:'scroll' clips content to the frame — RN's base style on both axes. Without it
// iOS Fabric doesn't clip and a fixed-size scroll view bleeds over its siblings.
if (outer.props.overflow !== 'scroll') {
  throw new Error(`outer node missing base overflow:'scroll', got ${JSON.stringify(outer.props)}`)
}
// horizontal must also reach the native scroll view as a bool — on iOS RCTScrollView keys
// its axis off this prop (Android uses the dedicated AndroidHorizontalScrollView component).
if (outer.props.horizontal !== true) {
  throw new Error(`horizontal must reach RCTScrollView, got ${JSON.stringify(outer.props.horizontal)}`)
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

// ---- vertical ScrollView carries the clip base too -----------------------
// Regression guard for the iOS bleed: a vertical scroll view used to get NO base style,
// so overflow was never set and iOS didn't clip. It must now match RN's baseVertical
// (overflow:'scroll' + flexDirection:'column').

allCreated.length = 0
committed = []
mount(12, <ScrollView style={{ height: 120 }}><View /></ScrollView>)
const vertical = allCreated.find((node) => node.viewName === 'RCTScrollView')
if (!vertical) throw new Error('no vertical RCTScrollView was created')
if (vertical.props.overflow !== 'scroll') {
  throw new Error(`vertical scroll view missing base overflow:'scroll', got ${JSON.stringify(vertical.props)}`)
}
if (vertical.props.flexDirection !== 'column') {
  throw new Error(`vertical scroll view missing baseVertical flexDirection:'column', got ${JSON.stringify(vertical.props)}`)
}
// A user style still wins over the base — the explicit height must survive the merge.
if (vertical.props.height !== 120) {
  throw new Error(`user height must survive the base merge, got ${JSON.stringify(vertical.props.height)}`)
}

console.log('scroll-view.smoke OK')
