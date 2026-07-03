// Regression test for the anchor/class bug (angular-adapter skill): VirtualizedSectionList is its
// own ANCHOR_HOST_COMPONENTS entry — a class= on <VirtualizedSectionList> resolves onto its OWN
// anchor and needs its OWN anchorHostStyle merge (see index.ts's resolvedStyle getter), it is NOT
// transitively fixed by VirtualizedList's/ScrollView's own fixes further down. Mirrors
// pressable.test.ts's "resolves a class=" case.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';
import type { ISection } from '@symbiotejs/components';

import { mount, unmount } from '../../render';
import { VirtualizedSectionList, VSectionItemDirective } from './index';

const ROOT_TAG = 954;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

interface IRow {
  id: string;
}

const sections: ISection<IRow>[] = [{ title: 'A', data: [{ id: 'a1' }, { id: 'a2' }] }];

@Component({
  selector: 'symbiote-virtualized-section-list-class-host',
  standalone: true,
  imports: [VirtualizedSectionList, VSectionItemDirective],
  template: `
    <VirtualizedSectionList class="card" [sections]="sections">
      <ng-template vSectionItem let-item>
        <symbiote-text [testID]="item.id">{{ item.id }}</symbiote-text>
      </ng-template>
    </VirtualizedSectionList>
  `,
})
class VirtualizedSectionListClassHost {
  sections = sections;
}

beforeEach(() => {
  fabric.reset();
  registerStyles({ card: { backgroundColor: 'red' } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('VirtualizedSectionList anchor class= resolution', () => {
  it('resolves a class= on the VirtualizedSectionList use site onto the real committed scroll host', async () => {
    mount(ROOT_TAG, VirtualizedSectionListClassHost);
    await tick();
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a real Fabric node carries the class-derived style').toBeDefined();
  });
});
