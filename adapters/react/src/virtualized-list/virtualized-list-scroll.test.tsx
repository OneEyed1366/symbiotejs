/** @jsxRuntime automatic */
// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `virtualized-list-scroll.smoke.tsx`. Proves that an ANIMATED imperative scroll rides the
// ScrollView's native scrollTo command (not an instant contentOffset push): we mount a
// FlatList with a ref, then assert that scrollToOffset({animated:true}) dispatches
// scrollTo [x, y, true] while scrollToOffset({animated:false}) dispatches scrollTo with
// animated=false. No simulator: a failure here is in the JS routing of the animated flag.

import { createElement, createRef, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount, type IFlatListHandle } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';

interface ICommandCall {
  name: string;
  args: readonly unknown[];
}

const ROOT_TAG = 42;
const ITEM_HEIGHT = 40;
const DATA = Array.from({ length: 100 }, (_unused, index) => ({ id: index }));

const listRef = createRef<IFlatListHandle>();
const commands: ICommandCall[] = [];

// The shared harness slot records createNode / completeRoot / events, but NOT view
// commands: scrollTo rides `dispatchCommand`, which the engine destructures off the live
// global slot on its first commit. So we graft a recording `dispatchCommand` onto the
// installed slot before any mount, mirroring the per-file slot the smoke carried.
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

function App(): ReactElement {
  return createElement(FlatList<{ id: number }>, {
    data: DATA,
    keyExtractor: item => `k-${item.id}`,
    getItemLayout: (_data, index) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
    ref: listRef,
  });
}

function scrollCommands(): ICommandCall[] {
  return commands.filter(c => c.name === 'scrollTo');
}

describe('VirtualizedList imperative scroll routes through the native scrollTo command', () => {
  it('an animated scroll dispatches the native scrollTo [x, y, true]', () => {
    mount(ROOT_TAG, <App />);
    expect(fabric.committed.length, 'FlatList committed').toBeGreaterThan(0);
    expect(listRef.current, 'FlatList ref attached').not.toBeNull();

    listRef.current!.scrollToOffset({ offset: 200, animated: true });
    const scrolls = scrollCommands();
    expect(scrolls.length, 'animated scrollToOffset dispatches one scrollTo').toBe(1);

    const [x, y, animated] = scrolls[0].args;
    // A vertical list scrolls along y; x stays 0.
    expect(x).toBe(0);
    expect(y).toBe(200);
    expect(animated).toBe(true);
  });

  it('an instant scroll also uses the native command, with animated=false', () => {
    // contentOffset-as-a-prop scrolls on Android but not on iOS post-mount, so both animated
    // and instant route through scrollTo, the instant one just carries animated=false. To
    // reach the cumulative "two scrolls" state the smoke asserted, re-do the animated scroll
    // first, then the instant one.
    mount(ROOT_TAG, <App />);
    expect(fabric.committed.length, 'FlatList committed').toBeGreaterThan(0);
    expect(listRef.current, 'FlatList ref attached').not.toBeNull();

    listRef.current!.scrollToOffset({ offset: 200, animated: true });
    listRef.current!.scrollToOffset({ offset: 80, animated: false });
    const scrolls = scrollCommands();
    expect(scrolls.length, 'instant scrollToOffset also dispatches a scrollTo').toBe(2);

    const [x, y, animated] = scrolls[1].args;
    expect(x).toBe(0);
    expect(y).toBe(80);
    expect(animated).toBe(false);
  });
});
