// The retained shadow-tree. Adapters mutate this cheap in-memory tree through a
// tiny API; the commit engine (commit.ts) later walks it and translates the
// whole thing into Fabric's clone-on-write child sets. Keeping the retained
// tree mutable while the Fabric mirror stays persistent is the core R2 trick,
// and it lives here in shared so no adapter re-implements it.

import { isEventFor } from './view-config'

const BRAND: unique symbol = Symbol('symbiote.node')

// A node carries the Fabric view name directly, so adding a primitive (Image,
// ScrollView, TextInput) is just a new string from the adapter — no core change.
// The only name resolved at commit time is text: a <Text> nested inside another
// <Text> becomes a virtual span. `isText` marks a text container so its
// descendants pick the virtual variant.
export const RAW_TEXT_COMPONENT = 'RCTRawText'
export const TEXT_COMPONENT = 'RCTText'
export const VIRTUAL_TEXT_COMPONENT = 'RCTVirtualText'

export interface SymbioteEvent {
  type: string
  // `target` is the node the gesture started on; `currentTarget` is the node
  // whose listener is running right now as the event bubbles toward the root.
  target: SymbioteNode
  currentTarget: SymbioteNode
  nativeEvent: Record<string, unknown>
  stopPropagation: () => void
}
// Returns `unknown`, not `void`: the responder negotiation reads a boolean back
// from onStartShouldSetResponder / onResponderTerminationRequest. Bubbling/direct
// dispatch ignore the return; only the responder path consults it.
export type Listener = (event: SymbioteEvent) => unknown

export interface SymbioteNode {
  readonly [BRAND]: true
  // Fabric view name passed to createNode (RCTView, RCTImageView, RCTText, ...).
  readonly component: string
  // A text container: its descendants render as virtual text spans.
  readonly isText: boolean
  props: Record<string, unknown>
  listeners: Map<string, Listener> | undefined
  children: SymbioteNode[]
  parent: SymbioteNode | undefined
}

export function createElement(component: string, isText = false): SymbioteNode {
  return {
    [BRAND]: true,
    component,
    isText,
    props: {},
    listeners: undefined,
    children: [],
    parent: undefined,
  }
}

export function createRawText(text: string): SymbioteNode {
  return {
    [BRAND]: true,
    component: RAW_TEXT_COMPONENT,
    isText: false,
    props: { text },
    listeners: undefined,
    children: [],
    parent: undefined,
  }
}

// `instanceHandle` round-trips through Fabric unchanged: the object we pass to
// createNode comes back as the event target. We brand our nodes so the event
// handler can confirm a target is one of ours before dispatching.
export function isSymbioteNode(value: unknown): value is SymbioteNode {
  return typeof value === 'object' && value !== null && BRAND in value
}

// Vue's runtime-core needs comment/anchor nodes (fragments, v-if, v-for) to track
// sibling order; Fabric has no such concept. An anchor is a real retained node so
// insert/nextSibling/parentNode ordering stays correct, but the commit walk SKIPS it
// (commit.ts) — no native view is ever created. Marked by a sentinel component name,
// not a new field, so the hot SymbioteNode shape is untouched.
export const ANCHOR_COMPONENT = '#anchor'

export function createAnchor(): SymbioteNode {
  return createElement(ANCHOR_COMPONENT)
}

export function isAnchor(node: SymbioteNode): boolean {
  return node.component === ANCHOR_COMPONENT
}

// A pure prop set: no event inference. `onTintColor` is a Switch prop and reaches
// Fabric like any other — the event-vs-prop decision is made by routeProp, never by
// the key's name.
export function setProp(node: SymbioteNode, key: string, value: unknown): void {
  if (value === undefined) {
    delete node.props[key]
  } else {
    node.props[key] = value
  }
}

// Fabric gates layout events behind a boolean prop (BaseViewProps.onLayout): unlike
// scroll / touch / change, which the native component emits unconditionally, a
// layout event fires only when the shadow node is flagged. So a `layout` listener
// must also raise that prop, mirroring RN's `onLayout: true` validAttribute —
// otherwise onLayout never fires and anything measuring its own box (VirtualizedList
// viewport) stays at zero.
const LAYOUT_EVENT = 'layout'
const LAYOUT_FLAG_PROP = 'onLayout'

// The explicit event channel. Structural adapters (Svelte addEventListener, Angular
// Renderer2.listen) call this directly with an already-known event name; flat-bag
// adapters reach it through routeProp. A non-function value clears the listener.
export function setEventListener(node: SymbioteNode, name: string, value: unknown): void {
  const isHandler = typeof value === 'function'
  if (isHandler) {
    const handler = value
    const listeners = (node.listeners ??= new Map())
    listeners.set(name, (event: SymbioteEvent) => handler(event))
  } else {
    node.listeners?.delete(name)
  }
  if (name === LAYOUT_EVENT) setProp(node, LAYOUT_FLAG_PROP, isHandler ? true : undefined)
}

const ON_PREFIX = /^on[A-Z]/

// onChange -> change
function listenerName(propName: string): string {
  return propName.charAt(2).toLowerCase() + propName.slice(3)
}

// The responder-negotiation events (PanResponder's panHandlers). They are a
// JS-side protocol the event layer synthesizes from raw touches, NOT Fabric
// ViewConfig events — so isEventFor never reports them. Treat them as listeners on
// any node so PanResponder's handlers actually attach (rather than routing to
// setProp and reaching Fabric as dead props). Names are post-listenerName.
const RESPONDER_EVENTS: ReadonlySet<string> = new Set([
  'startShouldSetResponder',
  'startShouldSetResponderCapture',
  'moveShouldSetResponder',
  'moveShouldSetResponderCapture',
  'responderGrant',
  'responderReject',
  'responderStart',
  'responderMove',
  'responderEnd',
  'responderRelease',
  'responderTerminate',
  'responderTerminationRequest',
])

// The flat-bag split (React / Vue / Solid): an `onX` prop becomes an event listener
// ONLY when the node's component actually declares `x` as an event (per the shared
// ViewConfig). Otherwise it is a plain prop — so `onTintColor` on a Switch, whose
// only event is `change`, routes to setProp and reaches Fabric.
export function routeProp(node: SymbioteNode, key: string, value: unknown): void {
  if (ON_PREFIX.test(key)) {
    const name = listenerName(key)
    if (RESPONDER_EVENTS.has(name) || isEventFor(node.component, name)) {
      setEventListener(node, name, value)
      return
    }
  }
  setProp(node, key, value)
}

export function setText(node: SymbioteNode, text: string): void {
  node.props.text = text
}

function detach(child: SymbioteNode): void {
  const parent = child.parent
  if (!parent) return
  const index = parent.children.indexOf(child)
  if (index >= 0) parent.children.splice(index, 1)
  child.parent = undefined
}

export function appendChild(parent: SymbioteNode, child: SymbioteNode): void {
  detach(child)
  child.parent = parent
  parent.children.push(child)
}

export function insertBefore(
  parent: SymbioteNode,
  child: SymbioteNode,
  beforeChild: SymbioteNode,
): void {
  detach(child)
  child.parent = parent
  const index = parent.children.indexOf(beforeChild)
  parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
}

export function removeChild(parent: SymbioteNode, child: SymbioteNode): void {
  const index = parent.children.indexOf(child)
  if (index >= 0) parent.children.splice(index, 1)
  child.parent = undefined
}
