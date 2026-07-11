// Co-located unit test for accessibility-info's shared sendAccessibilityEvent routing
// (accessibility-info/shared.ts's routeSendAccessibilityEvent), exercised through both
// platform builds directly, no simulator needed. Proves the merge behaves identically
// on both platforms except iOS's one 'click' no-op: createElement + createSurface commit
// a real node so commit.ts's mirror resolves it, and the fake Fabric slot is augmented
// with sendAccessibilityEvent (installFabric's harness models commit/clone, not the a11y
// sink - same augmentation the React adapter's accessibility-info test already uses).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createElement,
  createSurface,
  disposeRoot,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { AccessibilityInfo as AccessibilityInfoIOS } from './index.ios';
import { AccessibilityInfo as AccessibilityInfoAndroid } from './index.android';

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
  });
}

const ROOT_TAG = 91;

function committedNode(): ISymbioteNode {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

beforeEach(() => {
  fabric.reset();
  a11yEvents.length = 0;
});
afterEach(() => disposeRoot(ROOT_TAG));

describe('sendAccessibilityEvent (shared routing)', () => {
  it('a non-node handle is a no-op on both platforms', () => {
    AccessibilityInfoIOS.sendAccessibilityEvent(null, 'focus');
    AccessibilityInfoAndroid.sendAccessibilityEvent(undefined, 'focus');
    expect(a11yEvents).toEqual([]);
  });

  it('an uncommitted node is a no-op on both platforms (mirror has no entry yet)', () => {
    const node = createElement('RCTView');
    AccessibilityInfoIOS.sendAccessibilityEvent(node, 'focus');
    AccessibilityInfoAndroid.sendAccessibilityEvent(node, 'focus');
    expect(a11yEvents).toEqual([]);
  });

  it('iOS routes every non-click event through the slot', () => {
    const node = committedNode();
    AccessibilityInfoIOS.sendAccessibilityEvent(node, 'focus');
    expect(a11yEvents).toHaveLength(1);
    expect(a11yEvents[0]?.eventType).toBe('focus');
  });

  it("iOS early-returns 'click' — the ONE platform difference — nothing reaches the slot", () => {
    const node = committedNode();
    AccessibilityInfoIOS.sendAccessibilityEvent(node, 'click');
    expect(a11yEvents).toEqual([]);
  });

  it("Android has no 'click' special case: it reaches the slot exactly like any other event", () => {
    const node = committedNode();
    AccessibilityInfoAndroid.sendAccessibilityEvent(node, 'click');
    expect(a11yEvents).toHaveLength(1);
    expect(a11yEvents[0]?.eventType).toBe('click');
  });

  it('Android routes a non-click event through the slot too, identically to iOS', () => {
    const node = committedNode();
    AccessibilityInfoAndroid.sendAccessibilityEvent(node, 'focus');
    expect(a11yEvents).toHaveLength(1);
    expect(a11yEvents[0]?.eventType).toBe('focus');
  });
});
