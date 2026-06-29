// Co-located React-driven test (ADR 0025), ported from `input-accessory-view.smoke.tsx`.
// Proves the InputAccessoryView primitive: the RCTInputAccessoryView Fabric view name,
// nativeID/backgroundColor/style reaching the node, children nesting under it, and a
// TextInput carrying inputAccessoryViewID.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputAccessoryView, Text, TextInput, View, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const NATIVE_ID = 'accessory-1';
const BACKGROUND_COLOR = '#eee';
const ROOT_TAG = 230;

function App(): ReactElement {
  return (
    <View>
      <TextInput inputAccessoryViewID={NATIVE_ID} />
      <InputAccessoryView
        nativeID={NATIVE_ID}
        backgroundColor={BACKGROUND_COLOR}
        style={{ flex: 1 }}
      >
        <Text>Done</Text>
      </InputAccessoryView>
    </View>
  );
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function accessoryNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTInputAccessoryView');
  expect(node, 'an RCTInputAccessoryView was created').toBeDefined();
  return node!;
}

describe('InputAccessoryView', () => {
  it('passes nativeID, backgroundColor, and flattened style to the node', () => {
    mount(ROOT_TAG, <App />);
    const accessory = accessoryNode();
    expect(accessory.props.nativeID).toBe(NATIVE_ID);
    expect(accessory.props.backgroundColor).toBe(BACKGROUND_COLOR);
    expect(accessory.props.flex).toBe(1);
  });

  it('nests children under the accessory node', () => {
    mount(ROOT_TAG, <App />);
    const accessory = accessoryNode();
    expect(accessory.children).toHaveLength(1);
    expect(accessory.children[0].viewName).toBe('RCTText');
  });

  it('threads inputAccessoryViewID onto the referencing TextInput', () => {
    mount(ROOT_TAG, <App />);
    const input = fabric.find(n => n.viewName === 'RCTSinglelineTextInputView');
    expect(input, 'a TextInput was created').toBeDefined();
    expect(input!.props.inputAccessoryViewID).toBe(NATIVE_ID);
  });
});
