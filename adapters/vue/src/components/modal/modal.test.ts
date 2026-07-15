// Co-located Vue-driven pipeline test, the Vue twin of
// adapters/react/src/components/modal/modal.test.tsx. Proves the SAME shared contract
// (renderModal/modalReducer/shouldRenderModal from @symbiote-native/components) through Vue's own
// lifecycle: a visible modal commits ModalHostView(RCTView(RCTView)) with children nested under
// the container (one childSet, not a second root); a hidden modal commits no modal node; the
// direct events round-trip back to Vue emits; and the RN-faithful style precedence (transparent
// override, backdropColor, presentationStyle default) matches React's twin exactly, since both
// adapters render through the same `renderModal` call.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Modal, mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 421;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function modalNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'ModalHostView');
  expect(node, 'a ModalHostView was created').toBeDefined();
  if (node === undefined) throw new Error('unreachable: ModalHostView missing');
  return node;
}

function containerNode(): IFakeNode {
  const child = modalNode().children[0];
  if (child === undefined) throw new Error('ModalHostView has no container child');
  return child;
}

describe('Vue Modal on the engine', () => {
  it('commits a visible modal as ModalHostView(RCTView(RCTView)) with default host props', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h(Modal, { visible: true }, () => h('symbiote-view')),
      }),
    );
    await tick();

    expect(fabric.serialize(fabric.appRoot().children)).toBe('ModalHostView(RCTView(RCTView))');

    const host = modalNode();
    expect(host.props.visible).toBe(true);
    expect(host.props.animationType).toBe('none');
    expect(host.props.position).toBe('absolute');
    expect(host.props.presentationStyle).toBe('fullScreen');
    expect(containerNode().props.backgroundColor).toBe('white');
  });

  it('commits no modal node when visible is false', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h(Modal, { visible: false }, () => h('symbiote-view')),
      }),
    );
    await tick();
    // Unlike React (whose host config commits an empty AppContainer unconditionally every
    // commit), Vue's renderer only calls surface.requestCommit() from an actual nodeOp — a
    // root that renders nothing produces no nodeOp at all, so nothing commits yet. That's
    // fine: the mirror has no entry for the root container, so the NEXT real insert (when the
    // modal becomes visible) still does a full first-mount commit, AppContainer included.
    expect(fabric.committed.length).toBe(0);
    expect(fabric.find(n => n.viewName === 'ModalHostView')).toBeUndefined();
  });

  it('routes topRequestClose to the requestClose emit', async () => {
    let closed = false;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Modal, { visible: true, onRequestClose: () => (closed = true) }, () =>
            h('symbiote-view'),
          ),
      }),
    );
    await tick();
    fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
    expect(closed).toBe(true);
  });

  it('routes topShow to the show emit', async () => {
    let shown = false;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Modal, { visible: true, onShow: () => (shown = true) }, () => h('symbiote-view')),
      }),
    );
    await tick();
    fabric.fireEvent(modalNode().instanceHandle, 'topShow', {});
    expect(shown).toBe(true);
  });

  it('lets the transparent override win over a user style and flips the presentation default', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Modal, { visible: true, transparent: true, style: { backgroundColor: 'red' } }, () =>
            h('symbiote-view'),
          ),
      }),
    );
    await tick();
    expect(containerNode().props.backgroundColor).toBe('transparent');
    expect(modalNode().props.presentationStyle).toBe('overFullScreen');
  });

  it('sets the container background from backdropColor on a non-transparent modal', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Modal, { visible: true, backdropColor: 'rebeccapurple' }, () => h('symbiote-view')),
      }),
    );
    await tick();
    expect(containerNode().props.backgroundColor).toBe('rebeccapurple');
  });

  it('forwards platform props as NAMED host props', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            Modal,
            {
              visible: true,
              supportedOrientations: ['portrait', 'landscape'],
              hardwareAccelerated: true,
              statusBarTranslucent: true,
              navigationBarTranslucent: true,
              allowSwipeDismissal: true,
            },
            () => h('symbiote-view'),
          ),
      }),
    );
    await tick();
    const props = modalNode().props;
    expect(props.supportedOrientations).toEqual(['portrait', 'landscape']);
    expect(props.hardwareAccelerated).toBe(true);
    expect(props.statusBarTranslucent).toBe(true);
    expect(props.navigationBarTranslucent).toBe(true);
    expect(props.allowSwipeDismissal).toBe(true);
  });

  it('fires the dismiss emit only on the native topDismiss event, not on the hide transition', async () => {
    let dismissCount = 0;
    const visible = ref(true);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            Modal,
            {
              visible: visible.value,
              onRequestClose: () => (visible.value = false),
              onDismiss: () => (dismissCount += 1),
            },
            () => h('symbiote-view'),
          ),
      }),
    );
    await tick();
    expect(dismissCount).toBe(0);

    // Drive the native close: topRequestClose -> visible flips false. The keep-alive holds the
    // node mounted, but NO dismiss emit fires from JS on this transition alone.
    fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
    await tick();
    expect(dismissCount).toBe(0);

    // The native exit animation completes -> Fabric emits topDismiss on the still-mounted host
    // node -> dismiss fires exactly once.
    fabric.fireEvent(modalNode().instanceHandle, 'topDismiss', {});
    await tick();
    expect(dismissCount).toBe(1);
  });
});
