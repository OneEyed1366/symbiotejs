// Proves the class/style merge in patchProp (renderer.ts): a Vue `class` binding resolves
// through resolveClassName into real style props, and an explicit `:style` always wins over
// a class-derived one regardless of which patchProp call (class vs style) fires last — the
// ordering hazard documented at the styleParts WeakMap declaration.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '../render';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 341;
const VIEW = 'RCTView';

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function committedView(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === VIEW) found = node;
  });
  expect(found, `a ${VIEW} was committed`).toBeDefined();
  if (found === undefined) throw new Error('unreachable: View missing');
  return found;
}

describe('patchProp class/style merge', () => {
  it('resolves a class binding to registered style props', async () => {
    registerStyles({ foo: { color: 'red' } });
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('symbiote-view', { class: 'foo' }),
      }),
    );
    await tick();
    expect(committedView().props.color).toBe('red');
  });

  it('lets an explicit :style win over a class-derived style, regardless of declaration order', async () => {
    registerStyles({ foo: { color: 'red' } });
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('symbiote-view', { class: 'foo', style: { color: 'blue' } }),
      }),
    );
    await tick();
    expect(committedView().props.color).toBe('blue');
  });

  it('leaves an explicit :style unaffected when there is no class', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('symbiote-view', { style: { color: 'blue' } }),
      }),
    );
    await tick();
    expect(committedView().props.color).toBe('blue');
  });

  it('re-resolves and recommits when the class changes reactively', async () => {
    registerStyles({ foo: { color: 'red' }, bar: { color: 'green' } });
    const className = ref('foo');
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('symbiote-view', { class: className.value }),
      }),
    );
    await tick();
    expect(committedView().props.color).toBe('red');

    className.value = 'bar';
    await tick();
    expect(committedView().props.color).toBe('green');
  });
});
