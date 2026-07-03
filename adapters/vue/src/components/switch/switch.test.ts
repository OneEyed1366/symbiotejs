// Co-located Vue-driven pipeline test (ADR 0025), the Vue twin of
// adapters/react/src/components/switch/switch.test.tsx. Proves the Switch contract through Vue's
// reactive lifecycle (shallowRef host node, post-flush snap-back watch): the value prop as a
// strict boolean, the native onChange -> onValueChange derivation, the controlled snap-back (a rejected
// toggle commands the JS value back down via setValue), and — the point this file exists to
// guard — that v-model (modelValue/update:modelValue) drives BOTH the render AND the snap-back
// watch identically to the plain value/onValueChange path (vue-adapter-events skill, Rule 6: a
// second read site that misses resolveModelValue is a silent bug, not a build error).

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Switch, mount, unmount } from '@symbiotejs/vue';
import { installFabric, type IFakeNode } from '@symbiotejs/test-utils';

type ICommandCall = {
  name: string;
  args: readonly unknown[];
};

const ROOT_TAG = 320;
const SWITCH_VIEW = 'Switch';

const commands: ICommandCall[] = [];

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function switchNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SWITCH_VIEW);
  expect(node, `a ${SWITCH_VIEW} was created`).toBeDefined();
  if (node === undefined) throw new Error('unreachable: Switch missing');
  return node;
}

describe('Vue Switch on the engine', () => {
  it('passes value through as a strict boolean', async () => {
    mount(ROOT_TAG, defineComponent({ setup: () => () => h(Switch, { value: true }) }));
    await tick();
    expect(switchNode().props.value).toBe(true);
  });

  it('snaps native back via setValue when a rejected toggle is driven by value/onValueChange', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        // value is pinned false; onValueChange deliberately ignores the reported value.
        setup: () => () => h(Switch, { value: false, onValueChange: () => {} }),
      }),
    );
    await tick();
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();

    const setValue = commands.find(c => c.name === 'setValue');
    expect(setValue, 'a setValue command after a rejected toggle').toBeDefined();
    expect(setValue!.args[0]).toBe(false);
  });

  it('accepts modelValue as an alias for value, never forwarding it to Fabric', async () => {
    mount(ROOT_TAG, defineComponent({ setup: () => () => h(Switch, { modelValue: true }) }));
    await tick();

    const node = switchNode();
    expect(node.props.value).toBe(true);
    expect('modelValue' in node.props, 'modelValue must not reach Fabric').toBe(false);
  });

  it('emits update:modelValue and update:value alongside valueChange', async () => {
    let modelValueUpdate: boolean | undefined;
    let valueUpdate: boolean | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Switch, {
            modelValue: false,
            'onUpdate:modelValue': (value: boolean) => {
              modelValueUpdate = value;
            },
            'onUpdate:value': (value: boolean) => {
              valueUpdate = value;
            },
          }),
      }),
    );
    await tick();
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();
    expect(modelValueUpdate).toBe(true);
    expect(valueUpdate).toBe(true);
  });

  it('snaps native back via setValue on a rejected toggle driven by v-model, not just value', async () => {
    // Regression case for the read-every-site gotcha: the snap-back watch must resolve
    // modelValue too, not only the raw `value` attr — otherwise this renders fine but the
    // correction silently compares against an undefined value and never fires.
    mount(
      ROOT_TAG,
      defineComponent({
        // modelValue is pinned false; the update handler deliberately ignores the toggle.
        setup: () => () => h(Switch, { modelValue: false, 'onUpdate:modelValue': () => {} }),
      }),
    );
    await tick();
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();

    const setValue = commands.find(c => c.name === 'setValue');
    expect(setValue, 'a setValue command after a v-model-driven rejected toggle').toBeDefined();
    expect(setValue!.args[0]).toBe(false);
  });
});
