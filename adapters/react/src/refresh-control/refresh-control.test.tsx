// Co-located proof of the RefreshControl primitive wired into ScrollView (ADR 0025),
// ported from the headless `refresh-control.smoke.tsx`. Asserts the iOS nesting
// (PullToRefreshView is a child of RCTScrollView, a sibling BEFORE RCTScrollContentView),
// that `refreshing` passes through as a real Fabric prop, that the Android-only `enabled`
// prop forwards to native, and that firing topRefresh on the refresh-control node calls
// onRefresh, all against the fake Fabric slot, no simulator. A failure here is in JS.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, ScrollView, RefreshControl, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 61;

// onRefresh records into a module-level flag (the App is module-level); reset per test.
let refreshed = false;

function App(): ReactElement {
  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={false}
          enabled={true}
          onRefresh={() => {
            refreshed = true;
          }}
        />
      }
    >
      <View />
    </ScrollView>
  );
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  refreshed = false;
});
afterEach(() => unmount(ROOT_TAG));

describe('React RefreshControl on the engine', () => {
  it('nests PullToRefreshView before the content container under the ScrollView', () => {
    mount(ROOT_TAG, <App />);

    // appRoot() asserts the single box-none AppContainer root (committed.length === 1 and
    // pointerEvents === 'box-none'), then unwraps it.
    const appRoot = fabric.appRoot();
    expect(fabric.serialize(appRoot.children)).toBe(
      'RCTScrollView(PullToRefreshViewRCTScrollContentView(RCTView))',
    );

    // The serializer runs siblings together, so assert the ordered children of the scroll
    // view directly: refresh control FIRST, content container SECOND.
    const scrollView = appRoot.children[0];
    expect(scrollView?.viewName).toBe('RCTScrollView');
    const childNames = scrollView.children.map((node: IFakeNode) => node.viewName);
    expect(childNames).toEqual(['PullToRefreshView', 'RCTScrollContentView']);
  });

  it('forwards refreshing:false and the Android-only enabled prop to native', () => {
    mount(ROOT_TAG, <App />);

    const refresh = fabric.find(node => node.viewName === 'PullToRefreshView');
    expect(refresh, 'a PullToRefreshView was created').toBeDefined();
    expect(refresh!.props.refreshing).toBe(false);
    // `enabled` is Android-only (AndroidSwipeRefreshLayout); symbiote forwards it via
    // `...nativeProps`. Stripping it broke `<RefreshControl enabled={false} />`, so it
    // must reach the node.
    expect(refresh!.props.enabled).toBe(true);
  });

  it('calls onRefresh when topRefresh fires on the refresh-control node', () => {
    mount(ROOT_TAG, <App />);

    const refresh = fabric.find(node => node.viewName === 'PullToRefreshView');
    expect(refresh, 'a PullToRefreshView was created').toBeDefined();

    fabric.fireEvent(refresh!.instanceHandle, 'topRefresh', {});
    expect(refreshed).toBe(true);
  });
});
