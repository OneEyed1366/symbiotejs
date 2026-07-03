// Regression guard: columnWrapperStyle previously accepted ONLY a JS style object/array. It now
// also resolves a class-name string through the shared style registry, merged onto the same
// flex-row wrapper as an object/array value (see index.ts's ngOnChanges). Mirrors the Vue twin
// (column-wrapper-style-class.test.ts) and flat-list.test.ts's row-packing shape.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric, type IFakeNode } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { FlatList } from './index';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 953;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

interface IRow {
  id: string;
  label: string;
}

const rows: IRow[] = Array.from({ length: 4 }, (_unused, index) => ({
  id: `r-${index}`,
  label: `row-${index}`,
}));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function rowsWithFlexDirection(): IFakeNode[] {
  const found: IFakeNode[] = [];
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTView' && node.props.flexDirection === 'row') found.push(node);
  });
  return found;
}

@Component({
  selector: 'symbiote-flatlist-column-style-class-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList
      [data]="rows"
      [numColumns]="2"
      [keyExtractor]="keyExtractor"
      [columnWrapperStyle]="'gap8'"
    >
      <ng-template vListItem let-item>
        <symbiote-text [testID]="item.id">{{ item.label }}</symbiote-text>
      </ng-template>
    </FlatList>
  `,
})
class FlatListColumnStyleClassHost {
  rows = rows;
  keyExtractor = (item: IRow): string => item.id;
}

@Component({
  selector: 'symbiote-flatlist-column-style-object-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList
      [data]="rows"
      [numColumns]="2"
      [keyExtractor]="keyExtractor"
      [columnWrapperStyle]="{ gap: 4 }"
    >
      <ng-template vListItem let-item>
        <symbiote-text [testID]="item.id">{{ item.label }}</symbiote-text>
      </ng-template>
    </FlatList>
  `,
})
class FlatListColumnStyleObjectHost {
  rows = rows;
  keyExtractor = (item: IRow): string => item.id;
}

beforeEach(() => {
  fabric.reset();
  registerStyles({ gap8: { gap: 8 } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('FlatList columnWrapperStyle class-name support', () => {
  it('resolves a class-name string onto the row wrapper alongside flexDirection', async () => {
    mount(ROOT_TAG, FlatListColumnStyleClassHost);
    await tick();
    await tick();

    const found = rowsWithFlexDirection();
    expect(found.length, 'two flex-row rows for 4 items in 2 columns').toBe(2);
    expect(found[0].props.gap).toBe(8);
  });

  it('still accepts an ordinary style object unchanged', async () => {
    mount(ROOT_TAG, FlatListColumnStyleObjectHost);
    await tick();
    await tick();

    const found = rowsWithFlexDirection();
    expect(found[0].props.gap).toBe(4);
  });
});
