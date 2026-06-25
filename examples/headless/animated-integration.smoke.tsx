// End-to-end proof of the whole Animated stack (Phase 2 integration): a real
// driver (Animated.timing) moves an Animated.Value, whose frames flow through the
// component bridge's AnimatedProps leaf into shared's setNativeProps — a scoped
// commit per frame — landing on the committed view. Neither agent's smoke covered
// the driver + bridge + commit together; this one does. No simulator.

import { type ReactElement } from 'react'
import { mount } from '@symbiote/react'
// Reach the Animated bridge source directly (no built dist in the harness).
import { Animated } from '../../adapters/react/src/animated'
import { Easing } from '@symbiote/engine'

// rAF is not a Node global; polyfill it (setTimeout-based) before any driver runs.
// The drivers read requestAnimationFrame from the host at call time, so installing
// it here — before .start() — is enough.
let frameClock = 0
const pendingFrames = new Map<number, (time: number) => void>()
let nextFrameId = 1
Object.assign(globalThis, {
  requestAnimationFrame(callback: (time: number) => void): number {
    const id = nextFrameId++
    pendingFrames.set(id, callback)
    setTimeout(() => {
      const cb = pendingFrames.get(id)
      if (cb !== undefined) {
        pendingFrames.delete(id)
        frameClock += 16
        cb(frameClock)
      }
    }, 0)
    return id
  },
  cancelAnimationFrame(id: number): void {
    pendingFrames.delete(id)
  },
})

// ---- fake Fabric slot ----------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

let committed: FakeNode[] = []
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

// ---- mount an Animated.View and drive it with a real timing driver -------

const opacity = new Animated.Value(0)

function App(): ReactElement {
  return <Animated.View style={{ opacity }} />
}

const ROOT_TAG = 41
mount(ROOT_TAG, <App />)

if (appView().props.opacity !== 0) {
  throw new Error(`initial opacity should be 0, got ${JSON.stringify(appView().props)}`)
}

const frames: number[] = []
const opacityListener = opacity.addListener(({ value }) => {
  frames.push(value)
})

const finished = await new Promise<boolean>((resolve) => {
  Animated.timing(opacity, { toValue: 1, duration: 80, easing: Easing.linear }).start((result) => {
    resolve(result.finished)
  })
})

opacity.removeListener(opacityListener)

if (!finished) {
  throw new Error('timing should report finished:true')
}
if (appView().props.opacity !== 1) {
  throw new Error(`timing should drive opacity to 1, got ${JSON.stringify(appView().props)}`)
}
if (frames.length < 2) {
  throw new Error(`timing should emit multiple frames, got ${frames.length}`)
}
const middle = frames[Math.floor(frames.length / 2)]
if (!(middle > 0 && middle < 1)) {
  throw new Error(`intermediate frames must be within (0, 1), got ${middle}`)
}

console.log('timing drove', frames.length, 'frames; final view opacity =', appView().props.opacity)
console.log('animated-integration.smoke OK')
