/** @jsxRuntime automatic */
// Headless proof that an ANIMATED imperative scroll rides the ScrollView's native
// scrollTo command (not an instant contentOffset push). A fake slot records
// dispatchCommand calls; we mount a FlatList with a ref, then assert that
// scrollToOffset({animated:true}) dispatches scrollTo [x, y, true] while
// scrollToOffset({animated:false}) dispatches no such command. No simulator — a
// failure here is in the JS routing of the animated flag.

import { createElement, createRef, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { FlatList, type FlatListHandle } from '../../adapters/react/src/flat-list'

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

interface CommandCall {
  name: string
  args: readonly unknown[]
}

let committed: FakeNode[] = []
const commands: CommandCall[] = []

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
  registerEventHandler(): void {},
  dispatchCommand(_handle: unknown, name: string, args: readonly unknown[]): void {
    commands.push({ name, args })
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

const ITEM_HEIGHT = 40
const DATA = Array.from({ length: 100 }, (_unused, index) => ({ id: index }))

const listRef = createRef<FlatListHandle>()

function App(): ReactElement {
  return createElement(FlatList<{ id: number }>, {
    data: DATA,
    keyExtractor: (item) => `k-${item.id}`,
    getItemLayout: (_data, index) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
    ref: listRef,
  })
}

mount(91, <App />)

if (committed.length === 0) throw new Error('FlatList did not commit')
if (listRef.current === null) throw new Error('FlatList ref did not attach')

function scrollCommands(): CommandCall[] {
  return commands.filter((c) => c.name === 'scrollTo')
}

// ---- case 1: an animated scroll dispatches the native scrollTo [x, y, true] ----

{
  listRef.current.scrollToOffset({ offset: 200, animated: true })
  const scrolls = scrollCommands()
  if (scrolls.length !== 1) {
    throw new Error(`animated scrollToOffset should dispatch one scrollTo, got ${scrolls.length}`)
  }
  const [x, y, animated] = scrolls[0].args
  // A vertical list scrolls along y; x stays 0.
  if (x !== 0 || y !== 200 || animated !== true) {
    throw new Error(`scrollTo args should be [0, 200, true], got ${JSON.stringify(scrolls[0].args)}`)
  }
}

// ---- case 2: an instant scroll also uses the native command, with animated=false ----
// contentOffset-as-a-prop scrolls on Android but not on iOS post-mount, so both animated
// and instant route through scrollTo — the instant one just carries animated=false.

{
  listRef.current.scrollToOffset({ offset: 80, animated: false })
  const scrolls = scrollCommands()
  if (scrolls.length !== 2) {
    throw new Error(`instant scrollToOffset should also dispatch a scrollTo, got ${scrolls.length} total`)
  }
  const [x, y, animated] = scrolls[1].args
  if (x !== 0 || y !== 80 || animated !== false) {
    throw new Error(`instant scrollTo args should be [0, 80, false], got ${JSON.stringify(scrolls[1].args)}`)
  }
}

console.log('virtualized-list-scroll.smoke OK')
