/** @jsxRuntime automatic */
// Headless proof of the TextInput primitive — the controlled-value / event-count
// handshake — over the same fake Fabric slot as smoke.tsx, plus a dispatchCommand
// recorder so we can assert the setTextAndSelection view command. It checks the
// fold (value/defaultValue -> private `text` + mostRecentEventCount), the
// onChange -> onChangeText derivation, the multiline intrinsic, and a forced
// controlled write (value diverges from what native reported) that must go down
// as a setTextAndSelection command carrying the acknowledged event count. No
// simulator — a failure here is in JS, not native.

import { useState, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { TextInput } from '../../packages/react/src/text-input'

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

interface CommandCall {
  handle: unknown
  name: string
  args: readonly unknown[]
}

let committed: FakeNode[] = []
let eventHandler: EventHandler | undefined
const allCreated: FakeNode[] = []
const commands: CommandCall[] = []

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
  dispatchCommand(handle: unknown, name: string, args: readonly unknown[]): void {
    commands.push({ handle, name, args })
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ------------------------------------------------------------

function inputNode(viewName: string): FakeNode {
  const node = allCreated.find((n) => n.viewName === viewName)
  if (!node) throw new Error(`no ${viewName} was created`)
  return node
}

// The event handler is registered once for the whole slot, so reset() keeps it —
// only the per-mount node/command bookkeeping is cleared.
function reset(): void {
  committed = []
  allCreated.length = 0
  commands.length = 0
}

function fireChange(node: FakeNode, nativeEvent: Record<string, unknown>): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(node.instanceHandle, 'topChange', nativeEvent)
}

// ---- case 1: controlled value folds into text + mostRecentEventCount -----

const SINGLELINE = 'RCTSinglelineTextInputView'
const MULTILINE = 'RCTMultilineTextInputView'

let changedText: string | undefined
mount(11, <TextInput value="hi" onChangeText={(text) => { changedText = text }} />)

{
  const node = inputNode(SINGLELINE)
  if (node.props.text !== 'hi') {
    throw new Error(`expected folded text "hi", got ${JSON.stringify(node.props.text)}`)
  }
  if (typeof node.props.mostRecentEventCount !== 'number') {
    throw new Error(`mostRecentEventCount is not a number: ${JSON.stringify(node.props.mostRecentEventCount)}`)
  }
}

// ---- case 2: onChange derives onChangeText from nativeEvent.text ---------

{
  const node = inputNode(SINGLELINE)
  fireChange(node, { text: 'hix', eventCount: 1, selection: { start: 3, end: 3 } })
  if (changedText !== 'hix') {
    throw new Error(`onChangeText did not fire with "hix", got ${JSON.stringify(changedText)}`)
  }
}

// ---- case 3: multiline selects the multiline intrinsic ------------------

reset()
mount(12, <TextInput multiline value="x" />)
inputNode(MULTILINE)

// ---- case 4: a forced controlled write goes down as setTextAndSelection --
// A real controlled component whose onChangeText UPPERCASES the text. Native
// reports "ab"; the parent stores "AB" in `value`; that diverges from the text
// native last reported, so the component must command "AB" down with the
// acknowledged event count (the count native handed us in the same change).

reset()
const ACK_COUNT = 7

function Forced(): ReactElement {
  const [value, setValue] = useState('')
  return <TextInput value={value} onChangeText={(text) => setValue(text.toUpperCase())} />
}

mount(13, <Forced />)

{
  const node = inputNode(SINGLELINE)
  // A keystroke: native reports lowercase "ab" with its counter at ACK_COUNT.
  fireChange(node, { text: 'ab', eventCount: ACK_COUNT, selection: { start: 2, end: 2 } })

  const setText = commands.find((c) => c.name === 'setTextAndSelection')
  if (!setText) {
    throw new Error('expected a setTextAndSelection command after a divergent controlled write')
  }
  if (setText.args[0] !== ACK_COUNT) {
    throw new Error(`setTextAndSelection used count ${JSON.stringify(setText.args[0])}, expected ${ACK_COUNT}`)
  }
  if (setText.args[1] !== 'AB') {
    throw new Error(`setTextAndSelection pushed ${JSON.stringify(setText.args[1])}, expected "AB"`)
  }
}

console.log('text-input.smoke OK')
