// createTunnel — the cross-surface answer to createPortal's same-surface-only scope.
// Prior art: pmndrs/tunnel-rat exists precisely because a real
// createPortal cannot reach across two genuinely separate reconciler roots — see
// github.com/facebook/react/issues/17147 ("react-reconciler & portals: missing root
// instance"). The fix is the one the ecosystem already settled on: don't reach into a
// foreign surface's commit machinery — let that surface commit ITSELF, normally, by reading
// from a store it's already subscribed to.
//
// Both In and Out are COMPONENTS (the Vue twin's shape, and the same pattern as
// Context.Provider/Context.Consumer) — NOT hooks. This isn't just nicer call-site ergonomics:
// it's what makes the cascade in the first place structurally impossible. An earlier
// hook-based version (`useTunnelIn`/`useTunnelOut`, called directly inside one component)
// produced a genuine infinite render loop — a silent white screen on device, no thrown error
// — because notify() forces a re-render of whichever component's useSyncExternalStore call
// subscribed, and when THAT was the SAME component that also called useTunnelIn, its own
// effect re-ran and notified again, forever (this custom renderer's synchronous commit loop
// has no "Maximum update depth exceeded" guard to catch it). As separate components, notify()
// only forces Out's OWN render scope — never In's, even when both are children of the same
// parent — so the update has nowhere to bounce back to. `Out` lives inside whichever surface
// should PAINT the content (e.g. a persistent overlay-host surface); `In` lives ANYWHERE, same
// surface or a totally different one, and never touches a Fabric node directly, so there is
// no "target must already be mounted" guard to satisfy at all.

import { Fragment, useEffect, useId, useSyncExternalStore, type ReactNode } from 'react';

export interface ITunnel {
  /** Renders nothing; registers its children under the tunnel from wherever it's mounted —
   *  any surface. */
  In: (props: { children: ReactNode }) => null;
  /** Renders everything currently tunneled in, in registration order. Mount this in the
   *  component that should actually paint the content. */
  Out: () => ReactNode;
}

export function createTunnel(): ITunnel {
  const items = new Map<string, ReactNode>();
  const listeners = new Set<() => void>();
  // useSyncExternalStore bails out via Object.is on the snapshot reference, so it must stay
  // stable between reads — rebuilt only when the Map actually changes, never inline.
  let snapshot: ReactNode[] = [];

  function notify(): void {
    snapshot = Array.from(items.values());
    listeners.forEach(listener => listener());
  }

  function In({ children }: { children: ReactNode }): null {
    const id = useId();
    // Every render of In: keep this id's content in sync. Safe to run unconditionally (no
    // dependency array) — In and Out are separate components, so notify()'s forced re-render
    // of Out never bounces back into In (see the file header for why that matters).
    useEffect(() => {
      // Wrapped in a keyed Fragment: Out renders `snapshot` as a list, and a bare ReactNode
      // (possibly a fragment-less element or a string) has no key of its own.
      items.set(id, <Fragment key={id}>{children}</Fragment>);
      notify();
    });
    // Once, on real unmount: drop this id for good.
    useEffect(
      () => () => {
        items.delete(id);
        notify();
      },
      [id],
    );
    return null;
  }

  function Out(): ReactNode {
    return useSyncExternalStore(
      listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => snapshot,
    );
  }

  return { In, Out };
}
