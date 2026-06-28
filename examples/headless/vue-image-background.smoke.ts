// Headless parity proof of the Vue ImageBackground over the same fake Fabric slot as the React
// image-background.smoke, the Vue twin. ImageBackground is pure JS composition: an outer RCTView
// (gets the wrapper style) wrapping an absolute-fill RCTImageView, with the slot children painted
// ON TOP (after the image in the wrapper's child order). The composition/style math is shared
// verbatim from @symbiote/components/renderImageBackground; Vue supplies only the functional bridge.
// Run after the barrel is rebuilt: ./node_modules/.bin/tsx vue-image-background.smoke.ts

import { defineComponent, h } from '@vue/runtime-core'
import { ImageBackground, Text, mount } from '../../adapters/vue/src/index'

// ---- fake Fabric slot ---------------------------------------------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

let allCreated: IFakeNode[] = []
let committed: IFakeNode[] = []

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
  completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
    committed = childSet
  },
  registerEventHandler(): void {},
  dispatchCommand(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ------------------------------------------------------------

let failures = 0
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// ---- mount ImageBackground with an overlay Text child --------------------

const WRAPPER_STYLE = { width: 100, height: 80 }
const SOURCE = { uri: 'http://x/bg.png' }

allCreated = []
mount(
  90,
  defineComponent({
    setup: () => () =>
      h(ImageBackground, { style: WRAPPER_STYLE, source: SOURCE, resizeMode: 'cover' }, () => [h(Text, {}, () => 'on top')]),
  }),
)
await tick()

// Skip the synthetic AppContainer root (RCTView, pointerEvents box-none); the wrapper is the app's own RCTView.
const wrapper = allCreated.find((n) => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none')
check('A1 wrapper RCTView created', wrapper !== undefined)
check('A2 wrapper RCTView carries the wrapper dimensions', wrapper?.props.width === 100 && wrapper?.props.height === 80)

const image = allCreated.find((n) => n.viewName === 'RCTImageView')
check('A3 inner RCTImageView created', image !== undefined)
check('A4 inner image is absolute-fill', image?.props.position === 'absolute')
check('A5 wrapper dimensions proxied onto the image', image?.props.width === 100 && image?.props.height === 80)
{
  const source = image?.props.source
  check('A6 source resolved to a one-element array', Array.isArray(source) && source.length === 1)
}

// committed[0] is the synthetic AppContainer root; the ImageBackground wrapper is its single child.
const committedWrapper = committed[0]?.children[0]
check('A7 committed wrapper is an RCTView', committedWrapper?.viewName === 'RCTView')
{
  const names = committedWrapper?.children.map((c) => c.viewName) ?? []
  const imageIndex = names.indexOf('RCTImageView')
  const textIndex = names.findIndex((name) => name === 'RCTText' || name === 'RCTParagraph')
  check('A8 image is a child of the wrapper', imageIndex !== -1)
  check('A9 overlay text is a child of the wrapper', textIndex !== -1)
  check('A10 children paint AFTER the image (on top)', imageIndex !== -1 && textIndex !== -1 && imageIndex < textIndex)
}

console.log(failures === 0 ? '\nvue-image-background.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
