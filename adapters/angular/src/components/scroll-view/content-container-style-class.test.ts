// Regression guard: contentContainerStyle previously accepted ONLY a JS style object/array. It
// now also resolves a class-name string through the shared style registry, same as `class`/
// `style` (see shared.ts's resolvedContentContainerStyle getter). Mirrors the Vue twin
// (content-container-style-class.test.ts) and scroll-view-class-style.test.ts's style-for-this-
// exact-scenario shape.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric, type IFakeNode } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { ScrollView } from './index.ios';

const ROOT_TAG = 952;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function committedContentView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollContentView');
  expect(node, 'the scroll content view was committed').toBeDefined();
  if (node === undefined) throw new Error('unreachable: content view missing');
  return node;
}

@Component({
  selector: 'symbiote-scroll-content-style-class-host',
  standalone: true,
  imports: [ScrollView],
  template: `
    <ScrollView [contentContainerStyle]="'padded'">
      <symbiote-text>content</symbiote-text>
    </ScrollView>
  `,
})
class ScrollViewContentStyleClassHost {}

@Component({
  selector: 'symbiote-scroll-content-style-object-host',
  standalone: true,
  imports: [ScrollView],
  template: `
    <ScrollView [contentContainerStyle]="{ padding: 12 }">
      <symbiote-text>content</symbiote-text>
    </ScrollView>
  `,
})
class ScrollViewContentStyleObjectHost {}

beforeEach(() => {
  fabric.reset();
  registerStyles({ padded: { padding: 20 } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('ScrollView contentContainerStyle class-name support', () => {
  it('resolves a class-name string onto the content view, not the outer scroll view', async () => {
    mount(ROOT_TAG, ScrollViewContentStyleClassHost);
    await tick();

    expect(committedContentView().props.padding).toBe(20);
    const scrollHost = fabric.find(n => n.viewName === 'RCTScrollView');
    expect(scrollHost?.props.padding).toBeUndefined();
  });

  it('still accepts an ordinary style object unchanged', async () => {
    mount(ROOT_TAG, ScrollViewContentStyleObjectHost);
    await tick();

    expect(committedContentView().props.padding).toBe(12);
  });
});
