// A surface is one mounted root: it owns the rootTag handed down by the native
// Fabric host and the list of top-level retained nodes. Adapters mutate it and
// ask it to commit; the surface coalesces commits and drives the engine.

import type { IRootTag } from './fabric';
import { commitChildren } from './commit';
import { dlog } from './debug';
import { installEventHandler } from './events';
import type { ISymbioteNode } from './node';

export class SymbioteSurface {
  readonly rootTag: IRootTag;
  readonly children: ISymbioteNode[] = [];
  private commitScheduled = false;

  constructor(rootTag: IRootTag) {
    this.rootTag = rootTag;
  }

  appendChild(child: ISymbioteNode): void {
    this.detach(child);
    child.parent = undefined;
    this.children.push(child);
  }

  insertBefore(child: ISymbioteNode, beforeChild: ISymbioteNode): void {
    this.detach(child);
    child.parent = undefined;
    const index = this.children.indexOf(beforeChild);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
  }

  removeChild(child: ISymbioteNode): void {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
  }

  clear(): void {
    this.children.length = 0;
  }

  // Synchronous commit: used by React's resetAfterCommit, which already
  // batches per logical update.
  commit(): void {
    commitChildren(this.rootTag, this.children);
  }

  // Coalesced commit: for reactive frameworks that emit many mutations per
  // tick. Collapses to a single completeRoot at the microtask boundary.
  requestCommit(): void {
    if (this.commitScheduled) return;
    this.commitScheduled = true;
    queueMicrotask(() => {
      this.commitScheduled = false;
      this.commit();
    });
  }

  private detach(child: ISymbioteNode): void {
    const parent = child.parent;
    if (parent) {
      const index = parent.children.indexOf(child);
      if (index >= 0) parent.children.splice(index, 1);
      child.parent = undefined;
      return;
    }
    const topIndex = this.children.indexOf(child);
    if (topIndex >= 0) this.children.splice(topIndex, 1);
  }
}

export function createSurface(rootTag: IRootTag): SymbioteSurface {
  installEventHandler();
  dlog(`surface created root=${rootTag}`);
  return new SymbioteSurface(rootTag);
}
