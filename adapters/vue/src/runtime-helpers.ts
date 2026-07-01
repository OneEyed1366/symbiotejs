// Metro rewrites every compiled `from 'vue'` import to point HERE instead of at bare
// `@vue/runtime-core` (see examples/*/metro-vue-transformer.js). Most of the compiler's injected
// helpers (ref, computed, withDirectives, openBlock, …) already live in runtime-core untouched —
// re-exported below. But two Vue template directives compile to a runtime-helper import that
// ONLY exists in `@vue/runtime-dom` (vShow, vModelText, vModelCheckbox, vModelSelect), written
// directly against a real HTMLElement (el.style.display, el.value, addEventListener). We have no
// DOM, so those don't exist for us — rewriting straight to runtime-core leaves `v-show` either
// failing at import time or silently resolving to `undefined` (a no-op directive). This module is
// the interception point: it supplies our OWN implementation under the same export name, so the
// compiler's import keeps resolving and the directive actually does something.
//
// See the vue-adapter-directives skill for the full rationale and scope (what this does and does
// NOT cover — native-element v-model is a separate, out-of-scope case).

export * from '@vue/runtime-core';

import type { ObjectDirective } from '@vue/runtime-core';
import { setNativeProps, whenCommitted, type ISymbioteNode } from '@symbiote/engine';

// setNativeProps merges a partial `style` object onto the node's current one (never clobbering
// other declarative style fields) and re-commits via the node's OWN tracked rootTag — no
// SymbioteSurface reference needed here, which a directive hook has no access to anyway.
//
// whenCommitted, not a direct call: Vue's `mounted` hook fires synchronously during the patch
// pass, but this renderer coalesces the actual Fabric commit onto a microtask
// (surface.requestCommit()), so the node may have no committed tag yet — the same async-commit
// race TextInput's autoFocus guards against (see vue-adapter-reactivity). A bare setNativeProps
// here would silently no-op with no retry on the very first mount.
const pendingShowCommits = new WeakMap<ISymbioteNode, () => void>();

function applyShow(el: ISymbioteNode, value: boolean): void {
  pendingShowCommits.get(el)?.();
  const cancel = whenCommitted(el, () =>
    setNativeProps(el, { style: { display: value ? undefined : 'none' } }),
  );
  pendingShowCommits.set(el, cancel);
}

export const vShow: ObjectDirective<ISymbioteNode, boolean> = {
  mounted: (el, { value }) => applyShow(el, value),
  updated: (el, { value }) => applyShow(el, value),
  // Drop a still-pending first-commit wait if the element unmounts before it ever lands.
  unmounted: el => pendingShowCommits.get(el)?.(),
};
