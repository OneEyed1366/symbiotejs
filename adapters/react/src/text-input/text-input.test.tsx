// Co-located React-driven test (ADR 0025), ported from `text-input.smoke.tsx`.
// Proves the TextInput primitive, the controlled-value / event-count handshake, over a
// fake Fabric slot. This file keeps a PURPOSE-BUILT slot rather than the shared
// `installFabric()` harness because TextInput drives a `dispatchCommand`
// (setTextAndSelection / blur) view command, which the shared recorder does not capture.
// It checks the fold (value/defaultValue -> private `text` + mostRecentEventCount), the
// onChange -> onChangeText derivation, the multiline intrinsic, a forced controlled write
// that goes down as a setTextAndSelection command carrying the acknowledged event count,
// Keyboard.dismiss blurring the focused input, the W3C alias folds, and the
// underlineColorAndroid default.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Keyboard, TextInput, mount, unmount } from '@symbiote/react';

interface IFakeNode {
  tag: number;
  viewName: string;
  props: Record<string, unknown>;
  children: IFakeNode[];
  instanceHandle: unknown;
}

type IEventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void;

interface ICommandCall {
  handle: unknown;
  name: string;
  args: readonly unknown[];
}

let committed: IFakeNode[] = [];
let eventHandler: IEventHandler | undefined;
const allCreated: IFakeNode[] = [];
const commands: ICommandCall[] = [];

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle };
    allCreated.push(node);
    return node;
  },
  cloneNodeWithNewProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({
    ...node,
    props: newProps,
  }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: IFakeNode,
    newProps: Record<string, unknown>,
  ): IFakeNode => ({ ...node, props: newProps, children: [] }),
  createChildSet: (): IFakeNode[] => [],
  appendChild(parent: IFakeNode, child: IFakeNode): IFakeNode {
    parent.children.push(child);
    return parent;
  },
  appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
    childSet.push(child);
  },
  completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
    committed = childSet;
  },
  registerEventHandler(handler: IEventHandler): void {
    eventHandler = handler;
  },
  dispatchCommand(handle: unknown, name: string, args: readonly unknown[]): void {
    commands.push({ handle, name, args });
  },
};

Object.assign(globalThis, { nativeFabricUIManager: slot });

const SINGLELINE = 'RCTSinglelineTextInputView';
const MULTILINE = 'RCTMultilineTextInputView';
const ACK_COUNT = 7;
const ROOT_TAG = 300;

function inputNode(viewName: string): IFakeNode {
  const node = allCreated.find(n => n.viewName === viewName);
  expect(node, `a ${viewName} was created`).toBeDefined();
  return node!;
}

function fireChange(node: IFakeNode, nativeEvent: Record<string, unknown>): void {
  expect(eventHandler, 'an event handler was registered').toBeDefined();
  eventHandler!(node.instanceHandle, 'topChange', nativeEvent);
}

// The event handler is registered once for the whole slot, so reset keeps it.
// Only the per-mount node/command bookkeeping is cleared.
beforeEach(() => {
  committed = [];
  allCreated.length = 0;
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('TextInput', () => {
  it('folds the controlled value to text + mostRecentEventCount and derives onChangeText', () => {
    let changedText: string | undefined;
    mount(
      ROOT_TAG,
      <TextInput
        value="hi"
        onChangeText={text => {
          changedText = text;
        }}
      />,
    );

    const node = inputNode(SINGLELINE);
    expect(node.props.text).toBe('hi');
    expect(typeof node.props.mostRecentEventCount).toBe('number');

    fireChange(node, { text: 'hix', eventCount: 1, selection: { start: 3, end: 3 } });
    expect(changedText).toBe('hix');
  });

  it('selects the multiline intrinsic for multiline', () => {
    mount(ROOT_TAG, <TextInput multiline value="x" />);
    inputNode(MULTILINE);
  });

  it('commands setTextAndSelection with the acked count on a divergent controlled write', () => {
    // A real controlled component whose onChangeText UPPERCASES the text: native reports
    // "ab" at ACK_COUNT, the parent stores "AB", so the component must command "AB" down.
    function Forced(): ReactElement {
      const [value, setValue] = useState('');
      return <TextInput value={value} onChangeText={text => setValue(text.toUpperCase())} />;
    }
    mount(ROOT_TAG, <Forced />);

    const node = inputNode(SINGLELINE);
    fireChange(node, { text: 'ab', eventCount: ACK_COUNT, selection: { start: 2, end: 2 } });

    const setText = commands.find(c => c.name === 'setTextAndSelection');
    expect(setText, 'a setTextAndSelection command was dispatched').toBeDefined();
    expect(setText!.args[0]).toBe(ACK_COUNT);
    expect(setText!.args[1]).toBe('AB');
  });

  it('Keyboard.dismiss blurs the focused input and no-ops when nothing holds focus', () => {
    mount(ROOT_TAG, <TextInput value="focus me" />);

    const node = inputNode(SINGLELINE);
    expect(eventHandler, 'an event handler was registered').toBeDefined();
    // Native reports focus -> TextInput records this node as the focused one.
    eventHandler!(node.instanceHandle, 'topFocus', {});
    Keyboard.dismiss();
    expect(commands.some(c => c.name === 'blur')).toBe(true);

    // A second dismiss has nothing focused -> must be a no-op (no new blur command).
    commands.length = 0;
    Keyboard.dismiss();
    expect(commands.some(c => c.name === 'blur')).toBe(false);
  });

  it('folds W3C aliases to their legacy native props and strips the raw aliases', () => {
    mount(
      ROOT_TAG,
      <TextInput inputMode="numeric" enterKeyHint="done" readOnly selectionColor="#ff0000" />,
    );

    const node = inputNode(SINGLELINE);
    expect(node.props.keyboardType).toBe('number-pad');
    expect(node.props.returnKeyType).toBe('done');
    expect(node.props.editable).toBe(false);
    expect(node.props.cursorColor).toBe('#ff0000');
    for (const raw of ['inputMode', 'enterKeyHint', 'readOnly']) {
      expect(raw in node.props, `raw alias "${raw}" must not reach Fabric`).toBe(false);
    }
  });

  it('folds autoComplete + derives showSoftInputOnFocus:true from inputMode', () => {
    mount(ROOT_TAG, <TextInput autoComplete="email" inputMode="text" />);

    const node = inputNode(SINGLELINE);
    expect(node.props.autoComplete).toBe('email');
    expect(node.props.textContentType).toBe('emailAddress');
    expect(node.props.showSoftInputOnFocus).toBe(true);
  });

  it('derives showSoftInputOnFocus:false from inputMode="none"', () => {
    mount(ROOT_TAG, <TextInput inputMode="none" />);
    expect(inputNode(SINGLELINE).props.showSoftInputOnFocus).toBe(false);
  });

  it('passes an unmapped autoComplete token through with its iOS textContentType', () => {
    mount(ROOT_TAG, <TextInput autoComplete="cc-name" />);
    const node = inputNode(SINGLELINE);
    expect(node.props.autoComplete).toBe('cc-name');
    expect(node.props.textContentType).toBe('creditCardName');
  });

  it('defaults underlineColorAndroid to transparent', () => {
    mount(ROOT_TAG, <TextInput value="x" />);
    expect(inputNode(SINGLELINE).props.underlineColorAndroid).toBe('transparent');
  });

  it('lets an explicit underlineColorAndroid win', () => {
    mount(ROOT_TAG, <TextInput value="x" underlineColorAndroid="#00ff00" />);
    expect(inputNode(SINGLELINE).props.underlineColorAndroid).toBe('#00ff00');
  });
});
