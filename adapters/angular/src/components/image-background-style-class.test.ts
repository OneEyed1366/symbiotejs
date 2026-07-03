// Regression guard: imageStyle previously accepted ONLY a JS style object/array. It now also
// resolves a class-name string through the shared style registry, same as the `class` prop fix on
// the WRAPPER view (see image-background-class-style.test.ts) — and must land on the INNER image,
// never the wrapper, exactly like that prior fix. Mirrors the Vue twin
// (image-background-style-class.test.ts).
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric, type IFakeNode } from '@symbiotejs/test-utils';

import { mount, unmount } from '../render';
import { ImageBackground } from './image-background';

const ROOT_TAG = 917;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function committedImage(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTImageView');
  expect(node, 'the inner image was committed').toBeDefined();
  if (node === undefined) throw new Error('unreachable: image missing');
  return node;
}

function committedWrapper(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTView');
  expect(node, 'the wrapper view was committed').toBeDefined();
  if (node === undefined) throw new Error('unreachable: wrapper missing');
  return node;
}

@Component({
  selector: 'symbiote-image-background-style-class-host',
  standalone: true,
  imports: [ImageBackground],
  template: `<ImageBackground
    [source]="{ uri: 'https://example.com/a.png' }"
    [imageStyle]="'tinted'"
  />`,
})
class ImageBackgroundStyleClassHost {}

@Component({
  selector: 'symbiote-image-background-style-object-host',
  standalone: true,
  imports: [ImageBackground],
  template: `<ImageBackground
    [source]="{ uri: 'https://example.com/a.png' }"
    [imageStyle]="{ opacity: 0.25 }"
  />`,
})
class ImageBackgroundStyleObjectHost {}

beforeEach(() => {
  fabric.reset();
  registerStyles({ tinted: { opacity: 0.5 } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('ImageBackground imageStyle class-name support', () => {
  it('resolves a class-name string onto the inner image, not the wrapper', async () => {
    mount(ROOT_TAG, ImageBackgroundStyleClassHost);
    await tick();

    expect(committedImage().props.opacity).toBe(0.5);
    expect(committedWrapper().props.opacity).toBeUndefined();
  });

  it('still accepts an ordinary style object unchanged', async () => {
    mount(ROOT_TAG, ImageBackgroundStyleObjectHost);
    await tick();

    expect(committedImage().props.opacity).toBe(0.25);
  });
});
