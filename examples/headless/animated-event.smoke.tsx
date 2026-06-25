// Headless proof of Animated.event (the JS path) and its native attach wiring.
// A fake Fabric slot keeps each view's real reactTag so a scoped setNativeProps
// commit is observable; a fake NativeAnimatedTurboModule records the native-event
// registration. We assert, with no simulator, that:
//   1. JS path — firing the handler built from
//      `event([{nativeEvent:{contentOffset:{y: scrollY}}}])` with a real scroll
//      event drives scrollY, re-paints the bound translateY, and forwards args to
//      config.listener.
//   2. Native path — __attach(viewTag, 'onScroll') registers the leaf's key path
//      (['contentOffset','y']) and the value's native tag with the module.

import { type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { Animated } from '../../adapters/react/src/animated'
import { event, AnimatedEvent } from '../../core/engine/src/animated/event'

// ---- fake NativeAnimatedTurboModule (records calls) ----------------------

interface NativeCall {
  method: string
  args: unknown[]
}
const nativeCalls: NativeCall[] = []

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args })
  }
}

const fakeNativeAnimated = {
  createAnimatedNode: record('createAnimatedNode'),
  connectAnimatedNodes: record('connectAnimatedNodes'),
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode: record('startAnimatingNode'),
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

// ---- fake Fabric slot (keeps the real reactTag so the commit is checkable) ----

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

// translateY read off the committed view's flattened transform. The scoped
// setNativeProps commit hoists `style` onto the view, so transform lands on props.
function committedTranslateY(view: FakeNode): number {
  const transform = Reflect.get(view.props, 'transform')
  if (!Array.isArray(transform)) {
    throw new Error(`expected a transform array on the view, got ${JSON.stringify(view.props)}`)
  }
  for (const entry of transform) {
    if (typeof entry === 'object' && entry !== null) {
      const y = Reflect.get(entry, 'translateY')
      if (typeof y === 'number') return y
    }
  }
  throw new Error(`no translateY in committed transform ${JSON.stringify(transform)}`)
}

// ---- mount an Animated.View whose translateY binds scrollY -----------------

const scrollY = new Animated.Value(0)

function App(): ReactElement {
  return <Animated.View style={{ transform: [{ translateY: scrollY }] }} />
}

const ROOT_TAG = 41
mount(ROOT_TAG, <App />)

const viewTag = appView().tag

// the view paints at the initial value before any event fires
if (committedTranslateY(appView()) !== 0) {
  throw new Error(`expected initial translateY 0, got ${committedTranslateY(appView())}`)
}

// ---- 1. JS path: a real scroll event drives scrollY ------------------------

let listenerArg: unknown = null
const handler = event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
  listener: (arg) => {
    listenerArg = arg
  },
})

const scrollEvent = { nativeEvent: { contentOffset: { y: 42 } } }
handler(scrollEvent)

if (committedTranslateY(appView()) !== 42) {
  throw new Error(`event should drive translateY to 42, got ${committedTranslateY(appView())}`)
}
if (listenerArg !== scrollEvent) {
  throw new Error('config.listener should be called with the raw event arg')
}

// ---- 2. native path: __attach registers the key path + native tag ----------

const animatedEvent = handler.__getEvent()
if (!(animatedEvent instanceof AnimatedEvent)) {
  throw new Error('handler.__getEvent() should return the AnimatedEvent')
}

animatedEvent.__attach(viewTag, 'onScroll')

const added = callsOf('addAnimatedEventToView')
if (added.length !== 1) {
  throw new Error(`expected one addAnimatedEventToView, got ${added.length}`)
}
const [addedViewTag, addedEventName, addedMapping] = added[0].args
if (addedViewTag !== viewTag) {
  throw new Error(`addAnimatedEventToView should target view ${viewTag}, got ${String(addedViewTag)}`)
}
if (addedEventName !== 'onScroll') {
  throw new Error(`expected eventName onScroll, got ${String(addedEventName)}`)
}
if (typeof addedMapping !== 'object' || addedMapping === null) {
  throw new Error(`expected an event mapping object, got ${JSON.stringify(addedMapping)}`)
}
const nativeEventPath = Reflect.get(addedMapping, 'nativeEventPath')
if (!Array.isArray(nativeEventPath) || nativeEventPath.join('.') !== 'contentOffset.y') {
  throw new Error(`expected nativeEventPath ['contentOffset','y'], got ${JSON.stringify(nativeEventPath)}`)
}
const animatedValueTag = Reflect.get(addedMapping, 'animatedValueTag')
if (animatedValueTag !== scrollY.__getNativeTag()) {
  throw new Error(
    `mapping should carry scrollY's native tag ${scrollY.__getNativeTag()}, got ${String(animatedValueTag)}`,
  )
}

// detach unregisters against the same tag
animatedEvent.__detach(viewTag, 'onScroll')
const removed = callsOf('removeAnimatedEventFromView')
if (removed.length !== 1 || removed[0].args[2] !== scrollY.__getNativeTag()) {
  throw new Error(`expected removeAnimatedEventFromView with the value tag, got ${JSON.stringify(removed.map((c) => c.args))}`)
}

console.log('event drove translateY to:', committedTranslateY(appView()), '| native path mapping:', nativeEventPath.join('.'))
console.log('animated-event.smoke OK')
