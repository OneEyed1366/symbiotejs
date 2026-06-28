// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `imperative-ref.smoke`. Proves the imperative host-component ref API libraries like
// reanimated / gesture-handler reach through: ref.current.measure / measureInWindow /
// measureLayout / setNativeProps, plus findNodeHandle(ref). A host ref hands back the
// public instance; its methods route to the slot's measure family (keyed by the node's
// CURRENT Fabric handle) and to the engine's scoped setNativeProps.
//
// The slot's measure family and the merge-on-clone semantics aren't part of the shared
// recorder, so we graft canned geometry onto the live slot and make the clone MERGE the
// diff onto existing props (real Fabric's C++ behavior) before any mount, so the
// setNativeProps partial-style merge is observable. The engine destructures these off the
// global on its first commit, so they must be installed before mount.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, View, findNodeHandle } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 180;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function nodeTag(node: unknown): number {
  if (isRecord(node) && typeof node.tag === 'number') return node.tag;
  throw new Error('measured node has no numeric tag');
}

// Fabric's clone*WithNewProps MERGES the diff onto the node's existing props (a key sent
// as null resets to default: how the engine signals a removed prop). The shared recorder
// REPLACES, which would drop unchanged base props; model the real merge so the partial
// setNativeProps style override is observable as a merge, not a replace.
function mergeProps(
  previous: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...previous, ...patch };
  for (const key of Object.keys(patch)) {
    if (patch[key] === null) delete merged[key];
  }
  return merged;
}

const fabric = installFabric();
const installed: unknown = globalThis.nativeFabricUIManager;
if (!isRecord(installed)) throw new Error('fabric slot was not installed');

installed.cloneNodeWithNewProps = (node: IFakeNode, patch: Record<string, unknown>): IFakeNode => ({
  ...node,
  props: mergeProps(node.props, patch),
});
installed.cloneNodeWithNewChildrenAndProps = (
  node: IFakeNode,
  patch: Record<string, unknown>,
): IFakeNode => ({ ...node, props: mergeProps(node.props, patch), children: [] });
// Canned geometry, keyed off the node's tag so we can prove the RIGHT node was measured.
installed.measure = (
  _node: IFakeNode,
  cb: (x: number, y: number, w: number, h: number, px: number, py: number) => void,
): void => cb(1, 2, 100, 50, 11, 22);
installed.measureInWindow = (
  _node: IFakeNode,
  cb: (x: number, y: number, w: number, h: number) => void,
): void => cb(11, 22, 100, 50);
installed.measureLayout = (
  _node: IFakeNode,
  relativeTo: IFakeNode,
  _onFail: () => void,
  onSuccess: (left: number, top: number, w: number, h: number) => void,
): void => onSuccess(relativeTo.tag, 6, 100, 50);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function mountApp(): { box: unknown; anchor: unknown } {
  let box: unknown;
  let anchor: unknown;
  function App(): ReactElement {
    return (
      <View style={{ flex: 1 }}>
        <View
          ref={instance => {
            anchor = instance;
          }}
          style={{ width: 10, height: 10 }}
        />
        <View
          ref={instance => {
            box = instance;
          }}
          style={{ width: 50, height: 50 }}
        />
      </View>
    );
  }
  mount(ROOT_TAG, <App />);
  if (box == null || anchor == null) throw new Error('host refs handed back nothing');
  return { box, anchor };
}

function method(instance: unknown, name: string): (...args: unknown[]) => unknown {
  const candidate = Reflect.get(Object(instance), name);
  if (typeof candidate !== 'function') throw new Error(`ref instance has no ${name}() method`);
  return (...args: unknown[]) => Reflect.apply(candidate, instance, args);
}

function findCommitted(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined {
  function walk(node: IFakeNode): IFakeNode | undefined {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return undefined;
  }
  for (const root of fabric.committed) {
    const hit = walk(root);
    if (hit) return hit;
  }
  return undefined;
}

describe('React imperative host-component ref API', () => {
  it('delivers measure (x, y, width, height, pageX, pageY)', () => {
    const { box } = mountApp();
    let seen = '';
    method(
      box,
      'measure',
    )((x: number, y: number, w: number, h: number, px: number, py: number) => {
      seen = `${x},${y},${w},${h},${px},${py}`;
    });
    expect(seen).toBe('1,2,100,50,11,22');
  });

  it('delivers measureInWindow (x, y, width, height)', () => {
    const { box } = mountApp();
    let seen = '';
    method(
      box,
      'measureInWindow',
    )((x: number, y: number, w: number, h: number) => {
      seen = `${x},${y},${w},${h}`;
    });
    expect(seen).toBe('11,22,100,50');
  });

  it('delivers measureLayout(relative, onSuccess) measured against the anchor', () => {
    const { box, anchor } = mountApp();
    const anchorTag = findNodeHandle(anchor);
    let seen = '';
    method(box, 'measureLayout')(anchor, (left: number, top: number, w: number, h: number) => {
      seen = `${left},${top},${w},${h}`;
    });
    expect(seen).toBe(`${anchorTag},6,100,50`);
  });

  it('resolves findNodeHandle to the reactTag, idempotent on a number, null on null', () => {
    const { anchor } = mountApp();
    const anchorTag = findNodeHandle(anchor);
    expect(typeof anchorTag).toBe('number');
    expect(findNodeHandle(anchorTag)).toBe(anchorTag);
    expect(findNodeHandle(null)).toBeNull();
  });

  it('merges a partial setNativeProps style onto the box instead of replacing it', () => {
    const { box } = mountApp();
    method(box, 'setNativeProps')({ style: { opacity: 0.25 } });
    const updated = findCommitted(n => n.viewName === 'RCTView' && n.props.opacity === 0.25);
    expect(updated, 'setNativeProps re-committed the box with opacity 0.25').toBeDefined();
    // opacity is added while the declarative width/height survive the merge.
    expect(updated!.props.width).toBe(50);
    expect(updated!.props.height).toBe(50);
  });
});
