// Headless proof of the horizontal-FlatList fix. On iOS the scroll axis is decided
// by content overflow, so a horizontal list must (1) forward `horizontal` to the
// native RCTScrollView and (2) pin the content view to the full row width — else the
// content stays at the frame width, the row is clipped, and nothing scrolls. This
// asserts both against a fake Fabric slot.

import { createElement, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { FlatList } from '../../adapters/react/src/flat-list'

// ---- fake Fabric slot ---------------------------------------------------

interface FakeNode {
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
    _tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    const node: FakeNode = { viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNodeWithNewProps: (node: FakeNode, props: Record<string, unknown>): FakeNode => ({
    ...node,
    props,
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    props: Record<string, unknown>,
  ): FakeNode => ({ ...node, props, children: [] }),
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

// ---- the app ------------------------------------------------------------

const ITEM_COUNT = 20
const ITEM_WIDTH = 50
const TOTAL_WIDTH = ITEM_COUNT * ITEM_WIDTH
const VIEWPORT_WIDTH = 200

interface Row {
  id: string
  index: number
}

const data: Row[] = Array.from({ length: ITEM_COUNT }, (_, index) => ({ id: `row-${index}`, index }))

function App(): ReactElement {
  return createElement(FlatList<Row>, {
    data,
    horizontal: true,
    keyExtractor: (item: Row) => item.id,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_WIDTH,
      offset: ITEM_WIDTH * index,
      index,
    }),
    renderItem: ({ item }: { item: Row; index: number }) =>
      createElement('symbiote-view', { key: item.id, style: { width: ITEM_WIDTH, height: 40 } }),
  })
}

// ---- run + assert -------------------------------------------------------

const ROOT_TAG = 31
mount(ROOT_TAG, createElement(App))

const scrollView = allCreated.find((node) => node.viewName === 'RCTScrollView')
if (!scrollView) throw new Error('no RCTScrollView created')
if (scrollView.props.horizontal !== true) {
  throw new Error(`horizontal must reach RCTScrollView, got ${JSON.stringify(scrollView.props.horizontal)}`)
}

const content = allCreated.find((node) => node.viewName === 'RCTScrollContentView')
if (!content) throw new Error('no RCTScrollContentView created')
// The content view must be pinned to the full row width, not the frame width — this
// is what makes the row overflow and the native scroll view actually scroll.
if (content.props.width !== TOTAL_WIDTH) {
  throw new Error(
    `horizontal content must be pinned to total width ${TOTAL_WIDTH}, got ${JSON.stringify(content.props.width)}`,
  )
}
if (content.props.flexDirection !== 'row') {
  throw new Error(`horizontal content must be a row, got ${JSON.stringify(content.props.flexDirection)}`)
}

// Sanity: windowing still trims — not all 20 cells render before any layout/scroll.
if (!eventHandler) throw new Error('no event handler registered')
eventHandler(scrollView.instanceHandle, 'topLayout', {
  layout: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: 40 },
})

console.log('flat-list-horizontal.smoke OK')
