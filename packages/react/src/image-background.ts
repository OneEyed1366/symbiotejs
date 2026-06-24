// ImageBackground — pure JS composition, no native component (mirrors
// react-native/Libraries/Image/ImageBackground.js). An outer View receives
// `style`; an absolutely-filled Image sits behind it; `children` paint on top.
//
// The inner Image is positioned absolute-fill and has the wrapper's width/height
// reapplied: RN's Image overwrites its own width/height from the source's intrinsic
// size, which would fight the wrapper's explicit dimensions, so we proxy them back
// onto the Image so it fills the wrapper. `imageStyle` wins last.

import { createElement, type ReactElement, type ReactNode } from 'react'
import { dlog, flattenStyle } from '@symbiote/shared'
import { View } from './components'
import { Image, type ImageProps } from './image'
import type { DimensionValue, ViewStyle } from './styles'

// Inherit every forwarding Image prop (source, defaultSource, loadingIndicatorSource,
// resizeMode, resizeMethod, tintColor, blurRadius, capInsets, fadeDuration, load
// events) — they spread onto the inner Image. `style` is overridden to mean the
// WRAPPER View's style; `imageStyle` targets the inner Image.
export interface ImageBackgroundProps extends Omit<ImageProps, 'style'> {
  // Wrapper View style; its width/height are reapplied to the inner Image.
  style?: ViewStyle
  // Style merged onto the inner absolute-fill Image, after the proxied dimensions.
  imageStyle?: ViewStyle
  children?: ReactNode
}

const ABSOLUTE_FILL: ViewStyle = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }

function readDimension(style: Record<string, unknown>, key: 'width' | 'height'): DimensionValue | undefined {
  const value = Object.hasOwn(style, key) ? Reflect.get(style, key) : undefined
  if (typeof value === 'number' || typeof value === 'string') return value
  return undefined
}

export function ImageBackground(props: ImageBackgroundProps): ReactElement {
  const { children, style, imageStyle, ...imageProps } = props

  // Flatten only to read the wrapper's explicit dimensions; RN copies these onto the
  // Image so it fills the box rather than collapsing to the source's intrinsic size.
  const flattenedWrapper = flattenStyle(style)
  const imageMergedStyle: ViewStyle = {
    ...ABSOLUTE_FILL,
    width: readDimension(flattenedWrapper, 'width'),
    height: readDimension(flattenedWrapper, 'height'),
    ...imageStyle,
  }

  dlog('ImageBackground -> View(RCTView) > Image(RCTImageView absolute-fill) + children')

  return createElement(
    View,
    { style },
    createElement(Image, { ...imageProps, style: imageMergedStyle }),
    children,
  )
}
