// AnimatedProps: the leaf where the value graph meets symbiote's commit engine.
// It holds the host SymbioteNode (the public instance a ref handed us) and a props
// map whose entries may be AnimatedNodes (an animated `style` becomes an
// AnimatedStyle, a bare animated prop stays an AnimatedNode). Each frame, the graph
// flushes to this leaf via its `update()` method, which re-pulls the current values
// into a flat partial and pushes it through shared's scoped setNativeProps: one
// targeted clone-on-write commit. Ported from RN's AnimatedProps.js, JS-driven path
// only: native config (__makeNative / __getNativeConfig / connectAnimatedNodeToView,
// ADR 0017) is stripped.
//
// `update` MUST be a method, not a class field: flushValue detects a leaf by reading
// a `update` function off the node, and under useDefineForClassFields a field
// initialiser would shadow it and break subclassing. (See shared graph.ts leafUpdate.)

import { AnimatedNode, AnimatedWithChildren } from './graph';
import { setNativeProps, getNativeTag } from '../commit';
import { isSymbioteNode, type ISymbioteNode } from '../node';
import { registerPostCommit } from '../post-commit';
import { nativeAnimated, type INativeNodeConfig } from './native/native-animated';
import { AnimatedStyle } from './style';

function isAnimatedNode(value: unknown): value is AnimatedNode {
  return value instanceof AnimatedNode;
}

// Leaves that went native before their view's Fabric tag existed. Under an async-batched
// commit (Vue/Svelte schedule completeRoot on a microtask) a native animation started in
// onMounted cascades to the leaf BEFORE the first commit assigns the tag, so connectToView
// finds no tag. We hold the leaf here and retry it once each commit assigns tags — the
// third connect trigger alongside setNativeView and __makeNative. React commits
// synchronously, so its leaves never land here.
const pendingViewConnects = new Set<AnimatedProps>();
registerPostCommit(() => {
  for (const leaf of pendingViewConnects) leaf.retryViewConnect();
});

// Split the incoming props into (1) the AnimatedNodes to subscribe to and (2) the
// props map with `style` wrapped in an AnimatedStyle when it holds animated values.
// A fully-static style stays a plain object and contributes no node.
function createAnimatedProps(inputProps: Record<string, unknown>): {
  nodes: AnimatedNode[];
  props: Record<string, unknown>;
} {
  const nodes: AnimatedNode[] = [];
  const props: Record<string, unknown> = {};
  for (const key of Object.keys(inputProps)) {
    const value = inputProps[key];
    // `children` is a React element (its $$typeof is a Symbol), managed by the
    // reconciler as real Fabric child nodes, never a serializable prop. The host
    // config strips it from every prop bag; the Animated flush must too, else each
    // frame's setNativeProps sends the element to Fabric and folly::dynamic throws
    // "JS Symbols are not convertible to dynamic" (Android is strict; iOS ignores it).
    if (key === 'children') continue;
    if (key === 'style') {
      const styleNode = AnimatedStyle.from(value);
      if (styleNode !== undefined) {
        props[key] = styleNode;
        nodes.push(styleNode);
      } else {
        props[key] = value;
      }
    } else if (isAnimatedNode(value)) {
      props[key] = value;
      nodes.push(value);
    } else {
      props[key] = value;
    }
  }
  return { nodes, props };
}

export class AnimatedProps extends AnimatedWithChildren {
  private readonly nodes: readonly AnimatedNode[];
  private readonly props: Record<string, unknown>;
  // The host view this leaf flushes onto. Null until a ref captures the rendered
  // base component's public instance via setNativeView.
  private target: ISymbioteNode | null = null;
  // The Fabric view tag this leaf is bound to natively (null until connected).
  // Kept so __detach can disconnect exactly what it connected (ADR 0017).
  private connectedViewTag: number | null = null;

  constructor(inputProps: Record<string, unknown>) {
    super();
    const { nodes, props } = createAnimatedProps(inputProps);
    this.nodes = nodes;
    this.props = props;
  }

  // Rasterize the whole props map: animated entries to their current value, static
  // entries passed through. The flat partial setNativeProps hoists onto the view.
  override __getValue(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(this.props)) {
      const value = this.props[key];
      out[key] = isAnimatedNode(value) ? value.__getValue() : value;
    }
    return out;
  }

  override __getAnimatedValue(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(this.props)) {
      const value = this.props[key];
      out[key] = isAnimatedNode(value) ? value.__getAnimatedValue() : value;
    }
    return out;
  }

  // Bind this leaf to the host view a ref just captured. A SymbioteNode is the
  // public instance the host config returns (getPublicInstance), so we guard
  // structurally rather than cast.
  setNativeView(instance: unknown): void {
    if (this.target !== null && this.target === instance) return;
    if (!isSymbioteNode(instance)) return;
    this.target = instance;
    // If a native-driven animation already made this leaf native (view attached
    // after the animation began), connect now.
    if (this.__isNative()) this.connectToView();
  }

  // The leaf seam (a method, never a field). flushValue calls this once per frame;
  // re-pull the current values and push them through the scoped commit. Skipped
  // until the view is captured and committed at least once (setNativeProps no-ops
  // on an uncommitted node).
  update(): void {
    if (this.target === null) return;
    setNativeProps(this.target, this.__getValue());
  }

  override __attach(): void {
    for (const node of this.nodes) node.__addChild(this);
  }

  override __detach(): void {
    pendingViewConnects.delete(this);
    if (this.__isNative()) {
      // Reset the view's animated props to their defaults (native no longer
      // tracks them) and unbind, before the graph drops the native node.
      nativeAnimated.restoreDefaultValues(this.__getNativeTag());
      this.disconnectFromView();
    }
    for (const node of this.nodes) node.__removeChild(this);
    this.target = null;
    super.__detach();
  }

  // ---- native driver (ADR 0017) -------------------------------------------

  // Marking the leaf native binds it to the host view. The value->...->props edges
  // are wired by the upstream walk (AnimatedWithChildren.__makeNative); the one
  // thing only the leaf can do is attach the props node to a real view tag.
  override __makeNative(): void {
    super.__makeNative();
    if (this.target !== null) this.connectToView();
  }

  private connectToView(): void {
    if (this.target === null || this.connectedViewTag !== null) return;
    const viewTag = getNativeTag(this.target);
    if (viewTag === undefined) {
      // The view isn't committed yet (async-batched commit): retry after the commit
      // that assigns its tag, via the post-commit hook.
      pendingViewConnects.add(this);
      return;
    }
    pendingViewConnects.delete(this);
    nativeAnimated.connectAnimatedNodeToView(this.__getNativeTag(), viewTag);
    this.connectedViewTag = viewTag;
  }

  // Post-commit retry of a connect deferred because the view tag wasn't assigned yet.
  // No-op once connected (connectToView short-circuits on connectedViewTag).
  retryViewConnect(): void {
    this.connectToView();
  }

  private disconnectFromView(): void {
    if (this.connectedViewTag === null) return;
    nativeAnimated.disconnectAnimatedNodeFromView(this.__getNativeTag(), this.connectedViewTag);
    this.connectedViewTag = null;
  }

  override __getNativeConfig(): INativeNodeConfig {
    const propsConfig: Record<string, number> = {};
    for (const key of Object.keys(this.props)) {
      const value = this.props[key];
      if (isAnimatedNode(value)) {
        // __getNativeTag only: creation is edge-free; the connect is a later phase.
        propsConfig[key] = value.__getNativeTag();
      }
    }
    return { type: 'props', props: propsConfig };
  }
}
