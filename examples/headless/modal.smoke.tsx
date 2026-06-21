/** @jsxRuntime automatic */
// Headless proof of the Modal primitive over the same fake Fabric slot as the
// other smokes. It asserts the load-bearing facts: a visible modal commits a
// ModalHostView with the children nested under it (NOT a sibling — RCTModalHostView
// is an ordinary host node in the one childSet, no second root); a hidden modal
// commits no modal node at all (the visible gate); the direct events the shared
// engine routes round-trip back to the JS handlers; and the RN-faithful style and
// lifecycle behavior — backdrop-wins style precedence, the transparent-aware
// presentationStyle default, backdropColor, the position:absolute host style, and
// onDismiss firing on the visible->hidden transition. No simulator — a failure
// here is in JS, not native.

import { useState, type ReactElement } from 'react'
import { View, mount } from '@symbiote/react'
// Modal isn't on the barrel yet (the parent wires exports), so reach the source
// directly — the headless harness has no built dist.
import { Modal } from '../../packages/react/src/modal'

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

// ---- helpers ------------------------------------------------------------

function serialize(nodes: FakeNode[]): string {
  return nodes.map(serializeNode).join('')
}
function serializeNode(node: FakeNode): string {
  const kids = node.children.length ? `(${node.children.map(serializeNode).join('')})` : ''
  return `${node.viewName}${kids}`
}

// The event handler is registered once for the whole slot, so reset() keeps it —
// only the per-mount node bookkeeping is cleared.
function reset(): void {
  committed = []
  allCreated.length = 0
}

function modalNode(): FakeNode {
  const node = allCreated.find((n) => n.viewName === 'ModalHostView')
  if (!node) throw new Error('no ModalHostView was created')
  return node
}

// The container View RN wraps children in is the one View directly under the host.
function containerNode(): FakeNode {
  const child = modalNode().children[0]
  if (!child) throw new Error('ModalHostView has no container child')
  return child
}

// The shared commit hoists flattened style keys to the top level of the node
// props (commit.ts fabricProps: the `style` key is dropped, its entries spread
// onto the node), so style assertions read node.props directly.
function styleOf(node: FakeNode): Record<string, unknown> {
  return node.props
}

// ---- case 1: a visible modal commits ModalHostView(RCTView(RCTView)) -----
// The child View we pass nests UNDER the container View, which nests under the
// host — proving it's one childSet, not a separate rooting.

mount(20, (
  <Modal visible>
    <View />
  </Modal>
))

// committed[0] is the synthetic AppContainer root (RCTView, box-none) wrapping every
// commit; assert the modal subtree beneath it.
const shape = serialize(committed[0]?.children ?? [])
if (shape !== 'ModalHostView(RCTView(RCTView))') {
  throw new Error(`visible modal committed wrong tree: ${shape}`)
}

const host = modalNode()
if (host.props.visible !== true) {
  throw new Error(`ModalHostView missing visible:true, got ${JSON.stringify(host.props)}`)
}
if (host.props.animationType !== 'none') {
  throw new Error(`ModalHostView missing default animationType 'none', got ${JSON.stringify(host.props)}`)
}
if (host.children.length !== 1) {
  throw new Error(`ModalHostView should hold exactly one container child, got ${host.children.length}`)
}
// RN sets styles.modal (position:'absolute') on RCTModalHostView itself.
if (styleOf(host).position !== 'absolute') {
  throw new Error(`ModalHostView missing position:'absolute' host style, got ${JSON.stringify(host.props.style)}`)
}
// Default (opaque, non-transparent) presentationStyle is 'fullScreen'.
if (host.props.presentationStyle !== 'fullScreen') {
  throw new Error(`opaque modal should default presentationStyle 'fullScreen', got ${JSON.stringify(host.props.presentationStyle)}`)
}
// An opaque modal's container backdrop stays the default white.
if (styleOf(containerNode()).backgroundColor !== 'white') {
  throw new Error(`opaque modal container should default backgroundColor 'white', got ${JSON.stringify(styleOf(containerNode()).backgroundColor)}`)
}

// ---- case 2: visible={false} commits no modal node ----------------------

reset()
mount(21, (
  <Modal visible={false}>
    <View />
  </Modal>
))

// The synthetic AppContainer root always commits; a hidden modal must leave it empty.
if (committed[0]?.children.length !== 0) {
  throw new Error(`hidden modal still committed nodes: ${serialize(committed)}`)
}
if (allCreated.some((n) => n.viewName === 'ModalHostView')) {
  throw new Error('hidden modal created a ModalHostView node')
}

// ---- case 3: topRequestClose -> onRequestClose --------------------------

reset()
let closed = false
mount(22, (
  <Modal visible onRequestClose={() => { closed = true }}>
    <View />
  </Modal>
))

if (!eventHandler) throw new Error('no event handler was registered')
eventHandler(modalNode().instanceHandle, 'topRequestClose', {})
if (!closed) throw new Error('onRequestClose did not fire on topRequestClose')

// ---- case 4: topShow -> onShow ------------------------------------------

reset()
let shown = false
mount(23, (
  <Modal visible onShow={() => { shown = true }}>
    <View />
  </Modal>
))

eventHandler(modalNode().instanceHandle, 'topShow', {})
if (!shown) throw new Error('onShow did not fire on topShow')

// ---- case 5: the backdrop/transparent override wins over a user style ----
// RN composes [styles.container, props.style, containerStyles]: the transparent
// override is LAST, so a user backgroundColor cannot beat it.

reset()
mount(24, (
  <Modal visible transparent style={{ backgroundColor: 'red' }}>
    <View />
  </Modal>
))

{
  const backdrop = styleOf(containerNode()).backgroundColor
  if (backdrop !== 'transparent') {
    throw new Error(`transparent backdrop must win over user style, got ${JSON.stringify(backdrop)}`)
  }
  // transparent also flips the presentationStyle default to 'overFullScreen'.
  if (modalNode().props.presentationStyle !== 'overFullScreen') {
    throw new Error(`transparent modal should default presentationStyle 'overFullScreen', got ${JSON.stringify(modalNode().props.presentationStyle)}`)
  }
}

// ---- case 6: backdropColor sets the container background (non-transparent) ---

reset()
mount(25, (
  <Modal visible backdropColor="rebeccapurple">
    <View />
  </Modal>
))

{
  const backdrop = styleOf(containerNode()).backgroundColor
  if (backdrop !== 'rebeccapurple') {
    throw new Error(`backdropColor should set container background, got ${JSON.stringify(backdrop)}`)
  }
}

// ---- case 7: ViewProps/a11y passthrough reaches the host node ------------

reset()
mount(26, (
  <Modal visible testID="my-modal" accessible accessibilityLabel="a dialog">
    <View />
  </Modal>
))

{
  const props = modalNode().props
  if (props.testID !== 'my-modal') {
    throw new Error(`testID should pass through to the host, got ${JSON.stringify(props.testID)}`)
  }
  if (props.accessible !== true) {
    throw new Error(`accessible should pass through to the host, got ${JSON.stringify(props.accessible)}`)
  }
  if (props.accessibilityLabel !== 'a dialog') {
    throw new Error(`accessibilityLabel should pass through to the host, got ${JSON.stringify(props.accessibilityLabel)}`)
  }
}

// ---- case 8: onDismiss fires on the visible->hidden transition -----------
// RN keeps the modal mounted through its exit animation and fires onDismiss as
// isRendered flips false. Here the realistic flow: a native onRequestClose makes
// the parent set visible=false, and onDismiss is delivered on that transition.

reset()
let dismissed = false

function DismissCase(): ReactElement {
  const [visible, setVisible] = useState(true)
  return (
    <Modal
      visible={visible}
      onRequestClose={() => setVisible(false)}
      onDismiss={() => { dismissed = true }}
    >
      <View />
    </Modal>
  )
}

mount(27, <DismissCase />)

if (dismissed) {
  throw new Error('onDismiss fired before the modal was hidden')
}
// Drive the native dismissal: topRequestClose on the host -> parent sets
// visible=false -> the visible->hidden transition delivers onDismiss.
eventHandler(modalNode().instanceHandle, 'topRequestClose', {})

if (!dismissed) {
  throw new Error('onDismiss did not fire on the visible->hidden transition')
}

console.log('modal.smoke OK')
