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
  createElement,
  RAW_TEXT_COMPONENT,
  VIRTUAL_TEXT_COMPONENT,
  type SymbioteNode,
} from './node'
import { dlog, isDebug } from './debug'
import { flattenStyle } from './style'
import { registeredProcessor } from './registry'
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

// Convert a prop to the shape Fabric's C++ expects. A third-party view contributes
// its own processors, auto-derived from its ViewConfig (validAttributes[*].process —
// e.g. processColor for a slider's track tints); those run first. Built-ins are
// never in the registry, so they fall through to the global color path, where any
// CSS-string color is run through the injected platform processor (Fabric's C++
// color parser silently drops strings).
function processValue(component: string, key: string, value: unknown): unknown {
  const processor = registeredProcessor(component, key)
  if (processor !== undefined) return processor(value)
  if (typeof value === 'string' && COLOR_PROPS.has(key)) return colorProcessor(value)
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
    out[key] = processValue(node.component, key, value)
  }
  // Collapse style (object | array | nested arrays) into one flat payload before
  // hoisting — `style={[base, override]}` is RN's idiom and Fabric wants it flat.
  const style = flattenStyle(node.props.style)
  for (const [key, value] of Object.entries(style)) {
    if (value !== undefined) out[key] = processValue(node.component, key, value)
  }
  return out
}

// Fabric's clone*WithNewProps MERGES the raw payload onto the node's existing
// props, so a prop that simply disappears between commits (e.g. `opacity` when a
// pressed style is released, or any conditionally-applied style key) would keep its
// stale value. Mirror React's diffProperties: carry every current key, and send any
// key the node held last time but no longer has as `null` so Fabric resets it to its
// default. Only matters for clones — a fresh createNode starts from nothing.
function diffProps(previous: FabricProps, next: FabricProps): FabricProps {
  const out: Record<string, unknown> = { ...next }
  for (const key of Object.keys(previous)) {
    if (!(key in next)) out[key] = null
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
// `tag` is the reactTag we minted at first create — stable across clone-on-write
// (the clone keeps the family) — kept so the Animated native driver can bind to it
// (ADR 0017). `rootTag` lets a targeted re-commit (setNativeProps) find the surface.
interface Mirror {
  handle: FabricNode
  tag: number
  rootTag: RootTag
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
    const tag = nextTag()
    const handle = slot.createNode(tag, viewName, rootTag, props, node)
    for (const child of node.children) {
      slot.appendChild(handle, reconcile(slot, child, rootTag, childInText).handle)
    }
    mirror.set(node, { handle, tag, rootTag, props, children: node.children.slice(), viewName })
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
      ? slot.cloneNodeWithNewChildrenAndProps(committed.handle, diffProps(committed.props, props))
      : slot.cloneNodeWithNewChildren(committed.handle)
    for (const childHandle of childHandles) {
      slot.appendChild(handle, childHandle)
    }
  } else {
    stats.cloneProps += 1
    handle = slot.cloneNodeWithNewProps(committed.handle, diffProps(committed.props, props))
  }

  // The clone keeps the node's family, so its reactTag is unchanged — carry it.
  mirror.set(node, {
    handle,
    tag: committed.tag,
    rootTag,
    props,
    children: node.children.slice(),
    viewName,
  })
  return { handle, changed: true }
}

// One persistent synthetic root container per surface, mirroring RN's AppContainer
// (renderApplication wraps the app in `<View style={{flex:1}} pointerEvents="box-none">`).
// Without it a non-flex root view collapses to content height, and touches outside the
// app's children have no box-none escape. Keeping it here — not in each adapter's
// mount() — gives every framework a full-screen flex root for free and keeps layout in
// shared (adapters_stay_thin). The container is just another persistent node in the
// clone-on-write engine: stable identity, so an unchanged subtree leaves it un-cloned.
const ROOT_VIEW_COMPONENT = 'RCTView'
const ROOT_CONTAINER_STYLE = { flex: 1 }
const ROOT_CONTAINER_POINTER_EVENTS = 'box-none'

const rootContainers = new Map<RootTag, SymbioteNode>()

function rootContainerFor(rootTag: RootTag): SymbioteNode {
  let container = rootContainers.get(rootTag)
  if (container === undefined) {
    container = createElement(ROOT_VIEW_COMPONENT)
    container.props = {
      style: ROOT_CONTAINER_STYLE,
      pointerEvents: ROOT_CONTAINER_POINTER_EVENTS,
    }
    rootContainers.set(rootTag, container)
    dlog(`root container created root=${rootTag} (flex:1, box-none)`)
  }
  return container
}

export function commitChildren(rootTag: RootTag, children: readonly SymbioteNode[]): void {
  // The wrapper holds the surface's top-level children; reconcile walks from it so the
  // whole tree, synthetic root included, goes through the same clone-on-write path.
  rootContainerFor(rootTag).children = children.slice()
  commitContainer(rootTag)
}

// Re-run the scoped commit for a surface from its synthetic root container, reusing
// whatever top-level children it currently holds. The shared half of the engine: both
// a full mutation→commit and a single-node Animated frame (setNativeProps) funnel here.
function commitContainer(rootTag: RootTag): void {
  const slot = getSlot()
  const container = rootContainerFor(rootTag)

  stats.created = 0
  stats.cloneProps = 0
  stats.cloneChildren = 0
  stats.reused = 0
  const result = reconcile(slot, container, rootTag, false)

  // The container's identity is stable, so its un-cloned flag is the no-op signal:
  // an over-scheduled commit that touched nothing makes zero native calls.
  if (!result.changed) {
    dlog(`commit root=${rootTag} no-op (skipped completeRoot)`)
    return
  }

  const childSet = slot.createChildSet(rootTag)
  slot.appendChildToSet(childSet, result.handle)
  slot.completeRoot(rootTag, childSet)

  if (isDebug()) {
    const mode = stats.created > 0 && stats.reused === 0 ? 'full' : 'incremental'
    dlog(
      `commit root=${rootTag} ${mode} ` +
        `created=${stats.created} cloneProps=${stats.cloneProps} ` +
        `cloneChildren=${stats.cloneChildren} reused=${stats.reused}`,
    )
  }
}

// Targeted per-frame prop write for the JS-driven Animated path (ADR 0016). RN
// flushes an animation frame with an in-place `instance.setNativeProps(...)`; we have
// no in-place mutation (Fabric is persistent), so a frame is one scoped commit: mutate
// the node's desired props, then re-reconcile its surface. The engine clones only this
// node (props differ), bubbles the re-clone to the root, reuses every sibling subtree
// by reference, and emits a single completeRoot. This is the "slow tier" — viable for a
// single shallow animation; the native driver (ADR 0017) is the answer for scale.
export function setNativeProps(node: SymbioteNode, partial: Record<string, unknown>): void {
  const record = mirror.get(node)
  if (record === undefined) {
    dlog('setNativeProps skipped: node not committed')
    return
  }
  Object.assign(node.props, partial)
  dlog(`setNativeProps root=${record.rootTag} tag=${record.tag} keys=${Object.keys(partial)}`)
  commitContainer(record.rootTag)
}

// The committed reactTag of a node (stable across clone-on-write), for binding the
// Animated native driver via connectAnimatedNodeToView (ADR 0017). Undefined until the
// node has been committed at least once.
export function getNativeTag(node: SymbioteNode): number | undefined {
  return mirror.get(node)?.tag
}

// The node's current Fabric handle (the createNode/clone return value) — identical in
// kind to React's stateNode.node, for the native driver's ShadowNodeFamily path.
export function getNativeNode(node: SymbioteNode): FabricNode | undefined {
  return mirror.get(node)?.handle
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
