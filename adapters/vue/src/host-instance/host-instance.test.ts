// Co-located Vue-driven test for findNodeHandle (ADR 0025), the Vue twin of the React
// adapter's host-instance resolution. Proves the RN ref -> reactTag lookup over the shared
// fake Fabric slot: a function-ref-held host node (shallowRef, held by IDENTITY) resolves
// to its committed native tag, the same via the Vue Ref directly (the isRef unwrap path), a
// bare number passes through, and null / undefined / an empty ref / an uncommitted node all
// yield null. Commit is coalesced, so each mount is followed by a macrotask `tick` that
// drains the engine's commit before the assert reads the committed tree.
//
// findNodeHandle is imported from its own module (not the @symbiote/vue barrel) so the test
// stands without touching the barrel; once the export lands it can move to '@symbiote/vue'.

import { defineComponent, h, shallowRef } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, mount, unmount } from '@symbiote/vue';
import { createElement, isSymbioteNode, type ISymbioteNode } from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';
import { findNodeHandle, type IHostInstance } from './index';

const ROOT_TAG = 318;
const ROOT_VIEW = 'RCTView';
const PROBE_ID = 'probe';
const RAW_TAG = 9_001;
const GRAFTED_LABEL = 'grafted';

const fabric = installFabric();

// A macrotask boundary drains the engine's coalesced commit before the assert reads it.
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// The renderer grafts the public-instance API onto every host node; a ref-held node therefore
// carries the imperative methods. Narrowed by presence so the test calls them without a cast.
function isHostInstance(el: unknown): el is IHostInstance {
  return isSymbioteNode(el) && typeof Reflect.get(el, 'setNativeProps') === 'function';
}

function findCommitted(
  nodes: readonly IFakeNode[],
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const nested = findCommitted(node.children, predicate);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Vue findNodeHandle on the engine', () => {
  it('resolves a ref-held host node to its committed native tag', async () => {
    // shallowRef, NOT ref: the engine node is held by IDENTITY so the commit mirror (keyed
    // on the raw node) still resolves it. A plain ref would hand back a reactive Proxy.
    const nodeRef = shallowRef<ISymbioteNode | null>(null);
    const setNode = (el: unknown): void => {
      nodeRef.value = isSymbioteNode(el) ? el : null;
    };
    mount(
      ROOT_TAG,
      defineComponent({ setup: () => () => h(View, { nativeID: PROBE_ID, ref: setNode }) }),
    );
    await tick();

    const node = nodeRef.value;
    expect(node, 'host node captured by the function ref').not.toBeNull();
    if (node === null) throw new Error('unreachable: host node missing');

    // Find OUR view, not the synthetic flex root (also an RCTView), by its marker prop.
    const committed = fabric.find(n => n.props.nativeID === PROBE_ID);
    expect(committed, 'the probed RCTView was committed').toBeDefined();
    if (committed === undefined) throw new Error('unreachable: probed RCTView missing');

    // The engine node resolves to the committed reactTag...
    expect(findNodeHandle(node)).toBe(committed.tag);
    // ...and so does the Vue Ref carrying it (the isRef unwrap path).
    expect(findNodeHandle(nodeRef)).toBe(committed.tag);
  });

  it('passes a raw number through unchanged', () => {
    expect(findNodeHandle(RAW_TAG)).toBe(RAW_TAG);
  });

  it('returns null for null, undefined, an empty ref, and an uncommitted node', () => {
    expect(findNodeHandle(null)).toBeNull();
    expect(findNodeHandle(undefined)).toBeNull();
    expect(findNodeHandle(shallowRef(null))).toBeNull();
    // A freshly created node that never committed has no mirror entry -> no tag -> null.
    expect(findNodeHandle(createElement(ROOT_VIEW))).toBeNull();
  });
});

describe('Vue host ref exposes the engine public instance', () => {
  it('grafts measure / setNativeProps onto a ref-held <View> and setNativeProps reaches the committed node', async () => {
    // shallowRef + identity capture (the engine commit mirror is keyed on the raw node).
    const nodeRef = shallowRef<IHostInstance | null>(null);
    const setNode = (el: unknown): void => {
      nodeRef.value = isHostInstance(el) ? el : null;
    };
    mount(
      ROOT_TAG,
      defineComponent({ setup: () => () => h(View, { nativeID: PROBE_ID, ref: setNode }) }),
    );
    await tick();

    const node = nodeRef.value;
    expect(node, 'public instance captured by the function ref').not.toBeNull();
    if (node === null) throw new Error('unreachable: public instance missing');

    // The grafted imperative surface is present, exactly like React's getPublicInstance.
    expect(typeof node.measure, 'measure is grafted').toBe('function');
    expect(typeof node.setNativeProps, 'setNativeProps is grafted').toBe('function');

    // Driving setNativeProps through the ref re-commits the prop onto the committed view. The
    // engine clone carries the CHANGED props, so the grafted label identifies our view.
    node.setNativeProps({ accessibilityLabel: GRAFTED_LABEL });
    const committed = findCommitted(
      fabric.committed,
      n => n.props.accessibilityLabel === GRAFTED_LABEL,
    );
    expect(committed, 'setNativeProps re-committed the prop onto the view').toBeDefined();
  });
});
