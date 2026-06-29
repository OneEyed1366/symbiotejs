// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `switch.smoke`. Proves the Switch primitive: the Fabric view name `Switch`, the
// `value` prop as a strict boolean, the trackColor/thumbColor/ios_backgroundColor ->
// native prop mapping, the onChange -> onValueChange derivation from nativeEvent.value,
// and the controlled snap-back: a rejected toggle commands the JS value back down via
// a `setValue` view command. No simulator: a failure here is in JS, not native.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Switch } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

interface ICommandCall {
  name: string;
  args: readonly unknown[];
}

const ROOT_TAG = 190;
const SWITCH_VIEW = 'Switch';

const commands: ICommandCall[] = [];

// The shared harness slot doesn't record view commands; the snap-back cases assert the
// `setValue` command, so graft a recording `dispatchCommand` onto the live slot before any
// mount (the engine destructures it off the global on its first commit).
const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function switchNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SWITCH_VIEW);
  if (!node) throw new Error(`no ${SWITCH_VIEW} was created`);
  return node;
}

describe('React Switch on the engine', () => {
  it('emits the Fabric view name Switch and passes value through as a strict boolean', () => {
    mount(ROOT_TAG, <Switch value />);
    expect(switchNode().props.value).toBe(true);
  });

  it('folds an undefined value to a strict false', () => {
    mount(ROOT_TAG, <Switch />);
    expect(switchNode().props.value).toBe(false);
  });

  it('maps color + disabled props to the native iOS prop names', () => {
    mount(
      ROOT_TAG,
      <Switch
        value
        disabled
        trackColor={{ false: '#767577', true: '#81b0ff' }}
        thumbColor="#f5dd4b"
        ios_backgroundColor="#3e3e3e"
      />,
    );
    const props = switchNode().props;
    expect(props.onTintColor).toBe('#81b0ff');
    expect(props.tintColor).toBe('#767577');
    expect(props.thumbTintColor).toBe('#f5dd4b');
    expect(props.disabled).toBe(true);
    // ios_backgroundColor folds into the style, which the commit engine flattens onto the
    // node, so backgroundColor lands as a top-level committed prop.
    expect(props.backgroundColor).toBe('#3e3e3e');
  });

  it('derives onValueChange and the raw onChange event from nativeEvent.value', () => {
    let changedValue: boolean | undefined;
    let rawEventValue: unknown;
    mount(
      ROOT_TAG,
      <Switch
        value={false}
        onValueChange={v => {
          changedValue = v;
        }}
        onChange={event => {
          rawEventValue = event.nativeEvent.value;
        }}
      />,
    );
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    expect(changedValue).toBe(true);
    expect(rawEventValue).toBe(true);
  });

  it('snaps native back via a setValue command when a no-op handler rejects the toggle', () => {
    function Stuck(): ReactElement {
      // value is pinned false; the handler deliberately ignores the new value.
      const [value] = useState(false);
      return <Switch value={value} onValueChange={() => {}} />;
    }
    mount(ROOT_TAG, <Stuck />);
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });

    const setValue = commands.find(c => c.name === 'setValue');
    expect(setValue, 'a setValue command after a rejected toggle').toBeDefined();
    expect(setValue!.args[0]).toBe(false);
  });

  it('issues no snap-back command when the parent accepts the toggle', () => {
    function Accepting(): ReactElement {
      const [value, setValue] = useState(false);
      return <Switch value={value} onValueChange={setValue} />;
    }
    mount(ROOT_TAG, <Accepting />);
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });

    expect(commands.some(c => c.name === 'setValue')).toBe(false);
  });
});
