// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `modal.smoke`. Proves the Modal primitive: a visible modal commits a ModalHostView
// with its children nested under it (one childSet, not a second root); a hidden modal
// commits no modal node (the visible gate); the direct events round-trip back to JS;
// and the RN-faithful style/lifecycle behavior: backdrop-wins precedence, the
// transparent-aware presentationStyle default, backdropColor, the position:absolute host
// style, named platform-prop forwarding, and onDismiss as the native topDismiss event.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, Modal, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 220;

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function modalNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'ModalHostView');
  if (!node) throw new Error('no ModalHostView was created');
  return node;
}

// The container View RN wraps children in is the one View directly under the host.
function containerNode(): IFakeNode {
  const child = modalNode().children[0];
  if (!child) throw new Error('ModalHostView has no container child');
  return child;
}

describe('React Modal on the engine', () => {
  it('commits a visible modal as ModalHostView(RCTView(RCTView)) with default host props', () => {
    mount(
      ROOT_TAG,
      <Modal visible>
        <View />
      </Modal>,
    );

    expect(fabric.serialize(fabric.appRoot().children)).toBe('ModalHostView(RCTView(RCTView))');

    const host = modalNode();
    expect(host.props.visible).toBe(true);
    expect(host.props.animationType).toBe('none');
    expect(host.children.length).toBe(1);
    // RN sets styles.modal (position:'absolute') on RCTModalHostView itself.
    expect(host.props.position).toBe('absolute');
    // Default (opaque, non-transparent) presentationStyle is 'fullScreen'.
    expect(host.props.presentationStyle).toBe('fullScreen');
    // An opaque modal's container backdrop stays the default white.
    expect(containerNode().props.backgroundColor).toBe('white');
  });

  it('commits no modal node when visible is false', () => {
    mount(
      ROOT_TAG,
      <Modal visible={false}>
        <View />
      </Modal>,
    );
    expect(fabric.appRoot().children.length).toBe(0);
    expect(fabric.find(n => n.viewName === 'ModalHostView')).toBeUndefined();
  });

  it('routes topRequestClose to onRequestClose', () => {
    let closed = false;
    mount(
      ROOT_TAG,
      <Modal
        visible
        onRequestClose={() => {
          closed = true;
        }}
      >
        <View />
      </Modal>,
    );
    fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
    expect(closed).toBe(true);
  });

  it('routes topShow to onShow', () => {
    let shown = false;
    mount(
      ROOT_TAG,
      <Modal
        visible
        onShow={() => {
          shown = true;
        }}
      >
        <View />
      </Modal>,
    );
    fabric.fireEvent(modalNode().instanceHandle, 'topShow', {});
    expect(shown).toBe(true);
  });

  it('lets the transparent override win over a user style and flips the presentation default', () => {
    mount(
      ROOT_TAG,
      <Modal visible transparent style={{ backgroundColor: 'red' }}>
        <View />
      </Modal>,
    );
    expect(containerNode().props.backgroundColor).toBe('transparent');
    expect(modalNode().props.presentationStyle).toBe('overFullScreen');
  });

  it('sets the container background from backdropColor on a non-transparent modal', () => {
    mount(
      ROOT_TAG,
      <Modal visible backdropColor="rebeccapurple">
        <View />
      </Modal>,
    );
    expect(containerNode().props.backgroundColor).toBe('rebeccapurple');
  });

  it('passes ViewProps / a11y through to the host node', () => {
    mount(
      ROOT_TAG,
      <Modal visible testID="my-modal" accessible accessibilityLabel="a dialog">
        <View />
      </Modal>,
    );
    const props = modalNode().props;
    expect(props.testID).toBe('my-modal');
    expect(props.accessible).toBe(true);
    expect(props.accessibilityLabel).toBe('a dialog');
  });

  it('forwards platform props as NAMED host props', () => {
    mount(
      ROOT_TAG,
      <Modal
        visible
        supportedOrientations={['portrait', 'landscape']}
        hardwareAccelerated
        statusBarTranslucent
        navigationBarTranslucent
        allowSwipeDismissal
        onRequestClose={() => {}}
      >
        <View />
      </Modal>,
    );
    const props = modalNode().props;
    expect(props.supportedOrientations).toEqual(['portrait', 'landscape']);
    expect(props.hardwareAccelerated).toBe(true);
    expect(props.statusBarTranslucent).toBe(true);
    expect(props.navigationBarTranslucent).toBe(true);
    expect(props.allowSwipeDismissal).toBe(true);
  });

  it('fires onDismiss only on the native topDismiss event, not on the hide transition', () => {
    let dismissCount = 0;
    function DismissCase(): ReactElement {
      const [visible, setVisible] = useState(true);
      return (
        <Modal
          visible={visible}
          onRequestClose={() => setVisible(false)}
          onDismiss={() => {
            dismissCount += 1;
          }}
        >
          <View />
        </Modal>
      );
    }
    mount(ROOT_TAG, <DismissCase />);
    expect(dismissCount).toBe(0);

    // Drive the native close: topRequestClose -> parent sets visible=false. The keep-alive
    // holds the node mounted, but NO onDismiss fires from JS on this transition.
    fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
    expect(dismissCount).toBe(0);

    // The native exit animation completes -> Fabric emits topDismiss on the still-mounted
    // host node -> onDismiss fires exactly once.
    fabric.fireEvent(modalNode().instanceHandle, 'topDismiss', {});
    expect(dismissCount).toBe(1);
  });
});
