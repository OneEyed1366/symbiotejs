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
// Scope: this covers only Vue's own template directives (v-show, Teleport); native-element
// v-model is a separate, out-of-scope case.

export * from '@vue/runtime-core';

import {
  defineComponent,
  h,
  Teleport as VueTeleport,
  type ObjectDirective,
} from '@vue/runtime-core';
import {
  isSymbioteNode,
  setNativeProps,
  whenCommitted,
  type ISymbioteNode,
} from '@symbiote-native/engine';

// setNativeProps merges a partial `style` object onto the node's current one (never clobbering
// other declarative style fields) and re-commits via the node's OWN tracked rootTag — no
// SymbioteSurface reference needed here, which a directive hook has no access to anyway.
//
// whenCommitted, not a direct call: Vue's `mounted` hook fires synchronously during the patch
// pass, but this renderer coalesces the actual Fabric commit onto a microtask
// (surface.requestCommit()), so the node may have no committed tag yet — the same async-commit
// race TextInput's autoFocus guards against. A bare setNativeProps
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

// Teleport's `to` in the DOM world is usually a CSS-selector string ('body', '#modal-root'); we
// have no querySelector (renderer.ts stubs it to null, same as insertStaticContent), so `to` here
// must be an already-mounted host node — e.g. a ref to a persistent "overlay host" View rendered
// once near the app root — not a selector string. This wrapper shadows runtime-core's own
// `Teleport` (which the SFC compiler imports from 'vue' like vShow) purely to validate `to` BEFORE
// handing it to the real Teleport: a wrong value (string, plain object, an unrendered/reactive-
// wrapped node) throws immediately here instead of silently corrupting the retained tree deep
// inside insert/remove — the "don't let a dev accidentally break everything" case this exists for.
// Scope: same-surface targets only (see the React createPortal twin, create-portal.ts) — Vue's own
// Teleport internals (disabled toggling, move-on-update) work unmodified once `to` resolves to a
// real ISymbioteNode, since insert/remove/parentNode/nextSibling are already fully generic.
export const Teleport = defineComponent({
  name: 'Teleport',
  inheritAttrs: false,
  props: {
    to: { type: null, default: null },
    disabled: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => {
      const { to } = props;
      if (typeof to === 'string') {
        throw new Error(
          `Teleport target must be a host node ref, not a CSS-selector string ("${to}") — symbiote has no querySelector. Pass a ref to an already-rendered element instead (e.g. <View ref="overlayHost" />, then :to="overlayHost").`,
        );
      }
      if (to != null && !isSymbioteNode(to)) {
        throw new Error(
          'Teleport target is not a real host node — did you forget `.value` on a ref, or pass something symbiote never rendered?',
        );
      }
      return h(VueTeleport, { to, disabled: props.disabled }, slots);
    };
  },
});
