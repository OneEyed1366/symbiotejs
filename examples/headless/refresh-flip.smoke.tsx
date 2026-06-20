// Regression proof of the CONTROLLED refresh path: when onRefresh fires and the
// parent flips refreshing -> true, that true must reach the committed
// PullToRefreshView node, or native's UIRefreshControl is never told to keep
// spinning. The sibling refresh-control.smoke only covers the static
// refreshing:false mount; this covers the false->true flip. We fire the real
// `topRefresh` event (same discrete-lane flush path the device uses) and inspect
// the recommitted tree — green here means a missing spinner is native/visual, not JS.

import { useState, type ReactElement } from 'react'
import { View, mount } from '@symbiote/react'
import { ScrollView } from '../../packages/react/src/scroll-view'
import { RefreshControl } from '../../packages/react/src/refresh-control'

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
let nextTag = 100

const slot = {
  createNode(
    _tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    return { tag: nextTag++, viewName, props, children: [], instanceHandle }
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
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

function App(): ReactElement {
  const [refreshing, setRefreshing] = useState(false)
  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} />
      }
    >
      <View />
    </ScrollView>
  )
}

function findRefresh(nodes: FakeNode[]): FakeNode | undefined {
  for (const node of nodes) {
    if (node.viewName === 'PullToRefreshView') return node
    const found = findRefresh(node.children)
    if (found) return found
  }
  return undefined
}

mount(11, <App />)

const before = findRefresh(committed)
console.log('after mount: refreshing =', JSON.stringify(before?.props.refreshing))
if (!before) throw new Error('no PullToRefreshView committed at mount')
if (!eventHandler) throw new Error('no event handler registered')

// Native fires the pull gesture -> onRefresh -> setRefreshing(true).
eventHandler(before.instanceHandle, 'topRefresh', {})

const after = findRefresh(committed)
console.log('after topRefresh: refreshing =', JSON.stringify(after?.props.refreshing))

if (after?.props.refreshing !== true) {
  throw new Error('FAIL: refreshing:true never reached the committed PullToRefreshView')
}
console.log('refresh-flip.smoke OK')
