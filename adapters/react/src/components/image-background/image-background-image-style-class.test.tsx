// Co-located React-driven test (ADR 0025): imageStyle accepts a bare class-name string,
// resolved through the SAME shared style registry as `className`, not the full
// IClassNameValue union — see the widened IImageBackgroundProps type. Proves the resolved
// style lands on the INNER RCTImageView, not the wrapper (mirrors the className fix, which
// resolves onto the wrapper — the two must never cross), and that a plain style object still
// works unchanged.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote/engine';
import { ImageBackground, mount, unmount } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';

const ROOT_TAG = 15;
const fabric = installFabric();
const SOURCE = { uri: 'http://x/bg.png' };

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('React ImageBackground imageStyle class-name resolution', () => {
  it('resolves a class-name string onto the inner image, not the wrapper', () => {
    registerStyles({ overlay: { opacity: 0.5 } });
    mount(
      ROOT_TAG,
      <ImageBackground source={SOURCE} imageStyle="overlay" className="wrapperClass" />,
    );

    const image = fabric.find(node => node.viewName === 'RCTImageView');
    expect(image, 'RCTImageView was created').toBeDefined();
    expect(image!.props.opacity).toBe(0.5);

    const wrapper = fabric.find(
      node => node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none',
    );
    expect(wrapper, 'wrapper RCTView was created').toBeDefined();
    expect('opacity' in wrapper!.props).toBe(false);
  });

  it('still accepts a plain style object unchanged', () => {
    mount(ROOT_TAG, <ImageBackground source={SOURCE} imageStyle={{ opacity: 0.25 }} />);

    const image = fabric.find(node => node.viewName === 'RCTImageView');
    expect(image!.props.opacity).toBe(0.25);
  });
});
