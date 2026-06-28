// ImageBackground: the Vue lifecycle half. The composition (the absolute-fill Image behind the
// children, the dimension-proxy + style-merge math) lives framework-agnostic in
// @symbiote/components/renderImageBackground and is shared verbatim with React; here Vue only
// narrows the untyped attrs into the typed Image view, folds aria/role, bridges the Descriptor to
// vnodes, and appends the slot children ON TOP of the inner image.
//
// FUNCTIONAL, not a stateful defineComponent: ImageBackground is render-only (no state). Inputs
// arrive as attrs (untyped); the typed transform fields are narrowed with runtime guards, the
// forward-only rest is folded so resolveAccessibilityProps lands aria-* onto the inner image.

import { h, type FunctionalComponent, type VNode } from '@vue/runtime-core';
import {
  renderImageBackground,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
  type IDescriptorChild,
  type IImageProps,
  type IImageSourceProp,
  type IResizeMode,
} from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '@symbiote/engine';
import { descriptorToVue } from './descriptor-to-vue';
import { normalizeVueAttrs } from './normalize-attrs';

// The Vue-facing prop surface. React's IImageBackgroundProps carries `children?: ReactNode`; Vue
// takes children via slots, so this mirrors the same forwarding surface minus that. Every Image
// prop flows onto the inner image; `style` is the WRAPPER View style, `imageStyle` the inner one.
export interface IImageBackgroundProps extends Omit<IImageProps, 'style'> {
  style?: IStyleProp<IViewStyle>;
  imageStyle?: IStyleProp<IViewStyle>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

// A source is a structured object/array or an opaque require() id (number) the engine's injected
// resolver expands; any object/array/number is a valid source to forward.
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

// Object OR array (a style list) passes through: the engine flattens either; primitives degrade
// to undefined (parity with React, which preserves the StyleProp).
function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

function toChildVNode(child: IDescriptorChild): VNode | string {
  return typeof child === 'string' ? child : descriptorToVue(child);
}

// `style` is the WRAPPER View style; `imageStyle` targets the inner Image. The image transform
// fields are consumed by the source/style fold; everything else forwards onto the inner image.
const HANDLED_ATTRS = [
  'style',
  'imageStyle',
  'source',
  'defaultSource',
  'loadingIndicatorSource',
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
// genuine narrowing: the accumulator is BUILT at that type) so resolveAccessibilityProps folds
// aria-* into accessibility* before it reaches the inner image.
type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

const ImageBackgroundComponent: FunctionalComponent = (_props, { attrs: rawAttrs, slots }) => {
  const attrs = normalizeVueAttrs(rawAttrs);
  const wrapper = renderImageBackground({
    style: isStyleProp(attrs.style) ? attrs.style : undefined,
    imageStyle: isStyleProp(attrs.imageStyle) ? attrs.imageStyle : undefined,
    image: {
      source: asSource(attrs.source),
      defaultSource: asSource(attrs.defaultSource),
      loadingIndicatorSource: asSource(attrs.loadingIndicatorSource),
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
    },
  });

  // wrapper = symbiote-view > [imageDescriptor]; the slot children paint AFTER the image (on top).
  const slotChildren = slots.default !== undefined ? slots.default() : [];
  return h(wrapper.type, { ...wrapper.props, key: wrapper.key }, [
    ...wrapper.children.map(toChildVNode),
    ...slotChildren,
  ]);
};
ImageBackgroundComponent.displayName = 'ImageBackground';
ImageBackgroundComponent.inheritAttrs = false;

export const ImageBackground = ImageBackgroundComponent;
