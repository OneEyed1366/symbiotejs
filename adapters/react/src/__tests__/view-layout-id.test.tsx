// Co-located React-driven test (ADR 0025), ported from `view-layout-id.smoke.tsx`.
// Proves the View/Text event + alias props thread through to the committed Fabric node:
//   1. <View onLayout> / <Text onLayout> raise the `layout` event, the listener flags
//      onLayout:true on the node (Fabric only measures a flagged node).
//   2. id="foo" is RN's W3C alias for nativeID, so it lands as nativeID:'foo' and must
//      NEVER reach Fabric as a raw `id` prop.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text, View, mount, unmount } from '@symbiotejs/react';
import { installFabric } from '@symbiotejs/test-utils';

const ROOT_TAG = 240;

function App(): ReactElement {
  return (
    <View id="foo" onLayout={() => {}}>
      <Text onLayout={() => {}}>hi</Text>
    </View>
  );
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('View/Text layout + id alias props', () => {
  it('folds id to nativeID and never leaks a raw id prop', () => {
    mount(ROOT_TAG, <App />);
    // The app's View is the RCTView carrying nativeID (the synthetic root never does).
    const view = fabric.find(n => n.viewName === 'RCTView' && n.props.nativeID === 'foo');
    expect(view, 'a View with nativeID="foo" was created').toBeDefined();
    expect('id' in view!.props).toBe(false);
  });

  it('flags the View node with onLayout:true', () => {
    mount(ROOT_TAG, <App />);
    const view = fabric.find(n => n.viewName === 'RCTView' && n.props.nativeID === 'foo');
    expect(view!.props.onLayout).toBe(true);
  });

  it('flags the Text node with onLayout:true', () => {
    mount(ROOT_TAG, <App />);
    const text = fabric.find(n => n.viewName === 'RCTText');
    expect(text, 'an RCTText was created').toBeDefined();
    expect(text!.props.onLayout).toBe(true);
  });
});
