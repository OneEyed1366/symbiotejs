// Proves the v-show shim (vue-adapter-directives skill): the compiled `v-show` directive
// resolves to a real implementation (not the DOM-only @vue/runtime-dom one), toggles the
// committed node's style.display without clobbering other declarative style props, and survives
// the async-commit race on the very first mount — Vue's `mounted` hook fires synchronously
// during the patch pass, but this renderer coalesces the actual Fabric commit onto a microtask
// (surface.requestCommit()), so a bare setNativeProps call here would silently no-op on mount
// without the whenCommitted guard (see vue-adapter-reactivity). The directive's effect is always
// a targeted follow-up clone on top of the render's own commit (setNativeProps re-commits, it
// doesn't mutate in place), so assertions read the LATEST committed tree (`fabric.committed`),
// not the original `createNode`'d node (`fabric.find`), which never reflects a later clone.

import { defineComponent, h, ref, withDirectives } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote/vue';
import { vShow } from './runtime-helpers';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 340;
const VIEW = 'RCTView';
const PADDING = 4;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
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

function mountShowable(visible: boolean): void {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        withDirectives(h('symbiote-view', { style: { padding: PADDING } }), [[vShow, visible]]),
    }),
  );
}

describe('vShow runtime-helpers shim', () => {
  it('applies display:none on the very first mount despite the async-commit race', async () => {
    mountShowable(false);
    await tick();
    const node = committedView();
    expect(node.props.display).toBe('none');
    expect(node.props.padding, 'other style props survive').toBe(PADDING);
  });

  it('leaves display unset when mounted visible', async () => {
    mountShowable(true);
    await tick();
    expect(committedView().props.display).not.toBe('none');
  });

  it('toggles display back and forth without clobbering other style props', async () => {
    const visible = ref(true);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          withDirectives(h('symbiote-view', { style: { padding: PADDING } }), [
            [vShow, visible.value],
          ]),
      }),
    );
    await tick();
    expect(committedView().props.display).not.toBe('none');

    visible.value = false;
    await tick();
    let node = committedView();
    expect(node.props.display).toBe('none');
    expect(node.props.padding).toBe(PADDING);

    visible.value = true;
    await tick();
    node = committedView();
    expect(node.props.display).not.toBe('none');
    expect(node.props.padding).toBe(PADDING);
  });
});
