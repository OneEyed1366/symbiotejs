// Headless proof of the Animated NATIVE driver wiring (ADR 0017). A fake
// NativeAnimatedTurboModule (installed on the JSI module proxy) records every call,
// so we assert — with no simulator — that useNativeDriver:true mirrors the value
// graph into native (createAnimatedNode value/style/props), wires it
// (connectAnimatedNodes), binds the props node to the committed view's Fabric tag
// (connectAnimatedNodeToView), hands the curve to native (startAnimatingNode), and
// on the native completion callback syncs the JS value back through one scoped
// commit. Unmount must restore the view's default values.

import { type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { Animated } from '../../packages/react/src/animated'

// ---- fake NativeAnimatedTurboModule (records calls) ----------------------

interface NativeCall {
  method: string
  args: unknown[]
}
const nativeCalls: NativeCall[] = []
let lastStartCallback: ((result: { finished: boolean; value?: number }) => void) | null = null

// Mirror the native invariant that crashed on device: RCTNativeAnimatedNodesManager
// asserts a node exists before connecting it. Reproduce it headlessly so a
// connect-before-create ordering bug fails here instead of as a SIGABRT on iOS.
const createdNodeTags = new Set<number>()

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args })
  }
}

function assertNodeExists(tag: unknown, method: string): void {
  if (typeof tag !== 'number' || !createdNodeTags.has(tag)) {
    throw new Error(`${method} referenced animated node ${String(tag)} before createAnimatedNode`)
  }
}

const fakeNativeAnimated = {
  createAnimatedNode(tag: number, config: unknown): void {
    createdNodeTags.add(tag)
    nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] })
  },
  connectAnimatedNodes(parentTag: number, childTag: number): void {
    assertNodeExists(parentTag, 'connectAnimatedNodes(parent)')
    assertNodeExists(childTag, 'connectAnimatedNodes(child)')
    nativeCalls.push({ method: 'connectAnimatedNodes', args: [parentTag, childTag] })
  },
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView(nodeTag: number, viewTag: number): void {
    assertNodeExists(nodeTag, 'connectAnimatedNodeToView')
    nativeCalls.push({ method: 'connectAnimatedNodeToView', args: [nodeTag, viewTag] })
  },
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode(
    animationId: number,
    nodeTag: number,
    config: Record<string, unknown>,
    endCallback: (result: { finished: boolean; value?: number }) => void,
  ): void {
    nativeCalls.push({ method: 'startAnimatingNode', args: [animationId, nodeTag, config] })
    lastStartCallback = endCallback
  },
  stopAnimation: record('stopAnimation'),
  setAnimatedNodeValue: record('setAnimatedNodeValue'),
  setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
  flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
  extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
  startListeningToAnimatedNodeValue: record('startListeningToAnimatedNodeValue'),
  stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
  getValue: record('getValue'),
  addAnimatedEventToView: record('addAnimatedEventToView'),
  removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
}
Object.assign(globalThis, {
  nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
})

// ---- fake Fabric slot (keeps the real reactTag so view binding is checkable) --

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

let committed: FakeNode[] = []

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

function appView(): FakeNode {
  if (committed.length !== 1 || committed[0].props.pointerEvents !== 'box-none') {
    throw new Error(`expected one synthetic box-none root, got ${JSON.stringify(committed)}`)
  }
  return committed[0].children[0]
}

function callsOf(method: string): NativeCall[] {
  return nativeCalls.filter((call) => call.method === method)
}

// ---- mount an Animated.View and run a native-driven timing ----------------

// A diamond: one value feeds both opacity and a transform, so `style` has two
// animated parents (opacity-interp and the transform node). This is the shape that
// crashed on device — it forces the create-vs-connect ordering the fix guarantees.
const opacity = new Animated.Value(0)
const slide = opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 100] })

function App(): ReactElement {
  return <Animated.View style={{ opacity, transform: [{ translateX: slide }] }} />
}

const ROOT_TAG = 41
mount(ROOT_TAG, <App />)

const viewTag = appView().tag

let finished = false
Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start((result) => {
  finished = result.finished
})

// ---- the graph was mirrored into native ----------------------------------

const created = callsOf('createAnimatedNode')
const createdTypes = created.map((call) => {
  const config = call.args[1]
  return typeof config === 'object' && config !== null && 'type' in config ? config.type : undefined
})
for (const expected of ['value', 'style', 'props']) {
  if (!createdTypes.includes(expected)) {
    throw new Error(`native graph missing a "${expected}" node, got ${JSON.stringify(createdTypes)}`)
  }
}

// value -> style -> props were wired
if (callsOf('connectAnimatedNodes').length < 2) {
  throw new Error(`expected the value->style->props edges, got ${nativeCalls.map((c) => c.method)}`)
}

// the props node was bound to the committed view's real Fabric tag
const connectView = callsOf('connectAnimatedNodeToView')
if (connectView.length !== 1 || connectView[0].args[1] !== viewTag) {
  throw new Error(
    `expected connectAnimatedNodeToView -> view ${viewTag}, got ${JSON.stringify(connectView.map((c) => c.args))}`,
  )
}

// the curve was handed to native against the value node's tag
const start = callsOf('startAnimatingNode')
const valueCreate = created.find((call) => {
  const config = call.args[1]
  return typeof config === 'object' && config !== null && 'type' in config && config.type === 'value'
})
const valueTag = valueCreate?.args[0]
if (start.length !== 1) throw new Error(`expected one startAnimatingNode, got ${start.length}`)
if (start[0].args[1] !== valueTag) {
  throw new Error(`startAnimatingNode should target the value node ${String(valueTag)}, got ${String(start[0].args[1])}`)
}
const startConfig = start[0].args[2]
if (typeof startConfig !== 'object' || startConfig === null || !('type' in startConfig) || startConfig.type !== 'frames') {
  throw new Error(`startAnimatingNode config should be frames, got ${JSON.stringify(startConfig)}`)
}

// native drives the view, so no JS frame touched it yet
if (appView().props.opacity !== 0) {
  throw new Error(`JS view must stay at 0 while native drives, got ${JSON.stringify(appView().props)}`)
}

// ---- native reports completion: JS syncs through one scoped commit --------

const notifyComplete = lastStartCallback
if (notifyComplete === null) throw new Error('native start callback was not captured')
notifyComplete({ finished: true, value: 1 })

if (!finished) throw new Error('native completion should resolve the start callback finished')
if (appView().props.opacity !== 1) {
  throw new Error(`JS value should sync to 1 on completion, got ${JSON.stringify(appView().props)}`)
}

// restoreDefaultValues-on-unmount lives in AnimatedProps.__detach (typechecked);
// headless mount() never unmounts a prior container, so that path is exercised on a
// real unmount / device rather than here.

console.log('native graph nodes:', createdTypes.join(','), '| view bound:', viewTag)
console.log('animated-native-driver.smoke OK')
