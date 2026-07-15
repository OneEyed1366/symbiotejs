// Unit test for the pure renderImage view fn, split out from the imperative Image statics
// (@symbiote-native/engine's image-loader.ts) per the VIEW layer's zero-state / zero-native-bridge
// contract. Exercises source resolution (source / src / srcSet), the width/height style fold,
// resizeMode/tintColor read from style, and the alt -> accessibilityLabel fold - no adapter, no
// Fabric slot.

import { afterEach, describe, expect, it } from 'vitest';
import { setImageSourceResolver } from '@symbiote-native/engine';
import { renderImage, type IImageViewProps } from './index';
import type { IViewStyle } from '@symbiote-native/engine';

function baseView(overrides: Partial<IImageViewProps> = {}): IImageViewProps {
  return { passthrough: {}, ...overrides };
}

// resizeMode/tintColor on `style` is a legacy Image pattern renderImage reads defensively
// (readStyleString) - IViewStyle itself doesn't declare these keys, so a widened local type
// is needed to construct the fixture without an `as` cast.
type ILegacyImageStyle = IViewStyle & { resizeMode?: string; tintColor?: string };

afterEach(() => {
  // Restore the identity resolver so tests don't leak state into one another.
  setImageSourceResolver(source => source);
});

describe('renderImage', () => {
  it('resolves an object `source` into a one-element array via the installed resolver', () => {
    setImageSourceResolver(source => ({ ...(source as object), scale: 2 }));
    const descriptor = renderImage(baseView({ source: { uri: 'http://x/a.png' } }));
    expect(descriptor.type).toBe('symbiote-image');
    expect(descriptor.props.source).toEqual([{ uri: 'http://x/a.png', scale: 2 }]);
  });

  it('passes an already-array source through the resolver untouched in shape', () => {
    const sources = [{ uri: 'http://x/a.png' }, { uri: 'http://x/a@2x.png' }];
    const descriptor = renderImage(baseView({ source: sources }));
    expect(descriptor.props.source).toEqual(sources);
  });

  it('folds `src` into a single-element source array', () => {
    const descriptor = renderImage(baseView({ src: 'http://x/b.png', width: 10, height: 20 }));
    expect(descriptor.props.source).toEqual([
      { uri: 'http://x/b.png', width: 10, height: 20, headers: {} },
    ]);
  });

  it('expands `srcSet` into scaled sources and prefers srcSet over src/source', () => {
    const descriptor = renderImage(
      baseView({ src: 'http://x/fallback.png', srcSet: 'http://x/1x.png 1x, http://x/2x.png 2x' }),
    );
    const sources = descriptor.props.source as Array<{ uri: string; scale: number }>;
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ uri: 'http://x/1x.png', scale: 1 });
    expect(sources[1]).toMatchObject({ uri: 'http://x/2x.png', scale: 2 });
  });

  it('folds width/height aliases into style, with explicit style winning', () => {
    const descriptor = renderImage(
      baseView({ width: 10, height: 20, style: { width: 99 }, source: 1 }),
    );
    expect(descriptor.props.style).toEqual([{ width: 10, height: 20 }, { width: 99 }]);
  });

  it('reads resizeMode/tintColor out of a flattened style when not passed explicitly', () => {
    const style: ILegacyImageStyle = { resizeMode: 'contain', tintColor: 'red' };
    const descriptor = renderImage(baseView({ source: 1, style }));
    expect(descriptor.props.resizeMode).toBe('contain');
    expect(descriptor.props.tintColor).toBe('red');
  });

  it('an explicit resizeMode/tintColor prop wins over the style-derived one', () => {
    const style: ILegacyImageStyle = { resizeMode: 'contain' };
    const descriptor = renderImage(baseView({ source: 1, resizeMode: 'cover', style }));
    expect(descriptor.props.resizeMode).toBe('cover');
  });

  it('folds `alt` into accessibilityLabel and marks the image accessible', () => {
    const descriptor = renderImage(baseView({ source: 1, alt: 'a cat' }));
    expect(descriptor.props.accessibilityLabel).toBe('a cat');
    expect(descriptor.props.accessible).toBe(true);
  });

  it('an explicit accessibilityLabel in passthrough wins over `alt`', () => {
    const descriptor = renderImage(
      baseView({ source: 1, alt: 'a cat', passthrough: { accessibilityLabel: 'explicit' } }),
    );
    expect(descriptor.props.accessibilityLabel).toBe('explicit');
  });

  it('resolves loadingIndicatorSource to a bare uri string, not the array shape', () => {
    const descriptor = renderImage(
      baseView({ source: 1, loadingIndicatorSource: { uri: 'http://x/spinner.png' } }),
    );
    expect(descriptor.props.loadingIndicatorSrc).toBe('http://x/spinner.png');
  });
});
