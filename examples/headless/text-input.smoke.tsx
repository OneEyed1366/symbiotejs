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
import { Keyboard, mount } from '@symbiote/react'
import { TextInput } from '../../adapters/react/src/text-input'

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

// ---- case 5: Keyboard.dismiss blurs the currently-focused input ----------
// Focusing an input registers it as the app-wide focused input (TextInputState);
// Keyboard.dismiss then blurs it via the native `blur` view command, with no ref.

reset()
mount(14, <TextInput value="focus me" />)

{
  const node = inputNode(SINGLELINE)
  if (!eventHandler) throw new Error('no event handler was registered')
  // Native reports focus -> TextInput records this node as the focused one.
  eventHandler(node.instanceHandle, 'topFocus', {})
  Keyboard.dismiss()
  const blur = commands.find((c) => c.name === 'blur')
  if (!blur) {
    throw new Error('Keyboard.dismiss should blur the focused input via a blur command')
  }
  // A second dismiss has nothing focused -> must be a no-op (no new blur command).
  commands.length = 0
  Keyboard.dismiss()
  if (commands.some((c) => c.name === 'blur')) {
    throw new Error('Keyboard.dismiss must be a no-op when nothing holds focus')
  }
}

// ---- case 6: modern W3C aliases fold to their legacy native props --------
// RN translates inputMode/enterKeyHint/readOnly/selectionColor in JS before they reach the
// native input; symbiote must do the same and must not leak the raw aliases to Fabric.

reset()
mount(15, <TextInput inputMode="numeric" enterKeyHint="done" readOnly selectionColor="#ff0000" />)

{
  const node = inputNode(SINGLELINE)
  if (node.props.keyboardType !== 'number-pad') {
    throw new Error(`inputMode="numeric" should fold to keyboardType "number-pad", got ${JSON.stringify(node.props.keyboardType)}`)
  }
  if (node.props.returnKeyType !== 'done') {
    throw new Error(`enterKeyHint="done" should fold to returnKeyType "done", got ${JSON.stringify(node.props.returnKeyType)}`)
  }
  if (node.props.editable !== false) {
    throw new Error(`readOnly should fold to editable:false, got ${JSON.stringify(node.props.editable)}`)
  }
  if (node.props.cursorColor !== '#ff0000') {
    throw new Error(`selectionColor should default cursorColor, got ${JSON.stringify(node.props.cursorColor)}`)
  }
  for (const raw of ['inputMode', 'enterKeyHint', 'readOnly']) {
    if (raw in node.props) {
      throw new Error(`raw alias "${raw}" must not reach Fabric, found ${JSON.stringify(node.props[raw])}`)
    }
  }
}

// ---- case 7: autoComplete folds + showSoftInputOnFocus derivation --------
// RN folds the W3C autoComplete token to the per-platform native prop
// (Android `autoComplete`, iOS `textContentType`) and derives showSoftInputOnFocus
// from inputMode. Symbiote folds platform-agnostically, so both native props appear.

reset()
mount(16, <TextInput autoComplete="email" inputMode="text" />)

{
  const node = inputNode(SINGLELINE)
  // 'email' maps to Android 'email' and iOS textContentType 'emailAddress'.
  if (node.props.autoComplete !== 'email') {
    throw new Error(`autoComplete="email" should fold to Android "email", got ${JSON.stringify(node.props.autoComplete)}`)
  }
  if (node.props.textContentType !== 'emailAddress') {
    throw new Error(`autoComplete="email" should fold to textContentType "emailAddress", got ${JSON.stringify(node.props.textContentType)}`)
  }
  // inputMode="text" (!= 'none') -> showSoftInputOnFocus true.
  if (node.props.showSoftInputOnFocus !== true) {
    throw new Error(`inputMode="text" should derive showSoftInputOnFocus:true, got ${JSON.stringify(node.props.showSoftInputOnFocus)}`)
  }
  // The raw W3C token must not also leak as some other key beyond the folded ones.
}

// inputMode="none" hides the soft keyboard (showSoftInputOnFocus:false).
reset()
mount(17, <TextInput inputMode="none" />)
{
  const node = inputNode(SINGLELINE)
  if (node.props.showSoftInputOnFocus !== false) {
    throw new Error(`inputMode="none" should derive showSoftInputOnFocus:false, got ${JSON.stringify(node.props.showSoftInputOnFocus)}`)
  }
}

// An unmapped autoComplete token passes through to Android verbatim, with no iOS type.
reset()
mount(18, <TextInput autoComplete="cc-name" />)
{
  const node = inputNode(SINGLELINE)
  if (node.props.autoComplete !== 'cc-name') {
    throw new Error(`unmapped autoComplete should pass through, got ${JSON.stringify(node.props.autoComplete)}`)
  }
  // 'cc-name' has an iOS textContentType but no Android map entry -> Android keeps the token.
  if (node.props.textContentType !== 'creditCardName') {
    throw new Error(`autoComplete="cc-name" should fold to textContentType "creditCardName", got ${JSON.stringify(node.props.textContentType)}`)
  }
}

// ---- case 8: underlineColorAndroid defaults to 'transparent' -------------
// RN hides the Material default EditText underline by defaulting
// underlineColorAndroid to 'transparent' (TextInput.js:908) and forwarding it.
// Symbiote must do the same when the prop is absent, and respect an explicit value.

reset()
mount(19, <TextInput value="x" />)
{
  const node = inputNode(SINGLELINE)
  if (node.props.underlineColorAndroid !== 'transparent') {
    throw new Error(`underlineColorAndroid should default to "transparent", got ${JSON.stringify(node.props.underlineColorAndroid)}`)
  }
}

reset()
mount(20, <TextInput value="x" underlineColorAndroid="#00ff00" />)
{
  const node = inputNode(SINGLELINE)
  if (node.props.underlineColorAndroid !== '#00ff00') {
    throw new Error(`explicit underlineColorAndroid should win, got ${JSON.stringify(node.props.underlineColorAndroid)}`)
  }
}

console.log('text-input.smoke OK')
