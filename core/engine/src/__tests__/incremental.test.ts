// Co-located unit test (ADR 0025): the commit engine is INCREMENTAL, not a full rebuild. Driving
// the mutation API against the shared fake slot, a commit that changes one sibling re-clones only
// that sibling; the untouched sibling's native handle is reused BY REFERENCE (its native view
// state survives, the whole point of clone-on-write); no createNode happens after first mount;
// and a no-op commit makes zero native calls. The "only the changed branch was cloned" invariant
// is proven structurally by the reused-by-reference handle rather than a clone counter.

import { beforeAll, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';
import { appendChild, createElement, createSurface, setProp } from '../index';

const fabric = installFabric();
const ROOT_TAG = 11;
const surface = createSurface(ROOT_TAG);

const a = createElement('RCTView');
const b = createElement('RCTView');

let mountCreateNode = 0;
let mountCompleteRoot = 0;
let aHandle1: IFakeNode;
let bHandle1: IFakeNode;

beforeAll(() => {
  setProp(a, 'opacity', 1);
  appendChild(a, createElement('RCTView'));
  setProp(b, 'opacity', 1);
  appendChild(b, createElement('RCTView'));

  surface.appendChild(a);
  surface.appendChild(b);
  surface.commit();

  mountCreateNode = fabric.counts.createNode;
  mountCompleteRoot = fabric.counts.completeRoot;
  // committed[0] is the synthetic AppContainer root; A and B are its two children.
  const root = fabric.appRoot();
  aHandle1 = root.children[0];
  bHandle1 = root.children[1];
});

describe('incremental commit', () => {
  it('creates every node once on mount and commits once', () => {
    // synthetic AppContainer root + A, A.child, B, B.child -> 5 createNode.
    expect(mountCreateNode).toBe(5);
    expect(mountCompleteRoot).toBe(1);
  });

  it('changing one sibling rebuilds nothing and reuses the untouched sibling by reference', () => {
    fabric.reset();
    setProp(a, 'opacity', 0.5);
    surface.commit();

    expect(fabric.counts.createNode).toBe(0);
    expect(fabric.counts.completeRoot).toBe(1);

    const root = fabric.appRoot();
    // B's subtree is never cloned (its handle is reused). This IS "only the changed branch cloned".
    expect(root.children[1]).toBe(bHandle1);
    // A changed, so it gets a fresh handle.
    expect(root.children[0]).not.toBe(aHandle1);
  });

  it('makes zero native calls on a no-op commit', () => {
    fabric.reset();
    surface.commit();
    expect(fabric.counts.completeRoot).toBe(0);
    expect(fabric.counts.createNode).toBe(0);
  });
});
