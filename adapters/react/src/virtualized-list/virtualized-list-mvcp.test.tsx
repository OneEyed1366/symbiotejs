/** @jsxRuntime automatic */
// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `virtualized-list-mvcp.smoke.tsx`. Proves two VirtualizedList feature-parity fixes:
//   1. maintainVisibleContentPosition (MVCP) is forwarded to the inner ScrollView node, so
//      Fabric anchors the visible cells. We walk the committed tree for the scroll view and
//      assert the prop landed (with minIndexForVisible bumped for a ListHeaderComponent).
//   2. scrollToIndex on an UNMEASURED target with no getItemLayout fires onScrollToIndexFailed
//      ({index, highestMeasuredFrameIndex, averageItemLength}) instead of silently scrolling
//      to an estimate, so NO scrollTo command is dispatched on that path.
// No simulator: a failure here is in the JS routing, not native.

import { createElement, createRef, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount, type IFlatListHandle } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

interface ICommandCall {
  name: string;
  args: readonly unknown[];
}

interface IScrollToIndexFailure {
  index: number;
  highestMeasuredFrameIndex: number;
  averageItemLength: number;
}

const ROOT_TAG = 41;
const MVCP_DATA = Array.from({ length: 20 }, (_unused, index) => ({ id: index }));
const FAIL_DATA = Array.from({ length: 100 }, (_unused, index) => ({ id: index }));

const listRef = createRef<IFlatListHandle>();
const failures: IScrollToIndexFailure[] = [];
const commands: ICommandCall[] = [];

// The shared harness slot doesn't record view commands; the fail-path case asserts that NO
// scrollTo is dispatched, so graft a recording `dispatchCommand` onto the live slot before
// any mount (the engine destructures it off the global on its first commit).
const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
  failures.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

// Walk the committed tree; return the first node whose viewName looks like a scroll view.
function findScrollView(nodes: IFakeNode[]): IFakeNode | undefined {
  for (const node of nodes) {
    if (/scroll/i.test(node.viewName)) return node;
    const nested = findScrollView(node.children);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function MvcpApp(): ReactElement {
  return createElement(FlatList<{ id: number }>, {
    data: MVCP_DATA,
    keyExtractor: item => `k-${item.id}`,
    // A header occupies child 0, so RN bumps minIndexForVisible by 1 (1 -> 2).
    ListHeaderComponent: () => createElement('symbiote-text', {}, 'header'),
    maintainVisibleContentPosition: { minIndexForVisible: 1, autoscrollToTopThreshold: 10 },
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
  });
}

function FailPathApp(): ReactElement {
  return createElement(FlatList<{ id: number }>, {
    data: FAIL_DATA,
    keyExtractor: item => `k-${item.id}`,
    // No getItemLayout: cells are unmeasured in headless (no real onLayout), so a far
    // target has no resolvable offset.
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
    onScrollToIndexFailed: info => failures.push(info),
    ref: listRef,
  });
}

describe('VirtualizedList MVCP forwarding and scrollToIndex failure path', () => {
  it('forwards maintainVisibleContentPosition to the scroll view, bumping minIndexForVisible for the header', () => {
    mount(ROOT_TAG, <MvcpApp />);
    expect(fabric.committed.length, 'MVCP FlatList committed').toBeGreaterThan(0);

    const scrollView = findScrollView(fabric.committed);
    expect(scrollView, 'scroll view node found in committed tree').toBeDefined();

    const mvcp = scrollView!.props.maintainVisibleContentPosition;
    expect(typeof mvcp).toBe('object');
    expect(mvcp).not.toBeNull();

    const minIndex = Reflect.get(Object(mvcp), 'minIndexForVisible');
    const autoscroll = Reflect.get(Object(mvcp), 'autoscrollToTopThreshold');
    expect(minIndex, 'minIndexForVisible bumped 1->2 for the header').toBe(2);
    expect(autoscroll, 'autoscrollToTopThreshold passes through as 10').toBe(10);
  });

  it('fires onScrollToIndexFailed for an unmeasured cell and dispatches no scrollTo', () => {
    mount(ROOT_TAG, <FailPathApp />);
    expect(fabric.committed.length, 'fail-path FlatList committed').toBeGreaterThan(0);
    expect(listRef.current, 'fail-path FlatList ref attached').not.toBeNull();

    const scrollsBefore = commands.filter(c => c.name === 'scrollTo').length;
    listRef.current!.scrollToIndex({ index: 50, animated: true });
    const scrollsAfter = commands.filter(c => c.name === 'scrollTo').length;

    expect(failures.length, 'onScrollToIndexFailed fires once').toBe(1);
    expect(failures[0].index, 'failure index is 50').toBe(50);
    expect(typeof failures[0].highestMeasuredFrameIndex).toBe('number');
    expect(typeof failures[0].averageItemLength).toBe('number');
    // An unmeasured scrollToIndex must NOT dispatch scrollTo (an estimate).
    expect(scrollsAfter).toBe(scrollsBefore);
  });
});
