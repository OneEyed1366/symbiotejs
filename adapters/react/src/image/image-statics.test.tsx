// Co-located test (ADR 0025), ported from the headless `image-statics.smoke`. Image's static methods
// delegate to the iOS `ImageLoader` native module (NativeImageLoaderIOS.js). The spec's getSize
// resolves a `[width, height]` ARRAY, so the fake returns that; the static must normalize it to
// `{width, height}` AND fire the optional success callback with (width, height). prefetch resolves a
// boolean. resolveAssetSource is pure JS: it runs the installed source resolver. No simulator, no
// Fabric slot: these are imperative statics.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Image, setImageSourceResolver } from '@symbiote/react';

// Fake the native module under the bridgeless key (globalThis.nativeModuleProxy), keyed by the iOS
// module name `ImageLoader`.
// Records every prefetchImage call's arguments: the iOS spec is prefetchImage(uri) — a SINGLE
// arg — and the bridgeless TurboModule throws "Exception in HostFunction" on an extra one. The
// Android requestId is a second arg only there. We assert the call arity matches the platform.
const prefetchCalls: unknown[][] = [];
const fakeImageLoader = {
  getSize: (_uri: string) => Promise.resolve([120, 80]),
  getSizeWithHeaders: (_uri: string, _headers: Record<string, string>) =>
    Promise.resolve({ width: 200, height: 150 }),
  prefetchImage: (...args: unknown[]) => {
    prefetchCalls.push(args);
    return Promise.resolve(true);
  },
  queryCache: (_uris: string[]) => Promise.resolve({ 'x://a.png': 'disk/memory' }),
};

beforeEach(() => {
  Object.assign(globalThis, { nativeModuleProxy: { ImageLoader: fakeImageLoader } });
  prefetchCalls.length = 0;
  // Restore the default identity resolver before each scenario.
  setImageSourceResolver(source => source);
});
afterEach(() => {
  setImageSourceResolver(source => source);
});

describe('Image statics', () => {
  it('getSize normalizes an array result and fires the success callback', async () => {
    let callbackArgs: [number, number] | undefined;
    const size = await Image.getSize('x://a.png', (width, height) => {
      callbackArgs = [width, height];
    });
    expect(size).toEqual({ width: 120, height: 80 });

    // The success callback fires after the promise settles; give it a microtask.
    await Promise.resolve();
    expect(callbackArgs).toEqual([120, 80]);
  });

  it('getSizeWithHeaders normalizes an object result', async () => {
    const sizeH = await Image.getSizeWithHeaders('x://a.png', { Authorization: 'Bearer t' });
    expect(sizeH).toEqual({ width: 200, height: 150 });
  });

  it('prefetch resolves a boolean', async () => {
    const prefetched = await Image.prefetch('x://a.png');
    expect(prefetched).toBe(true);
  });

  it('prefetch calls the iOS native prefetchImage with a single uri arg (no Android requestId)', async () => {
    // Headless Platform.OS is 'ios'; the iOS ImageLoader.prefetchImage takes ONLY the uri. Passing
    // the Android requestId as a second arg makes the bridgeless TurboModule throw in a HostFunction.
    await Image.prefetch('x://a.png');
    expect(prefetchCalls).toHaveLength(1);
    expect(prefetchCalls[0]).toEqual(['x://a.png']);
  });

  it('queryCache maps to a known status', async () => {
    const cache = await Image.queryCache(['x://a.png']);
    expect(cache['x://a.png']).toBe('disk/memory');
  });

  it('resolveAssetSource runs the installed resolver', () => {
    // Default resolver is identity, so a plain source object round-trips.
    const plain = { uri: 'x://a.png', scale: 2 };
    expect(Image.resolveAssetSource(plain)).toBe(plain);

    // Swap in a real resolver and prove resolveAssetSource uses the same machinery.
    setImageSourceResolver(() => ({ uri: 'resolved://b.png', scale: 3 }));
    const resolved = Image.resolveAssetSource(42);
    const uri =
      typeof resolved === 'object' && resolved !== null ? Reflect.get(resolved, 'uri') : undefined;
    expect(uri).toBe('resolved://b.png');
  });
});
