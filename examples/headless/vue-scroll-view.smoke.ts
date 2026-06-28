// Headless parity proof of the Vue ScrollView (Phase 1, ADR 0024) over the same fake Fabric slot
// the React scroll-view.smoke uses, so the shared @symbiote/components math (intrinsics,
// decelerationRate, content-size dedupe, the imperative handle) is exercised through Vue's
// reactive lifecycle. It mirrors scroll-view.smoke.tsx case-for-case: the nested
// RCTScrollView > RCTScrollContentView shape, contentContainerStyle/horizontal -> content node,
// the base style under user style, the onScroll round-trip (A); the synthesized onContentSizeChange
// + its dedupe (B); and the imperative handle via expose() + a template ref (D, the host node is
// held in a shallowRef so the engine's mirror resolves it, a plain ref would hand back a reactive
// Proxy the command would miss). Props/structure are read off the COMMITTED tree (the Vue slot
// pushes intermediate clones into allCreated, so a find-by-name there can be stale).
//
// RefreshControl + sticky headers are Phase 2/3: accepted/typed, not rendered (no case here).

import { defineComponent, h, ref } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { ScrollView, View } from '../../adapters/vue/src/index'
import type { IScrollViewHandle } from '../../adapters/vue/src/index'
import type { ISymbioteEvent } from '@symbiote/engine'

// ---- fake Fabric slot (committed-tree + commands + events) --------------

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

let committed: IFakeNode[] = []
let allCreated: IFakeNode[] = []
let commands: ICommandCall[] = []
let eventHandler: IEventHandler | undefined

const slot = {
  createNode(tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>, instanceHandle: unknown): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNode: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [...node.children] }),
  cloneNodeWithNewProps(node: IFakeNode, newProps: Record<string, unknown>): IFakeNode {
    const clone: IFakeNode = { ...node, props: newProps }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps(node: IFakeNode, newProps: Record<string, unknown>): IFakeNode {
    const clone: IFakeNode = { ...node, props: newProps, children: [] }
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
  completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
    committed = childSet
  },
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
  committed = []
  allCreated = []
  commands = []
}
function serializeNode(node: IFakeNode): string {
  const kids = node.children.length ? `(${node.children.map(serializeNode).join(',')})` : ''
  return `${node.viewName}${kids}`
}
// The engine wraps every commit in one synthetic box-none root (RN's AppContainer). Assert it,
// then unwrap to the app's real root node (ADR 0024 smoke contract).
function appRootChild(): IFakeNode {
  check('A1 one synthetic box-none root', committed.length === 1 && committed[0]?.props.pointerEvents === 'box-none')
  return committed[0].children[0]
}
function fire(node: IFakeNode, type: string, nativeEvent: Record<string, unknown>): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(node.instanceHandle, type, nativeEvent)
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// ---- A: structure / style / onScroll (horizontal) -----------------------

reset()
let scrolled: Record<string, unknown> | undefined
const payload = {
  contentOffset: { x: 0, y: 10 },
  contentSize: { width: 100, height: 400 },
  layoutMeasurement: { width: 100, height: 200 },
}
mount(
  50,
  defineComponent({
    setup() {
      return () =>
        h(
          ScrollView,
          {
            contentContainerStyle: { padding: 8 },
            horizontal: true,
            onScroll: (event: ISymbioteEvent) => {
              scrolled = event.nativeEvent
            },
          },
          () => h(View),
        )
    },
  }),
)
await tick()

{
  const scroll = appRootChild()
  const content = scroll.children[0]
  check('A2 nested shape RCTScrollView(RCTScrollContentView(RCTView))', serializeNode(scroll) === 'RCTScrollView(RCTScrollContentView(RCTView))')
  check('A3 contentContainerStyle padding reaches content node', content.props.padding === 8)
  check('A4 horizontal content flexDirection row', content.props.flexDirection === 'row')
  check('A5 content padding does not leak onto scroll node', !('padding' in scroll.props))
  check('A6 horizontal scroll node base flexDirection row', scroll.props.flexDirection === 'row')
  check('A7 scroll node base overflow scroll', scroll.props.overflow === 'scroll')
  check('A8 horizontal reaches scroll node as true', scroll.props.horizontal === true)
  fire(scroll, 'topScroll', payload)
  check('A9 onScroll delivers the same nativeEvent (identity)', scrolled === payload)
}

// ---- A10-A12: vertical base style under user style -----------------------

reset()
mount(
  51,
  defineComponent({
    setup() {
      return () => h(ScrollView, { style: { height: 120 } }, () => h(View))
    },
  }),
)
await tick()

{
  const scroll = committed[0].children[0]
  check('A10 vertical scroll node base overflow scroll', scroll.props.overflow === 'scroll')
  check('A11 vertical scroll node base flexDirection column', scroll.props.flexDirection === 'column')
  check('A12 user height survives the base merge', scroll.props.height === 120)
}

// ---- B: synthesized onContentSizeChange + dedupe ------------------------

reset()
const sizeCalls: Array<{ width: number; height: number }> = []
mount(
  52,
  defineComponent({
    setup() {
      return () =>
        h(
          ScrollView,
          { onContentSizeChange: (width: number, height: number) => sizeCalls.push({ width, height }) },
          () => h(View),
        )
    },
  }),
)
await tick()

{
  const scroll = committed[0].children[0]
  const content = scroll.children[0]
  // onLayout routes as an event: setEventListener raises the onLayout FLAG prop to true.
  check('B2 onContentSizeChange wires content onLayout (flag true)', content.props.onLayout === true)

  fire(content, 'topLayout', { layout: { width: 320, height: 800 } })
  check('B3 first layout fires onContentSizeChange(320,800)', sizeCalls.length === 1 && sizeCalls[0].width === 320 && sizeCalls[0].height === 800)

  fire(content, 'topLayout', { layout: { width: 320, height: 800 } })
  check('B4 identical layout is deduped (still one call)', sizeCalls.length === 1)

  fire(content, 'topLayout', { layout: { width: 320, height: 1200 } })
  check('B5 changed height fires again (second call, 1200)', sizeCalls.length === 2 && sizeCalls[1].height === 1200)
}

// ---- D: imperative handle via expose() + a template ref ------------------

reset()
const handleRef = ref<IScrollViewHandle | null>(null)
mount(
  53,
  defineComponent({
    setup() {
      return () => h(ScrollView, { ref: handleRef }, () => h(View))
    },
  }),
)
await tick()

{
  const handle = handleRef.value
  check('D-pre handle exposed via expose()', handle !== null)
  handle?.scrollTo({ y: 50 })
  const scrollTo = commands.find((c) => c.name === 'scrollTo')
  check('D1 scrollTo dispatches [0,50,true]', scrollTo !== undefined && scrollTo.args.length === 3 && scrollTo.args[0] === 0 && scrollTo.args[1] === 50 && scrollTo.args[2] === true)

  handle?.scrollToEnd()
  const scrollToEnd = commands.find((c) => c.name === 'scrollToEnd')
  check('D2 scrollToEnd dispatches [true]', scrollToEnd !== undefined && scrollToEnd.args.length === 1 && scrollToEnd.args[0] === true)

  handle?.flashScrollIndicators()
  const flash = commands.find((c) => c.name === 'flashScrollIndicators')
  check('D3 flashScrollIndicators dispatches no args', flash !== undefined && flash.args.length === 0)
}

console.log(failures === 0 ? '\nvue-scroll-view.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
