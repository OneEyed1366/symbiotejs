// Regression test for the anchor/class bug (angular-adapter skill): FlatList is its own
// ANCHOR_HOST_COMPONENTS entry, separate from the VirtualizedList/ScrollView anchors it wraps two
// levels down — a class= on <FlatList> resolves onto FlatList's OWN anchor and needs its OWN
// anchorHostStyle merge (see index.ts's ngOnChanges), it is NOT transitively fixed by
// VirtualizedList's or ScrollView's own fixes. Mirrors pressable.test.ts's "resolves a class=" case.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { FlatList } from './index';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 951;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

interface IRow {
  id: string;
}

const rows: IRow[] = [{ id: 'a' }, { id: 'b' }];

@Component({
  selector: 'symbiote-flatlist-class-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList
      class="card"
      [data]="rows"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
    >
      <ng-template vListItem let-item>
        <symbiote-text [testID]="item.id">{{ item.id }}</symbiote-text>
      </ng-template>
    </FlatList>
  `,
})
class FlatListClassHost {
  rows = rows;
  keyExtractor = (item: IRow): string => item.id;
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

describe('FlatList anchor class= resolution', () => {
  it('resolves a class= on the FlatList use site onto the real committed scroll host', async () => {
    mount(ROOT_TAG, FlatListClassHost);
    await tick();
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a real Fabric node carries the class-derived style').toBeDefined();
  });
});
