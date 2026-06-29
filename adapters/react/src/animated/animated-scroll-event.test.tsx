// Co-located React-driven test (ADR 0025), ported from the headless `animated-scroll-event.smoke`.
// Proves the canonical scroll-driven animation:
//   onScroll={Animated.event([{nativeEvent:{contentOffset:{y: scrollY}}}])} on an
//   Animated.ScrollView, with a sibling Animated.View whose translateY binds scrollY.
// The shared fake Fabric slot keeps each view's real props so the committed transform is
// observable. No simulator.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote/react';
import { AnimatedValueXY } from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const fabric = installFabric();
const ROOT_TAG = 73;

// Walk the committed tree to the first node of a given view name.
function findByViewName(nodes: IFakeNode[], viewName: string): IFakeNode | undefined {
  for (const node of nodes) {
    if (node.viewName === viewName) return node;
    const found = findByViewName(node.children, viewName);
    if (found !== undefined) return found;
  }
  return undefined;
}

// Walk the committed tree to the first node carrying a `transform`.
function findTransformView(nodes: IFakeNode[]): IFakeNode | undefined {
  for (const node of nodes) {
    if (Reflect.get(node.props, 'transform') !== undefined) return node;
    const found = findTransformView(node.children);
    if (found !== undefined) return found;
  }
  return undefined;
}

// translateY read off a committed view's transform.
function committedTranslateY(node: IFakeNode): number {
  const transform = Reflect.get(node.props, 'transform');
  if (!Array.isArray(transform)) {
    throw new Error(`expected a transform array, got ${JSON.stringify(node.props)}`);
  }
  for (const entry of transform) {
    if (typeof entry === 'object' && entry !== null) {
      const y = Reflect.get(entry, 'translateY');
      if (typeof y === 'number') return y;
    }
  }
  throw new Error(`no translateY in committed transform ${JSON.stringify(transform)}`);
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Animated scroll-driven animation', () => {
  it('mounts Animated.ScrollView and drives the bound translateY from a scroll event', () => {
    const scrollY = new Animated.Value(0);
    // The canonical handler, held by reference so the test can fire it the way the native scroll
    // event would. onScroll is registered through React's event system, not committed as a prop.
    const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }]);

    function App(): ReactElement {
      return (
        <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
          <Animated.View style={{ transform: [{ translateY: scrollY }] }} />
        </Animated.ScrollView>
      );
    }

    mount(ROOT_TAG, <App />);

    // The Animated.ScrollView committed its native scroll node, proof the lazy getter resolved the
    // wrapper without tripping the scroll-view <-> animated module cycle.
    expect(findByViewName(fabric.committed, 'RCTScrollView')).toBeDefined();

    // The bound view (the leaf RCTView carrying the transform) paints at the initial value.
    const boundViewBefore = findTransformView(fabric.committed);
    expect(boundViewBefore).toBeDefined();
    expect(committedTranslateY(boundViewBefore!)).toBe(0);

    // firing onScroll drives scrollY -> re-paints translateY
    onScroll({ nativeEvent: { contentOffset: { y: 88, x: 0 } } });

    const boundViewAfter = findTransformView(fabric.committed);
    expect(boundViewAfter).toBeDefined();
    expect(committedTranslateY(boundViewAfter!)).toBe(88);
  });

  it('AnimatedValueXY.getTranslateTransform yields the live x/y values', () => {
    const xy = new AnimatedValueXY({ x: 3, y: 7 });
    const transform = xy.getTranslateTransform();
    expect(transform).toHaveLength(2);
    expect(transform[0].translateX).toBe(xy.x);
    expect(transform[1].translateY).toBe(xy.y);
    expect(transform[0].translateX.__getValue()).toBe(3);
    expect(transform[1].translateY.__getValue()).toBe(7);
    xy.setValue({ x: 30, y: 70 });
    expect(transform[1].translateY.__getValue()).toBe(70);
  });
});
