// Step indicator: the row of marks the library overlays on a stepped slider. Like a list's
// cells, each mark MAY hold the framework's own `StepMarker` element, so the overlay is shared
// as MATH + a DEFAULT render: the layout/style/font helpers below are reused by every adapter,
// and renderStepsIndicator paints the default overlay (empty mark containers + optional step
// numbers + the thumbImage on the current step). An adapter with a custom StepMarker slot
// assembles the overlay itself from these same helpers, dropping its element into each mark.

import { el, txt } from '@symbiotejs/components';
import type { IDescriptor, IDescriptorChild } from '@symbiotejs/components';
import type { IViewStyle, ITextStyle } from '@symbiotejs/engine';
import {
  SLIDER_MARGIN_HORIZONTAL_PADDING,
  SLIDER_STEP_NUMBER_FONT_BIG,
  SLIDER_STEP_NUMBER_FONT_SMALL,
  SLIDER_STEP_NUMBER_FONT_THRESHOLD,
} from './constants';
import type { ISliderPlatform } from './slider-props';

// Static overlay styles, ported from the library's utils/styles (native branch only — symbiote
// targets iOS/Android, so the web layout branches are dropped).
export const STEP_INDICATOR_ELEMENT_STYLE: IViewStyle = {
  alignItems: 'center',
  alignContent: 'center',
};

export const TRACK_MARK_CONTAINER_STYLE: IViewStyle = {
  alignItems: 'center',
  alignContent: 'center',
  alignSelf: 'center',
  justifyContent: 'center',
  position: 'absolute',
  zIndex: 3,
};

export const THUMB_IMAGE_CONTAINER_STYLE: IViewStyle = {
  position: 'absolute',
  zIndex: 3,
  justifyContent: 'center',
  alignItems: 'center',
  alignContent: 'center',
};

export const THUMB_IMAGE_STYLE: IViewStyle = {
  alignContent: 'center',
  alignItems: 'center',
  position: 'absolute',
};

export const STEP_NUMBER_CONTAINER_STYLE: IViewStyle = {
  marginTop: 20,
  alignItems: 'center',
  position: 'absolute',
};

// The mark row: flex row, evenly spaced, inset by a fraction of the measured width. `top` is
// platform-specific (iOS nudges the row down 10pt), supplied via the platform piece.
export function resolveStepsContainerStyle(width: number, platform: ISliderPlatform): IViewStyle {
  return {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    top: platform.stepsContainerTop,
    zIndex: 2,
    marginHorizontal: width * SLIDER_MARGIN_HORIZONTAL_PADDING,
  };
}

// Smaller font once there are more than 9 steps, so the labels keep fitting.
export function stepNumberFontSize(optionsLength: number): number {
  return optionsLength > SLIDER_STEP_NUMBER_FONT_THRESHOLD
    ? SLIDER_STEP_NUMBER_FONT_SMALL
    : SLIDER_STEP_NUMBER_FONT_BIG;
}

// Inverted sliders lay the marks right-to-left; copy before reversing (the helper is pure).
export function orderStepOptions(
  options: readonly number[],
  inverted: boolean | undefined,
): number[] {
  return inverted ? [...options].reverse() : [...options];
}

// The props a custom step marker receives, framework-agnostic scalars (the library's MarkerProps).
// Each adapter renders the marker its own way — React as an FC<IStepMarkerProps>, Vue as a scoped
// slot — but the props it gets are identical, so the shape lives here.
export type IStepMarkerProps = {
  stepMarked: boolean;
  currentValue: number;
  index: number;
  min: number;
  max: number;
};

export type IStepsIndicatorParams = {
  options: readonly number[];
  currentValue: number;
  width: number;
  renderStepNumber?: boolean;
  thumbImage?: unknown;
  inverted?: boolean;
  platform: ISliderPlatform;
};

// One mark cell: an absolutely-centered track-mark container (empty by default, or the
// thumbImage on the current step) plus the optional step number label.
function renderStepCell(
  value: number,
  displayIndex: number,
  params: IStepsIndicatorParams,
  fontSize: number,
): IDescriptor {
  const trackMarkChildren: IDescriptorChild[] = [];
  if (params.thumbImage !== undefined && value === params.currentValue) {
    trackMarkChildren.push(
      el(
        'symbiote-view',
        { style: THUMB_IMAGE_CONTAINER_STYLE, testID: 'sliderTrackMark-thumbImage' },
        [el('symbiote-image', { source: params.thumbImage, style: THUMB_IMAGE_STYLE })],
      ),
    );
  }

  const cellChildren: IDescriptorChild[] = [
    el('symbiote-view', { style: TRACK_MARK_CONTAINER_STYLE }, trackMarkChildren),
  ];
  if (params.renderStepNumber === true) {
    cellChildren.push(
      el('symbiote-view', { style: STEP_NUMBER_CONTAINER_STYLE }, [
        txt({ testID: `${displayIndex}th-step`, style: { fontSize } satisfies ITextStyle }, [
          String(value),
        ]),
      ]),
    );
  }
  return el('symbiote-view', { style: STEP_INDICATOR_ELEMENT_STYLE }, cellChildren);
}

// The default overlay (no custom StepMarker). pointerEvents none so it never eats the drag.
export function renderStepsIndicator(params: IStepsIndicatorParams): IDescriptor {
  const fontSize = stepNumberFontSize(params.options.length);
  const ordered = orderStepOptions(params.options, params.inverted);
  const cells = ordered.map((value, displayIndex) =>
    renderStepCell(value, displayIndex, params, fontSize),
  );
  return el(
    'symbiote-view',
    {
      pointerEvents: 'none',
      testID: 'StepsIndicator-Container',
      style: resolveStepsContainerStyle(params.width, params.platform),
    },
    cells,
  );
}
