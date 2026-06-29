// Image: the Vue lifecycle half. The full fold (source / src / srcSet resolution, the
// width/height → style fold, resizeMode/tintColor, alt → accessibility, and the native source
// array) lives framework-agnostic in @symbiote/components and is shared verbatim with React;
// here Vue only narrows the untyped attrs into renderImage's typed view, folds aria/role, bridges
// the Descriptor to a vnode, and carries the Image statics (getSize / prefetch / queryCache / …).
//
// FUNCTIONAL, not a stateful defineComponent: Image is render-only, and Animated.Image wraps it
// via createAnimatedComponent, which captures the host
// node through a ref that only falls through on a functional component (a defineComponent's ref
// resolves to a useless component proxy; see components.ts). So Image must stay functional.
//
// Inputs arrive as attrs (untyped). The typed transform fields are narrowed with runtime guards;
// the forward-only rest (events, blurRadius, capInsets, testID, accessibility*) is typed as the
// a11y intersection so resolveAccessibilityProps folds aria-* into accessibility* over it.

import { type FunctionalComponent } from '@vue/runtime-core';
import {
  imageStatics,
  renderImage,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
  type IImageSourceProp,
  type IImageStatics,
  type IResizeMode,
} from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '@symbiote/engine';
import { descriptorToVue } from './descriptor-to-vue';
import { normalizeVueAttrs } from './normalize-attrs';

export { setImageSourceResolver } from '@symbiote/components';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from '@symbiote/components';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

// A source is a structured object/array or an opaque require() id (number) the engine's injected
// resolver expands; any object/array/number is a valid source to forward (IImageSource is all-optional).
function asSource(value: unknown): IImageSourceProp | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null) return value;
  return undefined;
}

function isResizeMode(value: unknown): value is IResizeMode {
  return (
    value === 'cover' ||
    value === 'contain' ||
    value === 'stretch' ||
    value === 'repeat' ||
    value === 'center'
  );
}

function asResizeMode(value: unknown): IResizeMode | undefined {
  return isResizeMode(value) ? value : undefined;
}

function asCrossOrigin(value: unknown): 'anonymous' | 'use-credentials' | undefined {
  return value === 'anonymous' || value === 'use-credentials' ? value : undefined;
}

// Object OR array (a style list) passes through; readStyleString flattens either, and arrays must
// survive so `style={[a, b]}` reaches Fabric (parity with React, which preserves the StyleProp).
function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

// The typed transform fields renderImage folds; everything else forwards via passthrough.
const HANDLED_ATTRS = [
  'source',
  'defaultSource',
  'loadingIndicatorSource',
  'style',
  'resizeMode',
  'tintColor',
  'src',
  'srcSet',
  'alt',
  'width',
  'height',
  'crossOrigin',
  'referrerPolicy',
];

// The forwarded bag carries the aria/role aliases, so it is typed as the a11y intersection (a
// genuine narrowing: the accumulator is BUILT at that type, not cast) so resolveAccessibilityProps
// can fold aria-* into accessibility* before it reaches the host image.
type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

const ImageComponent: FunctionalComponent = (_props, { attrs: rawAttrs }) => {
  const attrs = normalizeVueAttrs(rawAttrs);
  return descriptorToVue(
    renderImage({
      source: asSource(attrs.source),
      defaultSource: asSource(attrs.defaultSource),
      loadingIndicatorSource: asSource(attrs.loadingIndicatorSource),
      style: isStyleProp(attrs.style) ? attrs.style : undefined,
      resizeMode: asResizeMode(attrs.resizeMode),
      tintColor: asString(attrs.tintColor),
      src: asString(attrs.src),
      srcSet: asString(attrs.srcSet),
      alt: asString(attrs.alt),
      width: asNumber(attrs.width),
      height: asNumber(attrs.height),
      crossOrigin: asCrossOrigin(attrs.crossOrigin),
      referrerPolicy: asString(attrs.referrerPolicy),
      passthrough: resolveAccessibilityProps(forwardAttrs(attrs)),
    }),
  );
};
ImageComponent.displayName = 'Image';
ImageComponent.inheritAttrs = false;

// Statics attached like RN (Image.getSize / prefetch / …), shared verbatim with React via
// the engine-resolved imageStatics. The component value doubles as the statics namespace.
export const Image: FunctionalComponent & IImageStatics = Object.assign(
  ImageComponent,
  imageStatics,
);
