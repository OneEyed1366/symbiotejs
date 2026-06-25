// Headless proof of the StatusBar primitive — the first JS->native consumer of the
// native-module bridge. Two fakes, no simulator: a fake nativeFabricUIManager slot
// (because mount commits a tree) and a fake __turboModuleProxy returning a
// StatusBarManager that records its calls. We mount <View><StatusBar .../></View>
// and assert StatusBar's effect drove the recorded native setters with the values
// our prop->method mapping sends.

import { type ReactElement } from 'react'
import { View, mount } from '@symbiote/react'
// StatusBar isn't on the barrel yet (the parent wires exports), so reach the source
// directly — the headless harness has no built dist.
import { StatusBar } from '../../adapters/react/src/status-bar'

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

// ---- fake StatusBarManager native module --------------------------------

interface RecordedCall {
  method: string
  args: unknown[]
}

const recorded: RecordedCall[] = []

const fakeStatusBarManager = {
  setStyle(statusBarStyle: string, animated: boolean): void {
    recorded.push({ method: 'setStyle', args: [statusBarStyle, animated] })
  },
  setHidden(hidden: boolean, withAnimation: string): void {
    recorded.push({ method: 'setHidden', args: [hidden, withAnimation] })
  },
  setNetworkActivityIndicatorVisible(visible: boolean): void {
    recorded.push({ method: 'setNetworkActivityIndicatorVisible', args: [visible] })
  },
}

const registeredModules: Record<string, unknown> = { StatusBarManager: fakeStatusBarManager }

// The fake proxy hands back a value the caller typed as T; this one guard is the
// fake's own trust boundary (the real native proxy returns a HostObject directly).
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

// ---- the app ------------------------------------------------------------

const BAR_STYLE = 'dark-content'

function App(): ReactElement {
  return (
    <View>
      <StatusBar barStyle={BAR_STYLE} hidden animated />
    </View>
  )
}

// ---- helpers ------------------------------------------------------------

function find(method: string): RecordedCall | undefined {
  return recorded.find((call) => call.method === method)
}

// ---- run ----------------------------------------------------------------

const ROOT_TAG = 41
mount(ROOT_TAG, <App />)

// StatusBar renders null, so the committed tree is just the View.
if (committed.length !== 1 || committed[0].viewName !== 'RCTView') {
  throw new Error(`expected a single RCTView, got: ${JSON.stringify(committed.map((n) => n.viewName))}`)
}

const styleCall = find('setStyle')
if (!styleCall) throw new Error('StatusBarManager.setStyle was never called')
// barStyle="dark-content", animated -> setStyle('dark-content', true)
if (styleCall.args[0] !== BAR_STYLE || styleCall.args[1] !== true) {
  throw new Error(`setStyle got wrong args: ${JSON.stringify(styleCall.args)}`)
}

const hiddenCall = find('setHidden')
if (!hiddenCall) throw new Error('StatusBarManager.setHidden was never called')
// hidden + animated -> setHidden(true, 'fade') (RN's default animated transition)
if (hiddenCall.args[0] !== true || hiddenCall.args[1] !== 'fade') {
  throw new Error(`setHidden got wrong args: ${JSON.stringify(hiddenCall.args)}`)
}

// networkActivityIndicatorVisible was not passed -> its setter must not fire.
if (find('setNetworkActivityIndicatorVisible')) {
  throw new Error('setNetworkActivityIndicatorVisible fired without the prop')
}

console.log('status-bar.smoke OK')
