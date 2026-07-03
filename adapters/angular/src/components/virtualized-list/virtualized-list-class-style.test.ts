// Regression test for the anchor/class bug (angular-adapter skill): VirtualizedList is its own
// ANCHOR_HOST_COMPONENTS entry — a class= on <VirtualizedList> resolves onto VirtualizedList's OWN
// anchor and needs its OWN anchorHostStyle merge (see index.ts's recomputeView), it is NOT
// transitively fixed by ScrollView's own fix one level down. Mirrors pressable.test.ts's
// "resolves a class=" case.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { VirtualizedList } from './index';
import { VListItemDirective } from './directives';

const ROOT_TAG = 952;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

interface IRow {
  id: string;
}

const rows: IRow[] = [{ id: 'a' }, { id: 'b' }];

@Component({
  selector: 'symbiote-virtualized-list-class-host',
  standalone: true,
  imports: [VirtualizedList, VListItemDirective],
  template: `
    <VirtualizedList
      class="card"
      [data]="rows"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
      [getItemLayout]="getItemLayout"
    >
      <ng-template vListItem let-item>
        <symbiote-text [testID]="item.id">{{ item.id }}</symbiote-text>
      </ng-template>
    </VirtualizedList>
  `,
})
class VirtualizedListClassHost {
  rows = rows;
  getItem = (data: readonly IRow[], index: number): IRow => data[index];
  getItemCount = (data: readonly IRow[]): number => data.length;
  getItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: 30,
    offset: 30 * index,
    index,
  });
}

beforeEach(() => {
  fabric.reset();
  registerStyles({ card: { backgroundColor: 'red' } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('VirtualizedList anchor class= resolution', () => {
  it('resolves a class= on the VirtualizedList use site onto the real committed scroll host', async () => {
    mount(ROOT_TAG, VirtualizedListClassHost);
    await tick();
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a real Fabric node carries the class-derived style').toBeDefined();
  });
});
