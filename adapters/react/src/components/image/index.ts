import { type FC } from 'react';
import {
  imageStatics,
  renderImage,
  resolveAccessibilityProps,
  type IImageStatics,
  type IImageProps as IImageBaseProps,
} from '@symbiotejs/components';
import { descriptorToReact } from '../../descriptor-to-react';

// React's own idiom for a registered class name (mirrors IViewProps.className) — a per-adapter
// field per <prop_types_split_agnostic_vs_per_adapter>, not part of the shared agnostic base.
// Not destructured below, so it falls into `...passthrough` like any other forward-only prop and
// resolves through the shared style registry the same way View's className does.
export type IImageProps = IImageBaseProps & { className?: string };

// renderImage takes a pre-resolved view + passthrough (the ISwitchViewProps shape), so the
// adapter folds aria/role and splits the typed transform fields from the forward-only rest.
// The W3C source aliases (src/srcSet/crossOrigin/referrerPolicy) and width/height become typed
// view fields (consumed by the source/style fold), so they never leak to Fabric via passthrough.
const ImageComponent: FC<IImageProps> = rawProps => {
  const {
    source,
    defaultSource,
    loadingIndicatorSource,
    style,
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
  } = resolveAccessibilityProps(rawProps);
  return descriptorToReact(
    renderImage({
      source,
      defaultSource,
      loadingIndicatorSource,
      style,
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
    }),
  );
};

export type IImageWithStatics = FC<IImageProps> & IImageStatics;

export const Image: IImageWithStatics = Object.assign(ImageComponent, imageStatics);

export { setImageSourceResolver } from '@symbiotejs/components';
export type {
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from '@symbiotejs/components';
