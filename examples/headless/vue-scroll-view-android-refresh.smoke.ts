// Headless parity proof of the Vue ANDROID ScrollView RefreshControl WRAP (ADR 0024 Phase 2), the
// Vue twin of scroll-view-android-refresh.smoke.tsx. On Android a ScrollView hosts one child, so a
// RefreshControl can't be a sibling of the content the way iOS allows, so it WRAPS the scroll view
// (AndroidSwipeRefreshLayout is the parent). Vue has no cloneElement, so the wrap RE-INVOKES the
// user's RefreshControl component type via h(): same type, its own props + the injected outer/layout
// style, and the inner scroll view as the default slot. The bug this guards: the user `style` landing
// WHOLE on the wrapper (so visual props paint the non-scrolling wrapper and an explicit height is
// overridden). splitLayoutProps routes LAYOUT → wrapper, VISUAL → inner. We assert that split.
//
// Import the Android build DIRECTLY (the base re-export resolves to iOS under tsx). HEADLESS
// LIMITATION (per the smoke spec): the intrinsic->native-name table resolves to the iOS build under
// tsx, so the RefreshControl node serializes as iOS 'PullToRefreshView', not 'AndroidSwipeRefreshLayout'.
// Every assertion below therefore keys off node ROLE/STRUCTURE (the node whose child is the inner
// RCTScrollView), NEVER off the native name: the wrap LOGIC is what's under test, not the name.

import { defineComponent, h } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { View } from '../../adapters/vue/src/index'
import { ScrollView } from '../../adapters/vue/src/scroll-view/index.android'
import { RefreshControl } from '../../adapters/vue/src/refresh-control'
import { SafeAreaView } from '../../adapters/vue/src/safe-area-view'

// ---- fake Fabric slot (committed tree) ----------------------------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

let committed: IFakeNode[] = []
let allCreated: IFakeNode[] = []

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
  registerEventHandler(): void {},
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
function serializeNode(node: IFakeNode): string {
  const kids = node.children.length ? `(${node.children.map(serializeNode).join(',')})` : ''
  return `${node.viewName}${kids}`
}
// The engine wraps every commit in one synthetic box-none root (RN's AppContainer); unwrap to the
// app's real root node. Keyed off the box-none marker, not a native name.
function appRootChild(label: string): IFakeNode {
  check(label, committed.length === 1 && committed[0]?.props.pointerEvents === 'box-none')
  return committed[0].children[0]
}
// Find a committed node by native name (used ONLY for RCTScrollView, which is stable across the
// iOS/Android tables, never for the refresh-control node, whose name is the ambiguous one).
function findInCommitted(predicate: (n: IFakeNode) => boolean): IFakeNode | undefined {
  const stack: IFakeNode[] = [...committed]
  while (stack.length) {
    const node = stack.pop()
    if (node === undefined) continue
    if (predicate(node)) return node
    stack.push(...node.children)
  }
  return undefined
}
function findParentOf(target: IFakeNode): IFakeNode | undefined {
  return findInCommitted((n) => n.children.some((kid) => kid === target))
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// ---- C: Android RefreshControl wrap -------------------------------------
// A VERTICAL ScrollView WITH a refreshControl and a style mixing LAYOUT (margin, height) and
// VISUAL (backgroundColor, padding) props: exactly the split the wrap must route.

reset()
mount(
  60,
  defineComponent({
    setup() {
      return () =>
        h(
          ScrollView,
          {
            style: { margin: 4, height: 200, backgroundColor: '#123', padding: 8 },
            refreshControl: h(RefreshControl, { refreshing: true, onRefresh: () => {} }),
          },
          [h(View)],
        )
    },
  }),
)
await tick()

{
  const wrapper = appRootChild('C1 one synthetic box-none root')

  // C2, refresh WRAPS the scroll view: the committed app-root subtree ENDS with the nested
  // scroll-view triple. The wrapper's own (ambiguous) name is the prefix, so we match the tail.
  const expectedTail = '(RCTScrollView(RCTScrollContentView(RCTView)))'
  check('C2 refresh wraps scroll view (subtree ends with the nested triple)', serializeNode(wrapper).endsWith(expectedTail))

  // C3, wrapper is the parent of the inner RCTScrollView (structural find off RCTScrollView, the
  // stable name, never off the refresh-control name).
  const inner = findInCommitted((n) => n.viewName === 'RCTScrollView')
  check('C3 inner RCTScrollView found', inner !== undefined)
  const wrapperOfInner = inner !== undefined ? findParentOf(inner) : undefined
  check('C3b wrapper is the parent of the inner scroll view', wrapperOfInner !== undefined && wrapperOfInner === wrapper)

  if (inner !== undefined) {
    // C4, layout `margin:4` on the wrapper, NOT on the inner.
    check('C4 layout margin:4 on wrapper, not on inner', wrapper.props.margin === 4 && !('margin' in inner.props))
    // C5, layout `height:200` sizes the laid-out box (the wrapper).
    check('C5 layout height:200 on wrapper', wrapper.props.height === 200)
    // C6, visual backgroundColor + padding paint the inner scroll view.
    check('C6 visual backgroundColor:#123 + padding:8 on inner', inner.props.backgroundColor === '#123' && inner.props.padding === 8)
    // C7, visual props do NOT leak onto the non-scrolling wrapper.
    check('C7 visual not on wrapper', !('backgroundColor' in wrapper.props) && !('padding' in wrapper.props))
    // C8, the inner carries NO hardcoded flex (base uses flexGrow/flexShrink, not flex:1).
    check('C8 inner has no hardcoded flex', !('flex' in inner.props))
    // C9, the inner keeps its vertical base (the clip): overflow:scroll + flexDirection:column.
    check('C9 inner keeps base overflow:scroll + flexDirection:column', inner.props.overflow === 'scroll' && inner.props.flexDirection === 'column')
    // C10, the wrap's gesture wiring: the inner handles the scroll before the refresh parent.
    check('C10 inner nestedScrollEnabled === true', inner.props.nestedScrollEnabled === true)
  }

  // Re-invoke seam proof: the wrapper carries the RefreshControl's OWN props (re-invoked with them).
  check('C11 wrapper carries RefreshControl prop refreshing === true', wrapper.props.refreshing === true)
}

// ---- E: SafeAreaView structure ------------------------------------------
// A SafeAreaView hosts the safe-area node with the View as its child (no JS translation).

reset()
mount(
  61,
  defineComponent({
    setup() {
      return () => h(SafeAreaView, {}, [h(View)])
    },
  }),
)
await tick()

{
  const safeArea = appRootChild('E1 one synthetic box-none root')
  // Under the iOS-resolved table the safe-area host serializes as 'SafeAreaView'.
  check('E2 committed node is the safe-area host', safeArea.viewName === 'SafeAreaView')
  check('E3 child is the View (RCTView)', safeArea.children.length === 1 && safeArea.children[0].viewName === 'RCTView')
}

console.log(failures === 0 ? '\nvue-scroll-view-android-refresh.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
