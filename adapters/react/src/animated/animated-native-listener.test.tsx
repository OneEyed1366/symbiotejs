// Co-located React-driven test (ADR 0025), ported from the headless `animated-native-listener.smoke`.
// Proves that a JS listener on a NATIVE-driven value still fires. While native owns the frames the
// JS value never changes per-frame, so addListener on a native value must ask native to stream
// updates back (onAnimatedValueUpdate on the device bus) and route them to the JS listener. We
// inject a device-event source (exactly how a real app wires RN's DeviceEventEmitter), make a value
// native, add a listener, emit a native update, and assert the listener fires and the JS value
// syncs. Removing the last listener must stop native streaming.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote/react';
import { setDeviceEventSource } from '@symbiote/engine';
import { installFabric } from '@symbiote/test-utils';

// ---- injected device-event source (the app's RN DeviceEventEmitter stand-in) ----

const deviceListeners = new Map<string, Set<(payload: unknown) => void>>();
setDeviceEventSource({
  addListener(eventType: string, listener: (payload: unknown) => void) {
    const set = deviceListeners.get(eventType) ?? new Set();
    deviceListeners.set(eventType, set);
    set.add(listener);
    return {
      remove: () => {
        set.delete(listener);
      },
    };
  },
});
function emitDevice(eventType: string, payload: unknown): void {
  deviceListeners.get(eventType)?.forEach(listener => listener(payload));
}

// ---- fake NativeAnimatedTurboModule (records calls) ----------------------

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

const fabric = installFabric();
const ROOT_TAG = 41;

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Animated native value listener', () => {
  it('streams native updates to a JS listener and stops on the last unsubscribe', () => {
    const opacity = new Animated.Value(0);

    function App(): ReactElement {
      return <Animated.View style={{ opacity }} />;
    }

    mount(ROOT_TAG, <App />);

    // useNativeDriver makes `opacity` native; capture the native tag it was created as.
    Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }).start();

    const valueCreate = callsOf('createAnimatedNode').find(call => {
      const config = call.args[1];
      return (
        typeof config === 'object' && config !== null && 'type' in config && config.type === 'value'
      );
    });
    const valueTag = valueCreate?.args[0];
    expect(typeof valueTag).toBe('number');

    // a JS listener on the native value asks native to stream updates
    let received: number | undefined;
    const listenerId = opacity.addListener(state => {
      received = state.value;
    });

    expect(callsOf('startListeningToAnimatedNodeValue').some(c => c.args[0] === valueTag)).toBe(
      true,
    );

    // native reports a mid-flight value via the device bus -> the JS listener fires
    emitDevice('onAnimatedValueUpdate', { tag: valueTag, value: 0.5 });
    expect(received).toBe(0.5);
    expect(opacity.__getValue()).toBe(0.5);

    // removing the last listener stops the native stream
    opacity.removeListener(listenerId);
    expect(callsOf('stopListeningToAnimatedNodeValue').some(c => c.args[0] === valueTag)).toBe(
      true,
    );

    received = undefined;
    emitDevice('onAnimatedValueUpdate', { tag: valueTag, value: 0.9 });
    expect(received).toBeUndefined();
  });
});
