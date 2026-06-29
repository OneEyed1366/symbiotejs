// @symbiote/slider/react: the React wrapper over the @react-native-community/slider native view.
// Importing this barrel first registers the native view's ViewConfig (../register, a side-effect
// import of the codegen spec — never the library's React Slider component), then exposes the
// platform-split Slider. The public prop type is the agnostic base plus React's StepMarker render
// component (Vue takes the same marker as a scoped slot). See ADR 0027.

import '../register';

export { Slider } from './slider';
export type { ISliderProps } from './slider/shared';
export type { IStepMarkerProps } from '../core';
