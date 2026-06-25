// Headless proof of the RefreshControl primitive wired into ScrollView. A fake
// nativeFabricUIManager records the committed tree and captures the global event
// handler, so we can assert the iOS nesting (PullToRefreshView is a child of
// RCTScrollView, a sibling BEFORE RCTScrollContentView), that `refreshing` passes
// through as a real Fabric prop, and that firing topRefresh on the refresh-control
// node calls onRefresh — all with no simulator. A failure here is in JS, not native.

import { type ReactElement } from 'react'
import { View, mount } from '@symbiote/react'
// Neither ScrollView nor RefreshControl is on the barrel yet (the parent wires
// exports), so reach the sources directly — the headless harness has no built dist.
import { ScrollView } from '../../adapters/react/src/scroll-view'
import { RefreshControl } from '../../adapters/react/src/refresh-control'

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

let refreshed = false

function App(): ReactElement {
  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={false}
          enabled={true}
          onRefresh={() => {
            refreshed = true
          }}
        />
      }
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

// PullToRefreshView is a child of RCTScrollView, the FIRST sibling — before the
// content container (exactly as RN's iOS ScrollView orders {refreshControl} then
// {contentContainer}).
// Every commit is now wrapped in RN's AppContainer equivalent: one synthetic RCTView
// root (flex:1 + pointerEvents box-none). Unwrap it before asserting the app's shape.
const [appRoot] = committed
if (committed.length !== 1 || appRoot.props.pointerEvents !== 'box-none') {
  throw new Error(`expected one synthetic box-none root, got ${serialize(committed)}`)
}
const shape = serialize(appRoot.children)
const EXPECTED_SHAPE =
  'RCTScrollView(PullToRefreshViewRCTScrollContentView(RCTView))'
if (shape !== EXPECTED_SHAPE) {
  throw new Error(`committed tree wrong: ${shape}`)
}

// The serializer runs siblings together, so assert the ordered children of the
// scroll view directly: refresh control FIRST, content container SECOND.
const scrollView = appRoot.children[0]
if (!scrollView || scrollView.viewName !== 'RCTScrollView') {
  throw new Error(`root is not RCTScrollView: ${JSON.stringify(scrollView?.viewName)}`)
}
const childNames = scrollView.children.map((node) => node.viewName)
if (
  childNames.length !== 2 ||
  childNames[0] !== 'PullToRefreshView' ||
  childNames[1] !== 'RCTScrollContentView'
) {
  throw new Error(`scroll-view children wrong: ${JSON.stringify(childNames)}`)
}

const refresh = allCreated.find((node) => node.viewName === 'PullToRefreshView')
if (!refresh) throw new Error('no PullToRefreshView was created')
if (refresh.props.refreshing !== false) {
  throw new Error(
    `PullToRefreshView missing refreshing:false, got ${JSON.stringify(refresh.props)}`,
  )
}

// `enabled` is an Android-only native prop (AndroidSwipeRefreshLayout). Symbiote forwards
// it via `...nativeProps` like the other Android-only props (colors/size); RN's Android
// branch (RefreshControl.js:174) keeps `enabled`, only its iOS branch strips it. Stripping
// it in symbiote made `<RefreshControl enabled={false} />` unable to disable Android
// pull-to-refresh — so it must now reach the node.
if (refresh.props.enabled !== true) {
  throw new Error(
    `enabled must forward to native (Android-only), got ${JSON.stringify(refresh.props)}`,
  )
}

if (!eventHandler) throw new Error('no event handler was registered')
eventHandler(refresh.instanceHandle, 'topRefresh', {})
if (!refreshed) throw new Error('onRefresh did not fire on topRefresh')

console.log('refresh-control.smoke OK')
