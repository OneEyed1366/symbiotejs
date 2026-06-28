// Headless proof of the Vue Animated surface (ADR 0024 Phase 3a), over the same fake Fabric slot
// the React animated smokes use, so the shared @symbiote/engine graph (AnimatedValue, the
// AnimatedProps leaf, Animated.event) is exercised through Vue's reactive lifecycle: a render that
// rebuilds the leaf + a post-commit reconcile (onMounted/onUpdated) + a function ref that captures
// the host node (held in a shallowRef, the reactivity rule). It mirrors the React twins
// (animated-component.smoke.tsx + animated-scroll-event.smoke.tsx + animated-timing.smoke.ts):
//   1. JS-driven prop: setValue on an Animated.Value drives the committed transform (the
//      value.setValue -> flushValue -> AnimatedProps.update() -> setNativeProps path), and the
//      FIRST render already carries the reduced (current) value.
//   2. Animated.event: firing the registered onScroll handler drives the bound value, which
//      re-paints a sibling Animated.View's translateY, and Animated.ScrollView resolves through
//      its lazy getter without tripping the scroll-view <-> animated module cycle.
//   3. Animated.timing drives a value over the JS/rAF path and lands the committed opacity on 1.

import { defineComponent, h } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { Animated } from '../../adapters/vue/src/animated'

// ---- fake Fabric slot (keeps real props; captures the committed child set) ----

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

let committed: IFakeNode[] = []
let nextTag = 100

const slot = {
  createNode(_tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>, instanceHandle: unknown): IFakeNode {
    return { tag: nextTag++, viewName, props, children: [], instanceHandle }
  },
  cloneNode: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [...node.children] }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [] }),
  cloneNodeWithNewProps: (node: IFakeNode, props: Record<string, unknown>): IFakeNode => ({ ...node, props: { ...node.props, ...props }, children: [...node.children] }),
  cloneNodeWithNewChildrenAndProps: (node: IFakeNode, props: Record<string, unknown>): IFakeNode => ({ ...node, props: { ...node.props, ...props }, children: [] }),
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

// ---- rAF shim (Node has none; the timing/spring drivers read it at call time) ----

const frameTimers = new Map<number, ReturnType<typeof setTimeout>>()
let nextFrameId = 1
if (typeof globalThis.requestAnimationFrame !== 'function') {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: () => void): number {
      const id = nextFrameId++
      frameTimers.set(id, setTimeout(() => { frameTimers.delete(id); callback() }, 16))
      return id
    },
    cancelAnimationFrame(id: number): void {
      const timer = frameTimers.get(id)
      if (timer !== undefined) { clearTimeout(timer); frameTimers.delete(id) }
    },
  })
}

// ---- helpers ------------------------------------------------------------

let failures = 0
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
function reset(): void {
  committed = []
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function findByViewName(nodes: IFakeNode[], viewName: string): IFakeNode | undefined {
  for (const node of nodes) {
    if (node.viewName === viewName) return node
    const found = findByViewName(node.children, viewName)
    if (found !== undefined) return found
  }
  return undefined
}

// First committed node carrying a top-level `transform` (style is flattened onto props at commit).
function findTransformView(nodes: IFakeNode[]): IFakeNode | undefined {
  for (const node of nodes) {
    if (Reflect.get(node.props, 'transform') !== undefined) return node
    const found = findTransformView(node.children)
    if (found !== undefined) return found
  }
  return undefined
}

// First committed node carrying a top-level numeric `opacity`.
function findOpacityView(nodes: IFakeNode[]): IFakeNode | undefined {
  for (const node of nodes) {
    if (typeof Reflect.get(node.props, 'opacity') === 'number') return node
    const found = findOpacityView(node.children)
    if (found !== undefined) return found
  }
  return undefined
}

// Pull a single transform key (translateX / translateY) off a committed node's transform array.
function transformValue(node: IFakeNode | undefined, key: string): number | undefined {
  if (node === undefined) return undefined
  const transform = Reflect.get(node.props, 'transform')
  if (!Array.isArray(transform)) return undefined
  for (const entry of transform) {
    if (typeof entry === 'object' && entry !== null) {
      const value = Reflect.get(entry, key)
      if (typeof value === 'number') return value
    }
  }
  return undefined
}

// ---- case 1: JS-driven transform prop (setValue -> committed transform) ----

const tx = new Animated.Value(10)
reset()
mount(50, defineComponent({
  setup() {
    return () => h(Animated.View, { style: { transform: [{ translateX: tx }] } })
  },
}))
await tick()

check('case1 first render carries the reduced translateX=10', transformValue(findTransformView(committed), 'translateX') === 10)
tx.setValue(55)
check('case1 setValue(55) drives the committed transform', transformValue(findTransformView(committed), 'translateX') === 55)

// ---- case 2: Animated.event on Animated.ScrollView drives a bound Animated.View ----

const scrollY = new Animated.Value(0)
const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }])
reset()
mount(51, defineComponent({
  setup() {
    return () =>
      h(
        Animated.ScrollView,
        { onScroll, scrollEventThrottle: 16 },
        { default: () => [h(Animated.View, { style: { transform: [{ translateY: scrollY }] } })] },
      )
  },
}))
await tick()

check('case2 Animated.ScrollView commits RCTScrollView (lazy getter, no module cycle)', findByViewName(committed, 'RCTScrollView') !== undefined)
check('case2 bound view initial translateY=0', transformValue(findTransformView(committed), 'translateY') === 0)
onScroll({ nativeEvent: { contentOffset: { y: 88, x: 0 } } })
check('case2 Animated.event drove the value to 88', scrollY.__getValue() === 88)
check('case2 bound translateY re-paints to 88', transformValue(findTransformView(committed), 'translateY') === 88)

// ---- case 3: Animated.timing drives opacity over the JS/rAF path, lands on 1 ----

const prog = new Animated.Value(0)
reset()
mount(52, defineComponent({
  setup() {
    return () => h(Animated.View, { style: { opacity: prog } })
  },
}))
await tick()

check('case3 first render opacity=0', findOpacityView(committed)?.props.opacity === 0)
await new Promise<void>((resolve) => {
  Animated.timing(prog, { toValue: 1, duration: 60, easing: Animated.Easing.linear }).start(() => resolve())
})
check('case3 timing landed the value on 1', prog.__getValue() === 1)
check('case3 timing drove the committed opacity to 1', findOpacityView(committed)?.props.opacity === 1)

console.log(failures === 0 ? '\nvue-animated.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
