// Slider on Android: the native view sizes itself (no default height), lays out implicit steps at
// 128-point resolution, and keeps the step row at the top. Mirrors the library's Android branches.

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorOutlet } from '@symbiotejs/angular';
import { SliderBase } from './shared';
import { SLIDER_STEP_RESOLUTION_ANDROID } from '../../core';
export type { ISliderProps } from './shared';

const ANDROID_STEPS_CONTAINER_TOP = 0;

@Component({
  selector: 'Slider',
  standalone: true,
  imports: [DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<symbiote-descriptor-outlet [node]="descriptor" />`,
})
export class Slider extends SliderBase {
  protected readonly platform = {
    defaultStyle: {},
    stepResolution: SLIDER_STEP_RESOLUTION_ANDROID,
    stepsContainerTop: ANDROID_STEPS_CONTAINER_TOP,
  };
}
