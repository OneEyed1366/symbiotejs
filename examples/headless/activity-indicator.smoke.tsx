// Headless proof of the ActivityIndicator primitive. A fake nativeFabricUIManager
// records the committed tree so we can assert the RCTView > ActivityIndicatorView
// wrapper shape, the animating/color/hidesWhenStopped passthrough, the
// size translation — string sizes map to the native enum + fixed box, a numeric
// size sizes via style and emits no native `size` — plus the standard ViewProps
// (testID/accessibilityLabel/accessible) landing on the wrapper and onLayout
// routing as a real `topLayout` event — all with no simulator.

import { type ReactElement } from 'react'
import { mount } from '@symbiote/react'
// ActivityIndicator isn't on the barrel yet (the parent wires exports), so reach
// the source directly — the headless harness has no built dist.
import { ActivityIndicator } from '../../packages/react/src/activity-indicator'

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

function findSpinner(): FakeNode {
  const node = allCreated.find((n) => n.viewName === 'ActivityIndicatorView')
  if (!node) throw new Error('no ActivityIndicatorView was created')
  return node
}

function findWrapper(): FakeNode {
  // Skip the synthetic AppContainer root (RCTView, box-none); the centering wrapper
  // is ActivityIndicator's own RCTView.
  const node = allCreated.find(
    (n) => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
  )
  if (!node) throw new Error('no RCTView wrapper was created')
  return node
}

// ---- case 1: default + string size -------------------------------------

function StringSizeApp(): ReactElement {
  return <ActivityIndicator size="large" color="#0000ff" animating={false} />
}

const ROOT_TAG = 21
mount(ROOT_TAG, <StringSizeApp />)

// Every commit is now wrapped in RN's AppContainer equivalent: one synthetic RCTView
// root (flex:1 + pointerEvents box-none). Unwrap it before asserting the app's shape.
const [appRoot] = committed
if (committed.length !== 1 || appRoot.props.pointerEvents !== 'box-none') {
  throw new Error(`expected one synthetic box-none root, got ${serialize(committed)}`)
}
const shape = serialize(appRoot.children)
if (shape !== 'RCTView(ActivityIndicatorView)') {
  throw new Error(`committed tree wrong: ${shape}`)
}

const spinner = findSpinner()
if (spinner.props.animating !== false) {
  throw new Error(`animating did not pass through: ${JSON.stringify(spinner.props)}`)
}
if (spinner.props.color !== '#0000ff') {
  throw new Error(`color did not pass through: ${JSON.stringify(spinner.props)}`)
}
if (spinner.props.hidesWhenStopped !== true) {
  throw new Error(`hidesWhenStopped should default true: ${JSON.stringify(spinner.props)}`)
}
if (spinner.props.size !== 'large') {
  throw new Error(`string size should map to native enum 'large': ${JSON.stringify(spinner.props)}`)
}
// shared flattens `style` onto the top-level props payload, so width/height land
// directly on props (no nested `style` object survives).
if (spinner.props.width !== 36 || spinner.props.height !== 36) {
  throw new Error(`'large' should size to 36x36: ${JSON.stringify(spinner.props)}`)
}

const wrapper = allCreated.find(
  (n) => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
)
if (!wrapper) throw new Error('no RCTView wrapper was created')
if (wrapper.props.alignItems !== 'center' || wrapper.props.justifyContent !== 'center') {
  throw new Error(`wrapper should center its child: ${JSON.stringify(wrapper.props)}`)
}

// ---- case 2: numeric size ----------------------------------------------

allCreated.length = 0

function NumericSizeApp(): ReactElement {
  return <ActivityIndicator size={48} />
}

mount(ROOT_TAG, <NumericSizeApp />)

const numericSpinner = findSpinner()
if ('size' in numericSpinner.props) {
  throw new Error(`numeric size must not reach native: ${JSON.stringify(numericSpinner.props)}`)
}
if (numericSpinner.props.width !== 48 || numericSpinner.props.height !== 48) {
  throw new Error(`numeric size should size to 48x48: ${JSON.stringify(numericSpinner.props)}`)
}
if (numericSpinner.props.animating !== true) {
  throw new Error(`animating should default true: ${JSON.stringify(numericSpinner.props)}`)
}
if (numericSpinner.props.color !== '#999999') {
  throw new Error(`color should default to gray: ${JSON.stringify(numericSpinner.props)}`)
}

// ---- case 3: standard ViewProps + onLayout event routing ----------------

allCreated.length = 0

let layoutFired = false

const TEST_ID = 'spinner-wrapper'
const ACCESSIBILITY_LABEL = 'loading'

function PropsApp(): ReactElement {
  return (
    <ActivityIndicator
      testID={TEST_ID}
      accessibilityLabel={ACCESSIBILITY_LABEL}
      accessible={true}
      onLayout={() => {
        layoutFired = true
      }}
    />
  )
}

mount(ROOT_TAG, <PropsApp />)

// testID/accessibilityLabel/accessible land on the centering wrapper View, not
// the spinner (RN spreads `...props` onto its wrapper).
const propsWrapper = findWrapper()
if (propsWrapper.props.testID !== TEST_ID) {
  throw new Error(`testID did not pass through to wrapper: ${JSON.stringify(propsWrapper.props)}`)
}
if (propsWrapper.props.accessibilityLabel !== ACCESSIBILITY_LABEL) {
  throw new Error(
    `accessibilityLabel did not pass through to wrapper: ${JSON.stringify(propsWrapper.props)}`,
  )
}
if (propsWrapper.props.accessible !== true) {
  throw new Error(
    `accessible did not pass through to wrapper: ${JSON.stringify(propsWrapper.props)}`,
  )
}

// onLayout is a BASE event in shared's ViewConfig — firing topLayout on the
// wrapper node must call the handler.
if (!eventHandler) throw new Error('no event handler was registered')
eventHandler(propsWrapper.instanceHandle, 'topLayout', {})
if (!layoutFired) throw new Error('onLayout did not fire on topLayout')

console.log('activity-indicator.smoke OK')
