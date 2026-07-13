// Unit test for AnimatedValue.__startNativeAnimation: the native-driver "start"
// handshake this value owns end-to-end (make itself native, mint its tag, hand the
// curve to the native module, sync the JS value back on completion). Extracted out
// of BaseAnimation.startNativeIfNeeded (animations/base.ts) so a driver never reaches
// into __makeNative / __getNativeTag / __onNativeUpdate / flushValue directly.
// Information Expert: this value is the one object that actually owns those
// internals. Native module mocked the same way animated-operators.test.ts /
// animated-native-loop.test.ts do (a fake nativeModuleProxy.NativeAnimatedTurboModule).

import { beforeEach, describe, expect, it } from 'vitest';
import { AnimatedValue } from '@symbiote-native/engine';
import type { INativeAnimationConfig } from '@symbiote-native/engine';

interface INativeCall {
  method: string;
  args: unknown[];
}

interface INativeEndResult {
  finished: boolean;
  value?: number;
  offset?: number;
}

let nativeCalls: INativeCall[];
let deliverResult: ((result: INativeEndResult) => void) | undefined;

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

beforeEach(() => {
  nativeCalls = [];
  deliverResult = undefined;
  const fakeNativeAnimated = {
    createAnimatedNode: record('createAnimatedNode'),
    connectAnimatedNodes: record('connectAnimatedNodes'),
    disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
    connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
    disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
    restoreDefaultValues: record('restoreDefaultValues'),
    dropAnimatedNode: record('dropAnimatedNode'),
    startAnimatingNode(
      animationId: number,
      nodeTag: number,
      config: INativeAnimationConfig,
      endCallback: (result: INativeEndResult) => void,
    ): void {
      nativeCalls.push({ method: 'startAnimatingNode', args: [animationId, nodeTag, config] });
      deliverResult = endCallback;
    },
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

describe('AnimatedValue.__startNativeAnimation', () => {
  it('makes the value native and starts the native animation on its own tag with the given id/config', () => {
    const value = new AnimatedValue(0);

    value.__startNativeAnimation({ type: 'frames', frames: [0, 1] }, 7, () => {});

    expect(nativeCalls.map(call => call.method)).toContain('createAnimatedNode');
    const start = nativeCalls.find(call => call.method === 'startAnimatingNode');
    expect(start).toBeDefined();
    expect(start?.args[0]).toBe(7);
    expect(start?.args[1]).toBe(value.__getNativeTag());
    expect(start?.args[2]).toEqual({ type: 'frames', frames: [0, 1] });
  });

  it('on native completion, reports finished via the callback and syncs the JS value, without a further native call', () => {
    const value = new AnimatedValue(0);
    let finished: boolean | undefined;

    value.__startNativeAnimation({ type: 'frames', frames: [0, 1] }, 9, result => {
      finished = result;
    });
    nativeCalls.length = 0; // only interested in what happens after native reports back

    deliverResult?.({ finished: true, value: 42 });

    expect(finished).toBe(true);
    expect(value.__getValue()).toBe(42);
    expect(nativeCalls).toHaveLength(0);
  });
});
