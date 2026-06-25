// Headless proof that the COLOR_PROPS set runs every RN color style key through the
// injected platform processor before Fabric. Fabric's C++ color parser silently drops CSS
// strings, so a color key MUST reach the slot as a processed value (an int here), never the
// raw 'red'. We mount a View with the logical/writing-direction color keys that were missing
// from COLOR_PROPS (borderStartColor / textShadowColor / outlineColor / …) and assert each
// committed prop is the PROCESSED sentinel, not the input string. A failure here is a missing
// COLOR_PROPS entry. A processed key proves the drift fix.

import { type ReactElement } from 'react'
import { mount, View } from '@symbiote/react'
import { setColorProcessor } from '@symbiote/engine'

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

// Injected processor: a real RN processColor turns 'red' into a platform int. Here a
// sentinel int proves the key passed through processValue (COLOR_PROPS.has(key)) rather
// than reaching Fabric as the raw string.
const PROCESSED_COLOR = 0xff0000ff
setColorProcessor(() => PROCESSED_COLOR)

// The color keys that were missing from COLOR_PROPS — each must now be processed.
const COLOR_KEYS = [
  'borderStartColor',
  'borderEndColor',
  'borderBlockColor',
  'borderBlockStartColor',
  'borderBlockEndColor',
  'textShadowColor',
  'overlayColor',
  'outlineColor',
] as const

function App(): ReactElement {
  const style: Record<string, unknown> = {}
  for (const key of COLOR_KEYS) style[key] = 'red'
  return <View style={style} />
}
mount(13, <App />)

// The first RCTView carrying a color key is the app's View — NOT the synthetic root
// container shared wraps every surface in (which only holds flex/pointerEvents).
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
const view = find(root, (n) => n.viewName === 'RCTView' && COLOR_KEYS.some((k) => k in n.props))
if (!view) throw new Error('no styled RCTView committed')

for (const key of COLOR_KEYS) {
  const value = view.props[key]
  if (value === 'red') {
    throw new Error(`COLOR_PROPS is missing "${key}": it reached Fabric as the raw string 'red'`)
  }
  if (value !== PROCESSED_COLOR) {
    throw new Error(`"${key}" should be the processed int ${PROCESSED_COLOR}, got ${String(value)}`)
  }
}

// Reset so a later smoke in the same process sees the identity processor again.
setColorProcessor((value) => value)

console.log(`color-props: ${COLOR_KEYS.length} color keys processed`)
console.log('color-props.smoke OK')
