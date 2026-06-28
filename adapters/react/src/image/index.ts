import { type FC } from 'react';
import {
  imageStatics,
  renderImage,
  resolveAccessibilityProps,
  type IImageStatics,
  type IImageProps,
} from '@symbiote/components';
import { descriptorToReact } from '../descriptor-to-react';

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

export { setImageSourceResolver } from '@symbiote/components';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from '@symbiote/components';
