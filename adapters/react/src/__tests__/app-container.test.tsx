// Co-located React-driven test (ADR 0025), ported from `app-container.smoke.tsx`.
// Proves the synthetic root container, symbiote's equivalent of RN's AppContainer
// (`renderApplication` wraps the app in `<View style={{flex:1}} pointerEvents="box-none">`):
// every commit puts a single box-none, flex:1 RCTView at the top of the child set,
// wrapping the app's own top-level nodes.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text, View, mount, unmount } from '@symbiotejs/react';
import { installFabric } from '@symbiotejs/test-utils';

function App(): ReactElement {
  return (
    <View>
      <Text>hello</Text>
    </View>
  );
}

const ROOT_TAG = 200;

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('synthetic AppContainer root', () => {
  it('wraps the app in a single box-none, flex:1 RCTView', () => {
    mount(ROOT_TAG, <App />);

    // appRoot() asserts the invariant: exactly one committed root, box-none.
    const root = fabric.appRoot();
    expect(root.viewName).toBe('RCTView');
    expect(root.props.flex).toBe(1);
    expect(root.props.pointerEvents).toBe('box-none');
  });

  it("puts the app's own View as the container's single child", () => {
    mount(ROOT_TAG, <App />);

    const root = fabric.appRoot();
    expect(root.children).toHaveLength(1);
    expect(root.children[0].viewName).toBe('RCTView');
  });
});
