import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { FlatList } from './index';
import {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
} from '../virtualized-list/directives';

const ROOT_TAG = 904;
const fabric = installFabric();

interface IRow {
  id: string;
  n: number;
}

const rows: IRow[] = Array.from({ length: 5 }, (_unused, index) => ({
  id: `r-${index}`,
  n: index,
}));

// Regression coverage for a real bug: FlatList's single-column path used to forward the app's
// <ng-template vListItem> to the inner VirtualizedList via a bare <ng-content></ng-content>
// passthrough. Angular's @ContentChild does NOT resolve a directive across that second projection
// hop (it only sees what was projected directly onto the querying component's own tag), so
// VirtualizedList's itemDir stayed undefined and every cell rendered empty — a real device symptom
// (a blank list) that headless testing never caught because no test existed for this component
// family. Fixed by having FlatList capture its own @ContentChild (a single, direct hop) and
// re-stamp explicit <ng-template>s onto <VirtualizedList>, mirroring VirtualizedSectionList's own
// (already-working) re-stamp pattern. SectionList had the identical bug, fixed the same way.
@Component({
  selector: 'symbiote-flatlist-host',
  standalone: true,
  imports: [
    FlatList,
    VListItemDirective,
    VListHeaderDirective,
    VListFooterDirective,
    VListEmptyDirective,
  ],
  template: `
    <FlatList
      testID="rows-list"
      [data]="rows"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [style]="{ height: 120 }"
    >
      <ng-template vListHeader>
        <symbiote-text testID="header">header</symbiote-text>
      </ng-template>
      <ng-template vListItem let-item>
        <symbiote-text [testID]="'row-' + item.n">{{ 'row ' + item.n }}</symbiote-text>
      </ng-template>
      <ng-template vListFooter>
        <symbiote-text testID="footer">footer</symbiote-text>
      </ng-template>
    </FlatList>
  `,
})
class FlatListHost {
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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('FlatList', () => {
  it('stamps the header, every row, and the footer through the projected templates', async () => {
    mount(ROOT_TAG, FlatListHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const texts = fabric.created
      .filter(node => node.props.testID !== undefined)
      .map(node => node.props.testID);

    expect(texts).toContain('header');
    expect(texts).toContain('footer');
    for (let index = 0; index < rows.length; index += 1) {
      expect(texts).toContain(`row-${index}`);
    }
  });
});
