// Image static methods (RN's Image.getSize / prefetch / queryCache / etc).
//
// These mirror RN's iOS Image statics (Libraries/Image/Image.ios.js), which delegate to the
// `ImageLoader` native (Turbo)Module declared in NativeImageLoaderIOS.js. The Android spec
// (NativeImageLoaderAndroid.js) registers under the SAME module name ('ImageLoader'), so this
// stays a flat, non-platform-split module - only the Android prefetch call signature differs (a
// second `requestId` arg), branched on Platform.OS below, not on module name. NOTE the asymmetry
// in the iOS spec: `getSize` resolves a `[width, height]` ARRAY, while `getSizeWithHeaders`
// resolves a `{width, height}` OBJECT, both are guarded below before reading. The native result
// crosses the I/O boundary as `unknown`; we never cast it, we narrow its shape.
//
// This is a stateful, native-bridge-touching imperative module (module-level ImageLoader cache +
// prefetch requestId counter) with no view of its own - it belongs in @symbiote-native/engine
// alongside Alert/Share, not in a view/render-*.ts file (whose contract is zero state / zero
// native bridge).

import { dlog } from './debug';
import { resolveImageSource, type IImageSourceProp } from './image-source-resolver';
import { getNativeModule } from './native-modules';
import { Platform } from './platform';
import { isNumber } from './type-guards';

export type IImageSize = {
  width: number;
  height: number;
};

export type IImageCacheStatus = 'memory' | 'disk' | 'disk/memory';

type ISizeSuccess = (width: number, height: number) => void;
type ISizeFailure = (error: unknown) => void;

// The `ImageLoader` native module surface we consume. Promise-based on the New Architecture (the
// spec returns Promises directly). One name, two signatures: Android's `prefetchImage` takes a
// second `requestId` arg (abortRequest keys off it) via NativeImageLoaderAndroid.js; iOS takes
// only `uri` and throws on the extra arg, so the call below branches on Platform.OS instead of
// passing requestId unconditionally. `abortRequest` cancels an in-flight prefetch keyed by its
// requestId; it exists on the Android spec only (NativeImageLoaderAndroid.js), so calling it where
// unsupported (iOS, headless) is a no-op rather than a throw.
type INativeImageLoader = {
  getSize(uri: string): Promise<unknown>;
  getSizeWithHeaders(uri: string, headers: Record<string, string>): Promise<unknown>;
  // iOS takes ONLY the uri (NativeImageLoaderIOS); Android adds the requestId so abortRequest can
  // key off it. The arg is optional here so the iOS call passes exactly one - a second arg makes the
  // bridgeless TurboModule throw "Exception in HostFunction".
  prefetchImage(uri: string, requestId?: number): Promise<unknown>;
  abortRequest?(requestId: number): void;
  queryCache(uris: string[]): Promise<unknown>;
};

// The iOS native module name RN registers this under (NativeImageLoaderIOS.js resolves
// `TurboModuleRegistry.getEnforcing<Spec>('ImageLoader')`). A module name like this is only
// provable on a real host - a headless fake answers to any name - so this iOS name is
// device-verify-pending.
const IMAGE_LOADER_MODULE = 'ImageLoader';

let imageLoaderModule: INativeImageLoader | null | undefined;

function getImageLoader(): INativeImageLoader | null {
  if (imageLoaderModule === undefined) {
    imageLoaderModule = getNativeModule<INativeImageLoader>(IMAGE_LOADER_MODULE);
    dlog(`Image: ImageLoader module ${imageLoaderModule ? 'resolved' : 'NOT resolved (null)'}`);
  }
  return imageLoaderModule;
}

// Narrow native's getSize result. The spec resolves a `[width, height]` array, but tolerate a
// `{width, height}` object too (getSizeWithHeaders uses that shape).
function toImageSize(result: unknown): IImageSize {
  if (Array.isArray(result) && isNumber(result[0]) && isNumber(result[1])) {
    return { width: result[0], height: result[1] };
  }
  if (typeof result === 'object' && result !== null) {
    const width = Reflect.get(result, 'width');
    const height = Reflect.get(result, 'height');
    if (isNumber(width) && isNumber(height)) return { width, height };
  }
  throw new Error(`Image: unexpected size result from native: ${JSON.stringify(result)}`);
}

function requireLoader(method: string): INativeImageLoader {
  const loader = getImageLoader();
  if (loader === null) {
    throw new Error(
      `Image.${method}: ImageLoader native module is not available ` +
        '(running headless or not linked on this host).',
    );
  }
  return loader;
}

// Resolve image dimensions, optionally via success/failure callbacks. Always returns the Promise
// too (RN returns void when a callback is passed, but a promise-and-callback shape is friendlier
// and a strict superset).
function getSize(uri: string, success?: ISizeSuccess, failure?: ISizeFailure): Promise<IImageSize> {
  const promise = Promise.resolve()
    .then(() => requireLoader('getSize').getSize(uri))
    .then(toImageSize);
  if (typeof success === 'function') {
    promise
      .then(size => success(size.width, size.height))
      .catch((error: unknown) => {
        if (typeof failure === 'function') failure(error);
        else dlog(`Image.getSize failed for ${uri}: ${String(error)}`);
      });
  }
  return promise;
}

function getSizeWithHeaders(
  uri: string,
  headers: Record<string, string>,
  success?: ISizeSuccess,
  failure?: ISizeFailure,
): Promise<IImageSize> {
  const promise = Promise.resolve()
    .then(() => requireLoader('getSizeWithHeaders').getSizeWithHeaders(uri, headers))
    .then(toImageSize);
  if (typeof success === 'function') {
    promise
      .then(size => success(size.width, size.height))
      .catch((error: unknown) => {
        if (typeof failure === 'function') failure(error);
        else dlog(`Image.getSizeWithHeaders failed for ${uri}: ${String(error)}`);
      });
  }
  return promise;
}

// Android keys an in-flight prefetch by a monotonic requestId (so abortRequest can cancel it);
// RN's Image.android.js generates the same way. iOS ignores the arg.
let prefetchRequestId = 0;

// Download a remote image into the disk cache. Resolves to whether it succeeded. `callback`
// receives the requestId (RN's Image.android.js shape) so the caller can later pass it to
// abortPrefetch.
async function prefetch(uri: string, callback?: (requestId: number) => void): Promise<boolean> {
  prefetchRequestId += 1;
  const requestId = prefetchRequestId;
  if (typeof callback === 'function') callback(requestId);
  const loader = requireLoader('prefetch');
  return (
    Promise.resolve()
      // Android's prefetchImage keys an abortable request on requestId; iOS takes ONLY the uri and
      // throws on an extra arg (bridgeless TurboModule arg-count check). Match RN's per-platform call.
      .then(() =>
        Platform.OS === 'android'
          ? loader.prefetchImage(uri, requestId)
          : loader.prefetchImage(uri),
      )
      .then(result => result === true)
      .catch((error: unknown) => {
        dlog(`Image.prefetch failed for ${uri}: ${String(error)}`);
        throw error;
      })
  );
}

// Cancel an in-flight prefetch by the requestId prefetch handed back. Android only (mirrors
// Image.android.js -> NativeImageLoaderAndroid.abortRequest); a missing abortRequest (iOS,
// headless) is a no-op rather than a throw.
function abortPrefetch(requestId: number): void {
  const loader = getImageLoader();
  if (loader === null || typeof loader.abortRequest !== 'function') {
    dlog(`Image.abortPrefetch(${requestId}): no abortRequest on this host, ignoring`);
    return;
  }
  loader.abortRequest(requestId);
}

// Narrow native's queryCache result: an object mapping each known uri to its cache status.
// Unknown statuses are dropped rather than trusted blindly.
const CACHE_STATUS: Record<string, IImageCacheStatus> = {
  memory: 'memory',
  disk: 'disk',
  'disk/memory': 'disk/memory',
};

function toCacheRecord(result: unknown): Record<string, IImageCacheStatus> {
  const record: Record<string, IImageCacheStatus> = {};
  if (typeof result !== 'object' || result === null) return record;
  for (const key of Object.keys(result)) {
    const value = Reflect.get(result, key);
    if (typeof value === 'string' && Object.hasOwn(CACHE_STATUS, value)) {
      record[key] = CACHE_STATUS[value];
    }
  }
  return record;
}

async function queryCache(uris: string[]): Promise<Record<string, IImageCacheStatus>> {
  return Promise.resolve()
    .then(() => {
      const loader = requireLoader('queryCache');
      // The native queryCache never rejects (RCTImageLoader resolves getImageCacheStatus), so a
      // rejection here is a JS/native boundary fault: log whether the method is even callable and
      // the arg shape, to tell "not a function" (interop gap) from a marshalling reject.
      dlog(
        `Image.queryCache: typeof loader.queryCache=${typeof loader.queryCache} uris=${uris.length}`,
      );
      return loader.queryCache(uris);
    })
    .then(toCacheRecord)
    .catch((error: unknown) => {
      dlog(`Image.queryCache failed: ${String(error)}`);
      throw error;
    });
}

// PURE JS: run the currently-installed source resolver (the same machinery the Image component
// uses via resolveImageSource). RN's resolveAssetSource turns a require() asset id into
// {uri, scale, ...}; the app injects the real one with setImageSourceResolver, and this exposes
// its output to callers directly.
function resolveAssetSource(source: IImageSourceProp): unknown {
  return resolveImageSource(source);
}

export type IImageStatics = {
  getSize: typeof getSize;
  getSizeWithHeaders: typeof getSizeWithHeaders;
  prefetch: typeof prefetch;
  abortPrefetch: typeof abortPrefetch;
  queryCache: typeof queryCache;
  resolveAssetSource: typeof resolveAssetSource;
};

export const imageStatics: IImageStatics = {
  getSize,
  getSizeWithHeaders,
  prefetch,
  abortPrefetch,
  queryCache,
  resolveAssetSource,
};
