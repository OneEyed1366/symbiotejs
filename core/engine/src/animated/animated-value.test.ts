// Co-located integration test (ADR 0025), ported from the headless `animated-value.smoke.ts`.
// The JS-driven Animated engine (ADR 0016) end-to-end through the engine's clone-on-write
// commit: an AnimatedValue feeds an interpolation whose leaf flushes each frame via
// setNativeProps, a single scoped completeRoot that re-clones only the animated node. We drive
// the value by hand with setValue and assert the interpolated prop lands on the committed view.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  AnimatedNode,
  AnimatedValue,
  createElement,
  createSurface,
  getNativeTag,
  setNativeProps,
  setProp,
  type AnimatedInterpolation,
  type ISymbioteNode,
} from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const fabric = installFabric();

// The leaf that pushes a frame's value onto the view. In the adapter this is AnimatedProps wired
// to the host instance; here it is the minimal shape: pull the source value, setNativeProps it.
class PropLeaf extends AnimatedNode {
  constructor(
    private readonly source: AnimatedInterpolation,
    private readonly target: ISymbioteNode,
    private readonly key: string,
  ) {
    super();
  }
  update(): void {
    setNativeProps(this.target, { [this.key]: this.source.__getValue() });
  }
}

const ROOT_TAG = 41;

function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

const value = new AnimatedValue(0);
// Non-identity mapping so the assertion proves interpolation, not passthrough.
const width = value.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });
const view = createElement('RCTView');

beforeAll(() => {
  const surface = createSurface(ROOT_TAG);
  setProp(view, 'width', width.__getValue()); // initial frame: 0
  surface.appendChild(view);
  surface.commit();

  // Wire the leaf into the graph: adding it to the interpolation attaches the interpolation to
  // the value, so a setValue flushes value -> width -> leaf.
  const leaf = new PropLeaf(width, view, 'width');
  width.__addChild(leaf);
});

describe('AnimatedValue through the clone-on-write commit', () => {
  it('commits the app view under a box-none AppContainer with the initial interpolated width', () => {
    expect(appView().viewName).toBe('RCTView');
    expect(appView().props.width).toBe(0);
  });

  it('exposes a native tag on the committed node for the native driver', () => {
    expect(getNativeTag(view)).toBeDefined();
  });

  it('setValue(0.5) interpolates to width 50 in exactly one completeRoot', () => {
    const commitsBefore = fabric.counts.completeRoot;
    value.setValue(0.5);
    expect(appView().props.width).toBe(50);
    expect(fabric.counts.completeRoot).toBe(commitsBefore + 1);
  });

  it('setValue(1) interpolates to width 100', () => {
    value.setValue(1);
    expect(appView().props.width).toBe(100);
  });

  it('drives listeners with the raw value while the leaf gets the interpolated value', () => {
    let observed = -1;
    value.addListener(({ value: v }) => {
      observed = v;
    });
    value.setValue(0.25);
    expect(observed).toBe(0.25);
    expect(appView().props.width).toBe(25);
  });
});
