// Co-located regression of the CONTROLLED refresh path (ADR 0025), ported from the headless
// `refresh-flip.smoke.tsx`. When onRefresh fires and the parent flips refreshing -> true,
// that true must reach the committed PullToRefreshView node, or native's UIRefreshControl is
// never told to keep spinning. The sibling refresh-control test covers the static
// refreshing:false mount; this covers the false->true flip. We fire the real `topRefresh`
// event (same discrete-lane flush path the device uses) and inspect the recommitted tree.
// Green here means a missing spinner is native/visual, not JS.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, ScrollView, RefreshControl, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 62;

function App(): ReactElement {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} />
      }
    >
      <View />
    </ScrollView>
  );
}

// The flip produces a CLONE of the refresh node with new props, so walk the committed tree
// (not `fabric.find`, which records only the originally created node).
function findRefresh(nodes: IFakeNode[]): IFakeNode | undefined {
  for (const node of nodes) {
    if (node.viewName === 'PullToRefreshView') return node;
    const found = findRefresh(node.children);
    if (found) return found;
  }
  return undefined;
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('React RefreshControl controlled flip on the engine', () => {
  it('propagates refreshing:false -> true to the committed node after topRefresh', () => {
    mount(ROOT_TAG, <App />);

    const before = findRefresh(fabric.committed);
    expect(before, 'a PullToRefreshView committed at mount').toBeDefined();

    // Native fires the pull gesture -> onRefresh -> setRefreshing(true).
    fabric.fireEvent(before!.instanceHandle, 'topRefresh', {});

    const after = findRefresh(fabric.committed);
    expect(after?.props.refreshing).toBe(true);
  });
});
