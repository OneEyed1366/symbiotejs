// Slider on iOS: the native view has an intrinsic 40pt height (the wrapper applies it as the
// default), lays out implicit steps at 1000-point resolution, and nudges the step row down 10pt.
// Also the base (./index re-exports it) for headless. Mirrors the library's iOS branches.

import { createSlider } from './shared';
import { SLIDER_IOS_DEFAULT_HEIGHT, SLIDER_STEP_RESOLUTION_IOS } from '../../core';

const IOS_STEPS_CONTAINER_TOP = 10;

export const Slider = createSlider({
  defaultStyle: { height: SLIDER_IOS_DEFAULT_HEIGHT },
  stepResolution: SLIDER_STEP_RESOLUTION_IOS,
  stepsContainerTop: IOS_STEPS_CONTAINER_TOP,
});
