// Headless proof of the JS pipeline: a fake nativeFabricUIManager records the
// Fabric calls our renderer makes. This validates R2 (shared's mutation ->
// clone-on-write translation), the React mutation host config, and the event
// round-trip end to end — with no simulator. A failure here is in JS, not
// native, which is exactly the isolation the React canary is meant to provide.

import { useState, type ReactElement } from 'react'
import { View, Text, mount } from '@symbiote/react'

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
  // Faithful persistent semantics: a clone is a new identity. NewProps replaces
  // the payload; the "...Children" variants reset children (the engine re-appends).
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

function serialize(nodes: FakeNode[]): string {
  return nodes.map(serializeNode).join('')
}
function serializeNode(node: FakeNode): string {
  const text = node.viewName === 'RCTRawText' ? ` "${String(node.props.text)}"` : ''
  const kids = node.children.length ? `(${node.children.map(serializeNode).join('')})` : ''
  return `${node.viewName}${text}${kids}`
}

// ---- run ----------------------------------------------------------------

const ROOT_TAG = 11
mount(ROOT_TAG, <Counter />)

expect(
  'initial mount paints View > Text > RawText',
  serialize(committed),
  'RCTView(RCTText(RCTRawText "count: 0"))',
)

const view = allCreated.find((node) => node.viewName === 'RCTView')
if (!view) {
  console.log('FAIL  no RCTView was created')
  failures += 1
} else if (!eventHandler) {
  console.log('FAIL  no event handler was registered')
  failures += 1
} else {
  // Fire a tap: Fabric hands the View's instanceHandle straight back. A press is
  // an honest gesture — a touch that starts and ends on the same node.
  eventHandler(view.instanceHandle, 'topTouchStart', {})
  eventHandler(view.instanceHandle, 'topTouchEnd', {})
  expect(
    'tap increments the counter and recommits',
    serialize(committed),
    'RCTView(RCTText(RCTRawText "count: 1"))',
  )
}

console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
