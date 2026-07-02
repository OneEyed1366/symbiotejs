// Regression guard: contentContainerStyle previously accepted ONLY a JS style object/array
// (isStyleProp rejects a bare string), so a class-name string was silently dropped. It now
// resolves through the shared style registry, same as `class`/`style` (see shared.ts). Mirrors
// scroll-view-android-class.test.ts's style-for-this-exact-scenario shape.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, ScrollView } from '@symbiote/vue';
import { clearGlobalStyles, registerStyles } from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 513;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function committedContentView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollContentView');
  expect(node, 'the scroll content view was committed').toBeDefined();
  if (node === undefined) throw new Error('unreachable: content view missing');
  return node;
}

describe('Vue ScrollView contentContainerStyle class-name support', () => {
  it('resolves a class-name string onto the content view, not the outer scroll view', async () => {
    registerStyles({ padded: { padding: 20 } });
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            ScrollView,
            { contentContainerStyle: 'padded' },
            { default: () => [h('symbiote-text')] },
          ),
      }),
    );
    await tick();
    expect(committedContentView().props.padding).toBe(20);
    const scrollView = fabric.find(n => n.viewName === 'RCTScrollView');
    expect(scrollView?.props.padding).toBeUndefined();
  });

  it('still accepts an ordinary style object unchanged', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            ScrollView,
            { contentContainerStyle: { padding: 12 } },
            { default: () => [h('symbiote-text')] },
          ),
      }),
    );
    await tick();
    expect(committedContentView().props.padding).toBe(12);
  });
});
