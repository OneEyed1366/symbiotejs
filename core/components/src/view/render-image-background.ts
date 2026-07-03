// ImageBackground: the render half (framework-agnostic). Pure JS composition, no native
// component of its own (mirrors react-native/Libraries/Image/ImageBackground.js): an outer
// View receives the wrapper `style`; an absolutely-filled Image sits behind it; the user's
// `children` paint on top (as siblings AFTER the image in the wrapper's child order, injected
// by the adapter). Shared verbatim across adapters: React and Vue both bridge this Descriptor.
//
// The inner Image is positioned absolute-fill and has the wrapper's width/height reapplied:
// RN's Image overwrites its own width/height from the source's intrinsic size, which would
// fight the wrapper's explicit dimensions, so we proxy them back onto the Image so it fills
// the box. `imageStyle` wins last.

import {
  dlog,
  flattenStyle,
  type IDimensionValue,
  type IStyleProp,
  type IViewStyle,
} from '@symbiotejs/engine';
import { el, type IDescriptor } from '../descriptor';
import { renderImage, type IImageViewProps } from './render-image';

// The inner Image's positioning: absolute-fill behind the wrapper's children.
const IMAGE_BACKGROUND_ABSOLUTE_FILL: IViewStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

// Read one explicit dimension off the (already-flattened) wrapper style. A dp number or a
// percentage string is a valid IDimensionValue; anything else (auto / undefined) yields undefined.
function readDimension(
  style: Record<string, unknown>,
  key: 'width' | 'height',
): IDimensionValue | undefined {
  const value = Object.hasOwn(style, key) ? Reflect.get(style, key) : undefined;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

// The pre-resolved inputs renderImageBackground paints from. `image` is the full Image view
// (the same view/passthrough contract renderImage consumes); its `style` is overridden here by
// the absolute-fill + proxied-dimension merge, so the caller need not pre-compute it.
export type IImageBackgroundViewProps = {
  // Wrapper View style; its width/height are reapplied to the inner Image.
  style?: IStyleProp<IViewStyle>;
  // Style merged onto the inner absolute-fill Image, after the proxied dimensions.
  imageStyle?: IStyleProp<IViewStyle>;
  // Every forwarding Image prop (source, resizeMode, events, …) the adapter already split.
  image: IImageViewProps;
};

export function renderImageBackground(view: IImageBackgroundViewProps): IDescriptor {
  // Flatten only to read the wrapper's explicit dimensions; RN copies these onto the Image so
  // it fills the box rather than collapsing to the source's intrinsic size. `imageStyle` last.
  const flattenedWrapper = flattenStyle(view.style);
  const imageMergedStyle: IStyleProp<IViewStyle> = [
    IMAGE_BACKGROUND_ABSOLUTE_FILL,
    {
      width: readDimension(flattenedWrapper, 'width'),
      height: readDimension(flattenedWrapper, 'height'),
    },
    view.imageStyle,
  ];

  dlog('ImageBackground -> View(RCTView) > Image(RCTImageView absolute-fill) + children');

  // The wrapper View holds the inner Image as its only structural child; the adapter appends
  // the user children after it (so they paint on top).
  return el('symbiote-view', { style: view.style }, [
    renderImage({ ...view.image, style: imageMergedStyle }),
  ]);
}
