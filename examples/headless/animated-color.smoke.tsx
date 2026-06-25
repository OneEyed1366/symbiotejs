// Headless proof of AnimatedColor: the input forms parse to r/g/b/a channels,
// __getValue() is the rgba() string the commit color path expects, driving a
// channel re-pulls it, and useNativeDriver mirrors a `color` node referencing the
// four channel tags. A fake native module records the native config.

import { AnimatedColor, AnimatedValue, AnimatedWithChildren } from '@symbiote/engine'

// ---- input forms parse to channels ----------------------------------------

if (new AnimatedColor('#ff8800').__getValue() !== 'rgba(255, 136, 0, 1)') {
  throw new Error(`#ff8800 parse, got ${new AnimatedColor('#ff8800').__getValue()}`)
}
if (new AnimatedColor('#f80').__getValue() !== 'rgba(255, 136, 0, 1)') {
  throw new Error(`#f80 shorthand parse, got ${new AnimatedColor('#f80').__getValue()}`)
}
if (new AnimatedColor('rgba(10, 20, 30, 0.5)').__getValue() !== 'rgba(10, 20, 30, 0.5)') {
  throw new Error(`rgba() parse, got ${new AnimatedColor('rgba(10, 20, 30, 0.5)').__getValue()}`)
}
if (new AnimatedColor({ r: 1, g: 2, b: 3, a: 1 }).__getValue() !== 'rgba(1, 2, 3, 1)') {
  throw new Error('rgba object form failed')
}
// An unparseable (named/platform) color falls back to the default, never throws.
if (new AnimatedColor('rebeccapurple').__getValue() !== 'rgba(0, 0, 0, 1)') {
  throw new Error('unparseable color should fall back to default black')
}

// ---- driving a channel re-pulls the string --------------------------------

const red = new AnimatedValue(0)
const color = new AnimatedColor({ r: red, g: 0, b: 0, a: 1 })
if (color.__getValue() !== 'rgba(0, 0, 0, 1)') {
  throw new Error(`initial channel value, got ${color.__getValue()}`)
}
red.setValue(200)
if (color.__getValue() !== 'rgba(200, 0, 0, 1)') {
  throw new Error(`channel drive should re-pull, got ${color.__getValue()}`)
}

// ---- setValue fires listeners ONCE with the FINAL color, commits ONCE -------
// AnimatedColor.setValue drives all four channels. Each per-channel setValue
// flushes to bound leaves and walks the graph up to the color's listeners — so
// without the _withSuspendedCallbacks guard, one setValue would fire color
// listeners four times (each an intermediate rgba) and re-commit each bound leaf
// four times. Assert exactly one fire (final color) and one leaf commit.

// A minimal bound leaf: flushValue walks to nodes carrying an `update()` method.
// Counting update() calls counts the view commits this color would drive.
class CommitCountingLeaf extends AnimatedWithChildren {
  commits = 0
  constructor(private readonly source: AnimatedColor) {
    super()
    source.__addChild(this)
  }
  update(): void {
    this.commits++
    // Re-pull, mirroring a real leaf rebuilding its committed prop.
    this.source.__getValue()
  }
}

const observed = new AnimatedColor({ r: 0, g: 0, b: 0, a: 1 })
const leaf = new CommitCountingLeaf(observed)

const fires: string[] = []
observed.addListener((state) => {
  if (typeof state.value !== 'string') {
    throw new Error(`color listener must receive the composed rgba string, got ${typeof state.value}`)
  }
  fires.push(state.value)
})

observed.setValue({ r: 10, g: 20, b: 30, a: 0.5 })

if (fires.length !== 1) {
  throw new Error(`setValue must fire the listener exactly once, fired ${fires.length}x: ${fires.join(' | ')}`)
}
if (fires[0] !== 'rgba(10, 20, 30, 0.5)') {
  throw new Error(`listener must receive the FINAL color, got ${fires[0]}`)
}
if (leaf.commits !== 1) {
  throw new Error(`setValue must commit the bound leaf exactly once, committed ${leaf.commits}x`)
}

// A second setValue fires exactly once more (no leakage across calls).
observed.setValue('#01020304')
if (fires.length !== 2) {
  throw new Error(`second setValue must fire once more, total ${fires.length}`)
}
if (fires[1] !== 'rgba(1, 2, 3, 0.0156862745098039)' && !fires[1].startsWith('rgba(1, 2, 3,')) {
  throw new Error(`second fire must carry the new final color, got ${fires[1]}`)
}
if (leaf.commits !== 2) {
  throw new Error(`second setValue must commit once more, total ${leaf.commits}`)
}

// ---- native: a `color` node referencing the four channel tags -------------

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
  createAnimatedNode(tag: number, config: unknown): void {
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

const nativeColor = new AnimatedColor('#01020304')
nativeColor.__makeNative()

const colorCreate = nativeCalls.find((call) => {
  const config = call.args[1]
  return typeof config === 'object' && config !== null && 'type' in config && config.type === 'color'
})
if (colorCreate === undefined) {
  throw new Error('useNativeDriver should create a "color" animated node')
}
const colorConfig = colorCreate.args[1]
if (typeof colorConfig !== 'object' || colorConfig === null) {
  throw new Error('color config missing')
}
for (const channel of ['r', 'g', 'b', 'a']) {
  if (typeof Reflect.get(colorConfig, channel) !== 'number') {
    throw new Error(`color native config must carry a numeric ${channel} tag, got ${JSON.stringify(colorConfig)}`)
  }
}

console.log('color parsed/drove/native:', color.__getValue(), '| native channels r,g,b,a')
console.log('animated-color.smoke OK')
