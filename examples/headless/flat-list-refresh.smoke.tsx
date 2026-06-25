/** @jsxRuntime automatic */
// Headless proof that a FlatList threads pull-to-refresh down to its inner
// ScrollView. RN's VirtualizedList renders a <RefreshControl> into the ScrollView's
// `refreshControl` prop whenever `onRefresh` is set; symbiote's lists never did.
// We mount a FlatList with onRefresh + refreshing, walk the committed tree, and
// assert:
//   1. a PullToRefreshView node (iOS native name for symbiote-refresh-control) is
//      committed as a child of the RCTScrollView (RN places it as the scroll view's
//      first child, a sibling before the content container),
//   2. its `refreshing` prop carries the controlled value we passed (true),
//   3. without onRefresh, NO PullToRefreshView is committed.
//
// No simulator; a failure here is in JS.

import { createElement, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { FlatList } from '../../adapters/react/src/flat-list'

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

// ---- data ---------------------------------------------------------------

const ITEM_COUNT = 20
const ITEM_HEIGHT = 40
const VIEWPORT_HEIGHT = 400
const REFRESH_VIEW_NAME = 'PullToRefreshView'

interface Row {
  id: number
  label: string
}

const DATA: Row[] = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({
  id: index,
  label: `row-${index}`,
}))

// ---- helpers ------------------------------------------------------------

function walk(nodes: FakeNode[], visit: (node: FakeNode) => void): void {
  for (const node of nodes) {
    visit(node)
    walk(node.children, visit)
  }
}

function findCommitted(viewName: string): FakeNode | undefined {
  let found: FakeNode | undefined
  walk(committed, (node) => {
    if (found === undefined && node.viewName === viewName) found = node
  })
  return found
}

// The scroll node whose own children contain a PullToRefreshView — proves the
// refresh control is a child of the scroll view, not stranded elsewhere.
function findScrollWithRefreshChild(): FakeNode | undefined {
  let found: FakeNode | undefined
  walk(committed, (node) => {
    if (found !== undefined || node.viewName !== 'RCTScrollView') return
    if (node.children.some((child) => child.viewName === REFRESH_VIEW_NAME)) found = node
  })
  return found
}

// =========================================================================
// PART 1 — onRefresh wires a PullToRefreshView child onto the scroll view
// =========================================================================

let refreshCalls = 0

function RefreshApp(): ReactElement {
  return createElement(FlatList<Row>, {
    data: DATA,
    refreshing: true,
    onRefresh: () => {
      refreshCalls += 1
    },
    progressViewOffset: 12,
    keyExtractor: (item: Row) => `r-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }: { item: Row }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  })
}

mount(40, <RefreshApp />)

// Establish the viewport so the list commits its body.
const refreshScroll = allCreated.find((n) => n.viewName === 'RCTScrollView')
if (!refreshScroll) throw new Error('refresh: no RCTScrollView was created')
if (!eventHandler) throw new Error('refresh: no event handler registered')
eventHandler(refreshScroll.instanceHandle, 'topLayout', {
  layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
})

const refreshNode = findCommitted(REFRESH_VIEW_NAME)
if (!refreshNode) {
  throw new Error(
    `refresh: no ${REFRESH_VIEW_NAME} committed — onRefresh did not thread a RefreshControl into the ScrollView`,
  )
}

const scrollWithRefresh = findScrollWithRefreshChild()
if (!scrollWithRefresh) {
  throw new Error(
    `refresh: ${REFRESH_VIEW_NAME} is not a child of the RCTScrollView ` +
      '(RN places the refresh control as the scroll view\'s first child)',
  )
}

if (refreshNode.props.refreshing !== true) {
  throw new Error(
    `refresh: controlled refreshing prop did not reach native (expected true, got ${String(refreshNode.props.refreshing)})`,
  )
}

// =========================================================================
// PART 2 — no onRefresh => no PullToRefreshView committed
// =========================================================================

committed = []
allCreated.length = 0
refreshCalls = 0

function PlainApp(): ReactElement {
  return createElement(FlatList<Row>, {
    data: DATA,
    keyExtractor: (item: Row) => `p-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }: { item: Row }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  })
}

mount(50, <PlainApp />)

const plainScroll = allCreated.find((n) => n.viewName === 'RCTScrollView')
if (!plainScroll) throw new Error('plain: no RCTScrollView was created')
eventHandler(plainScroll.instanceHandle, 'topLayout', {
  layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
})

if (findCommitted(REFRESH_VIEW_NAME)) {
  throw new Error(`plain: a ${REFRESH_VIEW_NAME} was committed with no onRefresh — refresh control must be absent`)
}

console.log('flat-list-refresh.smoke OK')
