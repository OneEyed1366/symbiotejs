/** @jsxRuntime automatic */
// Co-located React-driven test (ADR 0025), ported from the headless `smoke.tsx`. Proves a
// user-supplied onScroll on a FlatList COMPOSES with the list's internal windowing handler
// instead of overwriting it. RN's _onScroll runs its own bookkeeping AND calls
// this.props.onScroll(e) (VirtualizedList.js:1695-1697); before the fix our list dropped the
// user handler because it arrived raw via the rest spread and was clobbered by the internal
// `onScroll`. We mount a FlatList with getItemLayout (so offsets are known without real
// layout), a user onScroll, a small viewport, then fire a native scroll on the inner
// RCTScrollView and assert BOTH the user handler fired with the payload AND the window moved.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 31;
const ITEM_HEIGHT = 40;
const VIEWPORT = 200;
const DATA = Array.from({ length: 200 }, (_unused, index) => ({ id: index }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// Collect the text content of every rendered row so we can tell which window is resident.
function renderedRows(nodes: IFakeNode[]): string[] {
  const rows: string[] = [];
  for (const node of nodes) {
    for (const child of node.children) {
      if (typeof child.props.text === 'string' && child.props.text.startsWith('row-')) {
        rows.push(child.props.text);
      }
    }
    rows.push(...renderedRows(node.children));
  }
  return rows;
}

// The user's scroll-driven-UI handler records here. Before the fix it was silently dropped.
const seenEvents: Array<Record<string, unknown>> = [];

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
    onScroll: event => {
      seenEvents.push(event.nativeEvent);
    },
  });
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  seenEvents.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

const scrollPayload = {
  contentOffset: { x: 0, y: ITEM_HEIGHT * 100 },
  contentSize: { width: 320, height: ITEM_HEIGHT * DATA.length },
  layoutMeasurement: { width: 320, height: VIEWPORT },
};

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'scroll view node found in committed tree').toBeDefined();
  if (node === undefined) throw new Error('unreachable: scroll view missing');
  return node;
}

describe('FlatList user onScroll composes with internal windowing', () => {
  it('commits a FlatList containing a scroll view', () => {
    mount(ROOT_TAG, <App />);
    expect(fabric.committed.length).toBeGreaterThan(0);
    expect(findScrollView()).toBeDefined();
  });

  it('forwards the user onScroll with the scroll payload', () => {
    mount(ROOT_TAG, <App />);
    const scrollView = findScrollView();

    // Set the viewport via a native layout event so the window has a real height.
    fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });

    fabric.fireEvent(scrollView.instanceHandle, 'topScroll', scrollPayload);

    // The user's onScroll fired and received the scroll event (not clobbered by the internal one).
    expect(seenEvents.length).toBeGreaterThan(0);
    const last = seenEvents[seenEvents.length - 1];
    const offset = last.contentOffset;
    expect(isRecord(offset)).toBe(true);
    if (isRecord(offset)) expect(offset.y).toBe(ITEM_HEIGHT * 100);
  });

  it('keeps the internal windowing handler — the window moves on a deep scroll', () => {
    mount(ROOT_TAG, <App />);
    const scrollView = findScrollView();

    fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });

    // Rows resident before the deep scroll: top of the list.
    const rowsBeforeScroll = renderedRows(fabric.committed);

    fabric.fireEvent(scrollView.instanceHandle, 'topScroll', scrollPayload);

    const rowsAfterScroll = renderedRows(fabric.committed);
    // Control: the pre-scroll window must NOT already contain the deep row, else the test
    // cannot distinguish windowing.
    expect(rowsBeforeScroll.includes('row-100')).toBe(false);
    // The window moved off the top (internal handler intact).
    expect(rowsAfterScroll.includes('row-0')).toBe(false);
    // …and reached the scrolled region.
    expect(rowsAfterScroll.includes('row-100')).toBe(true);
  });
});
