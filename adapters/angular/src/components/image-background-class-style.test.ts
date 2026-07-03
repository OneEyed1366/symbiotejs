// Regression test for the anchor/class bug (angular-adapter skill): ImageBackground is its own
// ANCHOR_HOST_COMPONENTS entry, separate from the Image it composes internally — a class= on
// <ImageBackground> resolves onto ImageBackground's OWN anchor and needs its OWN anchorHostStyle
// merge onto its wrapper View (see image-background.ts's wrapperStyle getter), NOT onto its
// `imageStyle` (a separate, deliberately untouched prop — see the file's header comment).
// Mirrors pressable.test.ts's "resolves a class=" case.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../render';
import { ImageBackground } from './image-background';

const ROOT_TAG = 916;
const fabric = installFabric();

@Component({
  selector: 'symbiote-image-background-class-host',
  standalone: true,
  imports: [ImageBackground],
  template: `
    <ImageBackground class="card" [source]="{ uri: 'https://example.com/a.png' }">
      <symbiote-text>on top</symbiote-text>
    </ImageBackground>
  `,
})
class ImageBackgroundClassHost {}

beforeEach(() => {
  fabric.reset();
  registerStyles({ card: { backgroundColor: 'red' } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('ImageBackground anchor class= resolution', () => {
  it('resolves a class= on the ImageBackground use site onto the real committed wrapper View', async () => {
    mount(ROOT_TAG, ImageBackgroundClassHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a real Fabric node carries the class-derived style').toBeDefined();
  });
});
