// The Animated dependency graph — a directed acyclic graph of value nodes that
// sits ABOVE symbiote's shadow tree. Ported from React Native's AnimatedNode.js
// + AnimatedWithChildren.js, with every native-driver path
// (NativeAnimatedHelper / __isNative / __makeNative / __getNativeConfig) removed:
// this is the JS-driven engine (ADR 0016). The native driver re-introduces those
// hooks separately (ADR 0017).
//
// Two phases drive an update:
//   A) top-down  — when a Value changes, walk children to the leaf nodes (the
//                  ones with an `update()` method) and flag them.
//   B) bottom-up — each flagged leaf re-pulls its whole subtree via __getValue()
//                  to rebuild composite props (e.g. transform from many parents).

import {
  generateNativeNodeTag,
  nativeAnimated,
  type NativeNodeConfig,
} from './native/native-animated'

export type ValueListener = (state: { value: number }) => void

let nextListenerId = 1

export class AnimatedNode {
  private readonly listeners = new Map<string, ValueListener>()

  // Native-driver state (ADR 0017). Off until a useNativeDriver animation marks
  // the graph native; `nativeTag` is the node's identity in the native module,
  // allocated lazily on first reference (which also creates the native node).
  protected isNative = false
  private nativeTag: number | undefined

  __attach(): void {}

  __detach(): void {
    this.removeAllListeners()
    if (this.isNative && this.nativeTag !== undefined) {
      nativeAnimated.dropAnimatedNode(this.nativeTag)
      this.nativeTag = undefined
    }
  }

  __isNative(): boolean {
    return this.isNative
  }

  // Mirror this node (and its subtree) into the native module. Two strict phases,
  // because the native module asserts a node exists before connectAnimatedNodes
  // references it (a connect-before-create crashes RCTNativeAnimatedNodesManager):
  //   1. CREATE every node — __getNativeTag enqueues createAnimatedNode. A config
  //      only READS child tags (also creating them), never connects, so creation is
  //      side-effect-free w.r.t. edges and createAnimatedNode may precede its refs.
  //   2. CONNECT every edge — only once both endpoints are guaranteed created.
  __makeNative(): void {
    if (this.isNative) return
    this.isNative = true
    this.__getNativeTag() // phase 1: create self (config may create referenced children)
    this.__connectNativeChildren() // phase 2: wire edges
  }

  // Phase 2 hook. A leaf has no graph children; AnimatedWithChildren wires its own.
  protected __connectNativeChildren(): void {}

  // The node's native tag, minting it (and creating the native node) on first use.
  // Stable for the node's life — the native side keys animations off it. CREATION
  // ONLY: the config reads child tags but issues no connectAnimatedNodes, so a node
  // is safe to create before the nodes its config references exist.
  __getNativeTag(): number {
    if (this.nativeTag === undefined) {
      this.nativeTag = generateNativeNodeTag()
      nativeAnimated.createAnimatedNode(this.nativeTag, this.__getNativeConfig())
    }
    return this.nativeTag
  }

  // Each concrete node type (value / interpolation / style / transform / props)
  // overrides this with its native shape; a plain node cannot be offloaded.
  __getNativeConfig(): NativeNodeConfig {
    throw new Error('This animated node type cannot be used as a native animated node')
  }

  // The current rasterized value. Heterogeneous across the graph — scalar nodes
  // return a number, a props leaf returns a flat payload — so the base is
  // `unknown` and numeric subclasses narrow it.
  __getValue(): unknown {
    return undefined
  }

  __getAnimatedValue(): unknown {
    return this.__getValue()
  }

  __addChild(_child: AnimatedNode): void {}
  __removeChild(_child: AnimatedNode): void {}
  __getChildren(): readonly AnimatedNode[] {
    return []
  }

  // Asynchronous observation of value updates. There is no synchronous read of a
  // value once it is driven by an animation, so consumers subscribe instead.
  addListener(callback: ValueListener): string {
    const id = String(nextListenerId++)
    this.listeners.set(id, callback)
    return id
  }

  removeListener(id: string): void {
    this.listeners.delete(id)
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }

  hasListeners(): boolean {
    return this.listeners.size > 0
  }

  __callListeners(value: number): void {
    const event = { value }
    this.listeners.forEach((listener) => {
      listener(event)
    })
  }
}

export class AnimatedWithChildren extends AnimatedNode {
  protected children: AnimatedNode[] = []

  // Phase 2: every child's subtree is fully made native (created + its own edges
  // wired) before we connect this node to it, so both endpoints exist at connect.
  protected override __connectNativeChildren(): void {
    for (const child of this.children) {
      child.__makeNative()
    }
    for (const child of this.children) {
      nativeAnimated.connectAnimatedNodes(this.__getNativeTag(), child.__getNativeTag())
    }
  }

  override __addChild(child: AnimatedNode): void {
    if (this.children.length === 0) {
      this.__attach()
    }
    this.children.push(child)
    // A child joining an already-native parent must itself be made native and wired.
    if (this.isNative) {
      child.__makeNative()
      nativeAnimated.connectAnimatedNodes(this.__getNativeTag(), child.__getNativeTag())
    }
  }

  override __removeChild(child: AnimatedNode): void {
    const index = this.children.indexOf(child)
    if (index === -1) {
      return
    }
    if (this.isNative && child.__isNative()) {
      nativeAnimated.disconnectAnimatedNodes(this.__getNativeTag(), child.__getNativeTag())
    }
    this.children.splice(index, 1)
    if (this.children.length === 0) {
      this.__detach()
    }
  }

  override __getChildren(): readonly AnimatedNode[] {
    return this.children
  }

  override __callListeners(value: number): void {
    super.__callListeners(value)
    // A native-driven node's children are updated natively; don't also walk them
    // here (their values aren't tracked in JS while native owns the animation).
    if (this.isNative) return
    for (const child of this.children) {
      child.__callListeners(numericValueOf(child))
    }
  }
}

function numericValueOf(node: AnimatedNode): number {
  const value = node.__getValue()
  return typeof value === 'number' ? value : 0
}

// A leaf carries an `update()` that re-pulls its subtree and commits — the seam
// where the value graph meets symbiote's engine. It is NOT declared on the base:
// a class field would be initialised to undefined and shadow a subclass method
// under useDefineForClassFields. So leaves are detected structurally instead.
function leafUpdate(node: AnimatedNode): (() => void) | undefined {
  const candidate = Reflect.get(node, 'update')
  return typeof candidate === 'function' ? () => candidate.call(node) : undefined
}

// Top-down walk to the leaves, then re-pull each leaf (deduped by node identity,
// so a diamond in the graph still updates a leaf once).
export function flushValue(rootNode: AnimatedNode): void {
  const leaves = new Map<AnimatedNode, () => void>()
  function collect(node: AnimatedNode): void {
    const update = leafUpdate(node)
    if (update !== undefined) {
      leaves.set(node, update)
    } else {
      node.__getChildren().forEach(collect)
    }
  }
  collect(rootNode)
  leaves.forEach((update) => update())
}
