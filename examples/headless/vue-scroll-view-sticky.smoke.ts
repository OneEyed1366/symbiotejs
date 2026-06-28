// Headless parity proof of the Vue ScrollView sticky-header layer (Phase 3, ADR 0024) over the same
// fake Fabric slot the other smokes use, so the shared @symbiote/components sticky math
// (computeStickyInterpolation, nextStickyHeaderY) is exercised through Vue's reactive lifecycle. It
// mirrors scroll-view-content-size-sticky.smoke.tsx's sticky cases (Group B): the flagged child is
// wrapped in a non-collapsable Animated.View carrying a translateY transform (B6-B8), the non-sticky
// child stays a plain unwrapped content child (B9), sticky sets a numeric scrollEventThrottle on the
// outer scroll node (B10), [0,2] yields two wrappers with the last header's nextHeaderLayoutY
// undefined pre-layout (B11), and the cross-talk feeds the earlier header the later header's y while
// the last stays undefined (B12, proven with a spy StickyHeaderComponent override, the Vue twin of
// React's SpyStickyHeader). Props/structure are read off the COMMITTED tree.

import { defineComponent, h, isVNode, type VNode } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { ScrollView, Text, View } from '../../adapters/vue/src/index'
import { ScrollViewStickyHeader } from '../../adapters/vue/src/scroll-view/sticky-header'

// ---- fake Fabric slot (committed-tree + events) -------------------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

type IEventHandler = (instanceHandle: unknown, topLevelType: string, nativeEvent: Record<string, unknown>) => void

let committed: IFakeNode[] = []
let allCreated: IFakeNode[] = []
let eventHandler: IEventHandler | undefined

const slot = {
  createNode(tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>, instanceHandle: unknown): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNode: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [...node.children] }),
  cloneNodeWithNewProps(node: IFakeNode, newProps: Record<string, unknown>): IFakeNode {
    const clone: IFakeNode = { ...node, props: newProps }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps(node: IFakeNode, newProps: Record<string, unknown>): IFakeNode {
    const clone: IFakeNode = { ...node, props: newProps, children: [] }
    allCreated.push(clone)
    return clone
  },
  createChildSet: (): IFakeNode[] => [],
  appendChild(parent: IFakeNode, child: IFakeNode): void {
    parent.children.push(child)
  },
  appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
    childSet.push(child)
  },
  completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
    committed = childSet
  },
  registerEventHandler(handler: IEventHandler): void {
    eventHandler = handler
  },
  dispatchCommand(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ------------------------------------------------------------

let failures = 0
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
function reset(): void {
  committed = []
  allCreated = []
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
// The engine wraps every commit in one synthetic box-none root (RN's AppContainer); unwrap to the
// app's real root node, here the RCTScrollView.
function appRootChild(): IFakeNode {
  check('A1 one synthetic box-none root', committed.length === 1 && committed[0]?.props.pointerEvents === 'box-none')
  return committed[0].children[0]
}
function fire(node: IFakeNode, type: string, nativeEvent: Record<string, unknown>): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(node.instanceHandle, type, nativeEvent)
}
function isStickyWrapper(node: IFakeNode): boolean {
  return Array.isArray(node.props.transform) && node.props.collapsable === false
}
function subtreeContains(node: IFakeNode, predicate: (n: IFakeNode) => boolean): boolean {
  if (predicate(node)) return true
  return node.children.some((child) => subtreeContains(child, predicate))
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// ---- Mount 1: [0,2] over [Text, View, Text], wrap structure (B6-B11) ----

reset()
mount(
  60,
  defineComponent({
    setup() {
      return () =>
        h(ScrollView, { stickyHeaderIndices: [0, 2] }, () => [h(Text), h(View), h(Text)])
    },
  }),
)
await tick()

{
  const scroll = appRootChild()
  const content = scroll.children[0]
  const wrappers = content.children.filter(isStickyWrapper)

  // B6: the flagged Text (index 0) is wrapped; it must NOT be a direct content child, it sits one
  // level deeper inside the sticky wrapper.
  const isText = (node: IFakeNode): boolean => node.viewName === 'RCTText' || node.viewName === 'RCTParagraph'
  const textDirectlyUnderContent = content.children.some(isText)
  check('B6 flagged Text is wrapped (not a direct content child)', !textDirectlyUnderContent && subtreeContains(content, isText))

  // B7: the wrapper keeps collapsable===false (a real Yoga node, not view-flattened).
  check('B7 sticky wrapper is non-collapsable', wrappers.length > 0 && wrappers.every((w) => w.props.collapsable === false))

  // B8: the wrapper carries a transform with a translateY entry (the sticky pin).
  const hasTranslateY = (node: IFakeNode): boolean =>
    Array.isArray(node.props.transform) && node.props.transform.some((entry) => isRecord(entry) && 'translateY' in entry)
  check('B8 sticky wrapper carries a translateY transform', wrappers.length > 0 && wrappers.every(hasTranslateY))

  // B9: the non-sticky View (index 1) stays an unwrapped direct content child, a plain RCTView with
  // no sticky transform.
  const plainView = content.children.find((child) => !isStickyWrapper(child) && child.viewName === 'RCTView')
  check('B9 non-sticky View stays an unwrapped direct child', plainView !== undefined)

  // B10: sticky sets a numeric scrollEventThrottle on the outer scroll node (JS path -> 16 headless).
  check('B10 sticky sets a numeric scrollEventThrottle on the scroll node', typeof scroll.props.scrollEventThrottle === 'number')

  // B11: [0,2] yields exactly two wrappers.
  check('B11 two wrappers for stickyHeaderIndices [0,2]', wrappers.length === 2)
}

// ---- Mount 2: cross-talk with a spy StickyHeaderComponent (B11-pre, B12) --
// The spy records the nextHeaderLayoutY each header is handed (keyed by the wrapped child's testID),
// then delegates to the real ScrollViewStickyHeader so the genuine onLayout recorder still reports
// each header's own y up to the parent. Mirrors React's SpyStickyHeader.

reset()
const nextYByHeader = new Map<string, number | undefined>()

function childLabel(slotChildren: VNode[]): string {
  const first = slotChildren[0]
  if (!isVNode(first) || !isRecord(first.props)) return ''
  return typeof first.props.testID === 'string' ? first.props.testID : ''
}

const SpyStickyHeader = defineComponent({
  name: 'SpyStickyHeader',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => {
      const slotChildren = slots.default !== undefined ? slots.default() : []
      const nextY = typeof attrs.nextHeaderLayoutY === 'number' ? attrs.nextHeaderLayoutY : undefined
      nextYByHeader.set(childLabel(slotChildren), nextY)
      return h(ScrollViewStickyHeader, attrs, { default: () => slotChildren })
    }
  },
})

mount(
  61,
  defineComponent({
    setup() {
      return () =>
        h(
          ScrollView,
          { stickyHeaderIndices: [0, 2], StickyHeaderComponent: SpyStickyHeader },
          () => [h(Text, { testID: 'H0' }), h(View), h(Text, { testID: 'H1' })],
        )
    },
  }),
)
await tick()

// B11-pre: before any layout, the earlier header knows no next-header y.
check('B11-pre H0 nextHeaderLayoutY undefined before layout', nextYByHeader.get('H0') === undefined)

{
  const scroll = committed[0].children[0]
  const content = scroll.children[0]
  const wrappers = content.children.filter(isStickyWrapper)
  check('B12-pre two spy wrappers in document order', wrappers.length === 2)

  // Measure H1 first (y=100), then H0 (y=0): the recorder must feed H1's y to H0 by index order, not
  // arrival order (headerLayoutYs is keyed by child index, not by which fires first).
  fire(wrappers[1], 'topLayout', { layout: { x: 0, y: 100, width: 320, height: 40 } })
  fire(wrappers[0], 'topLayout', { layout: { x: 0, y: 0, width: 320, height: 40 } })
  await tick()

  // B12: H0 (earlier) learns H1's y (100) as its push-off collision point; H1 (last) stays undefined.
  check('B12 H0 receives H1 y (100) as nextHeaderLayoutY', nextYByHeader.get('H0') === 100)
  check('B12 last header (H1) keeps nextHeaderLayoutY undefined', nextYByHeader.get('H1') === undefined)
}

console.log(failures === 0 ? '\nvue-scroll-view-sticky.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
