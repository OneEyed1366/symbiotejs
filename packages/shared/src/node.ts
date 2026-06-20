// The retained shadow-tree. Adapters mutate this cheap in-memory tree through a
// tiny API; the commit engine (commit.ts) later walks it and translates the
// whole thing into Fabric's clone-on-write child sets. Keeping the retained
// tree mutable while the Fabric mirror stays persistent is the core R2 trick,
// and it lives here in shared so no adapter re-implements it.

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
export type Listener = (event: SymbioteEvent) => void

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

const EVENT_PROP = /^on[A-Z]/

// onPress -> press
function listenerName(propName: string): string {
  return propName.charAt(2).toLowerCase() + propName.slice(3)
}

export function setProp(node: SymbioteNode, key: string, value: unknown): void {
  if (EVENT_PROP.test(key)) {
    const name = listenerName(key)
    if (typeof value === 'function') {
      const handler = value
      const listeners = (node.listeners ??= new Map())
      listeners.set(name, (event: SymbioteEvent) => {
        handler(event)
      })
    } else {
      node.listeners?.delete(name)
    }
    return
  }
  if (value === undefined) {
    delete node.props[key]
  } else {
    node.props[key] = value
  }
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
