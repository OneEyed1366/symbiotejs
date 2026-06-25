// Headless proof of AnimatedMock (RN's AnimatedMock.js). When the host reports
// Platform.isDisableAnimations, react/animated swaps the live drivers for this mock:
// every animation jumps straight to its final value and fires the end callback
// SYNCHRONOUSLY — no frames. This smoke drives the mock directly (no Platform flip
// needed) and asserts: (a) timing lands on toValue with the value already there
// BEFORE the await, callback fired exactly once; (b) spring same; (c) decay is the
// empty animation (no toValue to land on); (d) sequence/parallel jump their members.

import { AnimatedValue } from '@symbiote/engine'
import type { EndResult } from '@symbiote/engine'
// Reach the mock source directly — it is the half swapped in under reduced motion.
import { AnimatedMock } from '../../adapters/react/src/animated/mock'

// ---- fake Fabric slot ----------------------------------------------------
// setValue flushes through the commit engine, which reads nativeFabricUIManager. A
// minimal slot keeps that path from throwing even though no view is attached.

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

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

// ---- (a) timing jumps to toValue synchronously, fires once -----------------

function testTimingJumpsSynchronously(): void {
  const value = new AnimatedValue(0)
  const frames: number[] = []
  value.addListener(({ value: v }) => frames.push(v))

  let endCount = 0
  let landedValue = -1
  AnimatedMock.timing(value, { toValue: 1, duration: 10000 }).start((result: EndResult) => {
    endCount += 1
    assert(result.finished, 'mock timing must report finished:true')
    // The callback runs INSIDE start() — value is already final here, no await.
    landedValue = value.__getValue()
  })

  // No frame loop ran: even with a 10s duration the value is already at the target
  // and the callback already fired, all on the same tick.
  assert(value.__getValue() === 1, `mock timing should jump to 1, got ${value.__getValue()}`)
  assert(landedValue === 1, `callback should see final value 1, saw ${landedValue}`)
  assert(endCount === 1, `mock timing callback must fire exactly once, fired ${endCount}`)
  assert(
    frames.length === 1 && frames[0] === 1,
    `mock timing emits exactly one frame at the target, got ${JSON.stringify(frames)}`,
  )
  console.log(`  (a) mock timing: jumped to ${value.__getValue()} synchronously, cb fired once`)
}

// ---- (b) spring jumps to toValue synchronously -----------------------------

function testSpringJumpsSynchronously(): void {
  const value = new AnimatedValue(0)
  let finished = false
  AnimatedMock.spring(value, { toValue: 42, stiffness: 200, damping: 20 }).start((result) => {
    finished = result.finished
  })
  assert(value.__getValue() === 42, `mock spring should jump to 42, got ${value.__getValue()}`)
  assert(finished, 'mock spring must report finished:true')
  console.log(`  (b) mock spring: jumped to ${value.__getValue()} synchronously`)
}

// ---- (c) decay is the empty animation (no toValue) -------------------------

function testDecayIsEmpty(): void {
  const value = new AnimatedValue(7)
  let called = false
  AnimatedMock.decay(value, { velocity: 1 }).start(() => {
    called = true
  })
  // Empty animation: value untouched, no callback (RN's emptyAnimation.start is a no-op).
  assert(value.__getValue() === 7, `mock decay must leave value at 7, got ${value.__getValue()}`)
  assert(!called, 'mock decay (empty animation) must not fire a callback')
  console.log(`  (c) mock decay: value untouched at ${value.__getValue()}, no callback`)
}

// ---- (d) sequence + parallel jump their members synchronously --------------

function testCompositionsJump(): void {
  const a = new AnimatedValue(0)
  const b = new AnimatedValue(0)
  let seqFinished = false
  AnimatedMock.sequence([
    AnimatedMock.timing(a, { toValue: 1, duration: 5000 }),
    AnimatedMock.timing(b, { toValue: 2, duration: 5000 }),
  ]).start((result) => {
    seqFinished = result.finished
  })
  assert(a.__getValue() === 1, `mock sequence a should be 1, got ${a.__getValue()}`)
  assert(b.__getValue() === 2, `mock sequence b should be 2, got ${b.__getValue()}`)
  assert(seqFinished, 'mock sequence must report finished:true')

  const c = new AnimatedValue(0)
  const d = new AnimatedValue(0)
  let parFinished = false
  AnimatedMock.parallel([
    AnimatedMock.timing(c, { toValue: 3, duration: 5000 }),
    AnimatedMock.timing(d, { toValue: 4, duration: 5000 }),
  ]).start((result) => {
    parFinished = result.finished
  })
  assert(c.__getValue() === 3, `mock parallel c should be 3, got ${c.__getValue()}`)
  assert(d.__getValue() === 4, `mock parallel d should be 4, got ${d.__getValue()}`)
  assert(parFinished, 'mock parallel must report finished:true')
  console.log(`  (d) mock sequence/parallel: members jumped synchronously`)
}

function main(): void {
  testTimingJumpsSynchronously()
  testSpringJumpsSynchronously()
  testDecayIsEmpty()
  testCompositionsJump()
  console.log('animated-mock.smoke OK')
}

main()
