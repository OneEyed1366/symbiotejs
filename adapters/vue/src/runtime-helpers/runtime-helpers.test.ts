// Proves the v-show shim: the compiled `v-show` directive
// resolves to a real implementation (not the DOM-only @vue/runtime-dom one), toggles the
// committed node's style.display without clobbering other declarative style props, and survives
// the async-commit race on the very first mount — Vue's `mounted` hook fires synchronously
// during the patch pass, but this renderer coalesces the actual Fabric commit onto a microtask
// (surface.requestCommit()), so a bare setNativeProps call here would silently no-op on mount
// without the whenCommitted guard. The directive's effect is always
// a targeted follow-up clone on top of the render's own commit (setNativeProps re-commits, it
// doesn't mutate in place), so assertions read the LATEST committed tree (`fabric.committed`),
// not the original `createNode`'d node (`fabric.find`), which never reflects a later clone.

import { defineComponent, h, ref, shallowRef, withDirectives } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import { Teleport, vShow } from './index';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

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

// Proves our Teleport wrapper: content moves under an already-
// mounted host node OUTSIDE its own template position (same surface), and the guard rejects a
// target that isn't a real host node instead of silently corrupting the retained tree.
function findByTestId(testId: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.props.testID === testId) found = node;
  });
  return found;
}

function isDescendantOf(root: IFakeNode, target: IFakeNode): boolean {
  if (root === target) return true;
  return root.children.some(child => isDescendantOf(child, target));
}

function mountTeleportApp(): void {
  const overlayRef = shallowRef<ISymbioteNode | null>(null);
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h('symbiote-view', {}, [
          h('symbiote-view', { ref: overlayRef, testID: 'overlay-host' }),
          h('symbiote-view', { testID: 'source' }, [
            overlayRef.value
              ? h(Teleport, { to: overlayRef.value }, () =>
                  h('symbiote-view', { testID: 'ported' }),
                )
              : null,
          ]),
        ]),
    }),
  );
}

describe('Teleport runtime-helpers shim', () => {
  it('renders content under the target node, not its own template position', async () => {
    mountTeleportApp();
    await tick();

    const overlayHost = findByTestId('overlay-host');
    const source = findByTestId('source');
    const ported = findByTestId('ported');
    expect(overlayHost, 'overlay host was committed').toBeDefined();
    expect(source, 'source was committed').toBeDefined();
    expect(ported, 'ported node was committed').toBeDefined();
    if (overlayHost === undefined || source === undefined || ported === undefined) {
      throw new Error('unreachable');
    }

    expect(isDescendantOf(overlayHost, ported), 'ported node landed under the overlay host').toBe(
      true,
    );
    expect(
      isDescendantOf(source, ported),
      'ported node did NOT stay under its own template parent',
    ).toBe(false);
  });

  it('throws for a CSS-selector string target instead of silently no-oping', () => {
    expect(() =>
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () => h(Teleport, { to: 'body' }, () => h('symbiote-view')),
        }),
      ),
    ).toThrow(/CSS-selector string/);
  });

  it('rejects a target that is not a real host node', () => {
    // JSON.parse returns an untyped value, the honest way to hand Teleport something its own
    // `to: null` (no-typecheck) prop would normally accept but our runtime guard must still reject.
    const garbage = JSON.parse('{}');
    expect(isSymbioteNode(garbage)).toBe(false);
    expect(() =>
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () => h(Teleport, { to: garbage }, () => h('symbiote-view')),
        }),
      ),
    ).toThrow(/not a real host node/);
  });
});
