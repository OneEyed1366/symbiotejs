/** @jsxRuntime automatic */
// Co-located React-driven test (ADR 0025), ported from the headless smoke. Proves two
// VirtualizedList parity fixes a simulator would otherwise be the only witness to:
//
//   1. `inverted` flips exactly TWO tree levels (the outer scroll node and each cell),
//      and NEVER the content container (flipping it cancels the scroll-node flip and
//      renders cells upside-down).
//   2. `waitForInteraction: true` suppresses all viewable items until the first scroll.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount, type IViewableItemsChangedInfo } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 22;

const ITEM_COUNT = 50;
const ITEM_HEIGHT = 40;
const VIEWPORT_HEIGHT = 400;
const SCROLL_OFFSET = 80;
const CONTENT_HEIGHT = ITEM_COUNT * ITEM_HEIGHT;

interface IRow {
  id: number;
  label: string;
}

const DATA: IRow[] = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({
  id: index,
  label: `row-${index}`,
}));

const viewableReports: IViewableItemsChangedInfo<IRow>[] = [];

function InvertedApp(): ReactElement {
  return createElement(FlatList<IRow>, {
    data: DATA,
    inverted: true,
    keyExtractor: (item: IRow) => `k-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }: { item: IRow }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  });
}

function GatedApp(): ReactElement {
  return createElement(FlatList<IRow>, {
    data: DATA,
    keyExtractor: (item: IRow) => `g-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    viewabilityConfig: { itemVisiblePercentThreshold: 50, waitForInteraction: true },
    onViewableItemsChanged: (info: IViewableItemsChangedInfo<IRow>) => {
      viewableReports.push(info);
    },
    renderItem: ({ item }: { item: IRow }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  });
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  viewableReports.length = 0;
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

// True when a scale(-1) flip (the inversion transform) appears anywhere in a node's props,
// robust to whether style lands as `props.style.transform` or a hoisted `props.transform`.
function hasInversionTransform(props: Record<string, unknown>): boolean {
  let found = false;
  const seen = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (found || value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    const record: Record<string, unknown> = { ...value };
    const scaleY = record.scaleY;
    const scaleX = record.scaleX;
    if (scaleY === -1 || scaleX === -1) {
      found = true;
      return;
    }
    for (const key of Object.keys(record)) visit(record[key]);
  };
  visit(props);
  return found;
}

// The cell wrapper is the measuring RCTView whose direct child is the RCTText for a single
// "row-N". Matching on a direct RCTText child skips the outer root/scroll/content RCTViews.
function findCellWithRowText(): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found !== undefined || node.viewName !== 'RCTView') return;
    const textChild = node.children.find(child => child.viewName === 'RCTText');
    if (textChild === undefined) return;
    let carriesRow = false;
    walk([textChild], descendant => {
      const text = descendant.props.text;
      if (typeof text === 'string' && text.startsWith('row-')) carriesRow = true;
    });
    if (carriesRow) found = node;
  });
  return found;
}

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'an RCTScrollView was created').toBeDefined();
  return node!;
}

describe('React FlatList inverted + waitForInteraction on the engine', () => {
  it('flips the scroll node and each cell, NOT the content container', () => {
    mount(ROOT_TAG, <InvertedApp />);

    // Establish the viewport so cells actually commit.
    const invertedScroll = findScrollView();
    fabric.fireEvent(invertedScroll.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
    });

    const scrollNode = findCommitted('RCTScrollView');
    expect(scrollNode, 'RCTScrollView in committed tree').toBeDefined();
    const contentNode = findCommitted('RCTScrollContentView');
    expect(contentNode, 'RCTScrollContentView in committed tree').toBeDefined();
    const cellNode = findCellWithRowText();
    expect(cellNode, 'a cell wrapper carrying a row label').toBeDefined();

    // The outer scroll node IS flipped.
    expect(hasInversionTransform(scrollNode!.props), 'scroll node flipped').toBe(true);
    // Each cell IS flipped (counter-flip so its content reads upright).
    expect(hasInversionTransform(cellNode!.props), 'cell wrapper counter-flipped').toBe(true);
    // The content container is NOT flipped: the bug was a third, cancelling flip here.
    expect(hasInversionTransform(contentNode!.props), 'content container NOT flipped').toBe(false);
  });

  it('suppresses viewable items until the first scroll', () => {
    mount(ROOT_TAG, <GatedApp />);

    const gatedScroll = findScrollView();
    // Establish the viewport (a layout, not a scroll, must NOT count as interaction).
    fabric.fireEvent(gatedScroll.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
    });

    // Before any scroll: waitForInteraction must suppress every viewable item.
    const viewableBefore = viewableReports.flatMap(r => r.viewableItems);
    expect(viewableBefore.length, 'no viewable items before interaction').toBe(0);

    // First scroll = the interaction that ungates the config.
    fabric.fireEvent(gatedScroll.instanceHandle, 'topScroll', {
      contentOffset: { x: 0, y: SCROLL_OFFSET },
      contentSize: { width: 320, height: CONTENT_HEIGHT },
      layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
    });

    const viewableAfter = viewableReports.flatMap(r => r.viewableItems);
    expect(viewableAfter.length, 'viewable items reported after scroll').toBeGreaterThan(0);
    // The window at offset 80, 400px viewport, 40px rows => rows ~2..11 fully visible.
    const labelsAfter = new Set(viewableAfter.map(token => token.item.label));
    expect(labelsAfter.has('row-3'), 'row-3 viewable after scroll').toBe(true);
  });
});
