// Co-located Vue-driven pipeline test (ADR 0025), the Vue twin of
// adapters/react/src/flat-list/*.test.tsx (flat-list + flat-list-horizontal + the imperative
// scroll). Proves FlatList's data-shaping over the shared VirtualizedList windowing: a
// single-column window stays bounded, numColumns packs items into flex-row rows, a horizontal
// list forwards `horizontal` to the native RCTScrollView and pins the content view to the full
// row width, and an imperative scrollToOffset lands as the native scrollTo view command. Vue
// reactivity is async, so each driving step is followed by a macrotask `tick`.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount, type IFlatListHandle } from '@symbiote/vue';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

type ICommandCall = {
  name: string;
  args: readonly unknown[];
};

const ROOT_TAG = 330;
const ITEM_HEIGHT = 40;
const VIEWPORT_HEIGHT = 400;
const BIG_COUNT = 1_000;
const WINDOW_CEILING = BIG_COUNT / 2;
const ITEM_WIDTH = 50;
const HORIZONTAL_COUNT = 20;
const TOTAL_WIDTH = HORIZONTAL_COUNT * ITEM_WIDTH;

type IRow = { id: number; label: string };

const commands: ICommandCall[] = [];

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function collectRowLabels(): Set<string> {
  const labels = new Set<string>();
  walk(fabric.committed, node => {
    const text = node.props.text;
    if (typeof text === 'string' && text.startsWith('row-')) labels.add(text);
  });
  return labels;
}

function findCreated(viewName: string): IFakeNode {
  const node = fabric.find(n => n.viewName === viewName);
  expect(node, `${viewName} created`).toBeDefined();
  if (node === undefined) throw new Error(`unreachable: ${viewName} missing`);
  return node;
}

function rowsWithFlexDirection(): IFakeNode[] {
  const rows: IFakeNode[] = [];
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTView' && node.props.flexDirection === 'row') rows.push(node);
  });
  return rows;
}

describe('Vue FlatList on the engine', () => {
  it('windows a single-column list to a bounded prefix anchored at the top', async () => {
    const data: IRow[] = Array.from({ length: BIG_COUNT }, (_unused, index) => ({
      id: index,
      label: `row-${index}`,
    }));
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(FlatList, {
            data,
            keyExtractor: (item: IRow) => `k-${item.id}`,
            getItemLayout: (_data: unknown, index: number) => ({
              length: ITEM_HEIGHT,
              offset: ITEM_HEIGHT * index,
              index,
            }),
            renderItem: ({ item }: { item: IRow }) => h('symbiote-text', {}, item.label),
          }),
      }),
    );
    await tick();
    const scrollView = findCreated('RCTScrollView');
    fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
    });
    await tick();

    const labels = collectRowLabels();
    expect(labels.size, 'item rows committed').toBeGreaterThan(0);
    expect(labels.size, 'window far smaller than the full data').toBeLessThan(WINDOW_CEILING);
    expect(labels.has('row-0')).toBe(true);
    expect(labels.has('row-900')).toBe(false);
  });

  it('packs items into flex-row rows for numColumns', async () => {
    const data: IRow[] = Array.from({ length: 6 }, (_unused, index) => ({
      id: index,
      label: `row-${index}`,
    }));
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(FlatList, {
            data,
            numColumns: 2,
            keyExtractor: (item: IRow) => `k-${item.id}`,
            renderItem: ({ item }: { item: IRow }) => h('symbiote-text', {}, item.label),
          }),
      }),
    );
    await tick();

    const rows = rowsWithFlexDirection();
    expect(rows.length, 'three flex-row rows for 6 items in 2 columns').toBe(3);
    expect(rows[0].children.length, 'a full row holds two column cells').toBe(2);
    // Every item still renders, just regrouped into rows.
    expect(collectRowLabels().size).toBe(6);
  });

  it('forwards horizontal to the native scroll view and pins the content to the row width', async () => {
    const data: IRow[] = Array.from({ length: HORIZONTAL_COUNT }, (_unused, index) => ({
      id: index,
      label: `row-${index}`,
    }));
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(FlatList, {
            data,
            horizontal: true,
            keyExtractor: (item: IRow) => `k-${item.id}`,
            getItemLayout: (_data: unknown, index: number) => ({
              length: ITEM_WIDTH,
              offset: ITEM_WIDTH * index,
              index,
            }),
            renderItem: ({ item }: { item: IRow }) =>
              h('symbiote-view', { style: { width: ITEM_WIDTH, height: 40 } }, [
                h('symbiote-text', {}, item.label),
              ]),
          }),
      }),
    );
    await tick();

    expect(findCreated('RCTScrollView').props.horizontal).toBe(true);
    const content = findCreated('RCTScrollContentView');
    // Pinned to the full row width (not the frame width) so the row overflows and scrolls.
    expect(content.props.width).toBe(TOTAL_WIDTH);
    expect(content.props.flexDirection).toBe('row');
  });

  it('routes an imperative scrollToOffset through the native scrollTo command', async () => {
    const listRef = ref<IFlatListHandle | null>(null);
    const data: IRow[] = Array.from({ length: BIG_COUNT }, (_unused, index) => ({
      id: index,
      label: `row-${index}`,
    }));
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(FlatList, {
            ref: listRef,
            data,
            keyExtractor: (item: IRow) => `k-${item.id}`,
            getItemLayout: (_data: unknown, index: number) => ({
              length: ITEM_HEIGHT,
              offset: ITEM_HEIGHT * index,
              index,
            }),
            renderItem: ({ item }: { item: IRow }) => h('symbiote-text', {}, item.label),
          }),
      }),
    );
    await tick();
    const scrollView = findCreated('RCTScrollView');
    fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
    });
    await tick();

    expect(listRef.value, 'FlatList handle attached').not.toBeNull();
    listRef.value!.scrollToOffset({ offset: 200, animated: true });
    const scrolls = commands.filter(c => c.name === 'scrollTo');
    expect(scrolls.length, 'one scrollTo from scrollToOffset').toBe(1);
    expect(scrolls[0].args[0]).toBe(0);
    expect(scrolls[0].args[1]).toBe(200);
    expect(scrolls[0].args[2]).toBe(true);
  });
});
