// Headless proof of the imperative host-component ref API — the seam libraries like
// reanimated / gesture-handler reach through: ref.current.measure / measureInWindow /
// measureLayout / setNativeProps, plus findNodeHandle(ref). A host ref hands back the
// public instance; its methods route to nativeFabricUIManager's measure family (keyed
// by the node's CURRENT Fabric handle) and to shared's scoped setNativeProps. A failure
// here is the public-instance wiring (host-config getPublicInstance) or the shared
// measure layer, not the renderer.

import { type ReactElement } from 'react'
import { mount, View, findNodeHandle } from '@symbiote/react'

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
  // Canned geometry, keyed off the node's tag so we can prove the RIGHT node was
  // measured. measure -> (x,y,w,h,pageX,pageY); measureInWindow -> (x,y,w,h);
  // measureLayout(to, from, onFail, onSuccess) -> onSuccess(left,top,w,h).
  measure: (
    node: FakeNode,
    cb: (x: number, y: number, w: number, h: number, px: number, py: number) => void,
  ): void => cb(1, 2, 100, 50, 11, 22),
  measureInWindow: (
    node: FakeNode,
    cb: (x: number, y: number, w: number, h: number) => void,
  ): void => cb(11, 22, 100, 50),
  measureLayout: (
    to: FakeNode,
    from: FakeNode,
    _onFail: () => void,
    onSuccess: (left: number, top: number, w: number, h: number) => void,
  ): void => onSuccess(from.tag, 6, 100, 50),
}
Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- capture the public instance a host ref hands back -------------------

let box: unknown
let anchor: unknown
function App(): ReactElement {
  return (
    <View style={{ flex: 1 }}>
      <View ref={(instance) => { anchor = instance }} style={{ width: 10, height: 10 }} />
      <View ref={(instance) => { box = instance }} style={{ width: 50, height: 50 }} />
    </View>
  )
}
mount(9, <App />)

if (box == null || anchor == null) throw new Error('host refs handed back nothing')

function method(instance: unknown, name: string): (...args: unknown[]) => unknown {
  const candidate = Reflect.get(Object(instance), name)
  if (typeof candidate !== 'function') throw new Error(`ref instance has no ${name}() method`)
  return (...args: unknown[]) => Reflect.apply(candidate, instance, args)
}

// ---- measure: callback gets (x, y, width, height, pageX, pageY) ----------

let seenMeasure = ''
method(box, 'measure')((x: number, y: number, w: number, h: number, px: number, py: number) => {
  seenMeasure = `${x},${y},${w},${h},${px},${py}`
})
if (seenMeasure !== '1,2,100,50,11,22') {
  throw new Error(`measure delivered wrong frame: ${seenMeasure}`)
}

// ---- measureInWindow: (x, y, width, height) ------------------------------

let seenWindow = ''
method(box, 'measureInWindow')((x: number, y: number, w: number, h: number) => {
  seenWindow = `${x},${y},${w},${h}`
})
if (seenWindow !== '11,22,100,50') {
  throw new Error(`measureInWindow delivered wrong frame: ${seenWindow}`)
}

// ---- measureLayout(relative, onSuccess): onSuccess(left, top, width, height) ---
// The fake echoes the RELATIVE node's tag as `left`, proving box measured against
// anchor (and that the public API's onSuccess sits in the native 4th-arg slot).

const anchorTag = findNodeHandle(anchor)
let seenLayout = ''
method(box, 'measureLayout')(anchor, (left: number, top: number, w: number, h: number) => {
  seenLayout = `${left},${top},${w},${h}`
})
if (seenLayout !== `${anchorTag},6,100,50`) {
  throw new Error(`measureLayout delivered wrong frame: ${seenLayout} (anchor tag ${anchorTag})`)
}

// ---- findNodeHandle: the node's committed reactTag, idempotent on a number ----

if (typeof anchorTag !== 'number') throw new Error('findNodeHandle(ref) returned no tag')
if (findNodeHandle(anchorTag) !== anchorTag) throw new Error('findNodeHandle(number) must be identity')
if (findNodeHandle(null) !== null) throw new Error('findNodeHandle(null) must be null')

// ---- setNativeProps: a scoped re-commit clones the box with the new prop ----

// A PARTIAL style override must MERGE onto the box's declarative style (RN
// semantics), not replace it — opacity is added while width/height survive.
method(box, 'setNativeProps')({ style: { opacity: 0.25 } })
function find(node: FakeNode, viewName: string, predicate: (n: FakeNode) => boolean): FakeNode | undefined {
  if (node.viewName === viewName && predicate(node)) return node
  for (const child of node.children) {
    const hit = find(child, viewName, predicate)
    if (hit) return hit
  }
  return undefined
}
const root = committed[0]
if (!root) throw new Error('nothing committed')
const updated = find(root, 'RCTView', (n) => n.props.opacity === 0.25)
if (!updated) throw new Error('setNativeProps did not re-commit the box with opacity 0.25')
if (updated.props.width !== 50 || updated.props.height !== 50) {
  throw new Error(
    `setNativeProps replaced the style instead of merging: width=${String(updated.props.width)} height=${String(updated.props.height)}`,
  )
}

console.log('imperative-ref: measure / measureInWindow / measureLayout / findNodeHandle / setNativeProps')
console.log('imperative-ref.smoke OK')
