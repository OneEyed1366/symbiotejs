// Co-located unit test (ADR 0025): wave-1 component core logic (ImageBackground /
// InputAccessoryView / Modal). Exercises the shared render fns + Modal state machine alone; no
// adapter, no Fabric slot. Ported from the headless `wave1-core.smoke.ts`.

import { describe, expect, it } from 'vitest';
import { flattenStyle } from '@symbiote/engine';
import type { IDescriptor, IDescriptorChild } from '../descriptor';
import { renderImageBackground } from '../view/render-image-background';
import { renderInputAccessoryView } from '../view/render-input-accessory-view';
import { renderModal } from '../view/render-modal';
import { createInitialModalState, modalReducer, shouldRenderModal } from '../state/modal';

function asDescriptor(child: IDescriptorChild | undefined): IDescriptor {
  if (child === undefined || typeof child === 'string')
    throw new Error('expected a descriptor child');
  return child;
}

describe('renderImageBackground', () => {
  const wrapperStyle = { width: 100, height: 80 };
  const wrapper = renderImageBackground({
    style: wrapperStyle,
    imageStyle: { opacity: 0.5 },
    image: {
      source: { uri: 'http://x/bg.png' },
      resizeMode: 'cover',
      passthrough: { testID: 'bg' },
    },
  });
  const image = asDescriptor(wrapper.children[0]);
  const imageStyle = flattenStyle(image.props.style);

  it('wraps a symbiote-view carrying the wrapper style and one structural child', () => {
    expect(wrapper.type).toBe('symbiote-view');
    expect(wrapper.props.style).toBe(wrapperStyle);
    expect(wrapper.children).toHaveLength(1);
  });

  it('makes the inner image an absolute-fill symbiote-image', () => {
    expect(image.type).toBe('symbiote-image');
    expect(imageStyle.position).toBe('absolute');
    expect(imageStyle.left).toBe(0);
  });

  it('proxies the wrapper width/height onto the image and lets imageStyle win last', () => {
    expect(imageStyle.width).toBe(100);
    expect(imageStyle.height).toBe(80);
    expect(imageStyle.opacity).toBe(0.5);
  });

  it('forwards source (resolved to a one-element array), resizeMode and passthrough', () => {
    expect(Array.isArray(image.props.source)).toBe(true);
    expect(image.props.source).toHaveLength(1);
    expect(image.props.resizeMode).toBe('cover');
    expect(image.props.testID).toBe('bg');
  });
});

describe('renderInputAccessoryView', () => {
  const style = { flex: 1 };
  const host = renderInputAccessoryView({
    nativeID: 'kbd-bar',
    backgroundColor: '#eee',
    style,
    passthrough: { testID: 'iav', accessibilityLabel: 'bar' },
  });

  it('hosts a symbiote-input-accessory-view forwarding its props', () => {
    expect(host.type).toBe('symbiote-input-accessory-view');
    expect(host.props.nativeID).toBe('kbd-bar');
    expect(host.props.backgroundColor).toBe('#eee');
    expect(host.props.style).toBe(style);
  });

  it('merges passthrough and injects no structural children (the adapter adds user children)', () => {
    expect(host.props.testID).toBe('iav');
    expect(host.props.accessibilityLabel).toBe('bar');
    expect(host.children).toHaveLength(0);
  });

  it('omits nativeID and backgroundColor when undefined', () => {
    const bare = renderInputAccessoryView({ passthrough: {} });
    expect('nativeID' in bare.props).toBe(false);
    expect('backgroundColor' in bare.props).toBe(false);
  });
});

describe('renderModal', () => {
  it('builds a symbiote-modal host with the default attributes', () => {
    const root = renderModal({ visible: true, passthrough: { testID: 'm', onShow: () => {} } });
    expect(root.type).toBe('symbiote-modal');
    expect(flattenStyle(root.props.style).position).toBe('absolute');
    expect(root.props.animationType).toBe('none');
    expect(root.props.presentationStyle).toBe('fullScreen');
    expect(root.props.visible).toBe(true);
    expect(root.props.testID).toBe('m');
    expect(typeof root.props.onShow).toBe('function');
  });

  it('nests a single collapsable:false container with an opaque white backdrop', () => {
    const root = renderModal({ visible: true, passthrough: {} });
    const container = asDescriptor(root.children[0]);
    expect(root.children).toHaveLength(1);
    expect(container.type).toBe('symbiote-view');
    expect(container.props.collapsable).toBe(false);
    const containerStyle = flattenStyle(container.props.style);
    expect(containerStyle.backgroundColor).toBe('white');
    expect(containerStyle.flex).toBe(1);
    expect(container.children).toHaveLength(0);
  });

  it('flips presentationStyle to overFullScreen and the backdrop to transparent when transparent', () => {
    const transparent = renderModal({ visible: true, transparent: true, passthrough: {} });
    expect(transparent.props.presentationStyle).toBe('overFullScreen');
    const container = asDescriptor(transparent.children[0]);
    expect(flattenStyle(container.props.style).backgroundColor).toBe('transparent');
  });

  it('lets backdropColor override the container background', () => {
    const tinted = renderModal({ visible: true, backdropColor: '#123456', passthrough: {} });
    const container = asDescriptor(tinted.children[0]);
    expect(flattenStyle(container.props.style).backgroundColor).toBe('#123456');
  });

  it('lets an explicit presentationStyle win over the transparent default', () => {
    const explicit = renderModal({
      visible: true,
      transparent: true,
      presentationStyle: 'pageSheet',
      passthrough: {},
    });
    expect(explicit.props.presentationStyle).toBe('pageSheet');
  });
});

describe('modal keep-alive state machine', () => {
  it('seeds isRendered from the initial visibility', () => {
    expect(createInitialModalState(true).isRendered).toBe(true);
    expect(createInitialModalState(false).isRendered).toBe(false);
  });

  it('drops the keep-alive on hide and is identity-stable when already hidden', () => {
    const visible = createInitialModalState(true);
    const hidden = modalReducer(visible, { type: 'hide' });
    expect(hidden.isRendered).toBe(false);
    expect(modalReducer(hidden, { type: 'hide' })).toBe(hidden);
  });

  it('re-arms the keep-alive on show and is identity-stable when already shown', () => {
    const hidden = modalReducer(createInitialModalState(true), { type: 'hide' });
    const shown = modalReducer(hidden, { type: 'show' });
    expect(shown.isRendered).toBe(true);
    expect(modalReducer(shown, { type: 'show' })).toBe(shown);
  });

  it('gates rendering: hidden+not-rendered -> none, visible or keep-alive frame -> node', () => {
    expect(shouldRenderModal(false, { isRendered: false })).toBe(false);
    expect(shouldRenderModal(true, { isRendered: false })).toBe(true);
    expect(shouldRenderModal(false, { isRendered: true })).toBe(true);
  });
});
