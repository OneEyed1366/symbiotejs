// Pure Fabrication (GRASP): the leaf-lifecycle orchestration shared by every Animated*
// wrapper, extracted out of AnimatedComponentBase so AnimatedImage — which cannot extend
// AnimatedComponentBase, since it must extend ImageBase for TS's-native image handling —
// gets the SAME logic via composition instead of copy-pasting it. Framework-thin on
// purpose: it knows nothing about Angular (@ViewChild, DI, change detection), only the
// engine's Animated leaf + commit primitives, so it stays testable without any Angular
// bootstrap. NOTE: react/vue drive this same dance through their own runtime HOC
// (createAnimatedComponent) rather than a class, so there is no cross-adapter dedup
// opportunity here yet — this Pure Fabrication is local to the angular adapter.
import {
  AnimatedProps,
  attachNativeEventHandler,
  dlog,
  whenCommitted,
  type ISymbioteNode,
} from '@symbiote-native/engine';

export class AnimatedLeafBinder {
  // The leaf currently wired into the value graph. Null until the first reconcile.
  private attached: AnimatedProps | null = null;
  // The whenCommitted waiter for the current leaf's node binding, cancelled before the next.
  private cancelBind: (() => void) | undefined;
  // Detachers for any Animated.event prop bound natively to the committed node (JS path: none).
  private eventDetachers: Array<() => void> = [];

  // `resolveNode` stays a caller-supplied resolver (not a constructor-captured node) so this
  // class never needs to know HOW the host node is found — AnimatedComponentBase and
  // AnimatedImage both resolve it the same way (resolveHostNode + isSymbioteNode over their
  // own @ViewChild), but that's Angular DI state this binder has no business touching.
  // `label` is purely diagnostic (dlog), mirroring the constructor.name the pre-extraction
  // dlog call used.
  constructor(
    private readonly resolveNode: () => ISymbioteNode | null,
    private readonly label: string,
  ) {}

  // Build a fresh AnimatedProps leaf from the current props (the React/Vue per-render
  // useMemo(rest)), wire it into the graph, and swap the previous one out. Attach the NEW leaf
  // BEFORE detaching the OLD one: a shared Value self-detaches (dropping its native node) the
  // instant its child count hits zero, so detaching first would kill a running native animation
  // on any unrelated re-render (mirrors RN's AnimatedComponent._attachProps). Then bind the
  // committed node, go native if wanted, and rebind native events.
  reconcile(props: Record<string, unknown>, wantsNative: boolean): void {
    dlog(`${this.label} reconcile`);
    const newLeaf = new AnimatedProps(props);
    newLeaf.__attach();
    if (this.attached !== null && this.attached !== newLeaf) this.attached.__detach();
    this.attached = newLeaf;

    this.bindNode(newLeaf, props, wantsNative);
  }

  // Bind the leaf to the host's Fabric node THROUGH whenCommitted: under Angular's zoneless
  // batched change detection the inner host's tag does not exist yet at ngAfterViewInit time
  // (the same async-commit gotcha Vue documents), so binding eagerly would no-op. whenCommitted
  // runs the action now if already committed, else after the commit that assigns the tag.
  private bindNode(
    leaf: AnimatedProps,
    props: Record<string, unknown>,
    wantsNative: boolean,
  ): void {
    this.cancelBind?.();
    this.cancelBind = undefined;
    const node = this.resolveNode();
    if (node === null) return;
    this.cancelBind = whenCommitted(node, () => {
      leaf.setNativeView(node);
      if (wantsNative) leaf.__makeNative();
      this.attachEvents(node, props);
    });
  }

  // Native-attach any Animated.event prop (e.g. onScroll={Animated.event(…,{useNativeDriver:true})})
  // to the committed node. attachNativeEventHandler no-ops (returns undefined) unless the prop is a
  // native event handler with a committed tag, so the JS path stays the fallback. Rebound each
  // reconcile so a new inline event re-attaches; detached first to avoid leaking the prior binding.
  private attachEvents(node: ISymbioteNode, props: Record<string, unknown>): void {
    this.detachEvents();
    for (const key of Object.keys(props)) {
      const attachment = attachNativeEventHandler(node, key, props[key]);
      if (attachment !== undefined) this.eventDetachers.push(attachment.detach);
    }
  }

  private detachEvents(): void {
    for (const detach of this.eventDetachers) detach();
    this.eventDetachers = [];
  }

  // Tear down everything: cancel a still-pending bind, drop native event listeners, detach the
  // current leaf from the value graph. Safe to call even if reconcile() was never called.
  destroy(): void {
    this.cancelBind?.();
    this.cancelBind = undefined;
    this.detachEvents();
    if (this.attached !== null) {
      this.attached.__detach();
      this.attached = null;
    }
  }
}
