// Co-located React-driven test (ADR 0025), ported from `safe-area-view.smoke.tsx`.
// Proves the SafeAreaView primitive: its Fabric view name, the style passthrough,
// children nesting, the standard ViewProps (testID/accessibilityLabel/accessible)
// reaching the safe-area node, and onLayout routing as a real `topLayout` event.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SafeAreaView, View, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const TEST_ID = 'safe-area';
const ACCESSIBILITY_LABEL = 'screen';
const ROOT_TAG = 220;

let layoutFired = false;

function App(): ReactElement {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff' }}
      testID={TEST_ID}
      accessibilityLabel={ACCESSIBILITY_LABEL}
      accessible={true}
      onLayout={() => {
        layoutFired = true;
      }}
    >
      <View />
    </SafeAreaView>
  );
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  layoutFired = false;
});
afterEach(() => unmount(ROOT_TAG));

function safeAreaNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'SafeAreaView');
  expect(node, 'a SafeAreaView was created').toBeDefined();
  return node!;
}

describe('SafeAreaView', () => {
  it('commits a SafeAreaView wrapping its children under the app container', () => {
    mount(ROOT_TAG, <App />);
    expect(fabric.serialize(fabric.appRoot().children)).toBe('SafeAreaView(RCTView)');
  });

  it('flattens style onto the safe-area node and nests children', () => {
    mount(ROOT_TAG, <App />);
    const safe = safeAreaNode();
    expect(safe.props.flex).toBe(1);
    expect(safe.props.backgroundColor).toBe('#fff');
    expect(safe.children).toHaveLength(1);
    expect(safe.children[0].viewName).toBe('RCTView');
  });

  it('passes the standard ViewProps through to the safe-area node', () => {
    mount(ROOT_TAG, <App />);
    const safe = safeAreaNode();
    expect(safe.props.testID).toBe(TEST_ID);
    expect(safe.props.accessibilityLabel).toBe(ACCESSIBILITY_LABEL);
    expect(safe.props.accessible).toBe(true);
  });

  it('routes onLayout as a topLayout event', () => {
    mount(ROOT_TAG, <App />);
    const safe = safeAreaNode();
    fabric.fireEvent(safe.instanceHandle, 'topLayout', {});
    expect(layoutFired).toBe(true);
  });
});
