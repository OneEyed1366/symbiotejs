// Slider prop types. Per CLAUDE.md <prop_types_split_agnostic_vs_per_adapter>: every field of
// the slider's public surface is framework-agnostic EXCEPT the custom `StepMarker`, which is a
// render component returning a framework element (React FC vs Vue slot) — so that one stays in
// each adapter's own flavored prop type. ISliderProps here is the shared agnostic base every
// adapter re-exports and extends; ISliderViewProps is the pre-resolved input the render fn paints.

import type { IColorValue, IStyleProp, IViewStyle } from '@symbiote/engine';
import type { IAccessibilityProps, IAriaProps, IImageSourceProp } from '@symbiote/components';
import type { ISliderAccessibilityState } from './slider-state';

// The agnostic public surface, shared by every adapter. Callbacks take a plain number (the
// adapter unwraps nativeEvent.value), colors/images/style are agnostic value types. The custom
// `StepMarker` component is deliberately absent — adapters add it to their own flavored type.
export interface ISliderProps extends IAccessibilityProps, IAriaProps {
  value?: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  lowerLimit?: number;
  upperLimit?: number;
  minimumTrackTintColor?: IColorValue;
  maximumTrackTintColor?: IColorValue;
  thumbTintColor?: IColorValue;
  disabled?: boolean;
  inverted?: boolean;
  tapToSeek?: boolean;
  vertical?: boolean;
  thumbImage?: IImageSourceProp;
  minimumTrackImage?: IImageSourceProp;
  maximumTrackImage?: IImageSourceProp;
  trackImage?: IImageSourceProp;
  thumbSize?: number;
  accessibilityUnits?: string;
  accessibilityIncrements?: readonly string[];
  renderStepNumber?: boolean;
  onValueChange?: (value: number) => void;
  onSlidingStart?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  testID?: string;
  style?: IStyleProp<IViewStyle>;
}

// The per-platform piece the render needs: the iOS default 40pt height (Android leaves it to
// the native view's intrinsic size), the step-indicator resolution fallback (ios 1000 /
// android 128), and the step container's platform `top` offset. The adapter's .ios/.android
// file supplies these (Metro filename-selected), keeping the render platform-invariant.
export type ISliderPlatform = {
  defaultStyle: IViewStyle;
  stepResolution: number;
  stepsContainerTop: number;
};

// Pre-resolved inputs the native render paints from. Only the fields that need FOLDING are
// explicit here (value sanitized, disabled/accessibilityState resolved, limits defaulted, the
// thumb tint/image resolved against the StepMarker decision); everything that just passes through
// untouched — minimum/maximumTrackTintColor, the track images, thumbSize, tapToSeek, vertical,
// accessibility*/testID/aria-*, AND the native event handlers — rides in `passthrough` and lands
// on the host node verbatim (the engine routes the on*-keyed handlers and runs the ViewConfig
// color processors). `width` is set only when a step overlay needs it, so the common case has no
// width:0 first-paint flash.
export type ISliderViewProps = {
  value?: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  lowerLimit: number;
  upperLimit: number;
  disabled: boolean;
  inverted: boolean;
  thumbTintColor?: unknown;
  thumbImage?: unknown;
  accessibilityState?: ISliderAccessibilityState;
  width?: number;
  // Opaque to the render — composed into a style array the engine flattens — so kept `unknown`
  // (object/array/registered-id all valid) rather than narrowed off attrs. The PUBLIC ISliderProps
  // keeps the precise IStyleProp typing.
  style?: unknown;
  passthrough: Record<string, unknown>;
};
