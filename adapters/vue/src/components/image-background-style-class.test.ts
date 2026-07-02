// Regression guard: imageStyle previously accepted ONLY a JS style object/array (isStyleProp
// rejects a bare string). It now also resolves a class-name string through the shared style
// registry, same as the `class` prop fix on the WRAPPER view (see image-background.ts) — and must
// land on the INNER image, never the wrapper, exactly like that prior fix.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, ImageBackground } from '@symbiote/vue';
import { clearGlobalStyles, registerStyles } from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 514;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

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

describe('Vue ImageBackground imageStyle class-name support', () => {
  it('resolves a class-name string onto the inner image, not the wrapper', async () => {
    registerStyles({ tinted: { opacity: 0.5 } });
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h(ImageBackground, { source: { uri: 'x' }, imageStyle: 'tinted' }),
      }),
    );
    await tick();
    expect(committedImage().props.opacity).toBe(0.5);
    expect(committedWrapper().props.opacity).toBeUndefined();
  });

  it('still accepts an ordinary style object unchanged', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(ImageBackground, { source: { uri: 'x' }, imageStyle: { opacity: 0.25 } }),
      }),
    );
    await tick();
    expect(committedImage().props.opacity).toBe(0.25);
  });
});
