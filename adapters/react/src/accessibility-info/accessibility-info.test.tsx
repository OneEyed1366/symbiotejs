// Co-located React-driven test (ADR 0025), ported from the headless `accessibility-info.smoke`.
// Proves the iOS AccessibilityInfo module, no simulator. A fake __turboModuleProxy returns an
// AccessibilityManager native module (state getters that invoke their success callback with known
// values, plus observe-counters); a fake RN$registerCallableModule captures the device hub so the
// test can play "native" and emit `screenReaderChanged`. iOS routes non-'click' accessibility events
// through the shared Fabric slot, so case 6 augments the slot to record sendAccessibilityEvent.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, View, AccessibilityInfo } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

// ---- augment the shared slot to record sendAccessibilityEvent ------------
// The shared harness models commit/clone but not the a11y event sink (unique to this suite), so we
// add it onto the live slot the engine already drives.

interface IAccessibilityCall {
  node: IFakeNode;
  eventType: string;
}
const a11yEvents: IAccessibilityCall[] = [];

const fabric = installFabric();
{
  const slot: unknown = Reflect.get(globalThis, 'nativeFabricUIManager');
  if (typeof slot !== 'object' || slot === null) {
    throw new Error('installFabric did not install a slot');
  }
  Object.assign(slot, {
    sendAccessibilityEvent(node: IFakeNode, eventType: string): void {
      a11yEvents.push({ node, eventType });
    },
    dispatchCommand(): void {},
  });
}

// ---- fake native-module + device-hub globals ----------------------------

let a11yAdded = 0;
let a11yRemoved = 0;
const SCREEN_READER_STATE = true;
const REDUCE_MOTION_STATE = false;
let announced: string | undefined;
let focusedTag: number | undefined;
const fakeAccessibilityInfo = {
  getCurrentVoiceOverState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(SCREEN_READER_STATE);
  },
  getCurrentReduceMotionState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(REDUCE_MOTION_STATE);
  },
  getCurrentBoldTextState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(false);
  },
  getCurrentGrayscaleState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(true);
  },
  getCurrentInvertColorsState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(false);
  },
  getCurrentReduceTransparencyState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(true);
  },
  getCurrentDarkerSystemColorsState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(true);
  },
  getCurrentPrefersCrossFadeTransitionsState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(false);
  },
  announceForAccessibility: (announcement: string): void => {
    announced = announcement;
  },
  setAccessibilityFocus: (reactTag: number): void => {
    focusedTag = reactTag;
  },
  addListener: (): void => {
    a11yAdded += 1;
  },
  removeListeners: (count: number): void => {
    a11yRemoved += count;
  },
};
const registeredModules: Record<string, unknown> = {
  AccessibilityManager: fakeAccessibilityInfo,
};

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined;

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
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

const ROOT_TAG = 11;

beforeEach(() => {
  fabric.reset();
  a11yEvents.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('AccessibilityInfo (iOS)', () => {
  it('isScreenReaderEnabled resolves to the module value', async () => {
    expect(await AccessibilityInfo.isScreenReaderEnabled()).toBe(SCREEN_READER_STATE);
  });

  it('a screenReaderChanged listener tracks a native change and stops on remove', async () => {
    let received: unknown;
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', state => {
      received = state;
    });
    expect(deviceHub).toBeDefined();
    expect(a11yAdded).toBeGreaterThanOrEqual(1);

    deviceHub?.emit('screenReaderChanged', false);
    expect(received).toBe(false);

    const removedBefore = a11yRemoved;
    received = undefined;
    sub.remove();
    expect(a11yRemoved).toBe(removedBefore + 1);

    deviceHub?.emit('screenReaderChanged', true);
    expect(received).toBeUndefined();
  });

  it('the expanded iOS getters resolve to their module values, with Android queries false', async () => {
    expect(await AccessibilityInfo.isGrayscaleEnabled()).toBe(true);
    expect(await AccessibilityInfo.isInvertColorsEnabled()).toBe(false);
    expect(await AccessibilityInfo.isReduceTransparencyEnabled()).toBe(true);

    // Android-only queries resolve false on the iOS build (no throw, RN parity).
    expect(await AccessibilityInfo.isHighTextContrastEnabled()).toBe(false);
    expect(await AccessibilityInfo.isAccessibilityServiceEnabled()).toBe(false);

    // The newer iOS getters resolve to their module's values (optional methods, present here).
    expect(await AccessibilityInfo.isDarkerSystemColorsEnabled()).toBe(true);
    expect(await AccessibilityInfo.prefersCrossFadeTransitions()).toBe(false);
  });

  it('announce + focus drive the native module', () => {
    AccessibilityInfo.announceForAccessibility('hello');
    expect(announced).toBe('hello');

    // No options-aware method on the fake -> falls back to the plain announce.
    AccessibilityInfo.announceForAccessibilityWithOptions('queued', {
      queue: true,
      priority: 'high',
    });
    expect(announced).toBe('queued');

    AccessibilityInfo.setAccessibilityFocus(42);
    expect(focusedTag).toBe(42);
  });

  it('getRecommendedTimeoutMillis returns the original on iOS', async () => {
    expect(await AccessibilityInfo.getRecommendedTimeoutMillis(3_000)).toBe(3_000);
  });

  it('sendAccessibilityEvent routes a host ref through the Fabric slot, click is a no-op', () => {
    // Mount a View and capture its host ref, the public-instance handle RN's Fabric
    // sendAccessibilityEvent expects. iOS routes every non-'click' event through the slot.
    let box: unknown;
    function App(): ReactElement {
      return (
        <View
          ref={instance => {
            box = instance;
          }}
          style={{ width: 10, height: 10 }}
        />
      );
    }
    mount(ROOT_TAG, <App />);
    expect(box).not.toBeNull();
    expect(box).toBeDefined();

    AccessibilityInfo.sendAccessibilityEvent(box, 'focus');
    const focus = a11yEvents[a11yEvents.length - 1];
    expect(focus).toBeDefined();
    expect(focus.eventType).toBe('focus');

    // RN early-returns 'click' on iOS (VoiceOver has no click producer) -> nothing reaches the slot.
    const before = a11yEvents.length;
    AccessibilityInfo.sendAccessibilityEvent(box, 'click');
    expect(a11yEvents.length).toBe(before);
  });
});
