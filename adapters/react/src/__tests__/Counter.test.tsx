// Co-located React-driven pipeline test (ADR 0025), ported from the headless `smoke.tsx`.
// Proves the engine's mutation->clone-on-write commit (R2), the React mutation host config,
// and the tap->recommit round-trip against the fake Fabric slot, no simulator.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, Text, mount, unmount } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';

function Counter(): ReactElement {
  const [count, setCount] = useState(0);
  return (
    <View onPress={() => setCount(value => value + 1)}>
      <Text>{`count: ${count}`}</Text>
    </View>
  );
}

const ROOT_TAG = 11;

// The fake `nativeFabricUIManager` is a process singleton (RN installs it once via
// InitializeCore), and the engine registers its event handler against the live slot on the
// first mount via a module-level one-shot. So the slot is installed ONCE; the per-test unit
// is the mounted surface: `beforeEach(reset)` clears recordings, `afterEach(unmount)` tears
// the surface down so every `it` mounts from scratch.
const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('React Counter on the engine', () => {
  it('mounts View > Text > RawText under a box-none AppContainer', () => {
    mount(ROOT_TAG, <Counter />);
    expect(fabric.serialize(fabric.appRoot().children)).toBe(
      'RCTView(RCTText(RCTRawText "count: 0"))',
    );
  });

  it('a tap increments the counter and recommits', () => {
    mount(ROOT_TAG, <Counter />);

    // The app's own View is the non-box-none RCTView (the box-none one is the AppContainer).
    const view = fabric.find(n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none');
    expect(view, 'app View was created').toBeDefined();

    // A press is an honest gesture: a touch that starts and ends on the same node. Fabric
    // hands the View's instanceHandle straight back.
    fabric.fireEvent(view!.instanceHandle, 'topTouchStart');
    fabric.fireEvent(view!.instanceHandle, 'topTouchEnd');

    expect(fabric.serialize(fabric.appRoot().children)).toBe(
      'RCTView(RCTText(RCTRawText "count: 1"))',
    );
  });
});
