// createTunnel — the Vue twin of the React adapter's create-tunnel.ts. Teleport only moves
// content within a single surface's own tree, so sharing content ACROSS two independently
// mounted surfaces needs a different mechanism: a plain shared reactive registry instead of
// a Fabric-tree relocation. `Out` lives in whichever component should
// PAINT the content; its own reactive read makes THAT surface's normal render/commit pick it
// up — no cross-surface reach-in, no rootTag lookup, works whether In and Out share a
// surface or not.
//
// Both In and Out are COMPONENTS, not composables: a composable can't accept template
// markup (slots only exist on components), so app code writes ordinary <template> —
// <tunnel.In>…</tunnel.In> / <tunnel.Out /> — exactly like the existing Teleport wrapper.
// h()/render functions stay inside THIS file; they never leak into app-level SFC script.

import { defineComponent, onUnmounted, reactive, type Slot } from 'vue';

export interface ITunnel {
  /** Register the default slot's content under the tunnel — mount this anywhere, any surface. */
  In: ReturnType<typeof defineComponent>;
  /** Renders everything currently tunneled in, in registration order. Mount this in the
   *  component that should actually paint the content. */
  Out: ReturnType<typeof defineComponent>;
}

export function createTunnel(): ITunnel {
  const items = reactive(new Map<number, Slot>());
  let nextId = 0;

  const In = defineComponent({
    name: 'TunnelIn',
    setup(_props, { slots }) {
      const id = nextId++;
      onUnmounted(() => items.delete(id));
      // Runs on every render of In — Vue's own reactivity picks up the Map mutation (the
      // slot function itself re-reads whatever reactive state it closes over), no manual
      // notify needed, unlike the React twin's useSyncExternalStore.
      return () => {
        items.set(id, slots.default ?? (() => []));
        return null;
      };
    },
  });

  const Out = defineComponent({
    name: 'TunnelOut',
    setup() {
      return () => Array.from(items.values()).flatMap(slot => slot());
    },
  });

  return { In, Out };
}
