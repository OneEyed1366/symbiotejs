// Co-located React-driven test (ADR 0025), ported from the headless `smoke.tsx`. Proves the
// horizontal-FlatList fix. On iOS the scroll axis is decided by content overflow, so a
// horizontal list must (1) forward `horizontal` to the native RCTScrollView and (2) pin the
// content view to the full row width, else the content stays at the frame width, the row is
// clipped, and nothing scrolls. We assert both against the fake Fabric slot.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 32;
const ITEM_COUNT = 20;
const ITEM_WIDTH = 50;
const TOTAL_WIDTH = ITEM_COUNT * ITEM_WIDTH;
const VIEWPORT_WIDTH = 200;

interface IRow {
  id: string;
  index: number;
}

const data: IRow[] = Array.from({ length: ITEM_COUNT }, (_, index) => ({
  id: `row-${index}`,
  index,
}));

function App(): ReactElement {
  return createElement(FlatList<IRow>, {
    data,
    horizontal: true,
    keyExtractor: (item: IRow) => item.id,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_WIDTH,
      offset: ITEM_WIDTH * index,
      index,
    }),
    renderItem: ({ item }: { item: IRow; index: number }) =>
      createElement('symbiote-view', { key: item.id, style: { width: ITEM_WIDTH, height: 40 } }),
  });
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findCreated(viewName: string): IFakeNode {
  const node = fabric.find(n => n.viewName === viewName);
  expect(node, `${viewName} created`).toBeDefined();
  if (node === undefined) throw new Error(`unreachable: ${viewName} missing`);
  return node;
}

describe('horizontal FlatList', () => {
  it('forwards horizontal to the native RCTScrollView', () => {
    mount(ROOT_TAG, createElement(App));
    const scrollView = findCreated('RCTScrollView');
    expect(scrollView.props.horizontal).toBe(true);
  });

  it('pins the content view to the full row width as a row', () => {
    mount(ROOT_TAG, createElement(App));
    const content = findCreated('RCTScrollContentView');
    // The content view must be pinned to the full row width, not the frame width. This is
    // what makes the row overflow and the native scroll view actually scroll.
    expect(content.props.width).toBe(TOTAL_WIDTH);
    expect(content.props.flexDirection).toBe('row');
  });

  it('registers an event handler that accepts a layout event', () => {
    mount(ROOT_TAG, createElement(App));
    const scrollView = findCreated('RCTScrollView');
    // Sanity: the renderer registered an event handler (fireEvent throws otherwise), and the
    // windowing layout event is delivered without error.
    expect(() =>
      fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
        layout: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: 40 },
      }),
    ).not.toThrow();
  });
});
