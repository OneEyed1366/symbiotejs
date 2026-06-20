/** @jsxRuntime automatic */
// Headless proof of the Image primitive over the same fake Fabric slot as
// smoke.tsx. It checks the two things only Image does: `source` reaches native as
// an ARRAY, and an opaque require()-style number is expanded by the injected
// resolver before it gets there. Plus the onLoad event round-trip. No simulator.

import { mount, type SymbioteEvent } from '@symbiote/react'
import { Image, setImageSourceResolver } from '../../packages/react/src/image'

// ---- fake Fabric slot ---------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

type EventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void

let committed: FakeNode[] = []
let eventHandler: EventHandler | undefined
const allCreated: FakeNode[] = []

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    const node: FakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
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
  registerEventHandler(handler: EventHandler): void {
    eventHandler = handler
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ------------------------------------------------------------

function imageNode(): FakeNode {
  const node = allCreated.find((n) => n.viewName === 'RCTImageView')
  if (!node) throw new Error('no RCTImageView was created')
  return node
}

// Note: the event handler is registered once for the whole slot, so reset()
// keeps it — only the per-mount node bookkeeping is cleared.
function reset(): void {
  committed = []
  allCreated.length = 0
}

// ---- fake resolver: a require() number expands to a resolved source -----

const ASSET_ID = 42
setImageSourceResolver((source) =>
  source === ASSET_ID ? { uri: 'asset://42', scale: 1, width: 10, height: 10 } : source,
)

// ---- case 1: object source becomes a one-element array ------------------

mount(11, <Image source={{ uri: 'http://x/y.png' }} onLoad={() => {}} />)

{
  const node = imageNode()
  const source = node.props.source
  if (!Array.isArray(source)) throw new Error('source is not an array')
  if (source.length !== 1) throw new Error(`expected 1 source, got ${source.length}`)
  const first = source[0]
  if (JSON.stringify(first) !== JSON.stringify({ uri: 'http://x/y.png' })) {
    throw new Error(`unexpected source[0]: ${JSON.stringify(first)}`)
  }
}

// ---- case 2: a require()-style number is resolved, then wrapped ----------

reset()
mount(12, <Image source={ASSET_ID} />)

{
  const node = imageNode()
  const source = node.props.source
  if (!Array.isArray(source)) throw new Error('resolved source is not an array')
  const wanted = { uri: 'asset://42', scale: 1, width: 10, height: 10 }
  if (JSON.stringify(source[0]) !== JSON.stringify(wanted)) {
    throw new Error(`resolver did not run: ${JSON.stringify(source[0])}`)
  }
}

// ---- case 3: onLoad fires from the captured native event ----------------

reset()
let loadedWith: SymbioteEvent | undefined
mount(13, <Image source={{ uri: 'http://x/y.png' }} onLoad={(event) => { loadedWith = event }} />)

{
  const node = imageNode()
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(node.instanceHandle, 'topLoad', {
    source: { uri: 'http://x/y.png', width: 1, height: 1 },
  })
  if (!loadedWith) throw new Error('onLoad did not fire')
}

console.log('image.smoke OK')
