// Co-located Vue-driven test (ADR 0025): a NATIVE Animated.event on an Animated component. When a
// prop like onScroll={Animated.event([…], {useNativeDriver:true})} rides an Animated.View, the
// wrapper attaches it to the committed view on the UI thread (addAnimatedEventToView). The attach
// runs in createAnimatedComponent's post-commit reconcile (onMounted); under Vue's async-batched
// commit the view has no Fabric tag yet at that point, so a naive attachNativeEventHandler reads
// getNativeTag()===undefined and binds nothing, with no retry — the native event never drives the
// value on Vue (React commits synchronously, so its effect sees the tag). The fake
// NativeAnimatedTurboModule records the bind so we assert it landed against the real tag, no host.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote/vue';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

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

const fabric = installFabric();
const ROOT_TAG = 55;

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function animatedViewNode(): IFakeNode {
  return fabric.appRoot().children[0];
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Vue Animated component native event', () => {
  it('binds a native Animated.event to the committed view tag', async () => {
    const scrollY = new Animated.Value(0);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Animated.View, {
            style: { height: 10 },
            onScroll: Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
              useNativeDriver: true,
            }),
          }),
      }),
    );
    await tick();

    const attach = callsOf('addAnimatedEventToView');
    expect(attach, 'the native event attaches to the view').toHaveLength(1);
    expect(attach[0].args[0], 'bound to the committed view tag').toBe(animatedViewNode().tag);
    expect(attach[0].args[1]).toBe('onScroll');
  });
});
