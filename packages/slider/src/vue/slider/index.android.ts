// Slider on Android: the native view sizes itself (no default height), lays out implicit steps at
// 128-point resolution, and keeps the step row at the top. Mirrors the library's Android branches.

import { createSlider } from './shared';
import { SLIDER_STEP_RESOLUTION_ANDROID } from '../../core';

const ANDROID_STEPS_CONTAINER_TOP = 0;

export const Slider = createSlider({
  defaultStyle: {},
  stepResolution: SLIDER_STEP_RESOLUTION_ANDROID,
  stepsContainerTop: ANDROID_STEPS_CONTAINER_TOP,
});
