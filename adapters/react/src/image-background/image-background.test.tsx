// Co-located React-driven test (ADR 0025), ported from the headless `image-background.smoke`.
// ImageBackground is pure JS composition: an outer RCTView (gets the wrapper style) wrapping an
// absolute-fill RCTImageView, with the children painted ON TOP, i.e. after the image in the
// wrapper's child order. This asserts that shape. No simulator.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Text, ImageBackground } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';

const fabric = installFabric();
const ROOT_TAG = 14;

const WRAPPER_STYLE = { width: 100, height: 80 };
const SOURCE = { uri: 'http://x/bg.png' };
const OVERLAY_TEXT = 'on top';

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('ImageBackground composition', () => {
  it('wraps an absolute-fill image and paints children on top', () => {
    mount(
      ROOT_TAG,
      <ImageBackground style={WRAPPER_STYLE} source={SOURCE} resizeMode="cover">
        <Text>{OVERLAY_TEXT}</Text>
      </ImageBackground>,
    );

    // the wrapper RCTView (the app's own, not the box-none AppContainer) gets the wrapper style
    const wrapper = fabric.find(
      node => node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none',
    );
    expect(wrapper).toBeDefined();
    expect(wrapper!.props.width).toBe(WRAPPER_STYLE.width);
    expect(wrapper!.props.height).toBe(WRAPPER_STYLE.height);

    // the inner RCTImageView is absolute-fill with the resolved source
    const image = fabric.find(node => node.viewName === 'RCTImageView');
    expect(image).toBeDefined();
    expect(image!.props.position).toBe('absolute');
    const source = image!.props.source;
    expect(Array.isArray(source) && source.length === 1).toBe(true);
    expect(Array.isArray(source) ? source[0] : undefined).toEqual(SOURCE);
    // Wrapper width/height are proxied onto the image so it fills the box.
    expect(image!.props.width).toBe(WRAPPER_STYLE.width);
    expect(image!.props.height).toBe(WRAPPER_STYLE.height);

    // children render on top (after the image in child order)
    const committedWrapper = fabric.appRoot().children[0];
    expect(committedWrapper).toBeDefined();
    expect(committedWrapper.viewName).toBe('RCTView');

    const childNames = committedWrapper.children.map(child => child.viewName);
    const imageIndex = childNames.indexOf('RCTImageView');
    const textIndex = childNames.findIndex(name => name === 'RCTText' || name === 'RCTParagraph');
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThanOrEqual(0);
    expect(imageIndex).toBeLessThan(textIndex);
  });
});
