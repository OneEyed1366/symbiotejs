// Headless proof of the Android StatusBar background/translucent routing — the Android
// native module is a DIFFERENT shape from iOS (setColor(int, animated) / setTranslucent),
// so it gets its own smoke importing status-bar.android directly (Metro's .android picker
// isn't active under tsx). Two fakes, no emulator: a fake nativeFabricUIManager slot
// (mount commits a tree) and a fake __turboModuleProxy returning a StatusBarManager that
// records its calls. We also wire a real color processor (setColorProcessor) so the smoke
// proves setBackgroundColor hands native a PROCESSED int, not the raw CSS string.

import { type ReactElement } from 'react'
import { View, mount } from '@symbiote/react'
import { setColorProcessor } from '@symbiote/engine'
import { StatusBar } from '../../adapters/react/src/status-bar.android'

// ---- fake Fabric slot ---------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

let committed: FakeNode[] = []

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    return { tag, viewName, props, children: [], instanceHandle }
  },
  cloneNode(node: FakeNode): FakeNode {
    return { ...node, children: [...node.children] }
  },
  cloneNodeWithNewChildren(node: FakeNode): FakeNode {
    return { ...node, children: [] }
  },
  cloneNodeWithNewProps(node: FakeNode, props: Record<string, unknown>): FakeNode {
    return { ...node, props: { ...node.props, ...props } }
  },
  cloneNodeWithNewChildrenAndProps(node: FakeNode, props: Record<string, unknown>): FakeNode {
    return { ...node, props: { ...node.props, ...props }, children: [] }
  },
  createChildSet(): FakeNode[] {
    return []
  },
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
  registerEventHandler(): void {},
}

// ---- fake Android StatusBarManager native module ------------------------

interface RecordedCall {
  method: string
  args: unknown[]
}

const recorded: RecordedCall[] = []
const STATUS_BAR_HEIGHT = 24

const fakeStatusBarManager = {
  setStyle(statusBarStyle: string): void {
    recorded.push({ method: 'setStyle', args: [statusBarStyle] })
  },
  setHidden(hidden: boolean): void {
    recorded.push({ method: 'setHidden', args: [hidden] })
  },
  setColor(color: number, animated: boolean): void {
    recorded.push({ method: 'setColor', args: [color, animated] })
  },
  setTranslucent(translucent: boolean): void {
    recorded.push({ method: 'setTranslucent', args: [translucent] })
  },
  getConstants(): { HEIGHT: number } {
    return { HEIGHT: STATUS_BAR_HEIGHT }
  },
}

const registeredModules: Record<string, unknown> = { StatusBarManager: fakeStatusBarManager }

// The fake proxy hands back a value the caller typed as T; this one guard is the fake's
// own trust boundary (the real native proxy returns a HostObject directly).
function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

Object.assign(globalThis, {
  nativeFabricUIManager: slot,
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name]
    if (module === undefined || module === null) return null
    if (!isType<T>(module)) return null
    return module
  },
})

// Wire a real color processor: '#ff0000' (RGB red, full alpha) -> the 0xAARRGGBB int RN
// would produce. This proves setBackgroundColor processes the string before native.
const RED_HEX = '#ff0000'
const RED_INT = 0xffff0000 // ARGB: opaque red
setColorProcessor((value) => (value === RED_HEX ? RED_INT : value))

// ---- helpers ------------------------------------------------------------

function find(method: string): RecordedCall | undefined {
  return recorded.find((call) => call.method === method)
}

function findAll(method: string): RecordedCall[] {
  return recorded.filter((call) => call.method === method)
}

// ---- 1) static setBackgroundColor routes a processed int ----------------

StatusBar.setBackgroundColor(RED_HEX)
const staticColor = find('setColor')
if (!staticColor) throw new Error('setBackgroundColor did not call StatusBarManager.setColor')
if (staticColor.args[0] !== RED_INT) {
  throw new Error(`setColor got a non-processed color: ${JSON.stringify(staticColor.args)}`)
}
if (staticColor.args[1] !== false) {
  throw new Error(`setColor default animated should be false: ${JSON.stringify(staticColor.args)}`)
}

// ---- 2) static setTranslucent routes the boolean ------------------------

StatusBar.setTranslucent(true)
const staticTranslucent = find('setTranslucent')
if (!staticTranslucent || staticTranslucent.args[0] !== true) {
  throw new Error(`setTranslucent(true) routed wrong: ${JSON.stringify(staticTranslucent?.args)}`)
}

// ---- 3) currentHeight reads the native constant -------------------------

if (StatusBar.currentHeight !== STATUS_BAR_HEIGHT) {
  throw new Error(`currentHeight expected ${STATUS_BAR_HEIGHT}, got ${String(StatusBar.currentHeight)}`)
}

// ---- 4) component props drive setColor / setTranslucent -----------------

recorded.length = 0 // forget the static calls; assert the component-driven ones

const BAR_STYLE = 'light-content'

function App(): ReactElement {
  return (
    <View>
      <StatusBar barStyle={BAR_STYLE} backgroundColor={RED_HEX} translucent />
    </View>
  )
}

const ROOT_TAG = 42
mount(ROOT_TAG, <App />)

// StatusBar renders null, so the committed tree is just the View.
if (committed.length !== 1 || committed[0].viewName !== 'RCTView') {
  throw new Error(`expected a single RCTView, got: ${JSON.stringify(committed.map((n) => n.viewName))}`)
}

const propColor = find('setColor')
if (!propColor || propColor.args[0] !== RED_INT) {
  throw new Error(`prop backgroundColor did not route a processed int: ${JSON.stringify(propColor?.args)}`)
}
const propTranslucent = find('setTranslucent')
if (!propTranslucent || propTranslucent.args[0] !== true) {
  throw new Error(`prop translucent did not route true: ${JSON.stringify(propTranslucent?.args)}`)
}

// setStyle still fires for barStyle, and exactly once per effect run.
if (findAll('setStyle').length !== 1 || find('setStyle')?.args[0] !== BAR_STYLE) {
  throw new Error(`barStyle routing changed: ${JSON.stringify(findAll('setStyle'))}`)
}

console.log('status-bar-android.smoke OK')
