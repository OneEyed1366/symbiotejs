// Unit test for the image-source-resolver seam (mirrors platform-color.ts's
// setColorProcessor/processColor test coverage). Proves the register/resolve round-trip both
// renderImage (@symbiote-native/components) and image-loader's resolveAssetSource static rely on.

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('image-source-resolver', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('resolveImageSource is the identity before any resolver is registered', async () => {
    const { resolveImageSource } = await import('./image-source-resolver');
    expect(resolveImageSource(42)).toBe(42);
    const obj = { uri: 'x' };
    expect(resolveImageSource(obj)).toBe(obj);
  });

  it('setImageSourceResolver registers a resolver that resolveImageSource then runs', async () => {
    const { setImageSourceResolver, resolveImageSource } = await import('./image-source-resolver');
    setImageSourceResolver(source => ({ uri: `asset://${String(source)}` }));
    expect(resolveImageSource(7)).toEqual({ uri: 'asset://7' });
  });

  it('a later registration replaces the earlier one', async () => {
    const { setImageSourceResolver, resolveImageSource } = await import('./image-source-resolver');
    setImageSourceResolver(() => 'first');
    setImageSourceResolver(() => 'second');
    expect(resolveImageSource(1)).toBe('second');
  });
});
