// Co-located React-driven test (ADR 0025): columnWrapperStyle accepts a bare class-name
// string, resolved through the SAME shared style registry as `className`, not the full
// IClassNameValue union — see the widened IFlatListProps type. Proves the resolved style
// lands on the auto-generated flex-row ROW view (numColumns > 1), and that a plain style
// object still works unchanged.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote/engine';
import { FlatList, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 33;
const fabric = installFabric();

interface IRow {
  id: number;
  label: string;
}

const DATA: IRow[] = Array.from({ length: 4 }, (_unused, index) => ({
  id: index,
  label: `row-${index}`,
}));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

function rowsWithFlexDirection(): IFakeNode[] {
  const rows: IFakeNode[] = [];
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName === 'RCTView' && node.props.flexDirection === 'row') rows.push(node);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return rows;
}

describe('React FlatList columnWrapperStyle class-name resolution', () => {
  it('resolves a class-name string onto the row wrapper', () => {
    registerStyles({ rowGap: { columnGap: 4 } });
    mount(
      ROOT_TAG,
      createElement(FlatList<IRow>, {
        data: DATA,
        numColumns: 2,
        columnWrapperStyle: 'rowGap',
        keyExtractor: (item: IRow) => `k-${item.id}`,
        renderItem: ({ item }: { item: IRow }): ReactElement =>
          createElement('symbiote-text', { key: item.id }, item.label),
      }),
    );

    const rows = rowsWithFlexDirection();
    expect(rows.length, 'two flex-row rows for 4 items in 2 columns').toBe(2);
    for (const row of rows) expect(row.props.columnGap).toBe(4);
  });

  it('still accepts a plain style object unchanged', () => {
    mount(
      ROOT_TAG,
      createElement(FlatList<IRow>, {
        data: DATA,
        numColumns: 2,
        columnWrapperStyle: { columnGap: 8 },
        keyExtractor: (item: IRow) => `k-${item.id}`,
        renderItem: ({ item }: { item: IRow }): ReactElement =>
          createElement('symbiote-text', { key: item.id }, item.label),
      }),
    );

    const rows = rowsWithFlexDirection();
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.props.columnGap).toBe(8);
  });
});
