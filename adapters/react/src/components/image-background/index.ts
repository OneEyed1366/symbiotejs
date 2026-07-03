// ImageBackground: the React lifecycle half. The composition (the absolute-fill Image behind
// the children, the dimension-proxy + style-merge math) lives framework-agnostic in
// @symbiotejs/components/renderImageBackground and is shared verbatim with Vue; here React only
// folds aria/role, splits the typed Image transform fields from the forward-only rest, bridges
// the Descriptor to elements, and appends the user children ON TOP of the inner image.

import { createElement, type ReactElement, type ReactNode } from 'react';
import { resolveClassName } from '@symbiotejs/engine';
import {
  renderImageBackground,
  resolveAccessibilityProps,
  type IDescriptorChild,
  type IImageProps,
} from '@symbiotejs/components';
import { descriptorToReact } from '../../descriptor-to-react';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

// Inherit every forwarding Image prop (source, defaultSource, loadingIndicatorSource,
// resizeMode, resizeMethod, tintColor, blurRadius, capInsets, fadeDuration, load events); they
// flow onto the inner Image. `style` is overridden to mean the WRAPPER View's style;
// `imageStyle` targets the inner Image.
export interface IImageBackgroundProps extends Omit<IImageProps, 'style'> {
  // Wrapper View style; its width/height are reapplied to the inner Image.
  style?: IStyleProp<IViewStyle>;
  // Style merged onto the inner absolute-fill Image, after the proxied dimensions. A bare
  // string resolves through the shared style registry, like `className` on the wrapper below.
  imageStyle?: IStyleProp<IViewStyle> | string;
  // Applies to the wrapper View, mirroring `style` above — resolves through the shared style
  // registry.
  className?: string;
  children?: ReactNode;
}

function toChild(child: IDescriptorChild): ReactElement | string {
  return typeof child === 'string' ? child : descriptorToReact(child);
}

export function ImageBackground(props: IImageBackgroundProps): ReactElement {
  // className is pulled out here, like style, and applied to the WRAPPER element below — left
  // in ...imageProps it would fall into `passthrough` and land on the INNER Image instead
  // (renderImageBackground's `image.passthrough`, not the wrapper's own props).
  const { children, style, imageStyle, className, ...imageProps } = props;
  // imageStyle targets the INNER image (renderImageBackground's own field), unlike className
  // above which lands on the wrapper — resolve the string here, before it flows in below.
  const resolvedImageStyle =
    typeof imageStyle === 'string' ? resolveClassName(imageStyle) : imageStyle;
  // The W3C source aliases (src/srcSet/crossOrigin/referrerPolicy) and width/height become typed
  // Image view fields (consumed by the source/style fold), so they never leak to Fabric via
  // passthrough; everything else (events, blurRadius, the folded accessibility*, testID) forwards.
  const {
    source,
    defaultSource,
    loadingIndicatorSource,
    resizeMode,
    tintColor,
    src,
    srcSet,
    alt,
    width,
    height,
    crossOrigin,
    referrerPolicy,
    ...passthrough
  } = resolveAccessibilityProps(imageProps);

  const wrapper = renderImageBackground({
    style,
    imageStyle: resolvedImageStyle,
    image: {
      source,
      defaultSource,
      loadingIndicatorSource,
      resizeMode,
      tintColor,
      src,
      srcSet,
      alt,
      width,
      height,
      crossOrigin,
      referrerPolicy,
      passthrough,
    },
  });

  // wrapper = symbiote-view > [imageDescriptor]; the user children paint AFTER the image (on top).
  return createElement(
    wrapper.type,
    { key: wrapper.key, ...wrapper.props, className },
    ...wrapper.children.map(toChild),
    children,
  );
}
