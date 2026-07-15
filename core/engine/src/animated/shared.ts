// Framework-agnostic helpers for createAnimatedComponent. Both the React and Vue
// adapters wrap a base component so it accepts AnimatedNodes in its props; the wrap
// mechanism (capture the host node, build an AnimatedProps leaf, reduce animated
// props to their current values, override with the passthrough style) is pure JS,
// identical across frameworks. Only `assignRef` is framework-ref-specific and stays
// per-adapter; everything here is shared so a new adapter reuses it verbatim.

import { AnimatedNode } from './graph';
import { AnimatedStyle } from './style';

export function isAnimatedNode(value: unknown): value is AnimatedNode {
  return value instanceof AnimatedNode;
}

// RN's `passthroughAnimatedPropExplicitValues` carries explicit (already-rasterized) prop
// values (e.g. a sticky header's debounced `{style:{transform:[{translateY}]}}`) that must
// override the animated prop in the COMMITTED props so the Fabric ShadowTree (hit-testing)
// stays current while the native driver animates. Read its `style` without a cast.
export function readPassthroughStyle(passthrough: unknown): unknown {
  if (typeof passthrough !== 'object' || passthrough === null) return undefined;
  return Reflect.get(passthrough, 'style');
}

// Replace animated entries in a props map with their current rasterized values so the
// first paint (and every re-render) carries concrete props. `style` is run through
// AnimatedStyle so an animated style key resolves to its current number.
export function reduceProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (key === 'style') {
      const styleNode = AnimatedStyle.from(value);
      out[key] = styleNode !== undefined ? styleNode.__getValue() : value;
    } else if (isAnimatedNode(value)) {
      out[key] = value.__getValue();
    } else {
      out[key] = value;
    }
  }
  return out;
}

// A ScrollView / FlatList / SectionList ref captures an imperative handle (RN's
// getScrollableNode pattern), NOT the raw host node, so a native event or animated
// props have nothing to bind to. Unwrap it via getScrollNode() to the underlying
// SymbioteNode; View / Text / Image already hand back the node directly, so they fall
// through unchanged.
export function resolveHostNode(instance: unknown): unknown {
  if (instance !== null && typeof instance === 'object') {
    const getScrollNode = Reflect.get(instance, 'getScrollNode');
    if (typeof getScrollNode === 'function') return getScrollNode.call(instance);
  }
  return instance;
}
