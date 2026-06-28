// Headless proof of the JS pipeline: a fake nativeFabricUIManager records the
// Fabric calls our renderer makes. This validates R2 (shared's mutation ->
// clone-on-write translation), the React mutation host config, and the event
// round-trip end to end, with no simulator. A failure here is in JS, not
// native, which is exactly the isolation the React canary is meant to provide.

import { useState, type ReactElement } from 'react'
import { View, Text, mount } from '@symbiote/react'

// ---- fake Fabric slot ---------------------------------------------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

type IEventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void

let committed: IFakeNode[] = []
let eventHandler: IEventHandler | undefined
const allCreated: IFakeNode[] = []

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  // Faithful persistent semantics: a clone is a new identity. NewProps replaces
  // the payload; the "...Children" variants reset children (the engine re-appends).
  cloneNodeWithNewProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({
    ...node,
    props: newProps,
  }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: IFakeNode,
    newProps: Record<string, unknown>,
  ): IFakeNode => ({ ...node, props: newProps, children: [] }),
  createChildSet: (): IFakeNode[] => [],
  appendChild(parent: IFakeNode, child: IFakeNode): IFakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
    childSet.push(child)
  },
  completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
    committed = childSet
  },
  registerEventHandler(handler: IEventHandler): void {
    eventHandler = handler
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- the app ------------------------------------------------------------

function Counter(): ReactElement {
  const [count, setCount] = useState(0)
  return (
    <View onPress={() => setCount((value) => value + 1)}>
      <Text>{`count: ${count}`}</Text>
    </View>
  )
}

// ---- assertions ---------------------------------------------------------

let failures = 0
function expect(label: string, actual: string, wanted: string): void {
  const ok = actual === wanted
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) console.log(`        wanted: ${wanted}\n        actual: ${actual}`)
}

function serialize(nodes: IFakeNode[]): string {
  return nodes.map(serializeNode).join('')
}
function serializeNode(node: IFakeNode): string {
  const text = node.viewName === 'RCTRawText' ? ` "${String(node.props.text)}"` : ''
  const kids = node.children.length ? `(${node.children.map(serializeNode).join('')})` : ''
  return `${node.viewName}${text}${kids}`
}

// ---- run ----------------------------------------------------------------

const ROOT_TAG = 11
mount(ROOT_TAG, <Counter />)

// Every commit is now wrapped in RN's AppContainer equivalent: one synthetic RCTView
// root (flex:1 + pointerEvents box-none). Unwrap it before asserting the app's shape.
const appRoot = committed[0]
if (committed.length !== 1 || appRoot.props.pointerEvents !== 'box-none') {
  console.log('FAIL  expected a single box-none AppContainer root')
  failures += 1
}
expect(
  'initial mount paints View > Text > RawText',
  serialize(appRoot.children),
  'RCTView(RCTText(RCTRawText "count: 0"))',
)

// Skip the synthetic AppContainer root; the app's own View is the non-box-none RCTView.
const view = allCreated.find(
  (node) => node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none',
)
if (!view) {
  console.log('FAIL  no RCTView was created')
  failures += 1
} else if (!eventHandler) {
  console.log('FAIL  no event handler was registered')
  failures += 1
} else {
  // Fire a tap: Fabric hands the View's instanceHandle straight back. A press is
  // a touch that starts and ends on the same node.
  eventHandler(view.instanceHandle, 'topTouchStart', {})
  eventHandler(view.instanceHandle, 'topTouchEnd', {})
  expect(
    'tap increments the counter and recommits',
    serialize(committed[0].children),
    'RCTView(RCTText(RCTRawText "count: 1"))',
  )
}

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
