// Headless proof of the JS-driven Animated drivers + composition (ADR 0016,
// Phase 2). timing / spring drive an AnimatedValue over real rAF frames; stop()
// cancels mid-flight; sequence / parallel compose. No simulator: a setTimeout
// polyfill stands in for the host's requestAnimationFrame so the drivers' frame
// loops run under Node. We observe the value through addListener — the value
// graph itself is proven by animated-value.smoke.ts; this proves the drivers.

import { AnimatedValue, Easing, parallel, sequence, spring, timing } from '@symbiote/engine'
import type { EndResult } from '@symbiote/engine'

// ---- fake Fabric slot ----------------------------------------------------
// The drivers never touch Fabric directly, but AnimatedValue's flush path runs
// the commit engine, which reads global.nativeFabricUIManager. A minimal slot
// keeps that path from throwing even though no view is attached here.

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

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
  cloneNodeWithNewProps(node: FakeNode, newProps: Record<string, unknown>): FakeNode {
    return { ...node, props: { ...node.props, ...newProps } }
  },
  cloneNodeWithNewChildren(node: FakeNode): FakeNode {
    return { ...node, children: [] }
  },
  createChildSet(): FakeNode[] {
    return []
  },
  appendChildToSet(childSet: FakeNode[], child: FakeNode): void {
    childSet.push(child)
  },
  completeRoot(): void {},
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- rAF polyfill --------------------------------------------------------
// Drivers read requestAnimationFrame / cancelAnimationFrame from the host at
// call time; Node has neither, so install a ~16ms setTimeout shim.

const frameTimers = new Map<number, ReturnType<typeof setTimeout>>()
let nextFrameId = 1

if (typeof globalThis.requestAnimationFrame !== 'function') {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: () => void): number {
      const id = nextFrameId++
      const timer = setTimeout(() => {
        frameTimers.delete(id)
        callback()
      }, 16)
      frameTimers.set(id, timer)
      return id
    },
    cancelAnimationFrame(id: number): void {
      const timer = frameTimers.get(id)
      if (timer !== undefined) {
        clearTimeout(timer)
        frameTimers.delete(id)
      }
    },
  })
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

// ---- (a) timing drives 0 -> 1, fires once, intermediate frames in (0,1) ---

async function testTiming(): Promise<void> {
  const value = new AnimatedValue(0)
  const frames: number[] = []
  value.addListener(({ value: v }) => frames.push(v))

  let endCount = 0
  const result = await new Promise<EndResult>((resolve) => {
    timing(value, { toValue: 1, duration: 100, easing: Easing.linear }).start((r) => {
      endCount += 1
      resolve(r)
    })
  })

  assert(result.finished, 'timing should finish')
  assert(endCount === 1, `timing callback must fire exactly once, fired ${endCount}`)
  assert(value.__getValue() === 1, `timing should land on 1, got ${value.__getValue()}`)
  assert(frames.length >= 2, `timing should emit multiple frames, got ${frames.length}`)

  const intermediate = frames.slice(0, -1)
  for (const f of intermediate) {
    assert(f > 0 && f < 1, `intermediate frame must be strictly in (0,1), got ${f}`)
  }
  console.log(`  (a) timing: ${frames.length} frames, lands on ${value.__getValue()}, cb fired once`)
}

// ---- (b) stop() mid-flight yields {finished:false} ------------------------

async function testStop(): Promise<void> {
  const value = new AnimatedValue(0)
  const composite = timing(value, { toValue: 1, duration: 500, easing: Easing.linear })

  const result = await new Promise<EndResult>((resolve) => {
    composite.start(resolve)
    // Let a couple of frames run, then stop mid-flight.
    setTimeout(() => composite.stop(), 50)
  })

  assert(!result.finished, 'stop mid-flight must report finished:false')
  assert(value.__getValue() < 1, `stopped value should be below target, got ${value.__getValue()}`)
  console.log(`  (b) stop: finished=${result.finished} at value ${value.__getValue().toFixed(3)}`)
}

// ---- (c) spring settles at its toValue and ends finished ------------------

async function testSpring(): Promise<void> {
  const value = new AnimatedValue(0)
  const result = await new Promise<EndResult>((resolve) => {
    spring(value, { toValue: 1, stiffness: 200, damping: 20, mass: 1 }).start(resolve)
  })

  assert(result.finished, 'spring should finish')
  assert(
    Math.abs(value.__getValue() - 1) < 0.01,
    `spring should settle at 1, got ${value.__getValue()}`,
  )
  console.log(`  (c) spring: settled at ${value.__getValue()}, finished=${result.finished}`)
}

// ---- (d) sequence and parallel compose; all inner animations finish -------

async function testSequence(): Promise<void> {
  const a = new AnimatedValue(0)
  const b = new AnimatedValue(0)
  const result = await new Promise<EndResult>((resolve) => {
    sequence([
      timing(a, { toValue: 1, duration: 60, easing: Easing.linear }),
      timing(b, { toValue: 1, duration: 60, easing: Easing.linear }),
    ]).start(resolve)
  })

  assert(result.finished, 'sequence should finish')
  assert(a.__getValue() === 1, `sequence first value should be 1, got ${a.__getValue()}`)
  assert(b.__getValue() === 1, `sequence second value should be 1, got ${b.__getValue()}`)
  console.log(`  (d1) sequence: a=${a.__getValue()}, b=${b.__getValue()}, finished`)
}

async function testParallel(): Promise<void> {
  const a = new AnimatedValue(0)
  const b = new AnimatedValue(0)
  const result = await new Promise<EndResult>((resolve) => {
    parallel([
      timing(a, { toValue: 1, duration: 80, easing: Easing.linear }),
      timing(b, { toValue: 1, duration: 80, easing: Easing.linear }),
    ]).start(resolve)
  })

  assert(result.finished, 'parallel should finish')
  assert(a.__getValue() === 1, `parallel a should be 1, got ${a.__getValue()}`)
  assert(b.__getValue() === 1, `parallel b should be 1, got ${b.__getValue()}`)
  console.log(`  (d2) parallel: a=${a.__getValue()}, b=${b.__getValue()}, finished`)
}

async function main(): Promise<void> {
  await testTiming()
  await testStop()
  await testSpring()
  await testSequence()
  await testParallel()
  console.log('animated-timing.smoke OK')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
