// Regression test for the anchor/class bug (angular-adapter skill): ActivityIndicator is its own
// ANCHOR_HOST_COMPONENTS entry AND renders through DescriptorOutlet (`symbiote-descriptor-outlet`,
// itself also an anchor entry) — a class= on <ActivityIndicator> resolves onto ActivityIndicator's
// OWN anchor, two levels up from the real committed wrapper View the descriptor builds, and needs
// its OWN anchorHostStyle merge (see shared.ts's `descriptor` getter). Mirrors pressable.test.ts's
// "resolves a class=" case.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { ActivityIndicator } from './index';

const ROOT_TAG = 909;
const fabric = installFabric();

@Component({
  selector: 'symbiote-activity-indicator-class-host',
  standalone: true,
  imports: [ActivityIndicator],
  template: `<ActivityIndicator class="card" />`,
})
class ActivityIndicatorClassHost {}

beforeEach(() => {
  fabric.reset();
  registerStyles({ card: { backgroundColor: 'red' } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('ActivityIndicator anchor class= resolution', () => {
  it('resolves a class= on the ActivityIndicator use site onto the real committed wrapper View', async () => {
    mount(ROOT_TAG, ActivityIndicatorClassHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a real Fabric node carries the class-derived style').toBeDefined();
  });
});
