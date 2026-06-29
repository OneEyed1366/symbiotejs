// findNodeHandle, the Vue adapter twin of adapters/react/src/host-instance.ts. RN's
// "ref/instance -> native reactTag" lookup, the seam imperative-interop libraries
// (reanimated, gesture-handler, react-navigation) reach through. A Vue template/function ref
// to a symbiote host element falls through to the raw engine SymbioteNode, and the Vue
// renderer grafts the public-instance API onto it (toPublicInstance in renderer.ts), so the
// node a ref receives carries measure / setNativeProps / focus exactly like React's
// getPublicInstance. IHostInstance is therefore that grafted node — re-exported from the
// engine so React and Vue share one definition.
//
// The node -> tag resolution itself belongs to the engine (getNativeTag, keyed on the raw
// node in the commit mirror); this only adapts the Vue-shaped inputs onto it. Accepts, in
// RN's idempotent spirit: a bare number (passes through), an engine host node (a ref's
// .value), a Vue Ref carrying either (unwrapped), or null / undefined (-> null). An
// uncommitted or unknown input has no tag yet and surfaces as null.

import { isRef, toRaw } from '@vue/runtime-core';
import { getNativeTag, isSymbioteNode, dlog } from '@symbiote/engine';

// The public instance a Vue host ref hands back: the grafted engine node. Re-exported from the
// engine so a call site reads in parity with the React adapter's IHostInstance.
export type { IHostInstance } from '@symbiote/engine';

export function findNodeHandle(componentOrHandle: unknown): number | null {
  const candidate = isRef(componentOrHandle) ? componentOrHandle.value : componentOrHandle;
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate === 'number') return candidate;
  // A plain ref() would have wrapped the node in a reactive Proxy; the engine mirror is
  // keyed on the RAW node, so recover it before the lookup or getNativeTag misses. See
  // the vue-adapter-reactivity skill.
  const node = toRaw(candidate);
  if (isSymbioteNode(node)) {
    const tag = getNativeTag(node) ?? null;
    dlog(`findNodeHandle: component=${node.component} tag=${tag}`);
    return tag;
  }
  dlog('findNodeHandle: input did not resolve to a symbiote host node');
  return null;
}
