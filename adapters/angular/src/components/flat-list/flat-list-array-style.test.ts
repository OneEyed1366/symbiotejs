import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiotejs/test-utils';
import { flattenStyle } from '@symbiotejs/engine';

import { mount, unmount } from '../../render';
import { FlatList } from './index';
import { VListItemDirective } from '../virtualized-list/directives';

const ROOT_TAG = 905;
const fabric = installFabric();

interface IChip {
  id: string;
  n: number;
}

const chips: IChip[] = Array.from({ length: 24 }, (_unused, index) => ({
  id: `c-${index}`,
  n: index,
}));

// Regression coverage for a real device bug: Angular compiles a literal `[style]="…"` binding to
// the built-in ɵɵstyleMap instruction (NOT a regular @Input() property write), regardless of the
// target's declared type — it only understands a flat style object, never an array. RN's own
// `style={[base, override]}` composition idiom (used by examples/angular/App.ts's "FlatList · 24
// chips" demo for the per-item computed backgroundColor) crashed deep inside Angular's own styling
// engine (`prop.indexOf is not a function`), and the crash landed inside a zoneless
// SymbioteChangeDetectionScheduler tick with no catch around it — so the retry kept re-firing
// forever (RAM climbing, constant re-render log spam on device) while the item never painted its
// style. Fixed by flattening any array-composed style with the engine's own `flattenStyle` before
// it reaches a `[style]=` binding — required of app authors (see App.ts) AND of every adapter
// component that forwards its own `style` @Input() onward (see the `resolvedStyle` getters/fields
// in virtualized-list, section-list, virtualized-section-list — flat-list's own `rowStyle` had the
// identical landmine, always assigning an array). See the angular-adapter skill for the full story.
@Component({
  selector: 'symbiote-chip-list-host',
  standalone: true,
  imports: [FlatList, VListItemDirective],
  template: `
    <FlatList
      testID="chips-list"
      [data]="chips"
      [horizontal]="true"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [style]="{ height: 84 }"
    >
      <ng-template vListItem let-item>
        <symbiote-view
          [testID]="'chip-' + item.n"
          [style]="flattenStyle([{ height: 72, width: 64 }, { backgroundColor: chipColor(item) }])"
        >
          <symbiote-text>{{ item.n }}</symbiote-text>
        </symbiote-view>
      </ng-template>
    </FlatList>
  `,
})
class ChipListHost {
  chips = chips;
  flattenStyle = flattenStyle;
  keyExtractor = (item: IChip): string => item.id;
  getItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: 64,
    offset: 64 * index,
    index,
  });
  chipColor(item: IChip): string {
    return `hsl(${(item.n * 47) % 360}, 70%, 50%)`;
  }
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findCommitted(
  nodes: typeof fabric.committed,
  predicate: (n: (typeof nodes)[number]) => boolean,
): (typeof nodes)[number] | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const found = findCommitted(node.children, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe('FlatList array-composed item style', () => {
  it('flattens to a plain object instead of crashing ɵɵstyleMap, and commits it', async () => {
    mount(ROOT_TAG, ChipListHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const chip0 = findCommitted(fabric.committed, node => node.props.testID === 'chip-0');
    expect(chip0?.props).toMatchObject({
      height: 72,
      width: 64,
      backgroundColor: 'hsl(0, 70%, 50%)',
    });
  });

  it('does not free-run change detection once the window settles', async () => {
    mount(ROOT_TAG, ChipListHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const scroll = fabric.find(node => node.viewName === 'RCTScrollView');
    if (scroll !== undefined) {
      fabric.fireEvent(scroll.instanceHandle, 'topLayout', {
        layout: { x: 0, y: 0, width: 360, height: 84 },
      });
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    let previous = fabric.counts.completeRoot;
    let stillGrowing = false;
    for (let tick = 0; tick < 10; tick += 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const current = fabric.counts.completeRoot;
      if (current > previous) stillGrowing = true;
      previous = current;
    }
    expect(stillGrowing).toBe(false);
  });
});
