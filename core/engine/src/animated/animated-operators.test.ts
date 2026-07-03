// Co-located unit test (ADR 0025), ported from the headless `animated-operators.smoke.tsx`.
// The Animated arithmetic / operator nodes (add, subtract, multiply, divide, modulo,
// diffClamp). The JS path is the contract that MUST hold: arithmetic is exact, diffClamp
// accumulates the input's delta and clamps the running total to its band, modulo wraps
// Euclidean. The native path installs a fake NativeAnimatedTurboModule and asserts each
// node's __getNativeConfig type when the graph is made native.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  AnimatedAddition,
  AnimatedDiffClamp,
  AnimatedValue,
} from '@symbiotejs/engine';

describe('Animated operators — JS path', () => {
  it('add / subtract / multiply over two values', () => {
    const a = new AnimatedValue(3);
    const b = new AnimatedValue(4);
    expect(add(a, b).__getValue()).toBe(7);
    expect(subtract(a, b).__getValue()).toBe(-1);
    expect(multiply(a, b).__getValue()).toBe(12);
  });

  it('wraps bare-number inputs in an AnimatedValue', () => {
    const v = new AnimatedValue(10);
    expect(add(v, 5).__getValue()).toBe(15);
    expect(add(2, 3).__getValue()).toBe(5);
  });

  it('divides, clamping divide-by-zero to 0 (avoids a Fabric crash)', () => {
    expect(divide(10, 4).__getValue()).toBe(2.5);
    expect(divide(1, 0).__getValue()).toBe(0);
  });

  it('wraps modulo Euclidean so a negative input lands in [0, modulus)', () => {
    const v = new AnimatedValue(7);
    expect(modulo(v, 5).__getValue()).toBe(2);
    v.setValue(-1);
    expect(modulo(v, 5).__getValue()).toBe(4);
  });

  it('diffClamp accumulates the frame-to-frame delta and clamps to [0, 10]', () => {
    const source = new AnimatedValue(0);
    const clamped = diffClamp(source, 0, 10);
    // pull once at the starting value to seed lastValue
    expect(clamped.__getValue()).toBe(0);

    const observed: number[] = [];
    for (const next of [5, 2, 20]) {
      source.setValue(next);
      observed.push(clamped.__getValue());
    }
    expect(observed).toEqual([5, 2, 10]);
  });
});

interface INativeCall {
  method: string;
  args: unknown[];
}

describe('Animated operators — native __getNativeConfig types', () => {
  const nativeCalls: INativeCall[] = [];

  function record(method: string): (...args: unknown[]) => void {
    return (...args: unknown[]) => {
      nativeCalls.push({ method, args });
    };
  }

  function configTypeFor(node: AnimatedAddition | AnimatedDiffClamp): unknown {
    node.__makeNative();
    const created = nativeCalls.find(
      call => call.method === 'createAnimatedNode' && call.args[0] === node.__getNativeTag(),
    );
    const config = created?.args[1];
    return typeof config === 'object' && config !== null && 'type' in config
      ? config.type
      : undefined;
  }

  beforeAll(() => {
    const fakeNativeAnimated = {
      createAnimatedNode(tag: number, config: unknown): void {
        nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] });
      },
      connectAnimatedNodes: record('connectAnimatedNodes'),
      disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
      connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
      disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
      restoreDefaultValues: record('restoreDefaultValues'),
      dropAnimatedNode: record('dropAnimatedNode'),
      startAnimatingNode: record('startAnimatingNode'),
      stopAnimation: record('stopAnimation'),
      setAnimatedNodeValue: record('setAnimatedNodeValue'),
      setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
      flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
      extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
      startListeningToAnimatedNodeValue: record('startListeningToAnimatedNodeValue'),
      stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
      getValue: record('getValue'),
      addAnimatedEventToView: record('addAnimatedEventToView'),
      removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
    };
    Object.assign(globalThis, {
      nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
    });
  });

  it('an addition node makes a native "addition" config', () => {
    const additionType = configTypeFor(
      new AnimatedAddition(new AnimatedValue(1), new AnimatedValue(2)),
    );
    expect(additionType).toBe('addition');
  });

  it('a diffClamp node makes a native "diffclamp" config', () => {
    const clampType = configTypeFor(new AnimatedDiffClamp(new AnimatedValue(0), 0, 10));
    expect(clampType).toBe('diffclamp');
  });
});
