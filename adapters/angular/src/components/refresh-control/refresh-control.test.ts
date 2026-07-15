import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { RefreshControl } from './index';

const ROOT_TAG = 914;
const fabric = installFabric();

@Component({
  selector: 'symbiote-refresh-control-host',
  standalone: true,
  imports: [RefreshControl],
  template: `
    <RefreshControl [refreshing]="false" [testID]="'refresh'" class="spinner"></RefreshControl>
  `,
})
class RefreshControlHostFixture {}

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('RefreshControl', () => {
  it('resolves a class= on the RefreshControl use site onto the real committed view, not the anchor', async () => {
    registerStyles({ spinner: { backgroundColor: 'green' } });

    mount(ROOT_TAG, RefreshControlHostFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'refresh');
    expect(node?.props.backgroundColor).toBe('green');
  });
});
