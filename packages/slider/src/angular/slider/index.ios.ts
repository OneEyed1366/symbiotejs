// Slider on iOS: the native view has an intrinsic 40pt height (the wrapper applies it as the
// default), lays out implicit steps at 1000-point resolution, and nudges the step row down 10pt.
// Also the base (./index re-exports it) for headless. Mirrors the library's iOS branches.

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorOutlet } from '@symbiote/angular';
import { SliderBase } from './shared';
import { SLIDER_IOS_DEFAULT_HEIGHT, SLIDER_STEP_RESOLUTION_IOS } from '../../core';
export type { ISliderProps } from './shared';

const IOS_STEPS_CONTAINER_TOP = 10;

@Component({
  selector: 'Slider',
  standalone: true,
  imports: [DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<symbiote-descriptor-outlet [node]="descriptor" />`,
})
export class Slider extends SliderBase {
  protected readonly platform = {
    defaultStyle: { height: SLIDER_IOS_DEFAULT_HEIGHT },
    stepResolution: SLIDER_STEP_RESOLUTION_IOS,
    stepsContainerTop: IOS_STEPS_CONTAINER_TOP,
  };
}
