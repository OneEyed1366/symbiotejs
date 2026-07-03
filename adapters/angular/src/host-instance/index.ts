// findNodeHandle, the Angular twin of adapters/react/src/host-instance.ts and
// adapters/vue/src/host-instance/index.ts. RN's "ref/instance -> native reactTag" lookup,
// the seam imperative-interop libraries reach through.
//
// Angular template refs on a primitive host (`<View #myView>`) receive the component instance,
// not the raw engine node. SymbiotePrimitiveHost exposes `nativeElement`, which holds the
// engine host node that `getNativeTag` is keyed on. This adapter accepts:
//   - a bare number (idempotent)
//   - an engine host node / public instance
//   - an Angular ElementRef wrapping the host node
//   - a SymbiotePrimitiveHost component instance (via its public `nativeElement` getter)
//   - null/undefined -> null
// An uncommitted or unknown input surfaces as null.

import { ElementRef } from '@angular/core';
import { getNativeTag, isSymbioteNode, type ISymbioteNode } from '@symbiotejs/engine';

export type { IHostInstance } from '@symbiotejs/engine';

function resolveHostNode(candidate: unknown): ISymbioteNode | null {
  if (candidate === null || candidate === undefined) return null;
  if (isSymbioteNode(candidate)) return candidate;
  if (candidate instanceof ElementRef) return resolveHostNode(candidate.nativeElement);
  const maybeHost = candidate as { nativeElement?: unknown };
  if (typeof maybeHost.nativeElement !== 'undefined') {
    return resolveHostNode(maybeHost.nativeElement);
  }
  return null;
}

export function findNodeHandle(componentOrHandle: unknown): number | null {
  if (componentOrHandle === null || componentOrHandle === undefined) return null;
  if (typeof componentOrHandle === 'number') return componentOrHandle;
  const node = resolveHostNode(componentOrHandle);
  return node ? (getNativeTag(node) ?? null) : null;
}
