/** @jsxRuntime automatic */
// Headless proof that a user-supplied onScroll on a FlatList COMPOSES with the
// list's internal windowing handler instead of overwriting it. RN's _onScroll runs
// its own bookkeeping AND calls this.props.onScroll(e) (VirtualizedList.js:1695-1697);
// before the fix our list dropped the user handler because it arrived raw via the
// rest spread and was clobbered by the internal `onScroll`.
//
// We mount a FlatList with getItemLayout (so offsets are known without real layout),
// a user onScroll, a small viewport, then fire a native scroll on the inner
// RCTScrollView. We assert BOTH:
//   1. the user's onScroll fired and received the scroll event, AND
//   2. the window still moved to the scrolled region (the internal handler is intact).
// No simulator — a failure here is in the JS compose, not native.

import { createElement, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { FlatList } from '../../packages/react/src/flat-list'

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
  completeRoot(_rootTag: number, childSet: FakeNode[]): void {
    committed = childSet
  },
  registerEventHandler(handler: EventHandler): void {
    eventHandler = handler
  },
  dispatchCommand(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

function findScrollView(nodes: FakeNode[]): FakeNode | undefined {
  for (const node of nodes) {
    if (/scroll/i.test(node.viewName)) return node
    const nested = findScrollView(node.children)
    if (nested !== undefined) return nested
  }
  return undefined
}

// Collect the text content of every rendered row so we can tell which window is resident.
function renderedRows(nodes: FakeNode[]): string[] {
  const rows: string[] = []
  for (const node of nodes) {
    for (const child of node.children) {
      if (typeof child.props.text === 'string' && child.props.text.startsWith('row-')) {
        rows.push(child.props.text)
      }
    }
    rows.push(...renderedRows(node.children))
  }
  return rows
}

const ITEM_HEIGHT = 40
const VIEWPORT = 200
const DATA = Array.from({ length: 200 }, (_unused, index) => ({ id: index }))

const seenEvents: Array<Record<string, unknown>> = []

function App(): ReactElement {
  return createElement(FlatList<{ id: number }>, {
    data: DATA,
    keyExtractor: (item) => `k-${item.id}`,
    getItemLayout: (_data, index) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
    // The user's scroll-driven-UI handler. Before the fix this was silently dropped.
    onScroll: (event) => {
      seenEvents.push(event.nativeEvent)
    },
  })
}

mount(301, <App />)

if (committed.length === 0) throw new Error('FlatList did not commit')
if (!eventHandler) throw new Error('no event handler was registered')

const scrollView = findScrollView(committed)
if (scrollView === undefined) throw new Error('no scroll view node found in committed tree')

// Set the viewport via a native layout event so the window has a real height.
eventHandler(scrollView.instanceHandle, 'topLayout', {
  layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
})

// Rows resident before the deep scroll — top of the list.
const rowsBeforeScroll = renderedRows(committed)

// Fire a deep native scroll. The internal windowing handler must re-window AND the
// user's onScroll must receive this same payload.
const scrollPayload = {
  contentOffset: { x: 0, y: ITEM_HEIGHT * 100 },
  contentSize: { width: 320, height: ITEM_HEIGHT * DATA.length },
  layoutMeasurement: { width: 320, height: VIEWPORT },
}
eventHandler(scrollView.instanceHandle, 'topScroll', scrollPayload)

// ---- assertion 1: the user's onScroll fired and got the event ----

if (seenEvents.length === 0) {
  throw new Error('user onScroll never fired — internal handler clobbered it (the bug)')
}
const last = seenEvents[seenEvents.length - 1]
const offset = Reflect.get(last, 'contentOffset')
if (typeof offset !== 'object' || offset === null || Reflect.get(offset, 'y') !== ITEM_HEIGHT * 100) {
  throw new Error(`user onScroll got wrong payload: ${JSON.stringify(last)}`)
}

// ---- assertion 2: the internal windowing handler still ran (window moved) ----

const rowsAfterScroll = renderedRows(committed)
if (rowsAfterScroll.includes('row-0')) {
  throw new Error('window did not move off the top after a deep scroll — internal handler lost')
}
if (!rowsAfterScroll.includes('row-100')) {
  throw new Error(
    `window did not reach the scrolled region (expected row-100), rendered ${JSON.stringify(rowsAfterScroll.slice(0, 4))}…`,
  )
}
if (rowsBeforeScroll.includes('row-100')) {
  throw new Error('pre-scroll window already contained row-100 — test cannot distinguish windowing')
}

console.log('flat-list-on-scroll-compose.smoke OK')
