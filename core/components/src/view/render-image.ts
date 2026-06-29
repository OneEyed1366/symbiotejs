import {
  dlog,
  flattenStyle,
  getNativeModule,
  Platform,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote/engine';
import type { IAccessibilityProps, IAriaProps } from '../accessibility-props';
import { el, type IDescriptor } from '../descriptor';

type IImageEventHandler = (event: ISymbioteEvent) => void;

export type IResizeMode = 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';

export type IImageSource = {
  uri?: string;
  scale?: number;
  width?: number;
  height?: number;
};

// A source is either a structured object/array (remote or pre-resolved) or an
// opaque asset id (the number `require('./x.png')` returns) the resolver expands.
export type IImageSourceProp = IImageSource | IImageSource[] | number;

// iOS resizable-image cap insets: the unscaled border kept fixed while the
// center stretches (a 9-patch on iOS). Forwarded as-is; native understands it.
export type IImageCapInsets = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

// Android decode strategy: 'auto' lets RN pick, 'resize' downsamples at decode
// (cheaper memory), 'scale' decodes full then scales, 'none' disables resizing
// (ImageProps.js:116).
export type IResizeMethod = 'auto' | 'resize' | 'scale' | 'none';

export type IImageProps = IAccessibilityProps &
  IAriaProps & {
    // `source` is optional because the W3C aliases (`src` / `srcSet`) can supply it
    // instead; the fold in the component resolves exactly one of them to native.
    source?: IImageSourceProp;
    defaultSource?: IImageSourceProp;
    // Android-only: shown while the main source loads. Mutually exclusive with
    // defaultSource (RN warns if both are set). Resolved like any asset source.
    loadingIndicatorSource?: IImageSourceProp;
    style?: IStyleProp<IViewStyle>;
    resizeMode?: IResizeMode;
    // Android decode-time scaling strategy.
    resizeMethod?: IResizeMethod;
    tintColor?: string;
    blurRadius?: number;
    // iOS: cap insets for a resizable (stretchable-center) image.
    capInsets?: IImageCapInsets;
    // Android: cross-fade duration in ms when the image appears.
    fadeDuration?: number;
    // Android: stream the image in as it downloads rather than waiting for the full
    // file (ImageProps.js:90). Forwarded as-is; inert on iOS.
    progressiveRenderingEnabled?: boolean;

    // --- W3C HTML-style aliases (ImageProps.js ~166-202) ---
    // A single remote URI, folded into `source` (ImageProps.js:src). Mutually
    // exclusive with `source` in practice; the fold prefers src/srcSet.
    src?: string;
    // A comma-separated `uri 2x, uri 3x` descriptor list, expanded into a scaled
    // `source` array (mirrors getImageSourcesFromImageProps' srcSet parsing).
    srcSet?: string;
    // Accessibility text: folds to accessibilityLabel and marks the image accessible
    // (Image.ios.js/Image.android.js: alt -> accessibilityLabel + accessible).
    alt?: string;
    // Layout dp shorthands folded into style (ImageProps.js:195,202).
    width?: number;
    height?: number;
    // CORS mode; 'use-credentials' adds the credentials header to the source
    // (ImageSourceUtils.js getImageSourcesFromImageProps).
    crossOrigin?: 'anonymous' | 'use-credentials';
    // Referrer policy, forwarded as a source header (ImageSourceUtils.js).
    referrerPolicy?: string;

    onLoadStart?: IImageEventHandler;
    onLoad?: IImageEventHandler;
    onLoadEnd?: IImageEventHandler;
    onError?: IImageEventHandler;
    onProgress?: IImageEventHandler;
    onPartialLoad?: IImageEventHandler;
  };

// Default resolver: identity. RN's resolveAssetSource (which turns a require()
// number into {uri, scale, width, height}) is wired in by the app at startup.
let resolveSource: (source: unknown) => unknown = source => source;

export function setImageSourceResolver(resolve: (source: unknown) => unknown): void {
  resolveSource = resolve;
}

// Resolve the source, then normalize to the array shape native expects. A single
// object/number becomes a one-element array; an already-array source passes through.
function normalizeSource(source: IImageSourceProp): unknown[] {
  const resolved = resolveSource(source);
  const sources = Array.isArray(resolved) ? resolved : [resolved];
  dlog(`Image source resolved to ${JSON.stringify(sources)}`);
  return sources;
}

// The HTTP headers the W3C aliases (crossOrigin / referrerPolicy) contribute to
// every folded source, mirroring ImageSourceUtils.js getImageSourcesFromImageProps:
// 'use-credentials' adds the credentials header; referrerPolicy adds Referrer-Policy.
function headersFromAliases(view: IImageViewProps): Record<string, string> {
  const headers: Record<string, string> = {};
  if (view.crossOrigin === 'use-credentials') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  if (view.referrerPolicy !== undefined) {
    headers['Referrer-Policy'] = view.referrerPolicy;
  }
  return headers;
}

// Expand a `srcSet` descriptor list into scaled sources, falling back to `src` for
// the 1x slot when srcSet omits it. Direct port of getImageSourcesFromImageProps'
// srcSet branch (ImageSourceUtils.js:48). Invalid scale tokens are skipped, matching
// RN's parse-and-warn behavior.
function expandSrcSet(
  srcSet: string,
  view: IImageViewProps,
  headers: Record<string, string>,
): IImageSource[] {
  const sources: IImageSource[] = [];
  let useSrcForDefaultScale = true;
  for (const entry of srcSet.split(', ')) {
    const [uri, xScale = '1x'] = entry.split(' ');
    if (!xScale.endsWith('x')) {
      dlog(`Image srcSet: unsupported scale token "${xScale}", skipping`);
      continue;
    }
    const scale = parseInt(xScale.slice(0, -1), 10);
    if (Number.isNaN(scale)) continue;
    if (scale === 1) useSrcForDefaultScale = false;
    sources.push({ uri, scale, width: view.width, height: view.height, ...{ headers } });
  }
  if (useSrcForDefaultScale && view.src !== undefined) {
    sources.push({
      uri: view.src,
      scale: 1,
      width: view.width,
      height: view.height,
      ...{ headers },
    });
  }
  if (sources.length === 0) dlog('Image srcSet: produced no valid sources');
  return sources;
}

// Resolve the native `source` array from whichever of source / src / srcSet the
// caller provided. Mirrors ImageSourceUtils.js getImageSourcesFromImageProps:
// srcSet wins, then src, then a header-decorated source, then the plain source.
// Always returns the array shape native expects (the same contract normalizeSource
// guarantees), so the component never sends a bare object.
function resolveSourceArray(view: IImageViewProps): unknown[] {
  const headers = headersFromAliases(view);
  if (view.srcSet !== undefined) {
    return expandSrcSet(view.srcSet, view, headers);
  }
  if (view.src !== undefined) {
    return [{ uri: view.src, width: view.width, height: view.height, ...{ headers } }];
  }
  if (view.source === undefined) {
    dlog('Image: no source / src / srcSet provided');
    return [];
  }
  const sources = normalizeSource(view.source);
  // A header-decorated single object source gets the headers merged in, per RN's
  // `source.uri && headers` branch; the array/number shapes pass through untouched.
  if (Object.keys(headers).length > 0 && sources.length === 1) {
    const [only] = sources;
    if (typeof only === 'object' && only !== null && typeof Reflect.get(only, 'uri') === 'string') {
      return [{ ...only, headers }];
    }
  }
  return sources;
}

function readStyleString(
  style: IStyleProp<IViewStyle> | undefined,
  key: 'resizeMode' | 'tintColor',
): string | undefined {
  if (style === undefined) return undefined;
  // style is a StyleProp (possibly a nested array), so flatten before reading a key.
  const flat = flattenStyle(style);
  const value = Object.hasOwn(flat, key) ? flat[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

// Resolve an asset source and read its single uri. RN forwards the Android
// loading indicator as a bare uri string (`loadingIndicatorSrc`), not the
// array shape the main source uses, so we resolve and pluck the uri.
function readSourceUri(source: IImageSourceProp): string | undefined {
  const [resolved] = normalizeSource(source);
  if (typeof resolved === 'object' && resolved !== null) {
    const uri = Reflect.get(resolved, 'uri');
    if (typeof uri === 'string') return uri;
  }
  return undefined;
}

// --- Image static methods (RN's Image.getSize / prefetch / queryCache / …) ---
//
// These mirror RN's iOS Image statics (Libraries/Image/Image.ios.js), which
// delegate to the `ImageLoader` native (Turbo)Module declared in
// NativeImageLoaderIOS.js. NOTE the asymmetry in that spec: `getSize` resolves a
// `[width, height]` ARRAY, while `getSizeWithHeaders` resolves a `{width, height}`
// OBJECT, both are guarded below before reading. The native result crosses the
// I/O boundary as `unknown`; we never cast it, we narrow its shape.

export type IImageSize = {
  width: number;
  height: number;
};

export type IImageCacheStatus = 'memory' | 'disk' | 'disk/memory';

type ISizeSuccess = (width: number, height: number) => void;
type ISizeFailure = (error: unknown) => void;

// The `ImageLoader` native module surface we consume. Promise-based on the New
// Architecture (the spec returns Promises directly). One name, two signatures:
// Android's `prefetchImage` takes a second `requestId` arg (abortRequest keys off
// it) via NativeImageLoaderAndroid.js, while iOS takes only `uri`. iOS ignores the
// extra arg, so we always pass a requestId and stay parity-correct on both.
// `abortRequest` cancels an in-flight prefetch keyed by its requestId. It is on
// the Android spec only (NativeImageLoaderAndroid.js); iOS's ImageLoader has no
// such method, so the call is best-effort and silently no-ops where unsupported.
type INativeImageLoader = {
  getSize(uri: string): Promise<unknown>;
  getSizeWithHeaders(uri: string, headers: Record<string, string>): Promise<unknown>;
  // iOS takes ONLY the uri (NativeImageLoaderIOS); Android adds the requestId so abortRequest can
  // key off it. The arg is optional here so the iOS call passes exactly one — a second arg makes the
  // bridgeless TurboModule throw "Exception in HostFunction".
  prefetchImage(uri: string, requestId?: number): Promise<unknown>;
  abortRequest?(requestId: number): void;
  queryCache(uris: string[]): Promise<unknown>;
};

// The iOS native module name RN registers this under (NativeImageLoaderIOS.js
// resolves `TurboModuleRegistry.getEnforcing<Spec>('ImageLoader')`). Per the
// symbiote invariant, a module name is only provable on a real host (a headless
// fake answers to any name); this iOS name is device-verify-pending. See
// .docs/native-module-platform-routing.md.
const IMAGE_LOADER_MODULE = 'ImageLoader';

let imageLoaderModule: INativeImageLoader | null | undefined;

function getImageLoader(): INativeImageLoader | null {
  if (imageLoaderModule === undefined) {
    imageLoaderModule = getNativeModule<INativeImageLoader>(IMAGE_LOADER_MODULE);
    dlog(`Image: ImageLoader module ${imageLoaderModule ? 'resolved' : 'NOT resolved (null)'}`);
  }
  return imageLoaderModule;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

// Narrow native's getSize result. The spec resolves a `[width, height]` array,
// but tolerate a `{width, height}` object too (getSizeWithHeaders uses that shape).
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

// Resolve image dimensions, optionally via success/failure callbacks. Always
// returns the Promise too (RN returns void when a callback is passed, but a
// promise-and-callback shape is friendlier and a strict superset).
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

// Android keys an in-flight prefetch by a monotonic requestId (so abortRequest can
// cancel it); RN's Image.android.js generates the same way. iOS ignores the arg.
let prefetchRequestId = 0;

// Download a remote image into the disk cache. Resolves to whether it succeeded.
// `callback` receives the requestId (RN's Image.android.js shape) so the caller
// can later pass it to abortPrefetch.
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

// Cancel an in-flight prefetch by the requestId prefetch handed back. Android
// only (mirrors Image.android.js -> NativeImageLoaderAndroid.abortRequest); a
// missing abortRequest (iOS, headless) is a no-op rather than a throw.
function abortPrefetch(requestId: number): void {
  const loader = getImageLoader();
  if (loader === null || typeof loader.abortRequest !== 'function') {
    dlog(`Image.abortPrefetch(${requestId}): no abortRequest on this host, ignoring`);
    return;
  }
  loader.abortRequest(requestId);
}

// Narrow native's queryCache result: an object mapping each known uri to its
// cache status. Unknown statuses are dropped rather than trusted blindly.
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
      // rejection here is a JS↔native boundary fault: log whether the method is even callable and
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

// PURE JS: run the currently-installed source resolver (the same machinery the
// Image component uses via normalizeSource). RN's resolveAssetSource turns a
// require() asset id into {uri, scale, …}; the app injects the real one with
// setImageSourceResolver, and this exposes its output to callers directly.
function resolveAssetSource(source: IImageSourceProp): unknown {
  return resolveSource(source);
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

// The pre-resolved inputs renderImage paints from (mirrors ISwitchViewProps /
// IActivityIndicatorViewProps). The adapter narrows the typed transform fields (source
// resolution, the width/height fold, resizeMode/tintColor) and folds everything else
// (events, blurRadius, capInsets, the already-folded accessibility* props, testID) into
// `passthrough`, which lands on the host image untouched. The W3C source aliases
// (src / srcSet / crossOrigin / referrerPolicy) are typed fields consumed here, NOT
// passthrough, so they never reach Fabric raw: native sees only the resolved `source` array.
export type IImageViewProps = {
  source?: IImageSourceProp;
  defaultSource?: IImageSourceProp;
  loadingIndicatorSource?: IImageSourceProp;
  style?: IStyleProp<IViewStyle>;
  resizeMode?: IResizeMode;
  tintColor?: string;
  src?: string;
  srcSet?: string;
  alt?: string;
  width?: number;
  height?: number;
  crossOrigin?: 'anonymous' | 'use-credentials';
  referrerPolicy?: string;
  passthrough: Record<string, unknown>;
};

export function renderImage(view: IImageViewProps): IDescriptor {
  // `width` / `height` aliases fold into style (ImageProps.js:195,202); explicit
  // style keys win, matching RN's `{width, height}, ...style` ordering.
  const foldedStyle =
    view.width === undefined && view.height === undefined
      ? view.style
      : [{ width: view.width, height: view.height }, view.style];

  const mapped: Record<string, unknown> = {
    ...view.passthrough,
    style: foldedStyle,
    source: resolveSourceArray(view),
    resizeMode: view.resizeMode ?? readStyleString(view.style, 'resizeMode'),
    tintColor: view.tintColor ?? readStyleString(view.style, 'tintColor'),
  };
  // `alt` is the accessibility text: it sets accessibilityLabel and marks the image
  // accessible (Image.ios.js / Image.android.js: alt -> accessibilityLabel + accessible).
  // An explicit accessibilityLabel (already folded into passthrough) still wins.
  if (view.alt !== undefined) {
    if (mapped.accessibilityLabel === undefined) mapped.accessibilityLabel = view.alt;
    mapped.accessible = true;
  }
  if (view.defaultSource !== undefined) mapped.defaultSource = normalizeSource(view.defaultSource);
  if (view.loadingIndicatorSource !== undefined) {
    mapped.loadingIndicatorSrc = readSourceUri(view.loadingIndicatorSource);
  }

  dlog('Image -> RCTImageView');
  return el('symbiote-image', mapped);
}
