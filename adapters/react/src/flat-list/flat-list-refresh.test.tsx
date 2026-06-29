/** @jsxRuntime automatic */
// Co-located React-driven test (ADR 0025), ported from the headless smoke. Proves a
// FlatList threads pull-to-refresh down to its inner ScrollView: RN's VirtualizedList
// renders a <RefreshControl> into the ScrollView's `refreshControl` prop whenever
// `onRefresh` is set, and omits it otherwise.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 23;

const ITEM_COUNT = 20;
const ITEM_HEIGHT = 40;
const VIEWPORT_HEIGHT = 400;
const REFRESH_VIEW_NAME = 'PullToRefreshView';

interface IRow {
  id: number;
  label: string;
}

const DATA: IRow[] = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({
  id: index,
  label: `row-${index}`,
}));

let refreshCalls = 0;

function RefreshApp(): ReactElement {
  return createElement(FlatList<IRow>, {
    data: DATA,
    refreshing: true,
    onRefresh: () => {
      refreshCalls += 1;
    },
    progressViewOffset: 12,
    keyExtractor: (item: IRow) => `r-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }: { item: IRow }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  });
}

function PlainApp(): ReactElement {
  return createElement(FlatList<IRow>, {
    data: DATA,
    keyExtractor: (item: IRow) => `p-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }: { item: IRow }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  });
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  refreshCalls = 0;
});
afterEach(() => unmount(ROOT_TAG));

// ---- helpers (repointed at the shared recorder) -------------------------

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function findCommitted(viewName: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && node.viewName === viewName) found = node;
  });
  return found;
}

// The scroll node whose own children contain a PullToRefreshView, proves the refresh
// control is a child of the scroll view, not stranded elsewhere.
function findScrollWithRefreshChild(): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found !== undefined || node.viewName !== 'RCTScrollView') return;
    if (node.children.some(child => child.viewName === REFRESH_VIEW_NAME)) found = node;
  });
  return found;
}

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'an RCTScrollView was created').toBeDefined();
  return node!;
}

describe('React FlatList pull-to-refresh on the engine', () => {
  it('wires a PullToRefreshView child onto the scroll view when onRefresh is set', () => {
    mount(ROOT_TAG, <RefreshApp />);

    // Establish the viewport so the list commits its body.
    const refreshScroll = findScrollView();
    fabric.fireEvent(refreshScroll.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
    });

    const refreshNode = findCommitted(REFRESH_VIEW_NAME);
    expect(refreshNode, `${REFRESH_VIEW_NAME} committed`).toBeDefined();

    const scrollWithRefresh = findScrollWithRefreshChild();
    expect(scrollWithRefresh, `${REFRESH_VIEW_NAME} is a child of the RCTScrollView`).toBeDefined();

    // The controlled refreshing prop reaches native.
    expect(refreshNode!.props.refreshing).toBe(true);
  });

  it('commits no PullToRefreshView when onRefresh is absent', () => {
    mount(ROOT_TAG, <PlainApp />);

    const plainScroll = findScrollView();
    fabric.fireEvent(plainScroll.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
    });

    expect(findCommitted(REFRESH_VIEW_NAME), 'refresh control absent').toBeUndefined();
  });
});
