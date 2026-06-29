// Co-located Vue-driven pipeline test (ADR 0025), the Vue twin of
// adapters/react/src/text-input/text-input.test.tsx. Proves the TextInput contract through Vue's
// reactive lifecycle (shallowRef host node, post-flush controlled-write watch, expose() handle)
// over the shared fake Fabric slot: the controlled value -> private `text` fold + the
// onChange -> onChangeText derivation, the engine style-key hoist (paddingBottom lands at the
// node top level, never nested under `style`), onChangeText NEVER reaching Fabric as a raw prop,
// the setTextAndSelection controlled write on value divergence (and none on mount), and the
// imperative handle (focus/blur land as view commands, proving shallowRef identity through the
// engine mirror, plus isFocused / clear / setSelection). Reactivity is async, so each driving
// step is followed by a macrotask `tick` that drains the engine's coalesced commit and the
// post-flush watchers before the assert reads the committed tree / commands.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TextInput, mount, unmount, type ITextInputHandle } from '@symbiote/vue';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

type ICommandCall = {
  name: string;
  args: readonly unknown[];
};

const ROOT_TAG = 310;
const SINGLELINE = 'RCTSinglelineTextInputView';
const MULTILINE = 'RCTMultilineTextInputView';
const ACK_COUNT = 7;
const PADDING_BOTTOM = 12;

const commands: ICommandCall[] = [];

// The shared harness slot records createNode / completeRoot / events, but NOT view commands.
// TextInput drives setTextAndSelection / focus / blur via dispatchCommand, which the engine
// destructures off the live global slot on its first commit, so graft a recording one before any
// mount (same approach as the React twin's purpose-built slot).
const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

// A macrotask boundary drains ALL pending microtasks: the engine's coalesced commit AND the
// post-flush watch (controlled write), before the assert reads them.
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function inputNode(viewName: string): IFakeNode {
  const node = fabric.find(n => n.viewName === viewName);
  expect(node, `a ${viewName} was created`).toBeDefined();
  if (node === undefined) throw new Error(`unreachable: ${viewName} missing`);
  return node;
}

describe('Vue TextInput on the engine', () => {
  it('folds the controlled value to text + mostRecentEventCount and derives onChangeText', async () => {
    let changedText: string | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(TextInput, {
            value: 'hi',
            onChangeText: (text: string) => {
              changedText = text;
            },
          }),
      }),
    );
    await tick();

    const node = inputNode(SINGLELINE);
    expect(node.props.text).toBe('hi');
    expect(typeof node.props.mostRecentEventCount).toBe('number');

    fabric.fireEvent(node.instanceHandle, 'topChange', {
      text: 'hix',
      eventCount: 1,
      selection: { start: 3, end: 3 },
    });
    await tick();
    expect(changedText).toBe('hix');
  });

  it('selects the multiline intrinsic for multiline', async () => {
    mount(
      ROOT_TAG,
      defineComponent({ setup: () => () => h(TextInput, { multiline: true, value: 'x' }) }),
    );
    await tick();
    inputNode(MULTILINE);
  });

  it('hoists style keys onto the committed node, never nesting under style', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h(TextInput, { value: 'x', style: { paddingBottom: PADDING_BOTTOM } }),
      }),
    );
    await tick();

    const node = inputNode(SINGLELINE);
    expect(node.props.paddingBottom).toBe(PADDING_BOTTOM);
    expect('style' in node.props, 'style is flattened, not nested').toBe(false);
  });

  it('never forwards onChangeText to the committed native node', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h(TextInput, { value: 'x', onChangeText: () => {} }),
      }),
    );
    await tick();

    const node = inputNode(SINGLELINE);
    expect('onChangeText' in node.props, 'onChangeText must not reach Fabric').toBe(false);
  });

  it('commands setTextAndSelection with the acked count on a divergent controlled write', async () => {
    // A real controlled component whose onChangeText UPPERCASES the text: native reports "ab" at
    // ACK_COUNT, the parent stores "AB", so the post-flush watch must command "AB" down.
    const Forced = defineComponent({
      setup() {
        const value = ref('');
        return () =>
          h(TextInput, {
            value: value.value,
            onChangeText: (text: string) => {
              value.value = text.toUpperCase();
            },
          });
      },
    });
    mount(ROOT_TAG, Forced);
    await tick();

    const node = inputNode(SINGLELINE);
    fabric.fireEvent(node.instanceHandle, 'topChange', {
      text: 'ab',
      eventCount: ACK_COUNT,
      selection: { start: 2, end: 2 },
    });
    await tick();

    const setText = commands.find(c => c.name === 'setTextAndSelection');
    expect(setText, 'a setTextAndSelection command was dispatched').toBeDefined();
    expect(setText!.args[0]).toBe(ACK_COUNT);
    expect(setText!.args[1]).toBe('AB');
  });

  it('issues no controlled-write command on mount (value equals the seed)', async () => {
    mount(ROOT_TAG, defineComponent({ setup: () => () => h(TextInput, { value: 'seed' }) }));
    await tick();
    expect(commands.some(c => c.name === 'setTextAndSelection')).toBe(false);
  });

  it('lands focus / blur as view commands through the shallowRef-held node', async () => {
    const handleRef = ref<ITextInputHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({ setup: () => () => h(TextInput, { value: 'x', ref: handleRef }) }),
    );
    await tick();

    expect(handleRef.value, 'imperative handle captured after commit').not.toBeNull();
    handleRef.value!.focus();
    handleRef.value!.blur();
    await tick();
    // The node is held by IDENTITY (shallowRef), so the engine mirror resolves it and the
    // commands land; a plain ref would hand back a reactive Proxy and both would silently no-op.
    expect(
      commands.some(c => c.name === 'focus'),
      'focus command landed',
    ).toBe(true);
    expect(
      commands.some(c => c.name === 'blur'),
      'blur command landed',
    ).toBe(true);
  });

  it('reflects focus/blur events through isFocused', async () => {
    const handleRef = ref<ITextInputHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({ setup: () => () => h(TextInput, { value: 'x', ref: handleRef }) }),
    );
    await tick();

    const node = inputNode(SINGLELINE);
    expect(handleRef.value!.isFocused()).toBe(false);
    fabric.fireEvent(node.instanceHandle, 'topFocus', {});
    await tick();
    expect(handleRef.value!.isFocused()).toBe(true);
    fabric.fireEvent(node.instanceHandle, 'topBlur', {});
    await tick();
    expect(handleRef.value!.isFocused()).toBe(false);
  });

  it('clear() and setSelection() route through setTextAndSelection', async () => {
    const handleRef = ref<ITextInputHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({ setup: () => () => h(TextInput, { value: 'hello', ref: handleRef }) }),
    );
    await tick();

    handleRef.value!.clear();
    await tick();
    const cleared = commands.find(c => c.name === 'setTextAndSelection');
    expect(cleared, 'clear() dispatches setTextAndSelection').toBeDefined();
    expect(cleared!.args[1], 'clear() commands empty text').toBe('');

    commands.length = 0;
    handleRef.value!.setSelection(2, 5);
    await tick();
    const selected = commands.find(c => c.name === 'setTextAndSelection');
    expect(selected, 'setSelection() dispatches setTextAndSelection').toBeDefined();
    expect(selected!.args[2]).toBe(2);
    expect(selected!.args[3]).toBe(5);
  });
});
