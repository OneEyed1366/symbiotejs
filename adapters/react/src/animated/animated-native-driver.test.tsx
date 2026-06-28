// Co-located React-driven test (ADR 0025), ported from the headless `animated-native-driver.smoke`.
// Proves the Animated NATIVE driver wiring (ADR 0017): a fake NativeAnimatedTurboModule on the JSI
// module proxy records every call, so we assert (no simulator) that `useNativeDriver:true` mirrors
// the value graph into native (createAnimatedNode value/style/props), wires it
// (connectAnimatedNodes), binds the props node to the committed view's Fabric tag
// (connectAnimatedNodeToView), hands the curve to native (startAnimatingNode), keeps the JS view
// frozen while native drives, and syncs the JS value back through one scoped commit on completion.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

// ---- fake NativeAnimatedTurboModule (records calls) ----------------------

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];
let lastStartCallback: ((result: { finished: boolean; value?: number }) => void) | null = null;

// Mirror the native invariant that crashed on device: RCTNativeAnimatedNodesManager asserts a node
// exists before connecting it. Reproduce it headlessly so a connect-before-create ordering bug fails
// here instead of as a SIGABRT on iOS.
const createdNodeTags = new Set<number>();

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

function assertNodeExists(tag: unknown, method: string): void {
  if (typeof tag !== 'number' || !createdNodeTags.has(tag)) {
    throw new Error(`${method} referenced animated node ${String(tag)} before createAnimatedNode`);
  }
}

const fakeNativeAnimated = {
  createAnimatedNode(tag: number, config: unknown): void {
    createdNodeTags.add(tag);
    nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] });
  },
  connectAnimatedNodes(parentTag: number, childTag: number): void {
    assertNodeExists(parentTag, 'connectAnimatedNodes(parent)');
    assertNodeExists(childTag, 'connectAnimatedNodes(child)');
    nativeCalls.push({ method: 'connectAnimatedNodes', args: [parentTag, childTag] });
  },
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView(nodeTag: number, viewTag: number): void {
    assertNodeExists(nodeTag, 'connectAnimatedNodeToView');
    nativeCalls.push({ method: 'connectAnimatedNodeToView', args: [nodeTag, viewTag] });
  },
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode(
    animationId: number,
    nodeTag: number,
    config: Record<string, unknown>,
    endCallback: (result: { finished: boolean; value?: number }) => void,
  ): void {
    nativeCalls.push({ method: 'startAnimatingNode', args: [animationId, nodeTag, config] });
    lastStartCallback = endCallback;
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

const fabric = installFabric();
const ROOT_TAG = 41;

// The app's Animated.View sits under the synthetic box-none AppContainer root.
function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

function configType(config: unknown): unknown {
  return typeof config === 'object' && config !== null && 'type' in config
    ? config.type
    : undefined;
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
  createdNodeTags.clear();
  lastStartCallback = null;
});
afterEach(() => unmount(ROOT_TAG));

describe('Animated native driver', () => {
  it('mirrors the value graph into native and syncs the JS value on completion', () => {
    // A diamond: one value feeds both opacity and a transform, so `style` has two animated parents
    // (opacity-interp and the transform node). This is the shape that crashed on device. It forces
    // the create-vs-connect ordering the fix guarantees.
    const opacity = new Animated.Value(0);
    const slide = opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 100] });

    function App(): ReactElement {
      return <Animated.View style={{ opacity, transform: [{ translateX: slide }] }} />;
    }

    mount(ROOT_TAG, <App />);
    const viewTag = appView().tag;

    let finished = false;
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start(result => {
      finished = result.finished;
    });

    // the graph was mirrored into native: a value, style, and props node each exist
    const created = callsOf('createAnimatedNode');
    const createdTypes = created.map(call => configType(call.args[1]));
    expect(createdTypes).toEqual(expect.arrayContaining(['value', 'style', 'props']));

    // value -> style -> props were wired
    expect(callsOf('connectAnimatedNodes').length).toBeGreaterThanOrEqual(2);

    // the props node was bound to the committed view's real Fabric tag
    const connectView = callsOf('connectAnimatedNodeToView');
    expect(connectView).toHaveLength(1);
    expect(connectView[0].args[1]).toBe(viewTag);

    // the curve was handed to native against the value node's tag, as a frames config
    const valueCreate = created.find(call => configType(call.args[1]) === 'value');
    const valueTag = valueCreate?.args[0];
    const start = callsOf('startAnimatingNode');
    expect(start).toHaveLength(1);
    expect(start[0].args[1]).toBe(valueTag);
    expect(configType(start[0].args[2])).toBe('frames');

    // native drives the view, so no JS frame touched it yet
    expect(appView().props.opacity).toBe(0);

    // native reports completion: JS syncs through one scoped commit
    const notifyComplete = lastStartCallback;
    expect(notifyComplete).not.toBeNull();
    notifyComplete?.({ finished: true, value: 1 });

    expect(finished).toBe(true);
    expect(appView().props.opacity).toBe(1);
  });
});
