// The Image primitive. Like View/Text it produces a host element the reconciler
// maps to a Fabric view name (`RCTImageView`). What's special: `source` must
// reach native as an ARRAY of {uri, scale?, width?, height?}, and `require()`
// asset sources arrive as opaque numbers that RN resolves to a uri. Resolution
// is RN-specific, so we inject it (setImageSourceResolver) to keep this module
// importable in plain Node, where react-native is absent.

import { createElement, type FC } from 'react'
import { dlog, getNativeModule, type SymbioteEvent } from '@symbiote/shared'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

type ImageEventHandler = (event: SymbioteEvent) => void

export type ResizeMode = 'cover' | 'contain' | 'stretch' | 'repeat' | 'center'

export interface ImageSource {
  uri?: string
  scale?: number
  width?: number
  height?: number
}

// A source is either a structured object/array (remote or pre-resolved) or an
// opaque asset id (the number `require('./x.png')` returns) the resolver expands.
export type ImageSourceProp = ImageSource | ImageSource[] | number

// iOS resizable-image cap insets: the unscaled border kept fixed while the
// center stretches (a 9-patch on iOS). Forwarded as-is; native understands it.
export interface ImageCapInsets {
  top: number
  left: number
  bottom: number
  right: number
}

// Android decode strategy: 'auto' lets RN pick, 'resize' downsamples at decode
// (cheaper memory), 'scale' decodes full then scales.
export type ResizeMethod = 'auto' | 'resize' | 'scale'

export interface ImageProps extends AccessibilityProps, AriaProps {
  source: ImageSourceProp
  defaultSource?: ImageSourceProp
  // Android-only: shown while the main source loads. Mutually exclusive with
  // defaultSource (RN warns if both are set). Resolved like any asset source.
  loadingIndicatorSource?: ImageSourceProp
  style?: ViewStyle
  resizeMode?: ResizeMode
  // Android decode-time scaling strategy.
  resizeMethod?: ResizeMethod
  tintColor?: string
  blurRadius?: number
  // iOS: cap insets for a resizable (stretchable-center) image.
  capInsets?: ImageCapInsets
  // Android: cross-fade duration in ms when the image appears.
  fadeDuration?: number
  onLoadStart?: ImageEventHandler
  onLoad?: ImageEventHandler
  onLoadEnd?: ImageEventHandler
  onError?: ImageEventHandler
  onProgress?: ImageEventHandler
  onPartialLoad?: ImageEventHandler
}

// Default resolver: identity. RN's resolveAssetSource (which turns a require()
// number into {uri, scale, width, height}) is wired in by the app at startup.
let resolveSource: (source: unknown) => unknown = (source) => source

export function setImageSourceResolver(resolve: (source: unknown) => unknown): void {
  resolveSource = resolve
}

// Resolve the source, then normalize to the array shape native expects. A single
// object/number becomes a one-element array; an already-array source passes through.
function normalizeSource(source: ImageSourceProp): unknown[] {
  const resolved = resolveSource(source)
  const sources = Array.isArray(resolved) ? resolved : [resolved]
  dlog(`Image source resolved to ${JSON.stringify(sources)}`)
  return sources
}

function readStyleString(style: ViewStyle | undefined, key: 'resizeMode' | 'tintColor'): string | undefined {
  if (style === undefined) return undefined
  const value = Object.hasOwn(style, key) ? Reflect.get(style, key) : undefined
  return typeof value === 'string' ? value : undefined
}

// Resolve an asset source and read its single uri. RN forwards the Android
// loading indicator as a bare uri string (`loadingIndicatorSrc`), not the
// array shape the main source uses, so we resolve and pluck the uri.
function readSourceUri(source: ImageSourceProp): string | undefined {
  const [resolved] = normalizeSource(source)
  if (typeof resolved === 'object' && resolved !== null) {
    const uri = Reflect.get(resolved, 'uri')
    if (typeof uri === 'string') return uri
  }
  return undefined
}

const ImageComponent: FC<ImageProps> = (rawProps) => {
  // Image is its own host element (not a View wrapper), so it folds aria/role here.
  const props = resolveAccessibilityProps(rawProps)
  const { source, defaultSource, loadingIndicatorSource, style, resizeMode, tintColor, ...rest } = props

  const mapped: Record<string, unknown> = {
    ...rest,
    style,
    source: normalizeSource(source),
    resizeMode: resizeMode ?? readStyleString(style, 'resizeMode'),
    tintColor: tintColor ?? readStyleString(style, 'tintColor'),
  }
  if (defaultSource !== undefined) mapped.defaultSource = normalizeSource(defaultSource)
  if (loadingIndicatorSource !== undefined) {
    mapped.loadingIndicatorSrc = readSourceUri(loadingIndicatorSource)
  }

  return createElement('symbiote-image', mapped)
}

// --- Image static methods (RN's Image.getSize / prefetch / queryCache / …) ---
//
// These mirror RN's iOS Image statics (Libraries/Image/Image.ios.js), which
// delegate to the `ImageLoader` native (Turbo)Module declared in
// NativeImageLoaderIOS.js. NOTE the asymmetry in that spec: `getSize` resolves a
// `[width, height]` ARRAY, while `getSizeWithHeaders` resolves a `{width, height}`
// OBJECT — both are guarded below before reading. The native result crosses the
// I/O boundary as `unknown`; we never cast it, we narrow its shape.

export interface ImageSize {
  width: number
  height: number
}

export type ImageCacheStatus = 'memory' | 'disk' | 'disk/memory'

type SizeSuccess = (width: number, height: number) => void
type SizeFailure = (error: unknown) => void

// The `ImageLoader` native module surface we consume. Promise-based on the New
// Architecture (the spec returns Promises directly). One name, two signatures:
// Android's `prefetchImage` takes a second `requestId` arg (abortRequest keys off
// it) — NativeImageLoaderAndroid.js — while iOS takes only `uri`. iOS ignores the
// extra arg, so we always pass a requestId and stay parity-correct on both.
// `abortRequest` cancels an in-flight prefetch keyed by its requestId. It is on
// the Android spec only (NativeImageLoaderAndroid.js); iOS's ImageLoader has no
// such method, so the call is best-effort and silently no-ops where unsupported.
interface NativeImageLoader {
  getSize(uri: string): Promise<unknown>
  getSizeWithHeaders(uri: string, headers: Record<string, string>): Promise<unknown>
  prefetchImage(uri: string, requestId: number): Promise<unknown>
  abortRequest?(requestId: number): void
  queryCache(uris: string[]): Promise<unknown>
}

// The iOS native module name RN registers this under (NativeImageLoaderIOS.js
// resolves `TurboModuleRegistry.getEnforcing<Spec>('ImageLoader')`). Per the
// symbiote invariant, a module name is only provable on a real host (a headless
// fake answers to any name); this iOS name is device-verify-pending. See
// .docs/native-module-platform-routing.md.
const IMAGE_LOADER_MODULE = 'ImageLoader'

let imageLoaderModule: NativeImageLoader | null | undefined

function getImageLoader(): NativeImageLoader | null {
  if (imageLoaderModule === undefined) {
    imageLoaderModule = getNativeModule<NativeImageLoader>(IMAGE_LOADER_MODULE)
    dlog(`Image: ImageLoader module ${imageLoaderModule ? 'resolved' : 'NOT resolved (null)'}`)
  }
  return imageLoaderModule
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}

// Narrow native's getSize result. The spec resolves a `[width, height]` array,
// but tolerate a `{width, height}` object too (getSizeWithHeaders uses that shape).
function toImageSize(result: unknown): ImageSize {
  if (Array.isArray(result) && isNumber(result[0]) && isNumber(result[1])) {
    return { width: result[0], height: result[1] }
  }
  if (typeof result === 'object' && result !== null) {
    const width = Reflect.get(result, 'width')
    const height = Reflect.get(result, 'height')
    if (isNumber(width) && isNumber(height)) return { width, height }
  }
  throw new Error(`Image: unexpected size result from native: ${JSON.stringify(result)}`)
}

function requireLoader(method: string): NativeImageLoader {
  const loader = getImageLoader()
  if (loader === null) {
    throw new Error(
      `Image.${method}: ImageLoader native module is not available ` +
        '(running headless or not linked on this host).',
    )
  }
  return loader
}

// Resolve image dimensions, optionally via success/failure callbacks. Always
// returns the Promise too (RN returns void when a callback is passed, but a
// promise-and-callback shape is friendlier and a strict superset).
function getSize(uri: string, success?: SizeSuccess, failure?: SizeFailure): Promise<ImageSize> {
  const promise = Promise.resolve()
    .then(() => requireLoader('getSize').getSize(uri))
    .then(toImageSize)
  if (typeof success === 'function') {
    promise.then((size) => success(size.width, size.height)).catch((error: unknown) => {
      if (typeof failure === 'function') failure(error)
      else dlog(`Image.getSize failed for ${uri}: ${String(error)}`)
    })
  }
  return promise
}

function getSizeWithHeaders(
  uri: string,
  headers: Record<string, string>,
  success?: SizeSuccess,
  failure?: SizeFailure,
): Promise<ImageSize> {
  const promise = Promise.resolve()
    .then(() => requireLoader('getSizeWithHeaders').getSizeWithHeaders(uri, headers))
    .then(toImageSize)
  if (typeof success === 'function') {
    promise.then((size) => success(size.width, size.height)).catch((error: unknown) => {
      if (typeof failure === 'function') failure(error)
      else dlog(`Image.getSizeWithHeaders failed for ${uri}: ${String(error)}`)
    })
  }
  return promise
}

// Android keys an in-flight prefetch by a monotonic requestId (so abortRequest can
// cancel it); RN's Image.android.js generates the same way. iOS ignores the arg.
let prefetchRequestId = 0

// Download a remote image into the disk cache. Resolves to whether it succeeded.
// `callback` receives the requestId (RN's Image.android.js shape) so the caller
// can later pass it to abortPrefetch.
function prefetch(uri: string, callback?: (requestId: number) => void): Promise<boolean> {
  prefetchRequestId += 1
  const requestId = prefetchRequestId
  if (typeof callback === 'function') callback(requestId)
  return Promise.resolve()
    .then(() => requireLoader('prefetch').prefetchImage(uri, requestId))
    .then((result) => result === true)
    .catch((error: unknown) => {
      dlog(`Image.prefetch failed for ${uri}: ${String(error)}`)
      throw error
    })
}

// Cancel an in-flight prefetch by the requestId prefetch handed back. Android
// only (mirrors Image.android.js -> NativeImageLoaderAndroid.abortRequest); a
// missing abortRequest (iOS, headless) is a no-op rather than a throw.
function abortPrefetch(requestId: number): void {
  const loader = getImageLoader()
  if (loader === null || typeof loader.abortRequest !== 'function') {
    dlog(`Image.abortPrefetch(${requestId}): no abortRequest on this host, ignoring`)
    return
  }
  loader.abortRequest(requestId)
}

// Narrow native's queryCache result: an object mapping each known uri to its
// cache status. Unknown statuses are dropped rather than trusted blindly.
const CACHE_STATUS: Record<string, ImageCacheStatus> = {
  memory: 'memory',
  disk: 'disk',
  'disk/memory': 'disk/memory',
}

function toCacheRecord(result: unknown): Record<string, ImageCacheStatus> {
  const record: Record<string, ImageCacheStatus> = {}
  if (typeof result !== 'object' || result === null) return record
  for (const key of Object.keys(result)) {
    const value = Reflect.get(result, key)
    if (typeof value === 'string' && Object.hasOwn(CACHE_STATUS, value)) {
      record[key] = CACHE_STATUS[value]
    }
  }
  return record
}

function queryCache(uris: string[]): Promise<Record<string, ImageCacheStatus>> {
  return Promise.resolve()
    .then(() => requireLoader('queryCache').queryCache(uris))
    .then(toCacheRecord)
    .catch((error: unknown) => {
      dlog(`Image.queryCache failed: ${String(error)}`)
      throw error
    })
}

// PURE JS: run the currently-installed source resolver (the same machinery the
// Image component uses via normalizeSource). RN's resolveAssetSource turns a
// require() asset id into {uri, scale, …}; the app injects the real one with
// setImageSourceResolver, and this exposes its output to callers directly.
function resolveAssetSource(source: ImageSourceProp): unknown {
  return resolveSource(source)
}

interface ImageStatics {
  getSize: typeof getSize
  getSizeWithHeaders: typeof getSizeWithHeaders
  prefetch: typeof prefetch
  abortPrefetch: typeof abortPrefetch
  queryCache: typeof queryCache
  resolveAssetSource: typeof resolveAssetSource
}

export type ImageWithStatics = FC<ImageProps> & ImageStatics

// Attach the statics to the component value so callers do `Image.getSize(...)`,
// exactly like RN. The component itself is unchanged.
export const Image: ImageWithStatics = Object.assign(ImageComponent, {
  getSize,
  getSizeWithHeaders,
  prefetch,
  abortPrefetch,
  queryCache,
  resolveAssetSource,
})
