// Headless proof of the Animated arithmetic / operator nodes (add, subtract,
// multiply, divide, modulo, diffClamp). The JS path is the contract that MUST
// hold: the arithmetic is exact, diffClamp accumulates the input's delta and
// clamps the running total to its band, and modulo wraps Euclidean. A bonus
// native-path check installs a fake NativeAnimatedTurboModule and asserts each
// node's __getNativeConfig type when the graph is made native.

import {
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  AnimatedAddition,
  AnimatedDiffClamp,
} from '../../core/engine/src/animated/operators'
import { AnimatedValue } from '../../core/engine/src/animated/value'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

// ---- JS path (MUST pass) --------------------------------------------------

// add / subtract / multiply over two values
{
  const a = new AnimatedValue(3)
  const b = new AnimatedValue(4)
  assert(add(a, b).__getValue() === 7, `add expected 7, got ${add(a, b).__getValue()}`)
  assert(
    subtract(a, b).__getValue() === -1,
    `subtract expected -1, got ${subtract(a, b).__getValue()}`,
  )
  assert(
    multiply(a, b).__getValue() === 12,
    `multiply expected 12, got ${multiply(a, b).__getValue()}`,
  )
}

// bare-number inputs are wrapped in an AnimatedValue
{
  const v = new AnimatedValue(10)
  assert(add(v, 5).__getValue() === 15, 'add with a bare number should wrap it')
  assert(add(2, 3).__getValue() === 5, 'add of two bare numbers should resolve')
}

// divide, including the divide-by-zero clamp (RN returns 0 to avoid a Fabric crash)
{
  assert(divide(10, 4).__getValue() === 2.5, 'divide expected 2.5')
  assert(divide(1, 0).__getValue() === 0, 'divide by zero should clamp to 0, not Infinity')
}

// modulo wraps Euclidean: a negative input still lands in [0, modulus)
{
  const v = new AnimatedValue(7)
  assert(modulo(v, 5).__getValue() === 2, 'modulo 7 % 5 expected 2')
  v.setValue(-1)
  assert(modulo(v, 5).__getValue() === 4, 'modulo -1 mod 5 should wrap to 4, not -1')
}

// diffClamp accumulates the frame-to-frame DELTA and clamps the running total to
// [0, 10] across a setValue sequence: 0 -> 5 -> 2 -> 20 yields 0, 5, 2, 10.
{
  const source = new AnimatedValue(0)
  const clamped = diffClamp(source, 0, 10)

  // pull once at the starting value to seed lastValue
  assert(clamped.__getValue() === 0, `diffClamp seed expected 0, got ${clamped.__getValue()}`)

  const observed: number[] = []
  for (const next of [5, 2, 20]) {
    source.setValue(next)
    observed.push(clamped.__getValue())
  }
  const expected = [5, 2, 10]
  assert(
    JSON.stringify(observed) === JSON.stringify(expected),
    `diffClamp sequence expected ${JSON.stringify(expected)}, got ${JSON.stringify(observed)}`,
  )
}

// ---- bonus native path: __getNativeConfig types -------------------------

interface NativeCall {
  method: string
  args: unknown[]
}
const nativeCalls: NativeCall[] = []
const createdNodeTags = new Set<number>()

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args })
  }
}

const fakeNativeAnimated = {
  createAnimatedNode(tag: number, config: unknown): void {
    createdNodeTags.add(tag)
    nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] })
  },
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

function configTypeFor(node: AnimatedAddition | AnimatedDiffClamp): unknown {
  node.__makeNative()
  const created = nativeCalls.find(
    (call) => call.method === 'createAnimatedNode' && call.args[0] === node.__getNativeTag(),
  )
  const config = created?.args[1]
  return typeof config === 'object' && config !== null && 'type' in config ? config.type : undefined
}

{
  const additionType = configTypeFor(new AnimatedAddition(new AnimatedValue(1), new AnimatedValue(2)))
  assert(additionType === 'addition', `native addition config type expected, got ${String(additionType)}`)

  const clampType = configTypeFor(new AnimatedDiffClamp(new AnimatedValue(0), 0, 10))
  assert(clampType === 'diffclamp', `native diffclamp config type expected, got ${String(clampType)}`)
}

console.log('animated-operators.smoke OK')
