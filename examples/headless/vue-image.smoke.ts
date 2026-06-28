// Headless parity proof of the Vue Image primitive over the same fake Fabric slot as the React
// image.smoke.tsx, the Vue twin. It checks the things only Image does, all shared verbatim from
// @symbiote/components/renderImage and reached through the Vue functional bridge: `source` lands
// native as an ARRAY, a require()-style number is expanded by the injected resolver, the onLoad
// event round-trips, and the W3C aliases fold (src→source uri, alt→accessibilityLabel + accessible;
// the raw src/alt never reach native). Same four cases as React, proof the fold is adapter-agnostic.

import { defineComponent, h } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { Image, setImageSourceResolver } from '../../adapters/vue/src/index'
import type { ISymbioteEvent } from '@symbiote/engine'

// ---- fake Fabric slot ---------------------------------------------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

type IEventHandler = (instanceHandle: unknown, topLevelType: string, nativeEvent: Record<string, unknown>) => void

let allCreated: IFakeNode[] = []
let eventHandler: IEventHandler | undefined

const slot = {
  createNode(tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>, instanceHandle: unknown): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNode: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [...node.children] }),
  cloneNodeWithNewProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({ ...node, props: newProps }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({ ...node, props: newProps, children: [] }),
  createChildSet: (): IFakeNode[] => [],
  appendChild(parent: IFakeNode, child: IFakeNode): void {
    parent.children.push(child)
  },
  appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
    childSet.push(child)
  },
  completeRoot(): void {},
  registerEventHandler(handler: IEventHandler): void {
    eventHandler = handler
  },
  dispatchCommand(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ------------------------------------------------------------

let failures = 0
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
function reset(): void {
  allCreated = []
}
function imageNode(): IFakeNode {
  const node = allCreated.find((n) => n.viewName === 'RCTImageView')
  if (!node) throw new Error('no RCTImageView was created')
  return node
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// ---- fake resolver: a require() number expands to a resolved source -----

const ASSET_ID = 42
setImageSourceResolver((source) =>
  source === ASSET_ID ? { uri: 'asset://42', scale: 1, width: 10, height: 10 } : source,
)

// ---- case 1: object source becomes a one-element array ------------------

reset()
mount(80, defineComponent({ setup: () => () => h(Image, { source: { uri: 'http://x/y.png' }, onLoad: () => {} }) }))
await tick()

{
  const source = imageNode().props.source
  check('A1 object source becomes a one-element array', Array.isArray(source) && source.length === 1)
  check('A2 source[0] is the object verbatim', Array.isArray(source) && JSON.stringify(source[0]) === JSON.stringify({ uri: 'http://x/y.png' }))
}

// ---- case 2: a require()-style number is resolved, then wrapped ----------

reset()
mount(81, defineComponent({ setup: () => () => h(Image, { source: ASSET_ID }) }))
await tick()

{
  const source = imageNode().props.source
  const wanted = { uri: 'asset://42', scale: 1, width: 10, height: 10 }
  check('A3 require()-number is resolved via the injected resolver', Array.isArray(source) && JSON.stringify(source[0]) === JSON.stringify(wanted))
}

// ---- case 3: onLoad fires from the captured native event ----------------

reset()
let loadedWith: ISymbioteEvent | undefined
mount(82, defineComponent({ setup: () => () => h(Image, { source: { uri: 'http://x/y.png' }, onLoad: (event: ISymbioteEvent) => { loadedWith = event } }) }))
await tick()

{
  const node = imageNode()
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(node.instanceHandle, 'topLoad', { source: { uri: 'http://x/y.png', width: 1, height: 1 } })
  check('A4 onLoad fires from the captured native event', loadedWith !== undefined)
}

// ---- case 4: W3C aliases: `src` folds to a source uri, `alt` to a11y ----

reset()
mount(83, defineComponent({ setup: () => () => h(Image, { src: 'http://x/z.png', alt: 'a kitten' }) }))
await tick()

{
  const node = imageNode()
  const source = node.props.source
  const first = Array.isArray(source) ? source[0] : undefined
  const uri = typeof first === 'object' && first !== null ? Reflect.get(first, 'uri') : undefined
  check('A5 src folds to a one-element source array', Array.isArray(source) && source.length === 1 && uri === 'http://x/z.png')
  check('A6 alt folds to accessibilityLabel', node.props.accessibilityLabel === 'a kitten')
  check('A7 alt marks the image accessible', node.props.accessible === true)
  check('A8 raw src/alt aliases do NOT reach native', !('src' in node.props) && !('alt' in node.props))
}

console.log(failures === 0 ? '\nvue-image.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
