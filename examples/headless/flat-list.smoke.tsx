/** @jsxRuntime automatic */
// Headless proof of virtualization. A fake nativeFabricUIManager records every
// committed node and captures the global event handler, so we can mount a
// FlatList over 1000 items with a FIXED getItemLayout (no measurement needed),
// drive the ScrollView's onLayout/onScroll directly, and ASSERT the core claim:
// only a window's worth of item nodes is ever committed — never all 1000 — and
// that window SHIFTS when we scroll. No simulator; a failure here is in JS.

import { createElement, createRef, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
// Not on the barrel yet (the integrator wires exports), so reach the source.
import { FlatList, type FlatListHandle } from '../../packages/react/src/flat-list'

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
const endReachedDistances: number[] = []
const startReachedDistances: number[] = []
// Read the count through a function so control-flow analysis can't pin .length to a
// literal after an earlier `!== 0` check (it can't see the push inside the callback).
const endReachedCount = (): number => endReachedDistances.length
const startReachedCount = (): number => startReachedDistances.length

const listRef = createRef<FlatListHandle>()

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

const ITEM_COUNT = 1000
const ITEM_HEIGHT = 40
const VIEWPORT_HEIGHT = 400

interface Row {
  id: number
  label: string
}

const DATA: Row[] = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({
  id: index,
  label: `row-${index}`,
}))

const Separator = (): ReactElement => createElement('symbiote-view', { style: { height: 1 } })
const Header = (): ReactElement => createElement('symbiote-text', {}, 'HEADER')
const Footer = (): ReactElement => createElement('symbiote-text', {}, 'FOOTER')

function App(): ReactElement {
  return createElement(FlatList<Row>, {
    ref: listRef,
    data: DATA,
    keyExtractor: (item: Row) => `k-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    ItemSeparatorComponent: Separator,
    ListHeaderComponent: Header,
    ListFooterComponent: Footer,
    onEndReached: ({ distanceFromEnd }: { distanceFromEnd: number }) => {
      endReachedDistances.push(distanceFromEnd)
    },
    onStartReached: ({ distanceFromStart }: { distanceFromStart: number }) => {
      startReachedDistances.push(distanceFromStart)
    },
    renderItem: ({ item }: { item: Row }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  })
}

// ---- helpers ------------------------------------------------------------

// The text content of a committed row cell ("row-N"). We harvest these from the
// committed tree to know exactly which items are resident.
function collectRowLabels(): Set<string> {
  const labels = new Set<string>()
  walk(committed, (node) => {
    const text = node.props.text
    if (typeof text === 'string' && text.startsWith('row-')) labels.add(text)
  })
  return labels
}

function hasText(target: string): boolean {
  let found = false
  walk(committed, (node) => {
    if (node.props.text === target) found = true
  })
  return found
}

function walk(nodes: FakeNode[], visit: (node: FakeNode) => void): void {
  for (const node of nodes) {
    visit(node)
    walk(node.children, visit)
  }
}

function findScrollView(): FakeNode {
  const node = allCreated.find((n) => n.viewName === 'RCTScrollView')
  if (!node) throw new Error('no RCTScrollView was created')
  return node
}

function fire(handle: unknown, type: string, nativeEvent: Record<string, unknown>): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(handle, type, nativeEvent)
}

const CONTENT_HEIGHT = ITEM_COUNT * ITEM_HEIGHT

function scrollTo(handle: unknown, offsetY: number): void {
  fire(handle, 'topScroll', {
    contentOffset: { x: 0, y: offsetY },
    contentSize: { width: 320, height: CONTENT_HEIGHT },
    layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
  })
}

// ---- run ----------------------------------------------------------------

const ROOT_TAG = 21
mount(ROOT_TAG, <App />)

// Establish the viewport by firing onLayout on the ScrollView. This re-renders
// and re-commits synchronously (discrete-lane flush), narrowing the window from
// the initial bounded prefix to the real visible region + buffer.
const scrollView = findScrollView()
fire(scrollView.instanceHandle, 'topLayout', {
  layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
})

// ---- assertion 1: the window is FAR smaller than the full data ----------

const labelsAtTop = collectRowLabels()
if (labelsAtTop.size === 0) {
  throw new Error('no item rows committed at all — windowing produced an empty list')
}
// windowSize 21 over a 400px viewport / 40px rows = ~10 visible + ~200 buffer
// each side => a few hundred at most, never close to 1000. Guard generously.
const WINDOW_CEILING = ITEM_COUNT / 2
if (labelsAtTop.size >= WINDOW_CEILING) {
  throw new Error(
    `virtualization failed: ${labelsAtTop.size} rows committed (expected far fewer than ${ITEM_COUNT})`,
  )
}

// The window must start at the top: row-0 present, a deep row absent.
if (!labelsAtTop.has('row-0')) {
  throw new Error('row-0 should be in the initial window but was not committed')
}
const DEEP_ROW = 'row-900'
if (labelsAtTop.has(DEEP_ROW)) {
  throw new Error(`${DEEP_ROW} should NOT be committed before scrolling — render-all, not windowed`)
}

// Header / footer / separator render.
if (!hasText('HEADER')) throw new Error('ListHeaderComponent did not render')
if (!hasText('FOOTER')) throw new Error('ListFooterComponent did not render')

// keyExtractor: the row cell key flows into the committed node key path. We
// proxied identity via the row text already; assert the cell text is the
// keyExtractor-tagged content we rendered (row-N), proving items round-tripped.
if (!labelsAtTop.has('row-1')) throw new Error('keyExtractor/renderItem round-trip missing row-1')

// ---- assertion 2: the window SHIFTS when scrolled -----------------------

// Scroll deep into the list. offset = 900 rows * 40px = 36000. Re-commit via the
// onScroll direct event; the window should now be centered near row-900.
const DEEP_OFFSET = 900 * ITEM_HEIGHT
scrollTo(scrollView.instanceHandle, DEEP_OFFSET)

const labelsAfterScroll = collectRowLabels()
if (labelsAfterScroll.size >= WINDOW_CEILING) {
  throw new Error(
    `window did not stay bounded after scroll: ${labelsAfterScroll.size} rows committed`,
  )
}
// The deep row is now resident...
if (!labelsAfterScroll.has(DEEP_ROW)) {
  throw new Error(`${DEEP_ROW} should be in the window after scrolling to offset ${DEEP_OFFSET}`)
}
// ...and the early rows have fallen out of the window (real shift, not append).
if (labelsAfterScroll.has('row-0')) {
  throw new Error('row-0 should have left the window after a deep scroll — window did not shift')
}

// ---- assertion 3: onEndReached gates on the last cell being rendered -----

// Scroll to a genuinely mid-list offset where the window's trailing buffer does
// NOT yet reach the last row. With the true last cell (row-999) out of the
// window, onEndReached must NOT fire — this is exactly the misfire the old
// count-based gating allowed once the estimated total drifted low.
const MID_OFFSET = 400 * ITEM_HEIGHT
scrollTo(scrollView.instanceHandle, MID_OFFSET)
const labelsAtMid = collectRowLabels()
if (labelsAtMid.has('row-999')) {
  throw new Error('precondition: last row should NOT be resident at the mid offset')
}
if (endReachedCount() !== 0) {
  throw new Error(
    `onEndReached fired ${endReachedDistances.length} time(s) before the last cell was rendered`,
  )
}

// Now scroll all the way to the bottom: row-999 enters the window and distance
// from end collapses to ~0, so onEndReached fires exactly once.
const BOTTOM_OFFSET = CONTENT_HEIGHT - VIEWPORT_HEIGHT
scrollTo(scrollView.instanceHandle, BOTTOM_OFFSET)

if (!collectRowLabels().has('row-999')) {
  throw new Error('row-999 should be resident after scrolling to the bottom')
}
if (endReachedCount() !== 1) {
  throw new Error(
    `onEndReached should fire exactly once at the bottom, fired ${endReachedDistances.length} time(s)`,
  )
}

// A redundant scroll at the same bottom (same content length, last cell still
// rendered) must NOT double-fire — RN dedups by content length.
scrollTo(scrollView.instanceHandle, BOTTOM_OFFSET)
if (endReachedCount() !== 1) {
  throw new Error(
    `onEndReached double-fired for the same content length: ${endReachedDistances.length} calls`,
  )
}

// ---- assertion 4: the imperative handle exposes the new RN methods -------

const handle = listRef.current
if (handle === null) throw new Error('FlatList ref did not attach a handle')
const requiredMethods: ReadonlyArray<keyof FlatListHandle> = [
  'flashScrollIndicators',
  'getNativeScrollRef',
  'getScrollableNode',
  'getScrollResponder',
  'recordInteraction',
]
for (const method of requiredMethods) {
  if (typeof handle[method] !== 'function') {
    throw new Error(`FlatList handle is missing ${method} (got ${typeof handle[method]})`)
  }
}
// getNativeScrollRef hands back the inner ScrollView handle (its own flash method),
// not a fabricated native tag.
const nativeRef = handle.getNativeScrollRef()
if (nativeRef === null || typeof nativeRef.flashScrollIndicators !== 'function') {
  throw new Error('getNativeScrollRef should return the inner ScrollView handle')
}

// ---- assertion 5: scrolling near the top fires onStartReached ------------

// We are currently parked at the bottom (assertion 3), well past the start
// threshold, so onStartReached is re-armed. Record the count, scroll back to the
// very top, and require exactly one more start-edge fire.
const startBeforeReturn = startReachedCount()
scrollTo(scrollView.instanceHandle, 0)
if (!collectRowLabels().has('row-0')) {
  throw new Error('row-0 should be resident again after scrolling back to the top')
}
if (startReachedCount() !== startBeforeReturn + 1) {
  throw new Error(
    `onStartReached should fire once on return to the top, count went ` +
      `${startBeforeReturn} -> ${startReachedCount()}`,
  )
}
// The reported distance from the start at offset 0 is ~0 (floored).
const lastStartDistance = startReachedDistances[startReachedDistances.length - 1]
if (lastStartDistance !== 0) {
  throw new Error(`distanceFromStart at the top should floor to 0, got ${lastStartDistance}`)
}

// A redundant scroll at the same top (same content length, first cell still
// rendered) must NOT double-fire — same content-length dedup as the end edge.
const startAfterReturn = startReachedCount()
scrollTo(scrollView.instanceHandle, 0)
if (startReachedCount() !== startAfterReturn) {
  throw new Error(
    `onStartReached double-fired for the same content length: ${startReachedCount()} calls`,
  )
}

console.log('flat-list.smoke OK')
