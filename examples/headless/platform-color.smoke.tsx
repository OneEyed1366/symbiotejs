// Headless proof that PlatformColor / DynamicColorIOS reach the platform color
// processor. RN's processColor (wired via setColorProcessor) resolves CSS strings
// AND the opaque { semantic } / { dynamic } objects to the platform values iOS
// UIColor expects. The shared color seam (commit.ts processValue) used to route
// only strings, so an opaque color would slip past unprocessed; this asserts the
// object path now flows through the processor and lands on the committed node.

import { type ReactElement } from 'react'
import { mount, View, PlatformColor, DynamicColorIOS, processColor } from '@symbiote/react'
import { setColorProcessor, isOpaqueColorValue } from '@symbiote/engine'

// ---- pure constructors: the opaque shapes iOS native reads ----------------

const semantic = PlatformColor('systemBlue')
if (JSON.stringify(semantic) !== JSON.stringify({ semantic: ['systemBlue'] })) {
  throw new Error(`PlatformColor wrong shape: ${JSON.stringify(semantic)}`)
}
const dynamic = DynamicColorIOS({ light: '#ffffff', dark: '#000000' })
if (!isOpaqueColorValue(dynamic) || dynamic.dynamic?.light !== '#ffffff') {
  throw new Error(`DynamicColorIOS wrong shape: ${JSON.stringify(dynamic)}`)
}

// ---- wire a recording processor (stands in for RN's processColor) ----------

const seen: unknown[] = []
const STRING_SENTINEL = 0xff0000ff
setColorProcessor((value) => {
  seen.push(value)
  // Mimic RN: an opaque color resolves to a native dict, a CSS string to an int.
  return isOpaqueColorValue(value) ? { native: value } : STRING_SENTINEL
})

// ---- processColor public export: delegates to the wired processor ----------

if (processColor('#abcdef') !== STRING_SENTINEL) {
  throw new Error('processColor(string) did not route through the wired processor')
}
const processedSemantic = processColor(semantic)
if (JSON.stringify(processedSemantic) !== JSON.stringify({ native: semantic })) {
  throw new Error(`processColor(PlatformColor) did not route the object: ${JSON.stringify(processedSemantic)}`)
}

// ---- the seam: an opaque color on a style prop reaches the processor -------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
}

let committed: FakeNode[] = []
const slot = {
  createNode: (
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
  ): FakeNode => ({ tag, viewName, props, children: [] }),
  cloneNodeWithNewProps: (node: FakeNode, newProps: Record<string, unknown>): FakeNode => ({
    ...node,
    props: { ...node.props, ...newProps },
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: { ...node.props, ...newProps }, children: [] }),
  createChildSet: (): FakeNode[] => [],
  appendChild: (parent: FakeNode, child: FakeNode): FakeNode => {
    parent.children.push(child)
    return parent
  },
  appendChildToSet: (childSet: FakeNode[], child: FakeNode): void => {
    childSet.push(child)
  },
  completeRoot: (_rootTag: number, childSet: FakeNode[]): void => {
    committed = childSet
  },
  registerEventHandler: (): void => {},
  dispatchCommand: (): void => {},
}
Object.assign(globalThis, { nativeFabricUIManager: slot })

function App(): ReactElement {
  return <View style={{ backgroundColor: PlatformColor('labelColor') }} />
}
mount(7, <App />)

function find(node: FakeNode, predicate: (n: FakeNode) => boolean): FakeNode | undefined {
  if (predicate(node)) return node
  for (const child of node.children) {
    const hit = find(child, predicate)
    if (hit) return hit
  }
  return undefined
}

const root = committed[0]
if (!root) throw new Error('nothing committed')
const painted = find(root, (n) => n.props.backgroundColor !== undefined)
if (!painted) throw new Error('no node carries a backgroundColor')

// The committed prop must be the processor's OUTPUT (the native dict), not the raw
// opaque object — proving the seam routed the object through the processor.
const expected = JSON.stringify({ native: { semantic: ['labelColor'] } })
if (JSON.stringify(painted.props.backgroundColor) !== expected) {
  throw new Error(
    `backgroundColor reached Fabric unprocessed: ${JSON.stringify(painted.props.backgroundColor)}`,
  )
}
const routedSemantic = seen.some(
  (v) => isOpaqueColorValue(v) && JSON.stringify(v) === JSON.stringify({ semantic: ['labelColor'] }),
)
if (!routedSemantic) throw new Error('the opaque style color never reached the processor')

console.log('platform-color: PlatformColor / DynamicColorIOS / processColor / opaque seam routing')
console.log('platform-color.smoke OK')
