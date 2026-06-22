// Headless proof of the AppRegistry entry point. RN app code registers a root with
//   AppRegistry.registerComponent(appKey, () => App)
// and the native Fabric host later runs it by key on a surface's rootTag. Our
// AppRegistry stores a runnable that calls `mount` (driving @symbiote/shared) and
// bridges that runnable to the host registrar (RN's own AppRegistry, injected via
// setHostRegistrar) so native can find it. This asserts both: the bridge fires on
// registration, and invoking the runnable mounts the tree onto the given rootTag.

import { type ReactElement } from 'react'
import {
  AppRegistry,
  setHostRegistrar,
  View,
  Text,
  type Runnable,
  type AppParameters,
} from '@symbiote/react'

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
}

let committed: FakeNode[] = []
const slot = {
  createNode: (
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
  ): FakeNode => ({ tag, viewName, props, children: [] }),
  cloneNodeWithNewProps: (node: FakeNode, newProps: Record<string, unknown>): FakeNode => ({
    ...node,
    props: { ...node.props, ...newProps },
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: { ...node.props, ...newProps }, children: [] }),
  createChildSet: (): FakeNode[] => [],
  appendChild: (parent: FakeNode, child: FakeNode): FakeNode => {
    parent.children.push(child)
    return parent
  },
  appendChildToSet: (childSet: FakeNode[], child: FakeNode): void => {
    childSet.push(child)
  },
  completeRoot: (_rootTag: number, childSet: FakeNode[]): void => {
    committed = childSet
  },
  registerEventHandler: (): void => {},
  dispatchCommand: (): void => {},
}
Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- the host registrar the native side drives (RN's AppRegistry stand-in) ----

const hostRunnables = new Map<string, Runnable>()
setHostRegistrar({
  registerRunnable: (appKey: string, run: Runnable): string => {
    hostRunnables.set(appKey, run)
    return appKey
  },
})

const APP_KEY = 'canary'
function App(): ReactElement {
  return (
    <View style={{ flex: 1 }}>
      <Text>hi</Text>
    </View>
  )
}

AppRegistry.registerComponent(APP_KEY, () => App)

// ---- the bridge fired: native can now find our runnable by key -------------

if (!AppRegistry.getAppKeys().includes(APP_KEY)) {
  throw new Error(`getAppKeys missing "${APP_KEY}": ${JSON.stringify(AppRegistry.getAppKeys())}`)
}
const hostRun = hostRunnables.get(APP_KEY)
if (hostRun === undefined) {
  throw new Error('registerComponent did not bridge the runnable to the host registrar')
}

function find(nodes: FakeNode[], viewName: string): FakeNode | undefined {
  for (const node of nodes) {
    if (node.viewName === viewName) return node
    const hit = find(node.children, viewName)
    if (hit) return hit
  }
  return undefined
}

// ---- native invokes the runnable with the surface's rootTag → mount --------

const nativeParams: AppParameters = { rootTag: 11 }
hostRun(nativeParams)
if (find(committed, 'RCTText') === undefined) {
  throw new Error('the host runnable did not mount the app tree')
}

// ---- runApplication drives the same runnable locally (headless / re-render) --

committed = []
AppRegistry.runApplication(APP_KEY, { rootTag: 12 })
if (find(committed, 'RCTText') === undefined) {
  throw new Error('runApplication did not mount the app tree')
}

console.log('app-registry: registerComponent / host bridge / runApplication / mount')
console.log('app-registry.smoke OK')
