// Framework-agnostic constants for the @react-native-community/slider native view, mirrored
// from the library's own utils/constants.ts so every adapter resolves identical defaults.
// symbiote ships zero metadata for RNCSlider at runtime — the engine derives its events and
// color processors from the library's ViewConfig — but the JS-side defaults the library's
// React wrapper applies (value/limit/step folding) are pure and shared here instead.

// The Fabric view name the library's codegen component registers (codegenNativeComponent<…>
// ('RNCSlider')). descriptorFor passes any non-`symbiote-` string through as a raw Fabric
// name, so the render fn emits this directly; the engine resolves its ViewConfig on first use.
export const RNC_SLIDER_VIEW_NAME = 'RNCSlider';

// Native event prop keys the engine routes to listeners. The library's ViewConfig declares the
// value change as BOTH a `topChange` (→ onChange) and `topRNCSliderValueChange`
// (→ onRNCSliderValueChange) bubbling event, plus the two direct sliding events; we bind both
// value-change keys exactly as the React wrapper does so neither host platform is missed.
export const SLIDER_ON_CHANGE = 'onChange';
export const SLIDER_ON_VALUE_CHANGE = 'onRNCSliderValueChange';
export const SLIDER_ON_SLIDING_START = 'onRNCSliderSlidingStart';
export const SLIDER_ON_SLIDING_COMPLETE = 'onRNCSliderSlidingComplete';
export const SLIDER_ON_ACCESSIBILITY_ACTION = 'onRNCSliderAccessibilityAction';

// Value/range defaults, matching the library wrapper's destructured prop defaults.
export const SLIDER_DEFAULT_INITIAL_VALUE = 0;
export const SLIDER_DEFAULT_MINIMUM_VALUE = 0;
export const SLIDER_DEFAULT_MAXIMUM_VALUE = 1;
export const SLIDER_DEFAULT_STEP = 0;

// lowerLimit/upperLimit default to the native sentinel (no limit) off-web; the library uses
// Number.MIN/MAX_SAFE_INTEGER for the unbounded case.
export const SLIDER_LIMIT_MIN_VALUE = Number.MIN_SAFE_INTEGER;
export const SLIDER_LIMIT_MAX_VALUE = Number.MAX_SAFE_INTEGER;

// Step-indicator resolution: how many implicit steps the library lays out when `step` is 0.
// Platform-specific in the library (android 128 / ios 1000); the adapter supplies the resolved
// number so the core render stays platform-invariant (no Platform.OS read here).
export const SLIDER_STEP_RESOLUTION_IOS = 1_000;
export const SLIDER_STEP_RESOLUTION_ANDROID = 128;

// iOS gives the native slider an intrinsic 40pt height; the wrapper applies it as the default.
export const SLIDER_IOS_DEFAULT_HEIGHT = 40;

// Step-indicator typography + layout, from the library's utils/styles + constants.
export const SLIDER_STEP_NUMBER_FONT_SMALL = 8;
export const SLIDER_STEP_NUMBER_FONT_BIG = 12;
export const SLIDER_STEP_NUMBER_FONT_THRESHOLD = 9;
export const SLIDER_THUMB_SIZE = 20;
export const SLIDER_MARGIN_HORIZONTAL_PADDING = 0.05;
