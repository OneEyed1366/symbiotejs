// Unit tests for AnimatedLeafBinder in isolation — no Angular involved. Both
// AnimatedComponentBase and AnimatedImage delegate their leaf-lifecycle (build a leaf,
// bind it to the committed Fabric node, swap leaves on re-render, tear down) to this Pure
// Fabrication; these tests exercise the binder directly against a real engine node
// (SymbioteSurface + the fake Fabric backend), so a break here isolates to the shared
// orchestration rather than either owning component.
import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  AnimatedValue,
  createElement,
  createSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { AnimatedLeafBinder } from './index';

const fabric = installFabric();
let nextRootTag = 9001;

beforeEach(() => fabric.reset());

// A node that has already gone through a commit — whenCommitted fires synchronously.
function committedNode(): ISymbioteNode {
  const surface = createSurface(nextRootTag++);
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

// A node that is attached to a surface but has NOT been committed yet — whenCommitted
// must defer until the caller commits the surface.
function uncommittedNode(): { node: ISymbioteNode; commit: () => void } {
  const surface = createSurface(nextRootTag++);
  const node = createElement('RCTView');
  surface.appendChild(node);
  return { node, commit: () => surface.commit() };
}

// `appRoot()` unwraps RN's synthetic box-none AppContainer, which is ALSO an RCTView, so a
// plain `fabric.find(viewName === 'RCTView')` would match it instead of the node under test.
// Each test appends exactly one child, so the container's first (only) child is the real node.
function fakeView(): ReturnType<typeof fabric.find> {
  return fabric.appRoot().children[0];
}

describe('AnimatedLeafBinder', () => {
  it('creates and attaches an AnimatedProps leaf, wiring value changes onto the host node', () => {
    const node = committedNode();
    const binder = new AnimatedLeafBinder(() => node, 'test');
    const opacity = new AnimatedValue(1);

    // The leaf itself never pushes the INITIAL value — that first paint comes from the
    // owning component's own reduceProps template binding (out of scope here). The leaf
    // only drives value CHANGES after it is bound.
    binder.reconcile({ style: { opacity } }, false);

    opacity.setValue(0.4);
    expect(fakeView()?.props.opacity).toBe(0.4);
  });

  it('binds to the host node via whenCommitted, deferring until the node is actually committed', () => {
    const { node, commit } = uncommittedNode();
    const binder = new AnimatedLeafBinder(() => node, 'test');
    const opacity = new AnimatedValue(1);

    binder.reconcile({ style: { opacity } }, false);
    // Not committed yet: the value graph exists, but no Fabric node to flush onto.
    opacity.setValue(0.5);
    expect(fabric.created).toHaveLength(0);

    commit();
    // whenCommitted's post-commit retry binds the leaf now; a subsequent change flushes.
    opacity.setValue(0.7);
    expect(fakeView()?.props.opacity).toBe(0.7);
  });

  it('attaches the new leaf before detaching the old one on a second reconcile', () => {
    const node = committedNode();
    const binder = new AnimatedLeafBinder(() => node, 'test');
    const shared = new AnimatedValue(1);
    const order: string[] = [];
    const originalAddChild = shared.__addChild.bind(shared);
    const originalRemoveChild = shared.__removeChild.bind(shared);
    shared.__addChild = child => {
      order.push('add');
      originalAddChild(child);
    };
    shared.__removeChild = child => {
      order.push('remove');
      originalRemoveChild(child);
    };

    binder.reconcile({ style: { opacity: shared } }, false);
    order.length = 0; // only care about the SECOND reconcile's swap order

    binder.reconcile({ style: { opacity: shared } }, false);

    expect(order).toEqual(['add', 'remove']);
  });

  it('detaches the leaf and cancels any pending bind on destroy', () => {
    const { node, commit } = uncommittedNode();
    const binder = new AnimatedLeafBinder(() => node, 'test');
    const opacity = new AnimatedValue(1);

    binder.reconcile({ style: { opacity } }, false);
    binder.destroy();
    commit();

    // The pending whenCommitted bind was cancelled by destroy, so committing afterward
    // must not retroactively bind the (already-detached) leaf.
    opacity.setValue(0.9);
    expect(fakeView()?.props.opacity).toBeUndefined();
  });
});
