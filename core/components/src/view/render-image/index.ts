import {
  dlog,
  flattenStyle,
  resolveImageSource,
  type IImageSource,
  type IImageSourceProp,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import type { IAccessibilityProps, IAriaProps } from '../../accessibility-props';
import { el, type IDescriptor } from '../../descriptor';

export type { IImageSource, IImageSourceProp };

type IImageEventHandler = (event: ISymbioteEvent) => void;

export type IResizeMode = 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';

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

// Resolve the source, then normalize to the array shape native expects. A single
// object/number becomes a one-element array; an already-array source passes through.
function normalizeSource(source: IImageSourceProp): unknown[] {
  const resolved = resolveImageSource(source);
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
