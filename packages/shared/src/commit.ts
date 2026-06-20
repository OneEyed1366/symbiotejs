// The clone-on-write engine. Fabric is persistent: you never mutate a committed
// node, you clone it with new props/children and atomically hand a fresh child
// set to completeRoot.
//
// Incremental strategy: each retained node keeps a "mirror" of what Fabric
// currently holds for it — its handle, the flat props last sent, the child
// identities last committed, and the resolved view name. On commit we walk the
// retained tree and only clone the nodes that actually changed; an untouched
// sibling subtree is reused by reference, which both skips work and — crucially
// — preserves the native view state (scroll offset, text cursor) that a full
// rebuild would wipe on every commit. A change bubbles up: re-cloning a leaf
// forces each ancestor to re-clone too, because a persistent parent holds
// references to specific child handles. That bubble is inherent to a persistent
// tree and is exactly what React's own Fabric renderer does.

import {
  getSlot,
  type FabricNode,
  type FabricProps,
  type RootTag,
} from './fabric'
import {
  RAW_TEXT_COMPONENT,
  VIRTUAL_TEXT_COMPONENT,
  type SymbioteNode,
} from './node'
import { dlog, isDebug } from './debug'
import { flattenStyle } from './style'
import { nextTag } from './tags'

// Per-commit work counters, surfaced via dlog so a device run can prove the
// engine is incremental (created=0 with clones after the first mount).
const stats = { created: 0, cloneProps: 0, cloneChildren: 0, reused: 0 }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Color props must reach Fabric as platform ints, not CSS strings — Fabric's C++
// color parser silently drops strings. The actual conversion (processColor) is
// RN-platform-specific, so it is injected here rather than imported, keeping
// shared free of a react-native dependency (and the headless harness working).
const COLOR_PROPS: ReadonlySet<string> = new Set([
  'backgroundColor',
  'color',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'shadowColor',
  'tintColor',
])

let colorProcessor: (value: string) => unknown = (value) => value

export function setColorProcessor(process: (value: string) => unknown): void {
  colorProcessor = process
}

function processValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && COLOR_PROPS.has(key)) {
    return colorProcessor(value)
  }
  return value
}

function viewNameFor(node: SymbioteNode, hasTextAncestor: boolean): string {
  // The only position-dependent name: a <Text> inside another <Text> becomes a
  // virtual span. Everything else is the component string the adapter chose.
  return node.isText && hasTextAncestor ? VIRTUAL_TEXT_COMPONENT : node.component
}

// Translate the retained node's logical props into the flat payload Fabric's C++
// props expect: `style` keys are hoisted to the top level, event handlers and
// undefined values are dropped.
function fabricProps(node: SymbioteNode): FabricProps {
  if (node.component === RAW_TEXT_COMPONENT) {
    return { text: node.props.text }
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.props)) {
    if (key === 'style') continue
    if (typeof value === 'function') continue
    if (value === undefined) continue
    out[key] = processValue(key, value)
  }
  // Collapse style (object | array | nested arrays) into one flat payload before
  // hoisting — `style={[base, override]}` is RN's idiom and Fabric wants it flat.
  const style = flattenStyle(node.props.style)
  for (const [key, value] of Object.entries(style)) {
    if (value !== undefined) out[key] = processValue(key, value)
  }
  return out
}

// Deep structural equality over the JSON-shaped props payload (Fabric props are
// serializable: primitives, arrays, plain objects). Used to decide whether a
// node's props actually changed — `fabricProps` builds a fresh object each
// commit, so a reference check would report every node as dirty.
function propsEqual(a: FabricProps, b: FabricProps): boolean {
  return jsonEqual(a, b)
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  const aArray = Array.isArray(a)
  const bArray = Array.isArray(b)
  if (aArray && bArray) {
    if (a.length !== b.length) return false
    return a.every((value, index) => jsonEqual(value, b[index]))
  }
  if (aArray || bArray) return false
  if (!isRecord(a) || !isRecord(b)) return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => key in b && jsonEqual(a[key], b[key]))
}

// What Fabric currently holds for a node. The retained node carries the *desired*
// state (props/children); the mirror carries the *committed* state we diff against.
interface Mirror {
  handle: FabricNode
  props: FabricProps
  children: readonly SymbioteNode[]
  viewName: string
}

const mirror = new WeakMap<SymbioteNode, Mirror>()

interface Reconciled {
  handle: FabricNode
  changed: boolean
}

function childrenIdentical(node: SymbioteNode, committed: readonly SymbioteNode[]): boolean {
  if (node.children.length !== committed.length) return false
  return node.children.every((child, index) => child === committed[index])
}

function reconcile(
  slot: ReturnType<typeof getSlot>,
  node: SymbioteNode,
  rootTag: RootTag,
  hasTextAncestor: boolean,
): Reconciled {
  const viewName = viewNameFor(node, hasTextAncestor)
  const props = fabricProps(node)
  const childInText = node.isText || hasTextAncestor
  const committed = mirror.get(node)

  // First mount, or the view kind flipped (RCTText <-> RCTVirtualText when a
  // <Text> moves in or out of another <Text>): a different native component
  // can't be cloned across, so create a fresh node from scratch.
  if (committed === undefined || committed.viewName !== viewName) {
    stats.created += 1
    const handle = slot.createNode(nextTag(), viewName, rootTag, props, node)
    for (const child of node.children) {
      slot.appendChild(handle, reconcile(slot, child, rootTag, childInText).handle)
    }
    mirror.set(node, { handle, props, children: node.children.slice(), viewName })
    return { handle, changed: true }
  }

  // Reconcile children first; a child that re-cloned forces this node to re-clone
  // too, since Fabric parents point at specific child handles.
  const childHandles: FabricNode[] = []
  let descendantChanged = false
  for (const child of node.children) {
    const result = reconcile(slot, child, rootTag, childInText)
    childHandles.push(result.handle)
    if (result.changed) descendantChanged = true
  }

  const childrenChanged = !childrenIdentical(node, committed.children) || descendantChanged
  const propsChanged = !propsEqual(committed.props, props)

  if (!childrenChanged && !propsChanged) {
    stats.reused += 1
    return { handle: committed.handle, changed: false }
  }

  let handle: FabricNode
  if (childrenChanged) {
    stats.cloneChildren += 1
    handle = propsChanged
      ? slot.cloneNodeWithNewChildrenAndProps(committed.handle, props)
      : slot.cloneNodeWithNewChildren(committed.handle)
    for (const childHandle of childHandles) {
      slot.appendChild(handle, childHandle)
    }
  } else {
    stats.cloneProps += 1
    handle = slot.cloneNodeWithNewProps(committed.handle, props)
  }

  mirror.set(node, { handle, props, children: node.children.slice(), viewName })
  return { handle, changed: true }
}

// The top-level children committed last time per root, so a commit that changed
// nothing (common when a reactive framework over-schedules) makes zero native
// calls instead of a redundant completeRoot.
const lastTopChildren = new Map<RootTag, readonly SymbioteNode[]>()

export function commitChildren(rootTag: RootTag, children: readonly SymbioteNode[]): void {
  const slot = getSlot()

  stats.created = 0
  stats.cloneProps = 0
  stats.cloneChildren = 0
  stats.reused = 0
  const results = children.map((child) => reconcile(slot, child, rootTag, false))

  const previous = lastTopChildren.get(rootTag)
  const topUnchanged =
    previous !== undefined &&
    previous.length === children.length &&
    children.every((child, index) => child === previous[index])
  if (topUnchanged && results.every((result) => !result.changed)) {
    dlog(`commit root=${rootTag} no-op (skipped completeRoot)`)
    return
  }

  const childSet = slot.createChildSet(rootTag)
  for (const result of results) {
    slot.appendChildToSet(childSet, result.handle)
  }
  slot.completeRoot(rootTag, childSet)
  lastTopChildren.set(rootTag, children.slice())

  if (isDebug()) {
    const mode = stats.created > 0 && stats.reused === 0 ? 'full' : 'incremental'
    dlog(
      `commit root=${rootTag} ${mode} ` +
        `created=${stats.created} cloneProps=${stats.cloneProps} ` +
        `cloneChildren=${stats.cloneChildren} reused=${stats.reused}`,
    )
  }
}

// Imperative view command (e.g. TextInput's setTextAndSelection / focus / blur),
// aimed at a node's CURRENT Fabric handle. Only valid once the node has been
// committed at least once — its handle is read from the mirror.
export function dispatchViewCommand(
  node: SymbioteNode,
  commandName: string,
  args: readonly unknown[],
): void {
  const record = mirror.get(node)
  if (record === undefined) {
    dlog(`dispatchViewCommand "${commandName}" skipped: node not committed`)
    return
  }
  dlog(`dispatchViewCommand "${commandName}"`)
  getSlot().dispatchCommand(record.handle, commandName, args)
}
