// Headless proof of the InputAccessoryView primitive. A fake nativeFabricUIManager
// records the committed tree so we can assert the RCTInputAccessoryView Fabric view
// name, that nativeID/backgroundColor/style reach the node, that children nest under
// it, and that a TextInput carries inputAccessoryViewID — no simulator needed.

import { type ReactElement } from 'react'
import { Text, TextInput, View, mount } from '@symbiote/react'
// InputAccessoryView isn't on the barrel yet (the parent wires exports), so reach the
// source directly — the headless harness has no built dist.
import { InputAccessoryView } from '../../packages/react/src/input-accessory-view'

// ---- fake Fabric slot ---------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

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
  completeRoot(): void {},
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- the app ------------------------------------------------------------

const NATIVE_ID = 'accessory-1'
const BACKGROUND_COLOR = '#eee'

function App(): ReactElement {
  return (
    <View>
      <TextInput inputAccessoryViewID={NATIVE_ID} />
      <InputAccessoryView
        nativeID={NATIVE_ID}
        backgroundColor={BACKGROUND_COLOR}
        style={{ flex: 1 }}
      >
        <Text>Done</Text>
      </InputAccessoryView>
    </View>
  )
}

// ---- helpers ------------------------------------------------------------

function serializeNode(node: FakeNode): string {
  const kids = node.children.length ? `(${node.children.map(serializeNode).join('')})` : ''
  return `${node.viewName}${kids}`
}

// ---- run ----------------------------------------------------------------

const ROOT_TAG = 31
mount(ROOT_TAG, <App />)

const accessory = allCreated.find((node) => node.viewName === 'RCTInputAccessoryView')
if (!accessory) throw new Error('no RCTInputAccessoryView was created')

// nativeID / backgroundColor reach the node.
if (accessory.props.nativeID !== NATIVE_ID) {
  throw new Error(`nativeID did not pass through: ${JSON.stringify(accessory.props)}`)
}
if (accessory.props.backgroundColor !== BACKGROUND_COLOR) {
  throw new Error(`backgroundColor did not pass through: ${JSON.stringify(accessory.props)}`)
}
// shared flattens `style` onto the top-level props payload.
if (accessory.props.flex !== 1) {
  throw new Error(`style did not pass through: ${JSON.stringify(accessory.props)}`)
}

// Children nest under the accessory node.
if (accessory.children.length !== 1 || accessory.children[0].viewName !== 'RCTText') {
  throw new Error(`children did not nest: ${serializeNode(accessory)}`)
}

// The TextInput references the accessory by id.
const input = allCreated.find((node) => node.viewName === 'RCTSinglelineTextInputView')
if (!input) throw new Error('no TextInput was created')
if (input.props.inputAccessoryViewID !== NATIVE_ID) {
  throw new Error(`inputAccessoryViewID did not reach the input: ${JSON.stringify(input.props)}`)
}

console.log('input-accessory-view.smoke OK')
