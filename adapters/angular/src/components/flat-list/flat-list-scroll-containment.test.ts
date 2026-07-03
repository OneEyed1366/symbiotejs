import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { FlatList } from './index';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 907;
const fabric = installFabric();

interface IChip {
  id: string;
  n: number;
}

const chips: IChip[] = Array.from({ length: 24 }, (_unused, index) => ({
  id: `c-${index}`,
  n: index,
}));

// Mirrors examples/angular/App.ts's "FlatList · 24 chips" demo end to end: a horizontal FlatList
// with getItemLayout. Regression coverage for a bug fixed 2026-07 (see angular-adapter skill §18):
// cell content used to land OUTSIDE the ScrollView's content view entirely — as top-level siblings
// of the committed RCTScrollView node, instead of children of its RCTScrollContentView — which is
// why the device screenshot showed full-width vertically-stacked chips instead of a small
// horizontal row. Root cause was `<ng-content>` declared once per `@if`/`@else` branch in
// scroll-view/index.ios.ts (a documented Angular limitation, angular/angular#53310); fixed by
// collapsing to a single unconditional host tag since iOS never needed axis-specific tags to begin
// with (`horizontal` already flows as a plain prop). This test pins the CORRECT tree shape.
@Component({
  selector: 'symbiote-chip-container-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList
      testID="chips-list"
      [data]="chips"
      [horizontal]="true"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [style]="chipListStyle"
    >
      <ng-template vListItem let-item>
        <symbiote-view [testID]="'chip-' + item.n" [style]="chipCardStyle">
          <symbiote-text>{{ item.n }}</symbiote-text>
        </symbiote-view>
      </ng-template>
    </FlatList>
  `,
})
class ChipContainerHost {
  chips = chips;
  chipListStyle = { height: 84 };
  chipCardStyle = { width: 72, height: 64, borderRadius: 14 };
  keyExtractor = (item: IChip): string => item.id;
  getItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: 64,
    offset: 64 * index,
    index,
  });
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findWithin(
  root: (typeof fabric.committed)[number],
  predicate: (n: (typeof fabric.committed)[number]) => boolean,
): (typeof fabric.committed)[number] | undefined {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = findWithin(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findTop(
  nodes: typeof fabric.committed,
  predicate: (n: (typeof nodes)[number]) => boolean,
): (typeof nodes)[number] | undefined {
  for (const node of nodes) {
    const found = findWithin(node, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe('FlatList cells stay inside the ScrollView content view', () => {
  it('nests chip cells under RCTScrollContentView, not as siblings of RCTScrollView', async () => {
    mount(ROOT_TAG, ChipContainerHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const scroll = findTop(fabric.committed, node => node.viewName === 'RCTScrollView');
    expect(scroll).toBeDefined();
    if (scroll === undefined) return;

    const chip0InsideScroll = findWithin(scroll, node => node.props.testID === 'chip-0');
    expect(chip0InsideScroll).toBeDefined();
  });
});
