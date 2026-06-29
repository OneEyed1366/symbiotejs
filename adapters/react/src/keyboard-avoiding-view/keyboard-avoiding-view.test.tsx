// Co-located React-driven test (ADR 0025), ported from `keyboard-avoiding-view.smoke.tsx`.
// Keyboard + KeyboardAvoidingView are the first consumers of the native->JS event bridge.
// The shared fake-Fabric slot records the committed tree; a fake __turboModuleProxy returns
// a KeyboardObserver with observe-counters; a fake RN$registerCallableModule captures the
// device hub so the test can play "native". We mount a padding KeyboardAvoidingView, give
// the wrapper a frame via topLayout, then emit keyboardDidShow/Hide and assert the wrapper's
// paddingBottom tracks the computed inset (the engine HOISTS paddingBottom to top-level props).

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KeyboardAvoidingView, Keyboard, Text, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 290;

// ---- fake native-module + device-hub globals ----------------------------

let keyboardAdded = 0;
let keyboardRemoved = 0;
const fakeKeyboardObserver = {
  addListener: (): void => {
    keyboardAdded += 1;
  },
  removeListeners: (count: number): void => {
    keyboardRemoved += count;
  },
};
const registeredModules: Record<string, unknown> = { KeyboardObserver: fakeKeyboardObserver };

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined;

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name];
    if (module === undefined || module === null) return null;
    if (!isType<T>(module)) return null;
    return module;
  },
  RN$registerCallableModule: (
    name: string,
    factory: () => { emit: (eventType: string, ...args: unknown[]) => void },
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  },
});

// ---- inset geometry -----------------------------------------------------

const SCREEN_HEIGHT = 800;
const FRAME_Y = 0;
const KEYBOARD_HEIGHT = 300;
// Keyboard top edge sits KEYBOARD_HEIGHT up from the screen bottom.
const KEYBOARD_SCREEN_Y = SCREEN_HEIGHT - KEYBOARD_HEIGHT; // 500
// inset = max(0, frameY + frameHeight - keyboardY) = 0 + 800 - 500 = 300.
const EXPECTED_INSET = FRAME_Y + SCREEN_HEIGHT - KEYBOARD_SCREEN_Y;
const WRAPPER_FRAME = { x: 0, y: FRAME_Y, width: 400, height: SCREEN_HEIGHT };

function App(): ReactElement {
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Text>type here</Text>
    </KeyboardAvoidingView>
  );
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  keyboardAdded = 0;
  keyboardRemoved = 0;
});
afterEach(() => unmount(ROOT_TAG));

// The current committed wrapper (the outer RCTView KeyboardAvoidingView renders).
// Re-read after each commit since clone-on-write hands back new nodes.
function currentWrapper(): IFakeNode {
  const wrapper = fabric.appRoot().children[0];
  expect(wrapper, 'an RCTView wrapper sits under the root').toBeDefined();
  expect(wrapper.viewName).toBe('RCTView');
  return wrapper;
}

describe('Keyboard module', () => {
  it('subscribes, receives the native payload, and unsubscribes', () => {
    let received: unknown;
    const sub = Keyboard.addListener('keyboardDidShow', payload => {
      received = payload;
    });
    expect(deviceHub, 'Keyboard.addListener installs the device hub').toBeDefined();
    expect(keyboardAdded).toBeGreaterThanOrEqual(1);

    deviceHub!.emit('keyboardDidShow', { endCoordinates: { height: 300, screenY: 500 } });
    expect(isRecord(received) && isRecord(received.endCoordinates)).toBe(true);
    expect(
      isRecord(received) && isRecord(received.endCoordinates) && received.endCoordinates.height,
    ).toBe(300);

    const removedBefore = keyboardRemoved;
    received = undefined;
    sub.remove();
    expect(keyboardRemoved).toBe(removedBefore + 1);

    deviceHub!.emit('keyboardDidShow', { endCoordinates: { height: 0, screenY: 800 } });
    expect(received, 'a removed listener must not fire').toBeUndefined();
  });
});

describe('KeyboardAvoidingView (behavior=padding)', () => {
  it('tracks the keyboard inset on paddingBottom across show/hide', () => {
    mount(ROOT_TAG, <App />);
    expect(deviceHub, 'device hub is installed by now').toBeDefined();
    const hub = deviceHub!;

    // Give the wrapper its measured frame so the inset math has frame.y / frame.height.
    // handleLayout writes a ref (no state), so no recommit happens here.
    fabric.fireEvent(currentWrapper().instanceHandle, 'topLayout', { layout: WRAPPER_FRAME });

    // Before the keyboard shows, padding must be absent or zero.
    const before = currentWrapper().props.paddingBottom;
    expect(before === undefined || before === 0).toBe(true);

    hub.emit('keyboardDidShow', {
      endCoordinates: { height: KEYBOARD_HEIGHT, screenY: KEYBOARD_SCREEN_Y },
    });
    expect(currentWrapper().props.paddingBottom).toBe(EXPECTED_INSET);

    hub.emit('keyboardDidHide', { endCoordinates: { height: 0, screenY: SCREEN_HEIGHT } });
    expect(currentWrapper().props.paddingBottom).toBe(0);
  });
});
