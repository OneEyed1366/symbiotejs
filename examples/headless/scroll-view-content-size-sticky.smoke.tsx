// Headless proof of two ScrollView gaps closed in JS (no native support needed):
//   1. onContentSizeChange — synthesized from an onLayout on the inner content node
//      (RN ScrollView.js _handleContentOnLayout). Fires (width, height) only when the
//      size actually changed (dedupe), composing with any content onLayout.
//   2. stickyHeaderIndices — RN implements stickiness PURELY IN JS by wrapping each
//      flagged child in a sticky-header component fed by the scroll offset; the native
//      scroll view ignores the index array. We assert the flagged child is wrapped.
// A fake nativeFabricUIManager records the committed tree and the global event handler,
// so we can fire a synthetic topLayout at the content node and observe the JS round-trip.

import { createElement, type ReactElement } from 'react'
import { View, Text, mount } from '@symbiote/react'
import { ScrollView } from '../../adapters/react/src/scroll-view'
import {
  ScrollViewStickyHeader,
  type StickyHeaderProps,
} from '../../adapters/react/src/scroll-view-sticky-header'

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

const contentSizes: Array<[number, number]> = []

function App(): ReactElement {
  return (
    <ScrollView
      onContentSizeChange={(width, height) => {
        contentSizes.push([width, height])
      }}
      stickyHeaderIndices={[0]}
    >
      <Text>Sticky header</Text>
      <View />
    </ScrollView>
  )
}

// ---- helpers ------------------------------------------------------------

function serializeNode(node: FakeNode): string {
  const kids = node.children.length ? `(${node.children.map(serializeNode).join('')})` : ''
  return `${node.viewName}${kids}`
}

// ---- run ----------------------------------------------------------------

const ROOT_TAG = 31
mount(ROOT_TAG, <App />)

const [appRoot] = committed
if (committed.length !== 1 || appRoot.props.pointerEvents !== 'box-none') {
  throw new Error(`expected one synthetic box-none root, got ${committed.map(serializeNode).join('')}`)
}

// ---- Gap 1: onContentSizeChange wired on the content node ----------------
// The synthesizer puts an onLayout on the content node, so Fabric raises the onLayout flag.
const content = allCreated.find((node) => node.viewName === 'RCTScrollContentView')
if (!content) throw new Error('no RCTScrollContentView was created')
if (content.props.onLayout !== true) {
  throw new Error(`content node must raise onLayout flag for onContentSizeChange, got ${JSON.stringify(content.props)}`)
}

// Fire a layout at the content node and assert onContentSizeChange(width, height) fires.
if (!eventHandler) throw new Error('no event handler was registered')
eventHandler(content.instanceHandle, 'topLayout', { layout: { x: 0, y: 0, width: 320, height: 800 } })
if (contentSizes.length !== 1) {
  throw new Error(`onContentSizeChange should fire once, fired ${contentSizes.length} times`)
}
if (contentSizes[0][0] !== 320 || contentSizes[0][1] !== 800) {
  throw new Error(`onContentSizeChange got wrong size: ${JSON.stringify(contentSizes[0])}`)
}

// Same size again -> deduped, no second call (RN's behavior).
eventHandler(content.instanceHandle, 'topLayout', { layout: { x: 0, y: 0, width: 320, height: 800 } })
if (contentSizes.length !== 1) {
  throw new Error(`onContentSizeChange must dedupe identical size, fired ${contentSizes.length} times`)
}

// Size changed -> fires again.
eventHandler(content.instanceHandle, 'topLayout', { layout: { x: 0, y: 0, width: 320, height: 1200 } })
if (contentSizes.length !== 2 || contentSizes[1][1] !== 1200) {
  throw new Error(`onContentSizeChange must re-fire on real change, got ${JSON.stringify(contentSizes)}`)
}

// ---- Gap 2: sticky header wraps the flagged child ------------------------
// RN wraps the flagged child (index 0) in a sticky-header Animated.View; the native scroll
// view never honors stickyHeaderIndices on its own. So the content's FIRST child must be an
// extra wrapper view holding the Text, while the second child (the plain View) is unwrapped.
const text = allCreated.find((node) => node.viewName === 'RCTText' || node.viewName === 'RCTParagraph')
if (!text) throw new Error(`no Text node was created, tree: ${serializeNode(content)}`)

// The Text must NOT be a direct child of the content node — it must sit one level deeper,
// inside the sticky wrapper view.
const directlyUnderContent = content.children.includes(text)
if (directlyUnderContent) {
  throw new Error(`sticky header child was NOT wrapped — Text is a direct content child: ${serializeNode(content)}`)
}
// The wrapper is the content child whose subtree contains the Text.
const wrapper = content.children.find((child) => subtreeContains(child, text))
if (!wrapper) {
  throw new Error(`no sticky wrapper found around the flagged child: ${serializeNode(content)}`)
}
// The wrapper is a real (non-flattened) view carrying a transform — the sticky translateY.
if (wrapper.props.collapsable !== false) {
  throw new Error(`sticky wrapper must be non-collapsable, got ${JSON.stringify(wrapper.props)}`)
}
const transform = wrapper.props.transform
if (!Array.isArray(transform) || !transform.some((entry) => isRecord(entry) && 'translateY' in entry)) {
  throw new Error(`sticky wrapper must carry a translateY transform, got ${JSON.stringify(wrapper.props.transform)}`)
}

// The second child (the plain View at index 1) is NOT flagged, so it stays unwrapped.
const plainView = content.children.find((child) => child !== wrapper && child.viewName === 'RCTView')
if (!plainView) {
  throw new Error(`non-sticky child should remain a direct unwrapped content child: ${serializeNode(content)}`)
}

// onScroll is wired on the scroll view so the sticky AnimatedValue tracks the offset.
const outer = allCreated.find((node) => node.viewName === 'RCTScrollView')
if (!outer) throw new Error('no RCTScrollView was created')
if (typeof outer.props.scrollEventThrottle !== 'number') {
  throw new Error(`sticky headers should set a scrollEventThrottle, got ${JSON.stringify(outer.props.scrollEventThrottle)}`)
}

function subtreeContains(node: FakeNode, target: FakeNode): boolean {
  if (node === target) return true
  return node.children.some((child) => subtreeContains(child, target))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ---- Gap 3: nextHeaderLayoutY cross-talk between sticky headers ----------
// RN feeds each sticky header the y of the NEXT flagged header (ScrollView.js
// _onStickyHeaderLayout -> previousHeader.setNextHeaderY): that y is the push-off collision
// point. With TWO sticky headers, once both have measured, the EARLIER header must receive
// the LATER header's y as nextHeaderLayoutY, while the LAST header stays undefined (sticks
// forever). We drive each header's onLayout with a fake layout event and read the prop the
// wrapper receives back. A spy StickyHeaderComponent records props per header and delegates
// to the real ScrollViewStickyHeader so the recorder onLayout (which reports y to the parent)
// still runs.

// Latest nextHeaderLayoutY each header was rendered with, keyed by its text content. The spy
// overwrites on every render, so after the layout round-trips this holds the resolved value.
const nextYByHeader = new Map<string, number | undefined>()

function headerText(children: StickyHeaderProps['children']): string {
  // Each header's child is a <Text>label</Text>; pull the label so we can tell H0 from H1.
  if (!isRecord(children)) return ''
  const props = Reflect.get(children, 'props')
  if (!isRecord(props)) return ''
  const inner = Reflect.get(props, 'children')
  return typeof inner === 'string' ? inner : ''
}

// Spy wrapper: records the nextHeaderLayoutY it is handed, then delegates to the real header so
// the genuine onLayout recorder (which reports this header's own y up to the parent) still runs.
function SpyStickyHeader(props: StickyHeaderProps): ReactElement {
  nextYByHeader.set(headerText(props.children), props.nextHeaderLayoutY)
  return createElement(ScrollViewStickyHeader, props)
}

function StickyApp(): ReactElement {
  return (
    <ScrollView stickyHeaderIndices={[0, 2]} StickyHeaderComponent={SpyStickyHeader}>
      <Text>H0</Text>
      <View />
      <Text>H1</Text>
      <View />
    </ScrollView>
  )
}

// Fresh capture for this second mount so wrapper lookup below sees only this tree's nodes.
allCreated.length = 0
mount(33, <StickyApp />)

// Before any layout: neither header knows the next one's y.
if (nextYByHeader.get('H0') !== undefined) {
  throw new Error(`H0 must start with undefined nextHeaderLayoutY, got ${nextYByHeader.get('H0')}`)
}

// The two sticky wrappers are the transform-bearing Animated.View nodes, in document order:
// [0] = H0, [1] = H1. Fire a real topLayout at each via the registered event handler so the
// wrapper's onLayout (the cross-talk recorder) runs through the genuine Fabric event path.
const stickyWrappers = allCreated.filter(
  (node) => Array.isArray(node.props.transform) && node.props.collapsable === false,
)
if (stickyWrappers.length !== 2) {
  throw new Error(`expected 2 sticky wrappers for indices [0,2], got ${stickyWrappers.length}`)
}
if (!eventHandler) throw new Error('no event handler was registered for sticky layout')
// Measure H1 first (y=100), then H0 (y=0): the recorder must feed H1's y to H0 by index order,
// not arrival order (RN keys _headerLayoutYs by child key, not by which fires first).
eventHandler(stickyWrappers[1].instanceHandle, 'topLayout', { layout: { x: 0, y: 100, width: 320, height: 40 } })
eventHandler(stickyWrappers[0].instanceHandle, 'topLayout', { layout: { x: 0, y: 0, width: 320, height: 40 } })

// After the layouts round-trip through state, H0 (earlier) must learn H1's y as its push-off
// collision point, while H1 (last) stays undefined and sticks indefinitely.
if (nextYByHeader.get('H0') !== 100) {
  throw new Error(`H0 must receive H1's y (100) as nextHeaderLayoutY, got ${nextYByHeader.get('H0')}`)
}
if (nextYByHeader.get('H1') !== undefined) {
  throw new Error(`last sticky header (H1) must keep nextHeaderLayoutY undefined, got ${nextYByHeader.get('H1')}`)
}

console.log('scroll-view-content-size-sticky.smoke OK')
