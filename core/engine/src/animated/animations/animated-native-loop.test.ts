// Co-located unit test (ADR 0025), ported from the headless `animated-native-loop.smoke.tsx`.
// Native loop offload: Animated.loop over a SINGLE native-driver timing must hand the whole loop
// to native (one startAnimatingNode carrying `iterations`), so zero JS runs per cycle. A finite
// loop passes its count; an infinite loop passes -1. A loop over a SEQUENCE can't offload and
// falls back to JS restart.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AnimatedValue, timing, loop, sequence } from '@symbiotejs/engine';

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

function startsOf(): INativeCall[] {
  return nativeCalls.filter(call => call.method === 'startAnimatingNode');
}
function configOf(call: INativeCall): Record<string, unknown> {
  const config = call.args[2];
  if (typeof config !== 'object' || config === null) throw new Error('start config missing');
  return { ...config };
}

beforeAll(() => {
  const fakeNativeAnimated = {
    createAnimatedNode: record('createAnimatedNode'),
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

beforeEach(() => {
  nativeCalls.length = 0;
});

describe('Animated.loop native offload', () => {
  it('an infinite loop of a single native timing issues one start with iterations -1', () => {
    const opacity = new AnimatedValue(0);
    loop(timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true })).start();

    const starts = startsOf();
    expect(starts).toHaveLength(1);
    expect(configOf(starts[0]).iterations).toBe(-1);
  });

  it('a finite loop rides its iteration count on the same single start', () => {
    const scale = new AnimatedValue(0);
    loop(timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }), {
      iterations: 3,
    }).start();

    const starts = startsOf();
    expect(starts).toHaveLength(1);
    expect(configOf(starts[0]).iterations).toBe(3);
  });

  it('a loop over a SEQUENCE cannot offload: it JS-restarts and does not carry an infinite count', () => {
    const seq = new AnimatedValue(0);
    loop(
      sequence([
        timing(seq, { toValue: 1, duration: 100, useNativeDriver: true }),
        timing(seq, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]),
    ).start();

    const seqStarts = startsOf();
    expect(seqStarts).toHaveLength(1);
    expect(configOf(seqStarts[0]).iterations).not.toBe(-1);
  });
});
