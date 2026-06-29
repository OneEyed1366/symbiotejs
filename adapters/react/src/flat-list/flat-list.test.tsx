/** @jsxRuntime automatic */
// Co-located React-driven virtualization test (ADR 0025), ported from the headless smoke.
// A FlatList over 1000 items with a FIXED getItemLayout (no measurement needed) is driven
// by firing the inner ScrollView's onLayout/onScroll directly, asserting the core claim:
// only a window's worth of item nodes is ever committed (never all 1000), and that window
// SHIFTS when we scroll, while onEndReached/onStartReached gate on the real edge cells.

import { createElement, createRef, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount, type IFlatListHandle } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 21;

const ITEM_COUNT = 1_000;
const ITEM_HEIGHT = 40;
const VIEWPORT_HEIGHT = 400;
const CONTENT_HEIGHT = ITEM_COUNT * ITEM_HEIGHT;
// windowSize 21 over a 400px viewport / 40px rows = ~10 visible + buffer each side =>
// a few hundred at most, never close to 1000. Guard generously.
const WINDOW_CEILING = ITEM_COUNT / 2;
const DEEP_ROW = 'row-900';
const DEEP_OFFSET = 900 * ITEM_HEIGHT;
const MID_OFFSET = 400 * ITEM_HEIGHT;
const BOTTOM_OFFSET = CONTENT_HEIGHT - VIEWPORT_HEIGHT;

interface IRow {
  id: number;
  label: string;
}

const DATA: IRow[] = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({
  id: index,
  label: `row-${index}`,
}));

const Separator = (): ReactElement => createElement('symbiote-view', { style: { height: 1 } });
const Header = (): ReactElement => createElement('symbiote-text', {}, 'HEADER');
const Footer = (): ReactElement => createElement('symbiote-text', {}, 'FOOTER');

const listRef = createRef<IFlatListHandle>();
// Recorded by the App callbacks; reset in beforeEach so each `it` starts clean. Read the
// count through a function so control-flow analysis can't pin .length to a literal.
const endReachedDistances: number[] = [];
const startReachedDistances: number[] = [];
const endReachedCount = (): number => endReachedDistances.length;
const startReachedCount = (): number => startReachedDistances.length;

function App(): ReactElement {
  return createElement(FlatList<IRow>, {
    ref: listRef,
    data: DATA,
    keyExtractor: (item: IRow) => `k-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    ItemSeparatorComponent: Separator,
    ListHeaderComponent: Header,
    ListFooterComponent: Footer,
    onEndReached: ({ distanceFromEnd }: { distanceFromEnd: number }) => {
      endReachedDistances.push(distanceFromEnd);
    },
    onStartReached: ({ distanceFromStart }: { distanceFromStart: number }) => {
      startReachedDistances.push(distanceFromStart);
    },
    renderItem: ({ item }: { item: IRow }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  });
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  endReachedDistances.length = 0;
  startReachedDistances.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

// ---- helpers (repointed at the shared recorder) -------------------------

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// The text content of a committed row cell ("row-N"). We harvest these from the committed
// tree to know exactly which items are resident.
function collectRowLabels(): Set<string> {
  const labels = new Set<string>();
  walk(fabric.committed, node => {
    const text = node.props.text;
    if (typeof text === 'string' && text.startsWith('row-')) labels.add(text);
  });
  return labels;
}

function hasText(target: string): boolean {
  let found = false;
  walk(fabric.committed, node => {
    if (node.props.text === target) found = true;
  });
  return found;
}

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'an RCTScrollView was created').toBeDefined();
  return node!;
}

function scrollTo(handle: unknown, offsetY: number): void {
  fabric.fireEvent(handle, 'topScroll', {
    contentOffset: { x: 0, y: offsetY },
    contentSize: { width: 320, height: CONTENT_HEIGHT },
    layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
  });
}

// Establish the viewport by firing onLayout on the ScrollView. This re-renders and
// re-commits synchronously (discrete-lane flush), narrowing the window from the initial
// bounded prefix to the real visible region + buffer.
function mountWithViewport(): IFakeNode {
  mount(ROOT_TAG, <App />);
  const scrollView = findScrollView();
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
  });
  return scrollView;
}

describe('React FlatList virtualization on the engine', () => {
  it('windows to a bounded prefix anchored at the top', () => {
    mountWithViewport();

    const labels = collectRowLabels();
    expect(labels.size, 'item rows committed').toBeGreaterThan(0);
    expect(labels.size, 'window far smaller than the full data').toBeLessThan(WINDOW_CEILING);
    // The window starts at the top: row-0 present, a deep row absent.
    expect(labels.has('row-0')).toBe(true);
    expect(labels.has(DEEP_ROW)).toBe(false);
    // Header / footer render.
    expect(hasText('HEADER')).toBe(true);
    expect(hasText('FOOTER')).toBe(true);
    // keyExtractor/renderItem round-trip: the tagged row content reached the committed tree.
    expect(labels.has('row-1')).toBe(true);
  });

  it('shifts the window when scrolled deep', () => {
    const scrollView = mountWithViewport();
    scrollTo(scrollView.instanceHandle, DEEP_OFFSET);

    const labels = collectRowLabels();
    expect(labels.size, 'window stays bounded after scroll').toBeLessThan(WINDOW_CEILING);
    // The deep row is now resident...
    expect(labels.has(DEEP_ROW)).toBe(true);
    // ...and the early rows have fallen out of the window (real shift, not append).
    expect(labels.has('row-0')).toBe(false);
  });

  it('gates onEndReached on the last cell being rendered', () => {
    const scrollView = mountWithViewport();

    // Mid-list: the trailing buffer does NOT yet reach the last row, so onEndReached must
    // NOT fire, exactly the misfire the old count-based gating allowed.
    scrollTo(scrollView.instanceHandle, MID_OFFSET);
    expect(collectRowLabels().has('row-999'), 'last row absent at mid offset').toBe(false);
    expect(endReachedCount()).toBe(0);

    // To the bottom: row-999 enters the window, distance collapses to ~0, fires exactly once.
    scrollTo(scrollView.instanceHandle, BOTTOM_OFFSET);
    expect(collectRowLabels().has('row-999'), 'last row resident at the bottom').toBe(true);
    expect(endReachedCount()).toBe(1);

    // A redundant scroll at the same bottom (same content length) must NOT double-fire.
    scrollTo(scrollView.instanceHandle, BOTTOM_OFFSET);
    expect(endReachedCount()).toBe(1);
  });

  it('exposes the RN imperative handle methods', () => {
    mountWithViewport();

    const handle = listRef.current;
    expect(handle).not.toBeNull();
    const requiredMethods: ReadonlyArray<keyof IFlatListHandle> = [
      'flashScrollIndicators',
      'getNativeScrollRef',
      'getScrollableNode',
      'getScrollResponder',
      'recordInteraction',
    ];
    for (const method of requiredMethods) {
      expect(typeof handle![method], `handle.${method}`).toBe('function');
    }
    // getNativeScrollRef hands back the inner ScrollView handle, not a fabricated native tag.
    const nativeRef = handle!.getNativeScrollRef();
    expect(nativeRef).not.toBeNull();
    expect(typeof nativeRef!.flashScrollIndicators).toBe('function');
  });

  it('fires onStartReached when scrolling back to the top', () => {
    const scrollView = mountWithViewport();

    // Park at the bottom so onStartReached is re-armed, then return to the very top.
    scrollTo(scrollView.instanceHandle, BOTTOM_OFFSET);
    const startBeforeReturn = startReachedCount();
    scrollTo(scrollView.instanceHandle, 0);
    expect(collectRowLabels().has('row-0'), 'row-0 resident again at the top').toBe(true);
    expect(startReachedCount()).toBe(startBeforeReturn + 1);
    // The reported distance from the start at offset 0 floors to ~0.
    const lastStartDistance = startReachedDistances[startReachedDistances.length - 1];
    expect(lastStartDistance).toBe(0);

    // A redundant scroll at the same top (same content length) must NOT double-fire.
    const startAfterReturn = startReachedCount();
    scrollTo(scrollView.instanceHandle, 0);
    expect(startReachedCount()).toBe(startAfterReturn);
  });
});
