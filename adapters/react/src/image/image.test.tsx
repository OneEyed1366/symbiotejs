// Co-located React-driven test (ADR 0025), ported from the headless `image.smoke`.
// Checks the two things only Image does: `source` reaches native as an ARRAY, and an opaque
// require()-style number is expanded by the injected resolver before it gets there. Plus the W3C
// aliases (`src` / `alt`) and the onLoad event round-trip. No simulator.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  Image,
  setImageSourceResolver,
  type ISymbioteEvent,
} from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const fabric = installFabric();
const ROOT_TAG = 11;

// A require() number expands to a resolved source; everything else round-trips.
const ASSET_ID = 42;
const RESOLVED_ASSET = { uri: 'asset://42', scale: 1, width: 10, height: 10 };

function imageNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTImageView');
  if (!node) throw new Error('no RCTImageView was created');
  return node;
}

beforeEach(() => {
  fabric.reset();
  setImageSourceResolver(source => (source === ASSET_ID ? RESOLVED_ASSET : source));
});
afterEach(() => unmount(ROOT_TAG));

describe('Image primitive', () => {
  it('wraps an object source into a one-element array', () => {
    mount(ROOT_TAG, <Image source={{ uri: 'http://x/y.png' }} onLoad={() => {}} />);

    const source = imageNode().props.source;
    expect(Array.isArray(source)).toBe(true);
    expect(Array.isArray(source) ? source : []).toHaveLength(1);
    expect(Array.isArray(source) ? source[0] : undefined).toEqual({ uri: 'http://x/y.png' });
  });

  it('runs the resolver on a require()-style number, then wraps it', () => {
    mount(ROOT_TAG, <Image source={ASSET_ID} />);

    const source = imageNode().props.source;
    expect(Array.isArray(source)).toBe(true);
    expect(Array.isArray(source) ? source[0] : undefined).toEqual(RESOLVED_ASSET);
  });

  it('fires onLoad from the captured native event', () => {
    let loadedWith: ISymbioteEvent | undefined;
    mount(
      ROOT_TAG,
      <Image
        source={{ uri: 'http://x/y.png' }}
        onLoad={event => {
          loadedWith = event;
        }}
      />,
    );

    const node = imageNode();
    fabric.fireEvent(node.instanceHandle, 'topLoad', {
      source: { uri: 'http://x/y.png', width: 1, height: 1 },
    });
    expect(loadedWith).toBeDefined();
  });

  it('folds the W3C aliases — `src` to a source uri, `alt` to accessibility — without leaking them', () => {
    mount(ROOT_TAG, <Image src="http://x/z.png" alt="a kitten" />);

    const node = imageNode();
    const source = node.props.source;
    expect(Array.isArray(source)).toBe(true);
    expect(Array.isArray(source) ? source : []).toHaveLength(1);
    const first = Array.isArray(source) ? source[0] : undefined;
    const uri = typeof first === 'object' && first !== null ? Reflect.get(first, 'uri') : undefined;
    expect(uri).toBe('http://x/z.png');
    expect(node.props.accessibilityLabel).toBe('a kitten');
    expect(node.props.accessible).toBe(true);
    // The aliases themselves must not reach native.
    expect('src' in node.props).toBe(false);
    expect('alt' in node.props).toBe(false);
  });
});
