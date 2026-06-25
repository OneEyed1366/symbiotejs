// Headless proof of the Keyboard module + KeyboardAvoidingView — the first
// consumers of the native->JS event bridge, no simulator. A fake Fabric slot
// records the committed tree; a fake RN$registerCallableModule captures the device
// hub; a fake __turboModuleProxy returns a KeyboardObserver with observe-counters.
// We mount a padding KeyboardAvoidingView, give the wrapper a frame via topLayout,
// then play "native" by emitting keyboardDidShow/Hide and assert the wrapper's
// paddingBottom tracks the computed inset. A direct Keyboard.addListener check
// proves the module subscribes, receives the payload, and unsubscribes.

import { type ReactElement } from 'react'
import { Text, mount } from '@symbiote/react'

// act flushes ALL pending lanes (a plain device emit schedules setInset on a lane
// that the Fabric-event flush path doesn't drain). The flag lets act flush
// synchronously without the "not configured for act" warning in a bare process.
import { KeyboardAvoidingView } from '../../adapters/react/src/keyboard-avoiding-view'
import { Keyboard } from '../../adapters/react/src/keyboard'

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
  cloneNodeWithNewProps: (node: FakeNode, newProps: Record<string, unknown>): FakeNode => {
    const clone: FakeNode = { ...node, props: newProps }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => {
    const clone: FakeNode = { ...node, props: newProps, children: [] }
    allCreated.push(clone)
    return clone
  },
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

// ---- fake native-module + device-hub globals ----------------------------

let keyboardAdded = 0
let keyboardRemoved = 0
const fakeKeyboardObserver = {
  addListener: (): void => {
    keyboardAdded += 1
  },
  removeListeners: (count: number): void => {
    keyboardRemoved += count
  },
}
const registeredModules: Record<string, unknown> = { KeyboardObserver: fakeKeyboardObserver }

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined

Object.assign(globalThis, {
  nativeFabricUIManager: slot,
  // Trailing comma on the type param: in a .tsx file a bare <T> reads as JSX.
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name]
    if (module === undefined || module === null) return null
    if (!isType<T>(module)) return null
    return module
  },
  RN$registerCallableModule: (
    name: string,
    factory: () => { emit: (eventType: string, ...args: unknown[]) => void },
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory()
  },
})

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ---- helpers ------------------------------------------------------------

// The current committed wrapper node (the outer RCTView KeyboardAvoidingView
// renders). Re-read after each commit since clone-on-write hands back new nodes.
function currentWrapper(): FakeNode {
  // committed[0] is the synthetic AppContainer root (RCTView, box-none); the
  // KeyboardAvoidingView's own RCTView wrapper is its single child.
  const wrapper = committed[0]?.children[0]
  if (wrapper === undefined || wrapper.viewName !== 'RCTView') {
    throw new Error(`expected an RCTView wrapper under the root, got ${JSON.stringify(committed)}`)
  }
  return wrapper
}

// ---- case 1: direct Keyboard.addListener ---------------------------------

{
  let received: unknown
  const sub = Keyboard.addListener('keyboardDidShow', (payload) => {
    received = payload
  })
  if (deviceHub === undefined) {
    throw new Error('Keyboard.addListener must install the device hub')
  }
  if (keyboardAdded < 1) {
    throw new Error('Keyboard.addListener must ping the observer addListener counter')
  }

  deviceHub.emit('keyboardDidShow', { endCoordinates: { height: 300, screenY: 500 } })
  if (
    !isRecord(received) ||
    !isRecord(received.endCoordinates) ||
    received.endCoordinates.height !== 300
  ) {
    throw new Error(`direct listener should get the native payload, got ${JSON.stringify(received)}`)
  }

  const removedBefore = keyboardRemoved
  received = undefined
  sub.remove()
  if (keyboardRemoved !== removedBefore + 1) {
    throw new Error('remove() must ping the observer removeListeners(1)')
  }
  deviceHub.emit('keyboardDidShow', { endCoordinates: { height: 0, screenY: 800 } })
  if (received !== undefined) throw new Error('a removed listener must not fire')
}

// ---- case 2: KeyboardAvoidingView reacts to the keyboard -----------------

const SCREEN_HEIGHT = 800
const FRAME_Y = 0
const KEYBOARD_HEIGHT = 300
// Keyboard top edge sits KEYBOARD_HEIGHT up from the screen bottom.
const KEYBOARD_SCREEN_Y = SCREEN_HEIGHT - KEYBOARD_HEIGHT // 500
// inset = max(0, frameY + frameHeight - keyboardY) = 0 + 800 - 500 = 300.
const EXPECTED_INSET = FRAME_Y + SCREEN_HEIGHT - KEYBOARD_SCREEN_Y

function App(): ReactElement {
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Text>type here</Text>
    </KeyboardAvoidingView>
  )
}

const ROOT_TAG = 41

// No act() needed: the device hub routes its emit through shared's dispatch seam,
// which the React adapter wires to discrete-lane + flushSyncWork — the same flush
// Fabric touch events get. So a hub.emit paints synchronously, like the real device.
mount(ROOT_TAG, <App />)

if (eventHandler === undefined) throw new Error('no Fabric event handler was registered')
if (deviceHub === undefined) throw new Error('device hub must be installed by now')
// Capture into a const so the flushReact closures below keep the narrowed type
// (a mutable `let` widens back to `| undefined` inside a callback).
const hub = deviceHub

const WRAPPER_FRAME = { x: 0, y: FRAME_Y, width: 400, height: SCREEN_HEIGHT }

// Give the wrapper its measured frame so the inset math has frame.y / frame.height.
// handleLayout writes a ref (no state), so no flush needed here.
{
  const wrapper = currentWrapper()
  eventHandler(wrapper.instanceHandle, 'topLayout', { layout: WRAPPER_FRAME })
}

// Before the keyboard shows, padding must be absent or zero.
{
  const before = currentWrapper().props.paddingBottom
  if (before !== undefined && before !== 0) {
    throw new Error(`expected no padding before keyboard, got ${JSON.stringify(before)}`)
  }
}

// Play native: keyboard shows.
hub.emit('keyboardDidShow', {
  endCoordinates: { height: KEYBOARD_HEIGHT, screenY: KEYBOARD_SCREEN_Y },
})

{
  const after = currentWrapper().props.paddingBottom
  if (after !== EXPECTED_INSET) {
    throw new Error(`paddingBottom should be ${EXPECTED_INSET} after show, got ${JSON.stringify(after)}`)
  }
}

// Play native: keyboard hides — inset must clear.
hub.emit('keyboardDidHide', {
  endCoordinates: { height: 0, screenY: SCREEN_HEIGHT },
})

{
  const cleared = currentWrapper().props.paddingBottom
  if (cleared !== 0) {
    throw new Error(`paddingBottom should clear to 0 after hide, got ${JSON.stringify(cleared)}`)
  }
}

console.log('keyboard-avoiding-view.smoke OK')
