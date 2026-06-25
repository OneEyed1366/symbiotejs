/** @jsxRuntime automatic */
// Headless proof of two VirtualizedList feature-parity fixes:
//   1. maintainVisibleContentPosition (MVCP) is forwarded to the inner ScrollView node, so
//      Fabric anchors the visible cells. We walk the committed tree for the scroll view and
//      assert the prop landed (with minIndexForVisible bumped for a ListHeaderComponent).
//   2. scrollToIndex on an UNMEASURED target with no getItemLayout fires onScrollToIndexFailed
//      ({index, highestMeasuredFrameIndex, averageItemLength}) instead of silently scrolling
//      to an estimate — so NO scrollTo command is dispatched on that path.
// No simulator — a failure here is in the JS routing, not native.

import { createElement, createRef, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { FlatList, type FlatListHandle } from '../../packages/react/src/flat-list'

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

interface CommandCall {
  name: string
  args: readonly unknown[]
}

let committed: FakeNode[] = []
const commands: CommandCall[] = []

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
  registerEventHandler(): void {},
  dispatchCommand(_handle: unknown, name: string, args: readonly unknown[]): void {
    commands.push({ name, args })
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// Walk the committed tree; return the first node whose viewName looks like a scroll view.
function findScrollView(nodes: FakeNode[]): FakeNode | undefined {
  for (const node of nodes) {
    if (/scroll/i.test(node.viewName)) return node
    const nested = findScrollView(node.children)
    if (nested !== undefined) return nested
  }
  return undefined
}

// ---- case 1: maintainVisibleContentPosition forwards to the scroll view ----

{
  const DATA = Array.from({ length: 20 }, (_unused, index) => ({ id: index }))
  function App(): ReactElement {
    return createElement(FlatList<{ id: number }>, {
      data: DATA,
      keyExtractor: (item) => `k-${item.id}`,
      // A header occupies child 0, so RN bumps minIndexForVisible by 1 (1 -> 2).
      ListHeaderComponent: () => createElement('symbiote-text', {}, 'header'),
      maintainVisibleContentPosition: { minIndexForVisible: 1, autoscrollToTopThreshold: 10 },
      renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
    })
  }

  mount(201, <App />)
  if (committed.length === 0) throw new Error('MVCP FlatList did not commit')

  const scrollView = findScrollView(committed)
  if (scrollView === undefined) throw new Error('MVCP: no scroll view node found in committed tree')

  const mvcp = scrollView.props.maintainVisibleContentPosition
  if (typeof mvcp !== 'object' || mvcp === null) {
    throw new Error(
      `MVCP: scroll view missing maintainVisibleContentPosition, got ${JSON.stringify(mvcp)}`,
    )
  }
  const minIndex = Reflect.get(mvcp, 'minIndexForVisible')
  const autoscroll = Reflect.get(mvcp, 'autoscrollToTopThreshold')
  if (minIndex !== 2) {
    throw new Error(`MVCP: minIndexForVisible should be bumped 1->2 for the header, got ${String(minIndex)}`)
  }
  if (autoscroll !== 10) {
    throw new Error(`MVCP: autoscrollToTopThreshold should pass through as 10, got ${String(autoscroll)}`)
  }
  console.log('virtualized-list-mvcp.smoke case1 (MVCP forwarded) OK')
}

// ---- case 2: scrollToIndex on an unmeasured cell fires onScrollToIndexFailed ----

{
  committed = []
  commands.length = 0
  const failures: Array<{ index: number; highestMeasuredFrameIndex: number; averageItemLength: number }> = []
  const listRef = createRef<FlatListHandle>()
  const DATA = Array.from({ length: 100 }, (_unused, index) => ({ id: index }))

  function App(): ReactElement {
    return createElement(FlatList<{ id: number }>, {
      data: DATA,
      keyExtractor: (item) => `k-${item.id}`,
      // No getItemLayout — cells are unmeasured in headless (no real onLayout), so a
      // far target has no resolvable offset.
      renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
      onScrollToIndexFailed: (info) => failures.push(info),
      ref: listRef,
    })
  }

  mount(202, <App />)
  if (committed.length === 0) throw new Error('fail-path FlatList did not commit')
  if (listRef.current === null) throw new Error('fail-path FlatList ref did not attach')

  const scrollsBefore = commands.filter((c) => c.name === 'scrollTo').length
  listRef.current.scrollToIndex({ index: 50, animated: true })
  const scrollsAfter = commands.filter((c) => c.name === 'scrollTo').length

  if (failures.length !== 1) {
    throw new Error(`onScrollToIndexFailed should fire once, fired ${failures.length} times`)
  }
  if (failures[0].index !== 50) {
    throw new Error(`onScrollToIndexFailed index should be 50, got ${failures[0].index}`)
  }
  if (typeof failures[0].highestMeasuredFrameIndex !== 'number') {
    throw new Error('onScrollToIndexFailed should carry a numeric highestMeasuredFrameIndex')
  }
  if (typeof failures[0].averageItemLength !== 'number') {
    throw new Error('onScrollToIndexFailed should carry a numeric averageItemLength')
  }
  if (scrollsAfter !== scrollsBefore) {
    throw new Error(
      `unmeasured scrollToIndex must NOT dispatch scrollTo (estimate), but ${scrollsAfter - scrollsBefore} fired`,
    )
  }
  console.log('virtualized-list-mvcp.smoke case2 (onScrollToIndexFailed) OK')
}

console.log('virtualized-list-mvcp.smoke OK')
