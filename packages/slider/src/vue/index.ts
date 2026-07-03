// @symbiotejs/slider/vue: the Vue wrapper over the @react-native-community/slider native view.
// Importing this barrel first registers the native view's ViewConfig (./register, a side-effect
// import of the codegen spec — never the library's React component), then exposes the platform-
// split Slider. The public prop type is the agnostic core ISliderProps plus a Vue-only `class`
// field (see slider/shared.ts); the custom StepMarker is a Vue scoped slot, not a prop. See
// ADR 0027.

import '../register';

export { Slider } from './slider';
export type { ISliderProps } from './slider/shared';
