// Regression test for the anchor/class bug (angular-adapter skill): Image is its own
// ANCHOR_HOST_COMPONENTS entry — a class= on <Image> resolves onto Image's OWN anchor and needs
// its OWN anchorHostStyle merge (see index.ios.ts/index.android.ts's imageProps override), not
// transitively fixed by anything else. Mirrors pressable.test.ts's "resolves a class=" case.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { Image } from './index';

const ROOT_TAG = 915;
const fabric = installFabric();

@Component({
  selector: 'symbiote-image-class-host',
  standalone: true,
  imports: [Image],
  template: `<Image
    [testID]="'photo'"
    class="card"
    [source]="{ uri: 'https://example.com/a.png' }"
  />`,
})
class ImageClassHost {}

beforeEach(() => {
  fabric.reset();
  registerStyles({ card: { backgroundColor: 'red' } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('Image anchor class= resolution', () => {
  it('resolves a class= on the Image use site onto the real committed view, not the anchor', async () => {
    mount(ROOT_TAG, ImageClassHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'photo');
    expect(node?.props.backgroundColor).toBe('red');
  });
});
