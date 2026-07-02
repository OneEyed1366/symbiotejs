// Regression guard: columnWrapperStyle previously accepted ONLY a JS style object/array
// (isRecord/Array.isArray). It now also resolves a class-name string through the shared style
// registry, merged onto the same flex-row wrapper as an object/array value (see index.ts's
// rowStyle). Mirrors the flat-list.test.ts numColumns row-packing shape.

import { defineComponent, h, type FunctionalComponent } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote/vue';
import { clearGlobalStyles, registerStyles } from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

// Generic-component limitation (see flat-list.test.ts): drive FlatList through a loose functional
// handle rather than the typed construct signature h() can't resolve imperatively.
const FlatListHost = FlatList as unknown as FunctionalComponent<Record<string, unknown>>;

const ROOT_TAG = 515;

type IRow = { id: number; label: string };

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function rowsWithFlexDirection(): IFakeNode[] {
  const rows: IFakeNode[] = [];
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTView' && node.props.flexDirection === 'row') rows.push(node);
  });
  return rows;
}

describe('Vue FlatList columnWrapperStyle class-name support', () => {
  it('resolves a class-name string onto the row wrapper alongside flexDirection', async () => {
    registerStyles({ gap8: { gap: 8 } });
    const data: IRow[] = Array.from({ length: 4 }, (_unused, index) => ({
      id: index,
      label: `row-${index}`,
    }));
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            FlatListHost,
            { data, numColumns: 2, columnWrapperStyle: 'gap8' },
            { item: ({ item }: { item: IRow }) => [h('symbiote-text', {}, item.label)] },
          ),
      }),
    );
    await tick();

    const rows = rowsWithFlexDirection();
    expect(rows.length, 'two flex-row rows for 4 items in 2 columns').toBe(2);
    expect(rows[0].props.gap).toBe(8);
  });

  it('still accepts an ordinary style object unchanged', async () => {
    const data: IRow[] = Array.from({ length: 4 }, (_unused, index) => ({
      id: index,
      label: `row-${index}`,
    }));
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            FlatListHost,
            { data, numColumns: 2, columnWrapperStyle: { gap: 4 } },
            { item: ({ item }: { item: IRow }) => [h('symbiote-text', {}, item.label)] },
          ),
      }),
    );
    await tick();

    const rows = rowsWithFlexDirection();
    expect(rows[0].props.gap).toBe(4);
  });
});
