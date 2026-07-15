import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Modal } from './index';

const ROOT_TAG = 912;
const fabric = installFabric();

@Component({
  selector: 'symbiote-modal-host',
  standalone: true,
  imports: [Modal],
  template: `
    <Modal [visible]="true" [testID]="'modal'" class="sheet">
      <symbiote-text>Hello</symbiote-text>
    </Modal>
  `,
})
class ModalHostFixture {}

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('Modal', () => {
  it('resolves a class= on the Modal use site onto the real committed view, not the anchor', async () => {
    registerStyles({ sheet: { backgroundColor: 'purple' } });

    mount(ROOT_TAG, ModalHostFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'modal');
    expect(node?.props.backgroundColor).toBe('purple');
  });
});
