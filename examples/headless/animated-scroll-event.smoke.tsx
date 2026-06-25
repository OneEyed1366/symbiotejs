// Headless proof of the canonical scroll-driven animation:
//   onScroll={Animated.event([{nativeEvent:{contentOffset:{y: scrollY}}}])} on an
//   Animated.ScrollView, with a sibling Animated.View whose translateY binds scrollY.
// A fake Fabric slot keeps each view's real props so the committed transform is
// observable. We assert, with no simulator, that:
//   1. Animated.ScrollView mounts (the lazy getter resolves the createAnimatedComponent
//      wrapper without tripping the scroll-view <-> animated module cycle).
//   2. Firing the committed onScroll handler with a real scroll event drives scrollY
//      and re-paints the bound translateY.
//   3. AnimatedValueXY.getTranslateTransform() hands back the live x/y values.

import { type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { Animated } from '../../adapters/react/src/animated'
import { AnimatedValueXY } from '../../core/engine/src/animated/value-xy'

// ---- fake Fabric slot (keeps the real props so the commit is checkable) ----

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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

// Walk the committed tree to the first node of a given view name.
function findByViewName(nodes: FakeNode[], viewName: string): FakeNode | undefined {
  for (const node of nodes) {
    if (node.viewName === viewName) return node
    const found = findByViewName(node.children, viewName)
    if (found !== undefined) return found
  }
  return undefined
}

// translateY read off a committed view's transform.
function committedTranslateY(node: FakeNode): number {
  const transform = Reflect.get(node.props, 'transform')
  if (!Array.isArray(transform)) {
    throw new Error(`expected a transform array, got ${JSON.stringify(node.props)}`)
  }
  for (const entry of transform) {
    if (typeof entry === 'object' && entry !== null) {
      const y = Reflect.get(entry, 'translateY')
      if (typeof y === 'number') return y
    }
  }
  throw new Error(`no translateY in committed transform ${JSON.stringify(transform)}`)
}

// ---- 1. mount Animated.ScrollView with a scroll-driven Animated.View --------

const scrollY = new Animated.Value(0)
// The canonical handler: `Animated.event([{nativeEvent:{contentOffset:{y: scrollY}}}])`.
// Held by reference so the test can fire it the way the native scroll event would —
// onScroll is registered through React's event system, not committed as a Fabric prop.
const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }])

function App(): ReactElement {
  return (
    <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
      <Animated.View style={{ transform: [{ translateY: scrollY }] }} />
    </Animated.ScrollView>
  )
}

const ROOT_TAG = 73
mount(ROOT_TAG, <App />)

// The Animated.ScrollView committed its native scroll node — proof the lazy getter
// resolved the wrapper without tripping the scroll-view <-> animated module cycle.
assert(
  findByViewName(committed, 'RCTScrollView') !== undefined,
  `expected an Animated.ScrollView to commit a scroll node, got ${committed.map((n) => n.viewName).join(',')}`,
)

// The bound view (the leaf RCTView carrying the transform) paints at the initial value.
const boundViewBefore = findTransformView(committed)
assert(boundViewBefore !== undefined, 'expected the bound Animated.View to be committed')
assert(
  committedTranslateY(boundViewBefore) === 0,
  `expected initial translateY 0, got ${committedTranslateY(boundViewBefore)}`,
)

// ---- 2. firing onScroll drives scrollY -> re-paints translateY -------------

onScroll({ nativeEvent: { contentOffset: { y: 88, x: 0 } } })

const boundViewAfter = findTransformView(committed)
assert(boundViewAfter !== undefined, 'expected the bound Animated.View after scroll')
assert(
  committedTranslateY(boundViewAfter) === 88,
  `scroll event should drive translateY to 88, got ${committedTranslateY(boundViewAfter)}`,
)

function findTransformView(nodes: FakeNode[]): FakeNode | undefined {
  for (const node of nodes) {
    if (Reflect.get(node.props, 'transform') !== undefined) return node
    const found = findTransformView(node.children)
    if (found !== undefined) return found
  }
  return undefined
}

// ---- 3. AnimatedValueXY.getTranslateTransform yields the live x/y -----------

const xy = new AnimatedValueXY({ x: 3, y: 7 })
const transform = xy.getTranslateTransform()
assert(transform.length === 2, `getTranslateTransform() should be a 2-tuple, got ${transform.length}`)
assert(transform[0].translateX === xy.x, 'transform[0].translateX must be the live x value')
assert(transform[1].translateY === xy.y, 'transform[1].translateY must be the live y value')
assert(transform[0].translateX.__getValue() === 3, 'translateX should read 3')
assert(transform[1].translateY.__getValue() === 7, 'translateY should read 7')
xy.setValue({ x: 30, y: 70 })
assert(transform[1].translateY.__getValue() === 70, 'getTranslateTransform must reflect setValue')

console.log('scroll event drove translateY to:', committedTranslateY(boundViewAfter))
console.log('animated-scroll-event.smoke OK')
