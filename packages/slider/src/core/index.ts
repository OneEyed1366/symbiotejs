// @symbiote/slider (core): the framework-agnostic half of the @react-native-community/slider
// wrapper. symbiote ships zero runtime metadata for RNCSlider — the engine derives its events
// and color processors from the library's own ViewConfig — so this layer is the pure JS folding
// the library's React wrapper does (value/limit/disabled resolution, the step-indicator layout)
// plus the Descriptor render of the native leaf. Every adapter (`@symbiote/slider/vue`, and the
// future `/angular`) reuses this verbatim and supplies only its lifecycle + descriptor bridge.
// This is the third-party-native-view track foreseen by ADR 0014; see ADR 0027.

export * from './constants';

export {
  sanitizeSliderValue,
  resolveSliderDisabled,
  resolveSliderAccessibilityState,
  resolveSliderLowerLimit,
  resolveSliderUpperLimit,
  valueFromSliderEvent,
  computeStepOptions,
  shouldRenderStepsIndicator,
  resolveThumbTintColor,
  shouldPassNativeThumbImage,
  isInvalidLimitConfig,
} from './slider-state';
export type { ISliderAccessibilityState } from './slider-state';

export type { ISliderProps, ISliderPlatform, ISliderViewProps } from './slider-props';

export {
  renderSlider,
  renderSliderNative,
  resolveSliderWrapperStyle,
  resolveSliderNativeStyle,
} from './render-slider';

export {
  renderStepsIndicator,
  resolveStepsContainerStyle,
  stepNumberFontSize,
  orderStepOptions,
  STEP_INDICATOR_ELEMENT_STYLE,
  TRACK_MARK_CONTAINER_STYLE,
  THUMB_IMAGE_CONTAINER_STYLE,
  THUMB_IMAGE_STYLE,
  STEP_NUMBER_CONTAINER_STYLE,
} from './render-steps-indicator';
export type { IStepsIndicatorParams, IStepMarkerProps } from './render-steps-indicator';
