// Co-located Vue-driven test (ADR 0025): TextInput autoFocus. autoFocus is a JS-driven imperative
// `focus` view command fired once the node first commits (RN TextInputState.focusInput). The Vue
// adapter wires it from a watch(nodeRef, …, flush:'post'), but under the async-batched commit the
// node has no Fabric tag at post-flush time, so a naive dispatchViewCommand is skipped (node not
// committed) and the one-shot guard never lets it retry — autoFocus silently does nothing on Vue
// (React commits synchronously, so its effect always sees the committed node). The fake fabric slot
// records dispatched commands so we assert the focus actually reached the committed node, no host.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, TextInput } from '@symbiote/vue';
import { installFabric } from '@symbiote/test-utils';

interface ICommandCall {
  name: string;
  args: readonly unknown[];
}

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');

const commands: ICommandCall[] = [];
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

const ROOT_TAG = 53;
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Vue TextInput autoFocus', () => {
  it('dispatches the focus command to the committed node', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h(TextInput, { autoFocus: true }),
      }),
    );
    await tick();

    const focusCommands = commands.filter(command => command.name === 'focus');
    expect(focusCommands, 'autoFocus dispatches one focus command').toHaveLength(1);
  });

  it('does not focus when autoFocus is absent', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h(TextInput, {}),
      }),
    );
    await tick();

    expect(commands.filter(command => command.name === 'focus')).toHaveLength(0);
  });
});
