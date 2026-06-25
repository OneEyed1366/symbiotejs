// Headless proof of the JS-driven Animated engine (ADR 0016) end-to-end through
// shared's clone-on-write commit: an AnimatedValue feeds an interpolation, whose
// leaf flushes each frame via setNativeProps — a single scoped completeRoot that
// re-clones only the animated node. No drivers yet (that is Phase 2): we drive the
// value by hand with setValue and assert the interpolated prop lands on the
// committed view. No simulator.

import {
  AnimatedNode,
  AnimatedValue,
  createElement,
  createSurface,
  getNativeTag,
  setNativeProps,
  setProp,
  type AnimatedInterpolation,
  type SymbioteNode,
} from '@symbiote/engine'

// ---- fake Fabric slot ----------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

let committed: FakeNode[] = []
let completeRootCalls = 0
let nextTag = 100

const slot = {
  createNode(
    _tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    return { tag: nextTag++, viewName, props, children: [], instanceHandle }
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
    completeRootCalls += 1
  },
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// The view we animate, and the leaf that pushes a frame's value onto it. In the
// adapter this leaf is AnimatedProps wired to the host instance; here it is the
// minimal shape — pull the source value, setNativeProps the target.
class PropLeaf extends AnimatedNode {
  constructor(
    private readonly source: AnimatedInterpolation,
    private readonly target: SymbioteNode,
    private readonly key: string,
  ) {
    super()
  }
  update(): void {
    setNativeProps(this.target, { [this.key]: this.source.__getValue() })
  }
}

function appView(): FakeNode {
  // The synthetic AppContainer root wraps the surface; the app's view is its child.
  if (committed.length !== 1 || committed[0].props.pointerEvents !== 'box-none') {
    throw new Error(`expected one synthetic box-none root, got ${JSON.stringify(committed)}`)
  }
  return committed[0].children[0]
}

// ---- build a committed tree ---------------------------------------------

const ROOT_TAG = 41
const surface = createSurface(ROOT_TAG)

const value = new AnimatedValue(0)
// Non-identity mapping so the assertion proves interpolation, not passthrough.
const width = value.interpolate({ inputRange: [0, 1], outputRange: [0, 100] })

const view = createElement('RCTView')
setProp(view, 'width', width.__getValue()) // initial frame: 0
surface.appendChild(view)
surface.commit()

if (appView().viewName !== 'RCTView') {
  throw new Error(`expected the app view under the root, got ${appView().viewName}`)
}
if (appView().props.width !== 0) {
  throw new Error(`initial width should be 0, got ${JSON.stringify(appView().props)}`)
}
if (getNativeTag(view) === undefined) {
  throw new Error('committed node must expose a native tag for the native driver')
}

// Wire the leaf into the graph: adding it to the interpolation attaches the
// interpolation to the value, so a setValue flushes value -> width -> leaf.
const leaf = new PropLeaf(width, view, 'width')
width.__addChild(leaf)

// ---- drive by hand and assert the scoped commit -------------------------

const commitsBefore = completeRootCalls
value.setValue(0.5)
if (appView().props.width !== 50) {
  throw new Error(`0.5 should interpolate to width 50, got ${JSON.stringify(appView().props)}`)
}
if (completeRootCalls !== commitsBefore + 1) {
  throw new Error(`a frame must be exactly one completeRoot, got ${completeRootCalls - commitsBefore}`)
}

value.setValue(1)
if (appView().props.width !== 100) {
  throw new Error(`1 should interpolate to width 100, got ${JSON.stringify(appView().props)}`)
}

// A value drives its listeners too (the bottom-up observe path).
let observed = -1
value.addListener(({ value: v }) => {
  observed = v
})
value.setValue(0.25)
if (observed !== 0.25) {
  throw new Error(`listener should observe the raw value 0.25, got ${observed}`)
}
if (appView().props.width !== 25) {
  throw new Error(`0.25 should interpolate to width 25, got ${JSON.stringify(appView().props)}`)
}

console.log('after setValue(0.25): width =', appView().props.width, 'observed =', observed)
console.log('animated-value.smoke OK')
