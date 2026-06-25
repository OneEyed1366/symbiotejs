/** @jsxRuntime automatic */
// Headless proof of ImageBackground over the same fake Fabric slot as image.smoke.
// ImageBackground is pure JS composition: an outer RCTView (gets the wrapper style)
// wrapping an absolute-fill RCTImageView, with the children painted ON TOP — i.e.
// after the image in the wrapper's child order. This asserts that shape. No simulator.

import { mount } from '@symbiote/react'
import { Text } from '../../adapters/react/src/components'
import { ImageBackground } from '../../adapters/react/src/image-background'

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

// ---- the app ------------------------------------------------------------

const WRAPPER_STYLE = { width: 100, height: 80 }
const SOURCE = { uri: 'http://x/bg.png' }
const OVERLAY_TEXT = 'on top'

mount(
  14,
  <ImageBackground style={WRAPPER_STYLE} source={SOURCE} resizeMode="cover">
    <Text>{OVERLAY_TEXT}</Text>
  </ImageBackground>,
)

// ---- assert: wrapper RCTView gets the wrapper style ----------------------

// Skip the synthetic AppContainer root (RCTView, pointerEvents box-none) that now
// wraps every commit — the ImageBackground wrapper is the app's own RCTView.
const wrapper = allCreated.find(
  (node) => node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none',
)
if (!wrapper) throw new Error('no wrapper RCTView was created')
if (wrapper.props.width !== WRAPPER_STYLE.width || wrapper.props.height !== WRAPPER_STYLE.height) {
  throw new Error(`wrapper RCTView missing wrapper style: ${JSON.stringify(wrapper.props)}`)
}

// ---- assert: inner RCTImageView is absolute-fill with the resolved source -

const image = allCreated.find((node) => node.viewName === 'RCTImageView')
if (!image) throw new Error('no inner RCTImageView was created')
if (image.props.position !== 'absolute') {
  throw new Error(`inner image must be absolute, got ${JSON.stringify(image.props.position)}`)
}
{
  const source = image.props.source
  if (!Array.isArray(source) || source.length !== 1) {
    throw new Error(`image source must be a one-element array, got ${JSON.stringify(source)}`)
  }
  if (JSON.stringify(source[0]) !== JSON.stringify(SOURCE)) {
    throw new Error(`unexpected image source: ${JSON.stringify(source[0])}`)
  }
}
// Wrapper width/height are proxied onto the image so it fills the box.
if (image.props.width !== WRAPPER_STYLE.width || image.props.height !== WRAPPER_STYLE.height) {
  throw new Error(`wrapper dimensions not proxied to image: ${JSON.stringify(image.props)}`)
}

// ---- assert: children render on top (after the image in child order) -----

// committed[0] is the synthetic AppContainer root; the ImageBackground wrapper is its
// single child.
if (committed.length !== 1) throw new Error(`expected one committed root child, got ${committed.length}`)
const committedWrapper = committed[0].children[0]
if (committedWrapper === undefined || committedWrapper.viewName !== 'RCTView') {
  throw new Error(`committed wrapper must be an RCTView, got ${committedWrapper?.viewName}`)
}

const childNames = committedWrapper.children.map((child) => child.viewName)
const imageIndex = childNames.indexOf('RCTImageView')
const textIndex = childNames.findIndex((name) => name === 'RCTText' || name === 'RCTParagraph')
if (imageIndex === -1) throw new Error(`image not a child of wrapper: ${JSON.stringify(childNames)}`)
if (textIndex === -1) throw new Error(`text child not found under wrapper: ${JSON.stringify(childNames)}`)
if (!(imageIndex < textIndex)) {
  throw new Error(`text must render after image (on top), got order ${JSON.stringify(childNames)}`)
}

// Touch the event handler ref so the slot's registration is exercised, matching
// the sibling smokes' slot shape.
if (!eventHandler) throw new Error('no event handler was registered')

console.log('image-background.smoke OK')
