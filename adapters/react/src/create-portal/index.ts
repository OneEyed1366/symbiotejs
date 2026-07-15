// createPortal — react-reconciler's Fiber-level portal primitive (HostPortal), not a
// react-dom re-export. Stock React Native does NOT support this: real RN's Fabric host
// config runs in PERSISTENT mode and never implements the mutation-mode container ops
// (appendChildToContainer / insertInContainerBefore / removeChildFromContainer) createPortal
// needs — see facebook/react-native#36273 ("Portal children gets overriden in Fabric").
// @symbiote-native/react is deliberately MUTATION mode and already implements all three (host-config.ts),
// so a portal here structurally works where it never could in real RN.
//
// Scope (v1): the target must be an already-mounted node WITHIN THE SAME SURFACE as the portal's
// call site (e.g. a ref to a persistent "overlay host" View near your app root) — not a second,
// independently-mounted SymbioteSurface. Cross-surface targets aren't wired: resetAfterCommit only
// fires for the primary root's own container, so a different surface's tree would never repaint.

import type { ReactNode, ReactPortal } from 'react';
import { isSymbioteNode, SymbioteSurface, type ISymbioteNode } from '@symbiote-native/engine';
import reconciler from '../host-config';

export type IPortalContainer = ISymbioteNode | SymbioteSurface;

export function createPortal(
  children: ReactNode,
  container: IPortalContainer,
  key?: string | null,
): ReactPortal {
  if (!(container instanceof SymbioteSurface) && !isSymbioteNode(container)) {
    throw new Error(
      'createPortal target must be an already-mounted host node (e.g. a ref to a rendered <View>) — got something else. Did you forget `.current`/`.value`, or pass a CSS-selector-style string?',
    );
  }
  // @ts-expect-error @types/react-reconciler's ReactPortal (containerInfo/implementation) and
  // react's own ReactPortal (type/props, a ReactElement) are different interfaces describing the
  // SAME runtime object; react-reconciler's is what reconciler.createPortal actually returns.
  return reconciler.createPortal(children, container, null, key ?? null);
}
