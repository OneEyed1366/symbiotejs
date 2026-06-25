// Headless proof of native loop offload: Animated.loop over a SINGLE native-driver
// timing must hand the whole loop to native (one startAnimatingNode carrying
// `iterations`), so zero JS runs per cycle — not the JS-restart path. A finite loop
// passes its count; an infinite loop passes -1, and its completion callback never
// fires (native owns every cycle). A loop over a SEQUENCE can't offload and falls
// back to JS restart.

import { AnimatedValue, timing, loop, sequence } from '@symbiote/engine'

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

function startsOf(): NativeCall[] {
  return nativeCalls.filter((call) => call.method === 'startAnimatingNode')
}
function configOf(call: NativeCall): Record<string, unknown> {
  const config = call.args[2]
  if (typeof config !== 'object' || config === null) throw new Error('start config missing')
  return { ...config }
}

// ---- infinite loop of a single native timing -> one start, iterations -1 ----

const opacity = new AnimatedValue(0)
loop(timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true })).start()

let starts = startsOf()
if (starts.length !== 1) {
  throw new Error(`infinite native loop should issue exactly one startAnimatingNode, got ${starts.length}`)
}
if (configOf(starts[0]).iterations !== -1) {
  throw new Error(`infinite loop should carry iterations -1, got ${String(configOf(starts[0]).iterations)}`)
}

// ---- finite loop -> the iteration count rides the same single start ---------

nativeCalls.length = 0
const scale = new AnimatedValue(0)
loop(timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }), { iterations: 3 }).start()
starts = startsOf()
if (starts.length !== 1 || configOf(starts[0]).iterations !== 3) {
  throw new Error(`finite native loop should issue one start with iterations 3, got ${JSON.stringify(starts.map(configOf))}`)
}

// ---- a loop over a SEQUENCE cannot offload: it starts the first child only --
// (the JS restart drives the rest), so its single start does NOT carry an infinite
// iteration count — proving the offload is scoped to single animations.

nativeCalls.length = 0
const seq = new AnimatedValue(0)
loop(
  sequence([
    timing(seq, { toValue: 1, duration: 100, useNativeDriver: true }),
    timing(seq, { toValue: 0, duration: 100, useNativeDriver: true }),
  ]),
).start()
const seqStarts = startsOf()
if (seqStarts.length !== 1) {
  throw new Error(`sequence loop should JS-restart (one start for the first child), got ${seqStarts.length}`)
}
if (configOf(seqStarts[0]).iterations === -1) {
  throw new Error('a sequence loop must NOT offload an infinite native iteration count')
}

console.log('native loop: single timing offloads (iterations -1 / 3), sequence falls back to JS')
console.log('animated-native-loop.smoke OK')
