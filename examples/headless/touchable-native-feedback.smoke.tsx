/** @jsxRuntime automatic */
// Headless proof of TouchableNativeFeedback over the same fake Fabric slot the
// other smokes use. Asserts the pure static factories (the most testable part),
// that the native ripple prop lands on the committed responder node, and that a
// press round-trips through the underlying Pressable. No simulator — a failure
// here is in JS. (Android-only feature; on iOS the native prop is inert but
// still committed, which is exactly what we assert.)

import { mount } from '@symbiote/react'
// Not on the barrel yet (the integrator wires exports), so reach the source.
import { TouchableNativeFeedback } from '../../adapters/react/src/touchable-native-feedback'
import { View } from '../../adapters/react/src/components'

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

// ---- helpers ------------------------------------------------------------

const TOUCH_START = 'topTouchStart'
const TOUCH_END = 'topTouchEnd'

function reset(): void {
  committed = []
  allCreated.length = 0
}

// The responder is the View the Pressable renders — the first RCTView committed
// that isn't the synthetic AppContainer root (pointerEvents box-none).
function responderHandle(): unknown {
  const view = allCreated.find(
    (n) => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
  )
  if (!view) throw new Error('no RCTView (Pressable responder) was created')
  return view.instanceHandle
}

// Returns props of the first committed node matching `pick`, walking the tree.
function findProps(pick: (props: Record<string, unknown>) => boolean): Record<string, unknown> {
  function find(node: FakeNode): FakeNode | undefined {
    if (pick(node.props)) return node
    for (const child of node.children) {
      const hit = find(child)
      if (hit) return hit
    }
    return undefined
  }
  for (const root of committed) {
    const hit = find(root)
    if (hit) return hit.props
  }
  throw new Error('no committed node matched')
}

// Props of the feedback View carrying the native ripple drawable.
function feedbackProps(): Record<string, unknown> {
  return findProps(
    (p) => p.nativeBackgroundAndroid !== undefined || p.nativeForegroundAndroid !== undefined,
  )
}

function fire(handle: unknown, type: string): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(handle, type, {})
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ---- case 1: the static factories return the right config dicts ----------
// These are pure and the most testable part. SelectableBackground() builds the
// theme-attr dict; Ripple(color, borderless) builds the ripple dict.

{
  const sel = TouchableNativeFeedback.SelectableBackground()
  if (sel.type !== 'ThemeAttrAndroid' || sel.attribute !== 'selectableItemBackground') {
    throw new Error(`SelectableBackground() wrong dict, got ${JSON.stringify(sel)}`)
  }

  const selRadius = TouchableNativeFeedback.SelectableBackground(12)
  if (selRadius.rippleRadius !== 12) {
    throw new Error(`SelectableBackground(12) should carry rippleRadius=12, got ${JSON.stringify(selRadius)}`)
  }

  const borderless = TouchableNativeFeedback.SelectableBackgroundBorderless()
  if (borderless.attribute !== 'selectableItemBackgroundBorderless') {
    throw new Error(`SelectableBackgroundBorderless() wrong attribute, got ${JSON.stringify(borderless)}`)
  }

  const ripple = TouchableNativeFeedback.Ripple('#fff', true)
  if (
    ripple.type !== 'RippleAndroid' ||
    ripple.color !== '#fff' ||
    ripple.borderless !== true
  ) {
    throw new Error(`Ripple('#fff', true) wrong dict, got ${JSON.stringify(ripple)}`)
  }
}

// ---- case 2: the ripple background lands on the committed node ------------
// background={Ripple(...)} must surface as nativeBackgroundAndroid on the
// underlying Pressable's RCTView.

{
  reset()
  const ripple = TouchableNativeFeedback.Ripple('#00f', false)
  mount(
    21,
    <TouchableNativeFeedback background={ripple}>
      <View />
    </TouchableNativeFeedback>,
  )

  const props = feedbackProps()
  const bg = props.nativeBackgroundAndroid
  if (!isRecord(bg) || bg.type !== 'RippleAndroid' || bg.color !== '#00f') {
    throw new Error(
      `nativeBackgroundAndroid must carry the ripple dict, got ${JSON.stringify(bg)}`,
    )
  }
  if (props.nativeForegroundAndroid !== undefined) {
    throw new Error(
      `without useForeground the foreground prop must be absent, got ${JSON.stringify(props.nativeForegroundAndroid)}`,
    )
  }
}

// ---- case 3: onPress fires through the underlying Pressable ---------------

{
  reset()
  let presses = 0
  mount(
    22,
    <TouchableNativeFeedback onPress={() => { presses++ }}>
      <View />
    </TouchableNativeFeedback>,
  )

  const handle = responderHandle()
  fire(handle, TOUCH_START)
  fire(handle, TOUCH_END)
  if (presses !== 1) {
    throw new Error(`onPress should fire once on start+end, fired ${presses}`)
  }
}

// ---- case 4: a missing background defaults to SelectableBackground --------
// RN paints feedback even when the caller passes no background.

{
  reset()
  mount(
    23,
    <TouchableNativeFeedback>
      <View />
    </TouchableNativeFeedback>,
  )

  const bg = feedbackProps().nativeBackgroundAndroid
  if (!isRecord(bg) || bg.attribute !== 'selectableItemBackground') {
    throw new Error(
      `missing background must default to SelectableBackground, got ${JSON.stringify(bg)}`,
    )
  }
}

console.log('touchable-native-feedback.smoke OK')
