// Headless proof of the ANDROID ScrollView RefreshControl WRAP style routing. On Android a
// ScrollView hosts one child, so a RefreshControl can't be a sibling of the content the way
// iOS allows — it WRAPS the scroll view (AndroidSwipeRefreshLayout is the parent). The bug
// this guards: the user `style` used to land WHOLE on the wrapper with a hardcoded flex:1
// inside, so visual props (backgroundColor/padding) painted the non-scrolling wrapper and an
// explicit height was overridden. RN splits the style (splitLayoutProps): LAYOUT → wrapper,
// VISUAL → inner scroll view. We assert that split.
//
// The base re-export (`@symbiote/react` / scroll-view) resolves to the iOS build under tsx, so
// to test the Android wrap we import scroll-view.android directly. RefreshControl is a single
// platform-agnostic file, imported from source.

import { type ReactElement } from 'react'
import { View, mount } from '@symbiote/react'
import { ScrollView } from '../../adapters/react/src/scroll-view.android'
import { RefreshControl } from '../../adapters/react/src/refresh-control'

// ---- fake Fabric slot ---------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

let committed: FakeNode[] = []
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
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- the app ------------------------------------------------------------
// A VERTICAL ScrollView WITH a refreshControl and a style mixing LAYOUT (height, margin) and
// VISUAL (backgroundColor, padding) props — exactly the split the wrap must route.

function App(): ReactElement {
  return (
    <ScrollView
      style={{ height: 200, backgroundColor: '#123', padding: 8, margin: 4 }}
      refreshControl={<RefreshControl refreshing={false} />}
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

const ROOT_TAG = 21
mount(ROOT_TAG, <App />)

const [appRoot] = committed
if (committed.length !== 1 || appRoot.props.pointerEvents !== 'box-none') {
  throw new Error(`expected one synthetic box-none root, got ${serialize(committed)}`)
}

// The wrap shape: the RefreshControl node WRAPS RCTScrollView, which holds the content.
// HEADLESS LIMITATION: the intrinsic->native-name table resolves to the iOS build under tsx
// (`@symbiote/react` is iOS-resolved), so the RefreshControl node serializes as the iOS native
// name 'PullToRefreshView' rather than Android's 'AndroidSwipeRefreshLayout'. The Android wrap
// LOGIC under test (scroll-view.android, imported directly) is identical regardless of that
// name; the style-split assertions below key off node ROLE, not native name, so the limitation
// doesn't weaken them.
const shape = serialize(appRoot.children)
const expectedTail = '(RCTScrollView(RCTScrollContentView(RCTView)))'
if (!shape.endsWith(expectedTail)) {
  throw new Error(`android refresh wrap shape wrong: ${shape}`)
}

// The wrapper is the parent of the inner RCTScrollView (the RefreshControl node) — found
// structurally so the assertions don't depend on the iOS-vs-Android native name.
const inner = allCreated.find((node) => node.viewName === 'RCTScrollView')
if (!inner) throw new Error('no inner RCTScrollView was created')
const wrapper = allCreated.find((node) => node.children.some((kid) => kid === inner))
if (!wrapper) throw new Error('no RefreshControl wrapper node wraps the inner RCTScrollView')

// --- LAYOUT props go on the OUTER wrapper, NOT on the inner scroll view ---
// `margin` is a pure-layout key (splitLayoutProps): it drives the wrapper's frame, so it must
// land on the wrapper and must NOT leak onto the inner scroll view.
if (wrapper.props.margin !== 4) {
  throw new Error(`wrapper must carry layout margin:4, got ${JSON.stringify(wrapper.props)}`)
}
if ('margin' in inner.props) {
  throw new Error(`inner scroll view leaked layout margin onto visual side, got ${JSON.stringify(inner.props)}`)
}
// `height` is layout too — it sizes the laid-out box (the wrapper), so it belongs on the wrapper.
if (wrapper.props.height !== 200) {
  throw new Error(`wrapper must carry layout height:200, got ${JSON.stringify(wrapper.props)}`)
}

// --- VISUAL props go on the INNER scroll view, NOT on the wrapper ---
// backgroundColor and padding paint the scrolling content; they must land on the inner scroll
// view (the old crutch dumped them on the non-scrolling wrapper).
if (inner.props.backgroundColor !== '#123') {
  throw new Error(`inner scroll view must carry visual backgroundColor:'#123', got ${JSON.stringify(inner.props)}`)
}
if (inner.props.padding !== 8) {
  throw new Error(`inner scroll view must carry visual padding:8, got ${JSON.stringify(inner.props)}`)
}
if ('backgroundColor' in wrapper.props) {
  throw new Error(`wrapper leaked visual backgroundColor, got ${JSON.stringify(wrapper.props)}`)
}
if ('padding' in wrapper.props) {
  throw new Error(`wrapper leaked visual padding, got ${JSON.stringify(wrapper.props)}`)
}

// --- the inner scroll view must NOT carry a hardcoded flex:1 ---
// The old INNER_FILL_STYLE forced flex:1 on the inner view, overriding explicit sizing. With
// height now correctly routed to the wrapper, the inner side has no flex:1 at all.
if ('flex' in inner.props) {
  throw new Error(`inner scroll view must not carry hardcoded flex, got ${JSON.stringify(inner.props)}`)
}

// --- the inner scroll view keeps its vertical base (the clip) ---
// splitLayoutProps must not strip the base style the wrap composes under the visual props.
if (inner.props.overflow !== 'scroll') {
  throw new Error(`inner scroll view lost base overflow:'scroll', got ${JSON.stringify(inner.props)}`)
}
if (inner.props.flexDirection !== 'column') {
  throw new Error(`inner scroll view lost baseVertical flexDirection:'column', got ${JSON.stringify(inner.props)}`)
}
// nestedScrollEnabled is the wrap's gesture wiring — the inner handles the scroll before the
// refresh parent. Preserved through the style-split refactor.
if (inner.props.nestedScrollEnabled !== true) {
  throw new Error(`inner scroll view lost nestedScrollEnabled, got ${JSON.stringify(inner.props)}`)
}

console.log('scroll-view-android-refresh.smoke OK')
