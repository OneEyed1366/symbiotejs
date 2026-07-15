import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { SafeAreaView } from './index';

const ROOT_TAG = 910;
const fabric = installFabric();

@Component({
  selector: 'symbiote-safe-area-view-host',
  standalone: true,
  imports: [SafeAreaView],
  template: `
    <SafeAreaView [testID]="'safe-area'" class="screen">
      <symbiote-text>Hello</symbiote-text>
    </SafeAreaView>
  `,
})
class SafeAreaViewHostFixture {}

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('SafeAreaView', () => {
  it('resolves a class= on the SafeAreaView use site onto the real committed view, not the anchor', async () => {
    registerStyles({ screen: { backgroundColor: 'navy' } });

    mount(ROOT_TAG, SafeAreaViewHostFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'safe-area');
    expect(node?.props.backgroundColor).toBe('navy');
  });
});
