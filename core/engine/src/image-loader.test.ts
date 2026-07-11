// Unit test for the Image statics imperative module (getSize / getSizeWithHeaders / prefetch /
// abortPrefetch / queryCache / resolveAssetSource), extracted out of the VIEW layer's
// render-image.ts into this native-bridge-touching module (same shape as alert.test.ts / the
// Share test - a fake ImageLoader installed via __turboModuleProxy, the same global
// getNativeModule reads). Platform is mocked directly to control the iOS/Android prefetch-call
// branch without depending on a real PlatformConstants native module.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./platform', () => ({ Platform: { OS: 'ios' } }));

let imageStatics: typeof import('./image-loader').imageStatics;
let setImageSourceResolver: typeof import('./image-source-resolver').setImageSourceResolver;

type ICapturedGetSize = { uri: string };
type ICapturedGetSizeWithHeaders = { uri: string; headers: Record<string, string> };
type ICapturedPrefetch = { uri: string; requestId?: number };

let capturedGetSize: ICapturedGetSize | null;
let capturedGetSizeWithHeaders: ICapturedGetSizeWithHeaders | null;
let capturedPrefetch: ICapturedPrefetch | null;
let capturedAbortId: number | null;
let capturedQueryCacheUris: string[] | null;

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

beforeEach(async () => {
  capturedGetSize = null;
  capturedGetSizeWithHeaders = null;
  capturedPrefetch = null;
  capturedAbortId = null;
  capturedQueryCacheUris = null;

  const fakeImageLoader = {
    getSize(uri: string): Promise<[number, number]> {
      capturedGetSize = { uri };
      return Promise.resolve([100, 200]);
    },
    getSizeWithHeaders(uri: string, headers: Record<string, string>): Promise<unknown> {
      capturedGetSizeWithHeaders = { uri, headers };
      return Promise.resolve({ width: 300, height: 400 });
    },
    prefetchImage(uri: string, requestId?: number): Promise<boolean> {
      capturedPrefetch = { uri, requestId };
      return Promise.resolve(true);
    },
    abortRequest(requestId: number): void {
      capturedAbortId = requestId;
    },
    queryCache(uris: string[]): Promise<Record<string, string>> {
      capturedQueryCacheUris = uris;
      return Promise.resolve({ 'https://a': 'memory', 'https://b': 'bogus' });
    },
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === 'ImageLoader' && isPresent<T>(fakeImageLoader) ? fakeImageLoader : null;

  vi.resetModules();
  ({ imageStatics } = await import('./image-loader'));
  ({ setImageSourceResolver } = await import('./image-source-resolver'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

describe('imageStatics', () => {
  it('getSize resolves width/height from the native [width, height] array', async () => {
    const size = await imageStatics.getSize('https://example.com/a.png');
    expect(size).toEqual({ width: 100, height: 200 });
    expect(capturedGetSize?.uri).toBe('https://example.com/a.png');
  });

  it('getSize also invokes the success callback', async () => {
    let seen: [number, number] | null = null;
    await imageStatics.getSize('https://example.com/a.png', (w, h) => {
      seen = [w, h];
    });
    expect(seen).toEqual([100, 200]);
  });

  it('getSizeWithHeaders resolves width/height from the native {width, height} object', async () => {
    const size = await imageStatics.getSizeWithHeaders('https://example.com/b.png', {
      Authorization: 'x',
    });
    expect(size).toEqual({ width: 300, height: 400 });
    expect(capturedGetSizeWithHeaders?.headers).toEqual({ Authorization: 'x' });
  });

  it('prefetch resolves true and reports a monotonic requestId via the callback', async () => {
    let reportedId: number | null = null;
    const ok = await imageStatics.prefetch('https://example.com/c.png', id => {
      reportedId = id;
    });
    expect(ok).toBe(true);
    expect(reportedId).toBe(1);
    // iOS: prefetchImage is called with only the uri (no requestId arg forwarded to native).
    expect(capturedPrefetch?.requestId).toBeUndefined();
  });

  it('abortPrefetch forwards the requestId to native abortRequest', () => {
    imageStatics.abortPrefetch(7);
    expect(capturedAbortId).toBe(7);
  });

  it('queryCache narrows the result to known cache statuses, dropping unknown ones', async () => {
    const record = await imageStatics.queryCache(['https://a', 'https://b']);
    expect(record).toEqual({ 'https://a': 'memory' });
    expect(capturedQueryCacheUris).toEqual(['https://a', 'https://b']);
  });

  it('resolveAssetSource runs the currently-installed source resolver', () => {
    setImageSourceResolver(source => ({ uri: `resolved:${String(source)}` }));
    expect(imageStatics.resolveAssetSource(42)).toEqual({ uri: 'resolved:42' });
  });

  it('resolveAssetSource is the identity when no resolver has been installed', () => {
    expect(imageStatics.resolveAssetSource(42)).toBe(42);
  });
});

describe('imageStatics on Android', () => {
  beforeEach(async () => {
    vi.doMock('./platform', () => ({ Platform: { OS: 'android' } }));
    vi.resetModules();
    ({ imageStatics } = await import('./image-loader'));
  });

  it('prefetch forwards the requestId to native prefetchImage', async () => {
    await imageStatics.prefetch('https://example.com/d.png');
    expect(capturedPrefetch?.requestId).toBe(1);
  });
});
