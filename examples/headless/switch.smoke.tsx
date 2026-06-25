// Headless proof of the Switch primitive over the same fake Fabric slot as the
// other smokes, plus a dispatchCommand recorder so we can assert the controlled
// snap-back view command. It checks: the Fabric view name `Switch`, the `value`
// prop passing through as a strict boolean, the trackColor/thumbColor/
// ios_backgroundColor -> native prop mapping, the onChange -> onValueChange
// derivation from nativeEvent.value, and a no-op-handler snap-back that must go
// down as a `setValue` command carrying the JS value native rejected. No
// simulator — a failure here is in JS, not native.

import { useState, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
// Switch isn't on the barrel yet (the parent wires exports), so reach the source
// directly — the headless harness has no built dist.
import { Switch } from '../../adapters/react/src/switch'

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
  cloneNode(node: FakeNode): FakeNode {
    const clone: FakeNode = { ...node, props: { ...node.props }, children: [...node.children] }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewChildren(node: FakeNode): FakeNode {
    const clone: FakeNode = { ...node, props: { ...node.props }, children: [] }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewProps(node: FakeNode, props: Record<string, unknown>): FakeNode {
    const clone: FakeNode = { ...node, props: { ...node.props, ...props }, children: [...node.children] }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewChildrenAndProps(node: FakeNode, props: Record<string, unknown>): FakeNode {
    const clone: FakeNode = { ...node, props: { ...node.props, ...props }, children: [] }
    allCreated.push(clone)
    return clone
  },
  createChildSet(): FakeNode[] {
    return []
  },
  appendChild(parent: FakeNode, child: FakeNode): void {
    parent.children.push(child)
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

const SWITCH_VIEW = 'Switch'

function switchNode(): FakeNode {
  const node = allCreated.find((n) => n.viewName === SWITCH_VIEW)
  if (!node) throw new Error(`no ${SWITCH_VIEW} was created`)
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

// ---- case 1: emits the Fabric view name `Switch` and passes `value` through --

reset()
mount(20, <Switch value />)

{
  const node = switchNode()
  if (node.props.value !== true) {
    throw new Error(`value prop did not pass through as true, got ${JSON.stringify(node.props.value)}`)
  }
}

// ---- case 2: an undefined value folds to a strict `false` -------------------

reset()
mount(21, <Switch />)

{
  const node = switchNode()
  if (node.props.value !== false) {
    throw new Error(`undefined value should fold to false, got ${JSON.stringify(node.props.value)}`)
  }
}

// ---- case 3: color + disabled props map to the native iOS prop names --------

reset()
mount(
  22,
  <Switch
    value
    disabled
    trackColor={{ false: '#767577', true: '#81b0ff' }}
    thumbColor="#f5dd4b"
    ios_backgroundColor="#3e3e3e"
  />,
)

// The commit engine flattens `style` and drops undefined props, so we read the
// node's committed props directly. `onTintColor` is the canonical ON-track name and
// now reaches Fabric as a real prop: the shared ViewConfig declares Switch's only
// event as `change`, so routeProp does NOT mistake `onTintColor` for a listener.
{
  const node = switchNode()
  if (node.props.onTintColor !== '#81b0ff') {
    throw new Error(`trackColor.true should map to onTintColor, got ${JSON.stringify(node.props.onTintColor)}`)
  }
  if (node.props.tintColor !== '#767577') {
    throw new Error(`trackColor.false should map to tintColor, got ${JSON.stringify(node.props.tintColor)}`)
  }
  if (node.props.thumbTintColor !== '#f5dd4b') {
    throw new Error(`thumbColor should map to thumbTintColor, got ${JSON.stringify(node.props.thumbTintColor)}`)
  }
  if (node.props.disabled !== true) {
    throw new Error(`disabled did not pass through, got ${JSON.stringify(node.props.disabled)}`)
  }
  // ios_backgroundColor folds into the style, which the commit engine flattens
  // onto the node, so backgroundColor lands as a top-level committed prop.
  if (node.props.backgroundColor !== '#3e3e3e') {
    throw new Error(`ios_backgroundColor should fold into backgroundColor, got ${JSON.stringify(node.props.backgroundColor)}`)
  }
}

// ---- case 4: onChange -> onValueChange derives from nativeEvent.value --------

reset()
let changedValue: boolean | undefined
let rawEventValue: unknown
mount(
  23,
  <Switch
    value={false}
    onValueChange={(v) => {
      changedValue = v
    }}
    onChange={(event) => {
      rawEventValue = event.nativeEvent.value
    }}
  />,
)

{
  const node = switchNode()
  fireChange(node, { value: true })
  if (changedValue !== true) {
    throw new Error(`onValueChange did not fire with true, got ${JSON.stringify(changedValue)}`)
  }
  if (rawEventValue !== true) {
    throw new Error(`onChange did not receive the raw event, got ${JSON.stringify(rawEventValue)}`)
  }
}

// ---- case 5: a no-op handler snaps native back via a setValue command --------
// A controlled Switch whose onValueChange is a no-op: the parent never updates
// `value`, so it stays false. Native toggles itself on and reports true; JS
// rejects it, so the component must command the rejected `false` back down.

reset()

function Stuck(): ReactElement {
  // value is pinned false; the handler deliberately ignores the new value.
  const [value] = useState(false)
  return <Switch value={value} onValueChange={() => {}} />
}

mount(24, <Stuck />)

{
  const node = switchNode()
  fireChange(node, { value: true })

  const setValue = commands.find((c) => c.name === 'setValue')
  if (!setValue) {
    throw new Error('expected a setValue command after a rejected (no-op handler) toggle')
  }
  if (setValue.args[0] !== false) {
    throw new Error(`setValue should snap native back to false, got ${JSON.stringify(setValue.args[0])}`)
  }
}

// ---- case 6: an accepted toggle issues NO snap-back command -----------------
// When the parent DOES update `value` to match native, JS and native agree, so
// no corrective command should fire.

reset()

function Accepting(): ReactElement {
  const [value, setValue] = useState(false)
  return <Switch value={value} onValueChange={setValue} />
}

mount(25, <Accepting />)

{
  const node = switchNode()
  fireChange(node, { value: true })

  if (commands.some((c) => c.name === 'setValue')) {
    throw new Error('an accepted toggle must NOT issue a snap-back setValue command')
  }
}

console.log('switch.smoke OK')
