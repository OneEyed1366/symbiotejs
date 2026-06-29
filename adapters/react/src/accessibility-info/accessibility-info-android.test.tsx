// Co-located React-driven test (ADR 0025), ported from the headless `accessibility-info-android.smoke`.
// Proves the Android AccessibilityInfo event dispatch, no emulator. The shared Fabric slot is
// augmented to record sendAccessibilityEvent(handle, eventType); we mount a View, capture its host
// ref, and assert AccessibilityInfo.sendAccessibilityEvent routes the node's COMMITTED Fabric handle
// and the STRING eventType (focus / click / windowStateChange) through the slot, matching RN's
// Fabric path, not the old UIManager int-map crutch. We import the .android build directly because
// the base re-export resolves to iOS under vitest.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, View, findNodeHandle } from '@symbiote/react';
import { AccessibilityInfo } from '../../../../core/engine/src/accessibility-info/index.android';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

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

const ROOT_TAG = 7;

function lastEvent(): IAccessibilityCall {
  const call = a11yEvents[a11yEvents.length - 1];
  if (!call) throw new Error('expected a slot.sendAccessibilityEvent call');
  return call;
}

let box: unknown;
let boxTag: number;

beforeEach(() => {
  fabric.reset();
  a11yEvents.length = 0;
  box = undefined;

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
  if (box == null) throw new Error('host ref handed back nothing');
  const tag = findNodeHandle(box);
  if (typeof tag !== 'number') throw new Error('findNodeHandle(ref) returned no tag');
  boxTag = tag;
});
afterEach(() => unmount(ROOT_TAG));

describe('AccessibilityInfo (Android)', () => {
  it("sendAccessibilityEvent('focus') routes the committed node + string through the slot", () => {
    AccessibilityInfo.sendAccessibilityEvent(box, 'focus');
    const call = lastEvent();
    expect(call.node.tag).toBe(boxTag);
    expect(call.eventType).toBe('focus');
  });

  it('the STRING eventType passes through unmapped (no int translation)', () => {
    AccessibilityInfo.sendAccessibilityEvent(box, 'click');
    const click = lastEvent();
    expect(click.node.tag).toBe(boxTag);
    expect(click.eventType).toBe('click');

    AccessibilityInfo.sendAccessibilityEvent(box, 'windowStateChange');
    expect(lastEvent().eventType).toBe('windowStateChange');
  });

  it('a non-node handle is a no-op, and setAccessibilityFocus(tag) does not route', () => {
    const before = a11yEvents.length;
    // A bare tag can't be resolved back to a node, so it must not reach the slot.
    AccessibilityInfo.sendAccessibilityEvent(123, 'focus');
    expect(a11yEvents.length).toBe(before);

    // setAccessibilityFocus is tag-only (no node to route), a documented no-op.
    AccessibilityInfo.setAccessibilityFocus(boxTag);
    expect(a11yEvents.length).toBe(before);
  });

  it('iOS-only getters resolve false on Android (RN parity)', async () => {
    expect(await AccessibilityInfo.isDarkerSystemColorsEnabled()).toBe(false);
    expect(await AccessibilityInfo.prefersCrossFadeTransitions()).toBe(false);
  });
});
