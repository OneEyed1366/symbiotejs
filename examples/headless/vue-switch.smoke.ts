// Headless proof of the Vue Switch over the same fake Fabric slot the React switch.smoke uses,
// so the shared @symbiote/components logic (the lastNativeReport reducer + the snap-back
// decision) is exercised through Vue's reactive lifecycle: a ref for state and a flush:'post'
// watch. It checks the `value` passthrough + iOS color mapping, the onChange -> onValueChange
// derivation, the controlled SNAP-BACK command on a rejected toggle (case 3, the host node is
// held in a shallowRef so the engine's mirror resolves it; a plain ref would hand back a
// reactive Proxy and the command would silently no-op), and that an accepted toggle issues no
// command. The React twin (switch.smoke.tsx) proves the same contract through useLayoutEffect.

import { defineComponent, h, ref } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { Switch } from '../../adapters/vue/src/switch'
import type { ISymbioteEvent } from '@symbiote/engine'

// ---- fake Fabric slot (same shape as switch.smoke.tsx) ------------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

type IEventHandler = (instanceHandle: unknown, topLevelType: string, nativeEvent: Record<string, unknown>) => void

interface ICommandCall {
  handle: unknown
  name: string
  args: readonly unknown[]
}

let eventHandler: IEventHandler | undefined
let allCreated: IFakeNode[] = []
let commands: ICommandCall[] = []

const slot = {
  createNode(tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>, instanceHandle: unknown): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNode: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [...node.children] }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [] }),
  cloneNodeWithNewProps(node: IFakeNode, props: Record<string, unknown>): IFakeNode {
    const clone: IFakeNode = { ...node, props: { ...node.props, ...props }, children: [...node.children] }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewChildrenAndProps(node: IFakeNode, props: Record<string, unknown>): IFakeNode {
    const clone: IFakeNode = { ...node, props: { ...node.props, ...props }, children: [] }
    allCreated.push(clone)
    return clone
  },
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
  dispatchCommand(handle: unknown, name: string, args: readonly unknown[]): void {
    commands.push({ handle, name, args })
  },
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
  commands = []
}
function switchNode(): IFakeNode {
  const node = allCreated.find((n) => n.viewName === 'Switch')
  if (!node) throw new Error('no Switch was created')
  return node
}
function fireChange(node: IFakeNode, nativeEvent: Record<string, unknown>): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(node.instanceHandle, 'topChange', nativeEvent)
}
// A macrotask boundary drains ALL pending microtasks: the engine's coalesced commit AND the
// adapter's one-microtask-deferred snap-back command, before the assert reads them.
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// ---- case 1: value passthrough + iOS color mapping ----------------------

reset()
mount(
  40,
  defineComponent({
    setup() {
      return () =>
        h(Switch, {
          value: true,
          disabled: true,
          trackColor: { false: '#767577', true: '#81b0ff' },
          thumbColor: '#f5dd4b',
          ios_backgroundColor: '#3e3e3e',
        })
    },
  }),
)
await tick()

{
  const node = switchNode()
  check('value passes through as strict true', node.props.value === true)
  check('trackColor.true -> onTintColor (iOS)', node.props.onTintColor === '#81b0ff')
  check('trackColor.false -> tintColor (iOS)', node.props.tintColor === '#767577')
  check('thumbColor -> thumbTintColor', node.props.thumbTintColor === '#f5dd4b')
  check('disabled passes through', node.props.disabled === true)
  check('ios_backgroundColor folds into backgroundColor', node.props.backgroundColor === '#3e3e3e')
  check('onValueChange never reaches Fabric', !('onValueChange' in node.props))
}

// ---- case 2: onChange -> onValueChange derives from nativeEvent.value ----

reset()
let changedValue: boolean | undefined
let rawEventValue: unknown
mount(
  41,
  defineComponent({
    setup() {
      const value = ref(false)
      return () =>
        h(Switch, {
          value: value.value,
          onValueChange: (next: boolean) => {
            changedValue = next
            value.value = next
          },
          onChange: (event: ISymbioteEvent) => {
            rawEventValue = event.nativeEvent.value
          },
        })
    },
  }),
)
await tick()
fireChange(switchNode(), { value: true })
await tick()

check('onValueChange fired with true', changedValue === true)
check('onChange received the raw event', rawEventValue === true)

// ---- case 3: a rejected (no-op) toggle snaps native back via a setValue command ----
// RN snaps native back via a setValue command when the parent rejects the toggle (an
// onValueChange that ignores its argument). The command targets the node's COMMITTED Fabric
// handle: the host node lives in a shallowRef (a plain ref would hand back a reactive Proxy the
// engine's mirror can't resolve), so dispatchViewCommand finds it and the value goes back down.
reset()
mount(
  42,
  defineComponent({
    setup() {
      const value = ref(false) // pinned: the handler deliberately ignores the new value
      return () => h(Switch, { value: value.value, onValueChange: () => {} })
    },
  }),
)
await tick()
fireChange(switchNode(), { value: true })
await tick()

const snapBack = commands.find((c) => c.name === 'setValue')
check('rejected toggle issues a setValue snap-back command', snapBack !== undefined)
check('snap-back carries the JS value native rejected (false)', snapBack?.args[0] === false)

// ---- case 4: an accepted toggle issues NO snap-back command --------------

reset()
mount(
  43,
  defineComponent({
    setup() {
      const value = ref(false)
      return () => h(Switch, { value: value.value, onValueChange: (next: boolean) => { value.value = next } })
    },
  }),
)
await tick()
fireChange(switchNode(), { value: true })
await tick()

check('an accepted toggle issues no setValue command', !commands.some((c) => c.name === 'setValue'))

console.log(failures === 0 ? '\nvue-switch.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
