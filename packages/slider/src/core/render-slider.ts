// Slider: the render half (framework-agnostic). Mirrors the library's React wrapper layout: an
// outer `symbiote-view` (default platform style + the caller's style, centered) hosting the
// native `RNCSlider` leaf, plus an optional step-indicator overlay sibling. The native leaf
// carries the folded value/limit/color/image props and the responder claims the wrapper does;
// every event handler + the ref ride in `passthrough` and the engine routes them against the
// view's derived ViewConfig. Pure and prop-driven — the adapter owns state, events, and the
// width measurement that feeds `view.width`.

import { dlog } from '@symbiote/engine';
import type { IStyleProp, IViewStyle, ISymbioteEvent } from '@symbiote/engine';
import { el } from '@symbiote/components';
import type { IDescriptor, IDescriptorChild } from '@symbiote/components';
import { RNC_SLIDER_VIEW_NAME } from './constants';
import type { ISliderPlatform, ISliderViewProps } from './slider-props';

// Extra wrapper props the adapter supplies: the pre-rendered default step overlay (placed before
// the native leaf, matching the library's z-order) and the onLayout handler that measures the
// width the step indicator needs. A custom StepMarker overlay is assembled per-adapter instead.
export type ISliderRenderOptions = {
  steps?: IDescriptor | null;
  onLayout?: (event: ISymbioteEvent) => void;
};

// The native slider stretches to the measured wrapper width when one is given (the step indicator
// and thumb then share one coordinate space); without it the slider sizes naturally.
export function resolveSliderNativeStyle(
  width: number | undefined,
  platform: ISliderPlatform,
): IStyleProp<IViewStyle> {
  const base: IViewStyle = { zIndex: 1, alignContent: 'center', alignItems: 'center' };
  const sized: IStyleProp<IViewStyle> = width === undefined ? base : [base, { width }];
  return [platform.defaultStyle, sized];
}

// The outer wrapper centers the native slider and gives it the platform default height; the
// caller's style layers on top, exactly as the library composes [defaultStyle, props.style]. The
// caller's style is opaque (`unknown`) — the engine flattens the array — so it is not narrowed.
export function resolveSliderWrapperStyle(style: unknown, platform: ISliderPlatform): unknown {
  return [platform.defaultStyle, style, { justifyContent: 'center' }];
}

// The native `RNCSlider` leaf alone (no wrapper). Adapters that compose a custom step overlay
// (a per-adapter StepMarker element) assemble the wrapper themselves and drop this leaf in.
export function renderSliderNative(view: ISliderViewProps, platform: ISliderPlatform): IDescriptor {
  dlog(
    `Slider render value=${String(view.value)} disabled=${String(view.disabled)} width=${String(view.width)}`,
  );
  const props: Record<string, unknown> = {
    // Forwarded verbatim: minimum/maximumTrackTintColor, track images, thumbSize, tapToSeek,
    // vertical, accessibilityUnits/Increments, testID, accessibility*/aria-*, and the native
    // event handlers the adapter wired in.
    ...view.passthrough,
    minimumValue: view.minimumValue,
    maximumValue: view.maximumValue,
    step: view.step,
    lowerLimit: view.lowerLimit,
    upperLimit: view.upperLimit,
    value: view.value,
    inverted: view.inverted,
    disabled: view.disabled,
    thumbTintColor: view.thumbTintColor,
    thumbImage: view.thumbImage,
    accessibilityState: view.accessibilityState,
    style: resolveSliderNativeStyle(view.width, platform),
    // The library claims the responder on the native slider so a parent ScrollView can't steal
    // the drag, and refuses termination requests; mirrored for gesture parity.
    onStartShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
  };
  return el(RNC_SLIDER_VIEW_NAME, props);
}

// The full slider: the centered wrapper hosting the native leaf, with an optional pre-rendered
// step-indicator overlay before it. The default overlay (renderStepsIndicator) is passed via
// `options.steps`; a custom StepMarker overlay is assembled per-adapter at the element level.
export function renderSlider(
  view: ISliderViewProps,
  platform: ISliderPlatform,
  options: ISliderRenderOptions = {},
): IDescriptor {
  const children: IDescriptorChild[] = [];
  if (options.steps) children.push(options.steps);
  children.push(renderSliderNative(view, platform));
  const wrapperProps: Record<string, unknown> = {
    style: resolveSliderWrapperStyle(view.style, platform),
  };
  if (options.onLayout !== undefined) wrapperProps.onLayout = options.onLayout;
  return el('symbiote-view', wrapperProps, children);
}
