// Co-located Vue-driven test (ADR 0025): sticky-header NATIVE scroll attach. On a real host the
// scroll offset must be driven on the UI thread so each sticky header's translateY interpolation
// rides scroll natively (RN attachNativeEvent, ScrollView.js). symbiote wires that by attaching an
// Animated.event to the COMMITTED scroll view's Fabric tag (addAnimatedEventToView). Under Vue's
// async-batched commit the scroll view's tag isn't assigned at onMounted/post-flush time, so a naive
// attach reads getNativeTag()===undefined, binds nothing, and the headers never move — the device
// bug this guards (React commits synchronously, so its effect always sees the tag). The fake
// NativeAnimatedTurboModule records the bind so we assert it happened against the real tag, no
// simulator.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, ScrollView, View } from '@symbiote/vue';
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
const ROOT_TAG = 51;

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function scrollViewNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('RCTScrollView was not created');
  return node;
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Vue ScrollView sticky native scroll attach', () => {
  it('binds the scroll event to the committed scroll view tag when sticky + native', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(ScrollView, { stickyHeaderIndices: [0] }, () => [
            h(View, { key: 'header', style: { height: 20 } }),
            h(View, { key: 'row', style: { height: 20 } }),
          ]),
      }),
    );
    await tick();

    const attach = callsOf('addAnimatedEventToView');
    expect(attach, 'sticky scroll attaches an Animated.event to the native view').toHaveLength(1);
    expect(attach[0].args[0], 'bound to the committed scroll view tag').toBe(scrollViewNode().tag);
    expect(attach[0].args[1]).toBe('onScroll');
  });
});
