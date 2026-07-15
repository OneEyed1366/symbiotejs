import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { InputAccessoryView } from './index';

const ROOT_TAG = 913;
const fabric = installFabric();

@Component({
  selector: 'symbiote-iav-host',
  standalone: true,
  imports: [InputAccessoryView],
  template: `
    <InputAccessoryView [testID]="'iav'" class="toolbar">
      <symbiote-text>Hello</symbiote-text>
    </InputAccessoryView>
  `,
})
class InputAccessoryViewHostFixture {}

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('InputAccessoryView', () => {
  it('resolves a class= on the InputAccessoryView use site onto the real committed view, not the anchor', async () => {
    registerStyles({ toolbar: { backgroundColor: 'orange' } });

    mount(ROOT_TAG, InputAccessoryViewHostFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'iav');
    expect(node?.props.backgroundColor).toBe('orange');
  });
});
