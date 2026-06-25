/** @jsxRuntime automatic */
// Headless proof that VirtualizedSectionList sticks its section headers. Stickiness is a
// JS layer (ScrollView wraps each flagged child in a ScrollViewStickyHeader — an
// Animated.View with collapsable:false and a translateY transform driven by the scroll
// offset; the native scroll view does NOT honor a bare index array). A fake slot records
// every created node; we mount two small sections (all entries inside the initial window)
// and assert the two section headers each get wrapped in a transform-bearing sticky
// wrapper — and that stickySectionHeadersEnabled={false} wraps nothing. This exercises the
// full VirtualizedSectionList -> ScrollView -> wrapStickyHeaders path.

import { createElement, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { VirtualizedSectionList } from '../../adapters/react/src/virtualized-section-list'

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

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
  completeRoot(): void {},
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

interface Row {
  id: number
}

const SECTIONS = [
  { title: 'A', data: [{ id: 0 }, { id: 1 }] },
  { title: 'B', data: [{ id: 2 }, { id: 3 }] },
]

function reset(): void {
  allCreated.length = 0
}

// A sticky-header wrapper is the only node carrying a `transform` (its translateY); regular
// cells and the content container don't. So transform-bearing nodes count the wrapped headers.
function stickyWrappers(): FakeNode[] {
  return allCreated.filter((n) => Array.isArray(n.props.transform))
}

function renderSection(props: {
  sections: typeof SECTIONS
  stickySectionHeadersEnabled?: boolean
}): ReactElement {
  return createElement(VirtualizedSectionList<Row>, {
    sections: props.sections,
    stickySectionHeadersEnabled: props.stickySectionHeadersEnabled,
    renderSectionHeader: ({ section }) => createElement('symbiote-text', {}, section.title),
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
  })
}

// ---- case 1: the two section headers each get a sticky wrapper -------------
// Flattened: [0]=header A, [1..2]=items, [3]=footer A, [4]=header B, [5..6]=items,
// [7]=footer B. No separators, no list header -> child positions equal entry indices,
// so the two headers land at child 0 and 4 and get wrapped.

{
  reset()
  mount(51, renderSection({ sections: SECTIONS }))
  const wrappers = stickyWrappers()
  if (wrappers.length !== 2) {
    throw new Error(`expected 2 sticky-header wrappers (one per section header), got ${wrappers.length}`)
  }
  for (const wrapper of wrappers) {
    if (wrapper.props.collapsable !== false) {
      throw new Error(`sticky wrapper must be collapsable:false, got ${JSON.stringify(wrapper.props.collapsable)}`)
    }
  }
}

// ---- case 2: stickySectionHeadersEnabled={false} wraps nothing -------------

{
  reset()
  mount(52, renderSection({ sections: SECTIONS, stickySectionHeadersEnabled: false }))
  const wrappers = stickyWrappers()
  if (wrappers.length !== 0) {
    throw new Error(`disabled sticky headers must wrap no header, got ${wrappers.length}`)
  }
}

console.log('sticky-section-headers.smoke OK')
