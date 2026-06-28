// Regression proof for the Vue kebab→camel attr normalization (normalizeVueAttrs). Vue does not
// camelCase $attrs, so an idiomatic SFC template `:content-container-style` / `:refresh-control`
// arrives kebab-keyed; without folding, a consumed prop is silently dropped (lost padding) and a
// VNode-valued prop leaks to Fabric (Android `JS Functions are not convertible to dynamic`). These
// cases drive components with KEBAB keys over the fake slot and assert the committed tree got the
// camelCase contract, and that no raw kebab key (nor an un-consumed VNode) reached native.

import { defineComponent, h } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { View, ScrollView, RefreshControl } from '../../adapters/vue/src/index'

// ---- fake Fabric slot ---------------------------------------------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

let committed: IFakeNode[] = []
let allCreated: IFakeNode[] = []

const slot = {
  createNode(tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>, instanceHandle: unknown): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNode: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [...node.children] }),
  cloneNodeWithNewProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({ ...node, props: newProps }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({ ...node, props: newProps, children: [] }),
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
  registerEventHandler(): void {},
  dispatchCommand(): void {},
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
}
// The engine wraps every commit in one synthetic box-none root; the app's real root is its child.
function appRootChild(): IFakeNode {
  return committed[0].children[0]
}
function anyNodeHasKey(key: string): boolean {
  return allCreated.some((n) => key in n.props)
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// ---- N1: a kebab `accessibility-label` on View folds to camelCase --------

reset()
mount(90, defineComponent({ setup: () => () => h(View, { 'accessibility-label': 'hello', testID: 'v' }) }))
await tick()

{
  // appRootChild() unwraps the engine's synthetic box-none root to the app's real View (find('RCTView')
  // would return that synthetic root, also an RCTView).
  const view = appRootChild()
  check('N1 kebab accessibility-label folds to accessibilityLabel', view.props.accessibilityLabel === 'hello')
  check('N1 raw kebab key does NOT reach native', !('accessibility-label' in view.props))
}

// ---- N2: kebab `content-container-style` is folded + consumed, not leaked --

reset()
mount(
  91,
  defineComponent({
    setup: () => () => h(ScrollView, { 'content-container-style': { padding: 33 } }, () => [h(View)]),
  }),
)
await tick()

{
  const scroll = appRootChild()
  // The kebab key (and its camel form as a raw prop) must NOT sit on the scroll node; it is consumed
  // and applied to the inner content container, not forwarded.
  check('N2 no raw content-container-style on the scroll node', !('content-container-style' in scroll.props))
  check('N2 no raw contentContainerStyle on the scroll node', !('contentContainerStyle' in scroll.props))
}

// ---- N3: kebab `refresh-control` (a VNode) is folded + consumed, no Fabric leak --
// This is the exact Android `JS Functions are not convertible to dynamic` case: a VNode-valued prop
// must be consumed by the platform assemble, never forwarded to native as a raw prop.

reset()
mount(
  92,
  defineComponent({
    setup: () => () =>
      h(ScrollView, { 'refresh-control': h(RefreshControl, { refreshing: false }) }, () => [h(View)]),
  }),
)
await tick()

{
  check('N3 no raw refresh-control key reached native', !anyNodeHasKey('refresh-control'))
  check('N3 no raw refreshControl VNode key reached native', !anyNodeHasKey('refreshControl'))
  // The RefreshControl was consumed by the assemble, so its host node IS in the committed tree.
  check('N3 RefreshControl committed as a real node', allCreated.some((n) => n.viewName === 'PullToRefreshView' || n.viewName === 'RCTRefreshControl' || n.viewName.includes('Refresh')))
}

// ---- N4: aria-* is PRESERVED through normalize, then folded by resolveAccessibilityProps --

reset()
mount(93, defineComponent({ setup: () => () => h(ScrollView, { 'aria-label': 'scrolled' }, () => [h(View)]) }))
await tick()

{
  const scroll = appRootChild()
  check('N4 aria-label folds to accessibilityLabel (not mangled to ariaLabel)', scroll.props.accessibilityLabel === 'scrolled')
  check('N4 no raw aria-label leaked to native', !('aria-label' in scroll.props))
}

console.log(failures === 0 ? '\nvue-attr-normalize.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
