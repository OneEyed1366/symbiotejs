// createAnimatedComponent: the Vue twin of the React wrapper. It wraps a base component
// (View / Text / Image / ScrollView / any) so it accepts AnimatedNodes in its props.
// Same JS-driven path, NO native driver in the hot loop: a frame is the scoped commit
// setNativeProps drives from the AnimatedProps leaf (ADR 0016). The framework-agnostic
// pieces (reduceProps / readPassthroughStyle / resolveHostNode / isAnimatedNode + the
// AnimatedProps leaf itself) live in @symbiotejs/engine, shared verbatim with React; here
// Vue supplies only the lifecycle.
//
// React → hooks: useMemo(leaf) + three useEffects + a callback ref. Vue → reactivity:
// a render that rebuilds the leaf each pass (like React's per-render useMemo(rest)) + a
// post-commit reconcile (onMounted/onUpdated, the Vue twin of a post-commit useEffect) +
// a function ref. The per-frame path is unchanged and NEVER goes through Vue render:
// value.setValue / animation -> flushValue -> AnimatedProps.update() -> setNativeProps(node).

import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  shallowRef,
  type Component,
  type SetupContext,
} from '@vue/runtime-core';
import {
  AnimatedProps,
  attachNativeEventHandler,
  isNativeAnimatedAvailable,
  reduceProps,
  readPassthroughStyle,
  resolveHostNode,
} from '@symbiotejs/engine';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';

// RN's prop carrying explicit (already-rasterized) values that override the animated prop in
// the COMMITTED props (sticky-header passthrough). Named once here so render/reconcile agree.
const PASSTHROUGH_PROP = 'passthroughAnimatedPropExplicitValues';

// A base component is either a functional component (View / Text / Image, a function) or a
// stateful defineComponent (ScrollView, an object). Read its display name without a cast for
// the wrapper's devtools name.
function baseName(component: Component): string {
  if (component === null || (typeof component !== 'function' && typeof component !== 'object')) {
    return 'Anonymous';
  }
  const display = Reflect.get(component, 'displayName');
  if (typeof display === 'string') return display;
  const name = Reflect.get(component, 'name');
  if (typeof name === 'string') return name;
  return 'Anonymous';
}

export function createAnimatedComponent(Component: Component) {
  return defineComponent({
    name: `Animated(${baseName(Component)})`,
    inheritAttrs: false,
    setup(_props, { attrs: rawAttrs, slots, expose }: SetupContext) {
      // The committed host node, held by IDENTITY in a shallowRef (the reactivity rule: a deep
      // ref() would run it through toReactive() and hand back a Proxy, so AnimatedProps.setNativeView
      // / attachNativeEventHandler would miss the engine's WeakMap mirror, keyed on the raw node).
      // See .claude/skills/vue-adapter-reactivity. Same rule as Switch / ScrollView host nodes.
      const nodeRef = shallowRef<unknown>(null);
      // The base component's public instance (a ScrollView handle, or the host node for View).
      // Forwarded to a parent ref via expose(). shallowRef: it may itself BE an engine node.
      const instanceRef = shallowRef<unknown>(null);

      // The AnimatedProps leaf the next reconcile should wire in, rebuilt by render each pass
      // (like React's per-render useMemo(rest)). Plain (non-reactive) so writing it in render
      // triggers no reactive effect. `attached` is the leaf currently in the value graph.
      let pendingLeaf: AnimatedProps | null = null;
      let attached: AnimatedProps | null = null;
      // The current non-passthrough props, kept so the post-commit event-attach can re-scan them.
      let currentRest: Record<string, unknown> = {};
      let wantsNative = false;
      // Detachers for any Animated.event prop bound natively to the committed node (JS path: none).
      let eventDetachers: Array<() => void> = [];

      function detachEvents(): void {
        for (const detach of eventDetachers) detach();
        eventDetachers = [];
      }

      // Native-attach any Animated.event prop (e.g. onScroll={Animated.event(…,{useNativeDriver:true})})
      // to the committed node. attachNativeEventHandler no-ops (returns undefined) unless the prop is a
      // native event handler with a committed tag, so the JS path stays the fallback. Rebound on every
      // reconcile so a new inline event re-attaches; detached first to avoid leaking the prior binding.
      function attachEvents(): void {
        detachEvents();
        const node = nodeRef.value;
        if (node === null) return;
        for (const key of Object.keys(currentRest)) {
          const attachment = attachNativeEventHandler(node, key, currentRest[key]);
          if (attachment !== undefined) eventDetachers.push(attachment.detach);
        }
      }

      // Post-commit reconcile (onMounted first paint, onUpdated every re-render, the Vue twin of a
      // post-commit useEffect). Attach the NEW leaf BEFORE detaching the OLD one: order is load-bearing.
      // A shared Value self-detaches (and drops its native node) the instant its child count hits
      // zero, so detaching first would kill a running native animation on any unrelated re-render
      // (mirrors RN's AnimatedComponent._attachProps). Then bind the captured node, go native if wanted,
      // and rebind native events.
      function reconcile(): void {
        const newLeaf = pendingLeaf;
        if (newLeaf === null) return;
        newLeaf.__attach();
        if (attached !== null && attached !== newLeaf) attached.__detach();
        attached = newLeaf;
        const node = nodeRef.value;
        if (node !== null) newLeaf.setNativeView(node);
        if (wantsNative) newLeaf.__makeNative();
        attachEvents();
      }

      onMounted(reconcile);
      onUpdated(reconcile);
      // Final teardown: detach the last-attached leaf and any native events on unmount.
      onBeforeUnmount(() => {
        detachEvents();
        if (attached !== null) {
          attached.__detach();
          attached = null;
        }
      });

      // Function ref (held stably, so Vue doesn't re-invoke it per patch). On mount the base hands
      // back its public instance; resolve it to the underlying host node (unwrapping a scroll-container
      // handle via getScrollNode), record THAT for the leaf binding / event attach, and keep the
      // ORIGINAL instance for ref forwarding. Vue calls it with null on unmount, node clears.
      const captureRef = (instance: unknown): void => {
        instanceRef.value = instance;
        nodeRef.value = resolveHostNode(instance);
      };

      // Forward the caller's ref to the base instance: a parent ref on Animated.ScrollView still gets
      // scrollTo (the exposed handle), on Animated.View the host node. A delegating proxy because the
      // instance is captured async (after mount), so a snapshot exposed at setup time would be null.
      expose(
        new Proxy(Object.create(null), {
          get: (_target, key): unknown => {
            const instance = instanceRef.value;
            if (instance === null || typeof instance !== 'object') return undefined;
            return Reflect.get(instance, key);
          },
          has: (_target, key): boolean => {
            const instance = instanceRef.value;
            return instance !== null && typeof instance === 'object' && Reflect.has(instance, key);
          },
        }),
      );

      return () => {
        // Fold kebab template props to camelCase before splitting (idempotent: the base component
        // normalizes too, but keep `rest`/reduceProps on the RN contract here as well).
        const attrs = normalizeVueAttrs(rawAttrs);
        // Split the incoming attrs into the passthrough (consumed) and the rest (forwarded). The
        // passthrough never reaches the base as a prop; it only overrides the committed style below.
        const rest: Record<string, unknown> = {};
        let passthrough: unknown;
        for (const key of Object.keys(attrs)) {
          if (key === PASSTHROUGH_PROP) {
            passthrough = attrs[key];
            continue;
          }
          rest[key] = attrs[key];
        }
        currentRest = rest;
        // Native driving is opt-in per the passthrough prop AND requires a real native module;
        // headless / unsupported hosts keep the JS flush path (and the JS smokes green).
        wantsNative = passthrough != null && isNativeAnimatedAvailable();

        // One AnimatedProps leaf per render pass (rebuilt like React's useMemo(rest)); the post-commit
        // reconcile wires it into the graph and swaps the previous one out.
        pendingLeaf = new AnimatedProps(rest);

        // Reduced props are concrete (animated nodes replaced by their current values) so the first
        // paint carries real values, exactly like React's first render.
        const reduced = reduceProps(rest);
        // Override the committed style with the explicit passthrough values (last wins via the style
        // array, which the commit layer flattens) so the ShadowTree carries the current transform.
        const passthroughStyle = readPassthroughStyle(passthrough);
        if (passthroughStyle !== undefined) {
          reduced.style =
            reduced.style === undefined ? passthroughStyle : [reduced.style, passthroughStyle];
        }
        reduced.ref = captureRef;
        return h(
          Component,
          reduced,
          slots.default !== undefined ? { default: slots.default } : undefined,
        );
      };
    },
  });
}
