// Slider, the React lifecycle half. The logic (value/limit/disabled folds, the step-option layout)
// and the native render live in @symbiotejs/slider core, shared verbatim with the Vue adapter; here
// React supplies the lifecycle — useState for the last-reported value (to mark the active step)
// and the measured width (for the step indicator), useEffect for the limit warning — plus the
// descriptor bridge and forwardRef to the native view (matching the library's forwardRef). The
// native RNCSlider carries no symbiote metadata: the engine derives its events and color/image
// processors from the library's ViewConfig, registered by ../register (the package barrel pulls
// it). This is the React twin of the Vue wrapper; both drive the engine, NEITHER imports the
// library's React Slider component. See CLAUDE.md <third_party_rn_packages_are_react_only>, ADR 0027.

import { createElement, forwardRef, useCallback, useEffect, useState } from 'react';
import type {
  FC,
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactElement,
  RefAttributes,
} from 'react';
import { descriptorToReact, Image } from '@symbiotejs/react';
import { resolveAccessibilityProps } from '@symbiotejs/components';
import type { IDescriptor, IDescriptorChild, IImageSourceProp } from '@symbiotejs/components';
import { dlog, type ISymbioteEvent, type ISymbioteNode } from '@symbiotejs/engine';
import {
  sanitizeSliderValue,
  resolveSliderDisabled,
  resolveSliderAccessibilityState,
  resolveSliderLowerLimit,
  resolveSliderUpperLimit,
  valueFromSliderEvent,
  shouldRenderStepsIndicator,
  resolveThumbTintColor,
  shouldPassNativeThumbImage,
  isInvalidLimitConfig,
  computeStepOptions,
  orderStepOptions,
  stepNumberFontSize,
  renderSlider,
  renderSliderNative,
  resolveStepsContainerStyle,
  renderStepsIndicator,
  STEP_INDICATOR_ELEMENT_STYLE,
  TRACK_MARK_CONTAINER_STYLE,
  THUMB_IMAGE_CONTAINER_STYLE,
  THUMB_IMAGE_STYLE,
  STEP_NUMBER_CONTAINER_STYLE,
  SLIDER_DEFAULT_MINIMUM_VALUE,
  SLIDER_DEFAULT_MAXIMUM_VALUE,
  SLIDER_DEFAULT_STEP,
  SLIDER_ON_CHANGE,
  SLIDER_ON_VALUE_CHANGE,
  SLIDER_ON_SLIDING_START,
  SLIDER_ON_SLIDING_COMPLETE,
  SLIDER_ON_ACCESSIBILITY_ACTION,
  type ISliderPlatform,
  type ISliderProps as ISliderBaseProps,
  type ISliderViewProps,
  type IStepMarkerProps,
} from '../../core';

// React's flavored prop type: the agnostic base plus the per-adapter StepMarker — a render
// component returning a React element, which (per CLAUDE.md <prop_types_split_agnostic_vs_per_adapter>)
// cannot live in the shared layer. Same name as the agnostic base by the split convention (cf.
// IPressableProps declared per-adapter); Vue takes the same marker as a `#stepMarker` scoped slot.
export interface ISliderProps extends ISliderBaseProps {
  StepMarker?: FC<IStepMarkerProps>;
  // Forwarded onto the OUTER wrapper View, like `style` (resolveSliderWrapperStyle) — resolves
  // through the shared style registry. Explicitly destructured below, not left in `...passthrough`,
  // which lands on the INNER native RNCSlider leaf (renderSliderNative) — the same wrapper/inner
  // routing bug ImageBackground was fixed for.
  className?: string;
}

type ISliderComponent = ForwardRefExoticComponent<
  PropsWithoutRef<ISliderProps> & RefAttributes<ISymbioteNode>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toChild(child: IDescriptorChild): ReactElement | string {
  return typeof child === 'string' ? child : descriptorToReact(child);
}

// renderSlider's Descriptor IS the outer wrapper (symbiote-view hosting the native leaf +
// optional steps overlay); className is reapplied on it here, exactly like ImageBackground's
// wrapper.
function withClassName(descriptor: IDescriptor, className: string | undefined): ReactElement {
  return createElement(
    descriptor.type,
    { key: descriptor.key, ...descriptor.props, className },
    ...descriptor.children.map(toChild),
  );
}

export function createSlider(platform: ISliderPlatform): ISliderComponent {
  return forwardRef<ISymbioteNode, ISliderProps>((rawProps, forwardedRef) => {
    // Slider owns its host wrapper rather than rendering through a symbiote View, so it folds
    // aria/role into accessibility* here; the rest (testID, accessibilityLabel, accessibility-
    // Actions, …) rides to the native node via `passthrough`.
    const props = resolveAccessibilityProps(rawProps);
    const {
      value,
      minimumValue,
      maximumValue,
      step,
      lowerLimit,
      upperLimit,
      disabled,
      inverted,
      thumbTintColor,
      thumbImage,
      accessibilityState,
      renderStepNumber,
      style,
      className,
      StepMarker,
      onValueChange,
      onSlidingStart,
      onSlidingComplete,
      onAccessibilityAction,
      ...passthrough
    } = props;

    const [reportedValue, setReportedValue] = useState<number | undefined>(undefined);
    const [width, setWidth] = useState(0);

    const handleValueChange = useCallback(
      (event: ISymbioteEvent): void => {
        const next = valueFromSliderEvent(event);
        if (next === undefined) return;
        setReportedValue(next);
        onValueChange?.(next);
      },
      [onValueChange],
    );
    const handleSlidingStart = useCallback(
      (event: ISymbioteEvent): void => {
        const next = valueFromSliderEvent(event);
        if (next !== undefined) onSlidingStart?.(next);
      },
      [onSlidingStart],
    );
    const handleSlidingComplete = useCallback(
      (event: ISymbioteEvent): void => {
        const next = valueFromSliderEvent(event);
        if (next !== undefined) onSlidingComplete?.(next);
      },
      [onSlidingComplete],
    );
    const handleAccessibilityAction = useCallback(
      (event: ISymbioteEvent): void => {
        onAccessibilityAction?.(event);
      },
      [onAccessibilityAction],
    );
    const handleLayout = useCallback((event: ISymbioteEvent): void => {
      const layout = event.nativeEvent.layout;
      if (isRecord(layout) && typeof layout.width === 'number') setWidth(layout.width);
    }, []);

    const minimum = minimumValue ?? SLIDER_DEFAULT_MINIMUM_VALUE;
    const maximum = maximumValue ?? SLIDER_DEFAULT_MAXIMUM_VALUE;
    const stepValue = step ?? SLIDER_DEFAULT_STEP;
    const lower = resolveSliderLowerLimit(lowerLimit);
    const upper = resolveSliderUpperLimit(upperLimit);

    useEffect(() => {
      if (isInvalidLimitConfig(lower, upper))
        dlog('Slider: lowerLimit must be smaller than upperLimit');
    }, [lower, upper]);

    const hasStepMarker = StepMarker !== undefined;
    const hasThumbImage = thumbImage !== undefined;
    const showSteps = shouldRenderStepsIndicator(hasStepMarker, renderStepNumber);
    // Passed to the native view raw — the engine runs the image processor derived from RNCSlider's
    // ViewConfig — and only when no custom marker draws its own thumb (matches the library).
    const nativeThumbImage = shouldPassNativeThumbImage(hasStepMarker, hasThumbImage)
      ? thumbImage
      : undefined;

    const view: ISliderViewProps = {
      value: sanitizeSliderValue(value),
      minimumValue: minimum,
      maximumValue: maximum,
      step: stepValue,
      lowerLimit: lower,
      upperLimit: upper,
      disabled: resolveSliderDisabled(disabled, accessibilityState),
      inverted: inverted ?? false,
      thumbTintColor: resolveThumbTintColor(thumbTintColor, hasStepMarker, hasThumbImage),
      thumbImage: nativeThumbImage,
      accessibilityState: resolveSliderAccessibilityState(disabled, accessibilityState),
      width,
      style,
      passthrough: {
        ...passthrough,
        ref: forwardedRef,
        [SLIDER_ON_CHANGE]: handleValueChange,
        [SLIDER_ON_VALUE_CHANGE]: handleValueChange,
        [SLIDER_ON_SLIDING_START]: handleSlidingStart,
        [SLIDER_ON_SLIDING_COMPLETE]: handleSlidingComplete,
        [SLIDER_ON_ACCESSIBILITY_ACTION]: handleAccessibilityAction,
      },
    };

    if (!showSteps) {
      return withClassName(renderSlider(view, platform, { onLayout: handleLayout }), className);
    }

    const options = computeStepOptions(minimum, maximum, stepValue, platform.stepResolution);
    const currentValue = reportedValue ?? view.value ?? minimum;

    if (StepMarker !== undefined) {
      const overlay = renderCustomStepsOverlay({
        options,
        currentValue,
        inverted: view.inverted,
        renderStepNumber: renderStepNumber === true,
        thumbImage,
        width,
        platform,
        StepMarker,
      });
      return createElement(
        'symbiote-view',
        { style: resolveStepsWrapperStyle(style, platform), onLayout: handleLayout, className },
        overlay,
        descriptorToReact(renderSliderNative(view, platform)),
      );
    }

    const steps = renderStepsIndicator({
      options,
      currentValue,
      width,
      renderStepNumber: renderStepNumber === true,
      thumbImage,
      inverted: view.inverted,
      platform,
    });
    return withClassName(
      renderSlider(view, platform, { steps, onLayout: handleLayout }),
      className,
    );
  });
}

// The wrapper style for the custom-marker steps path mirrors renderSlider's wrapper.
function resolveStepsWrapperStyle(style: unknown, platform: ISliderPlatform): unknown {
  return [platform.defaultStyle, style, { justifyContent: 'center' }];
}

type ICustomStepsParams = {
  options: readonly number[];
  currentValue: number;
  inverted: boolean;
  renderStepNumber: boolean;
  thumbImage: IImageSourceProp | undefined;
  width: number;
  platform: ISliderPlatform;
  StepMarker: FC<IStepMarkerProps>;
};

// The custom-marker overlay: the same flex row as the agnostic default, each mark hosting the
// user's StepMarker element (plus the thumbImage on the current step and the optional step
// number), mirroring the library's SliderTrackMark composition.
function renderCustomStepsOverlay(params: ICustomStepsParams): ReactElement {
  const fontSize = stepNumberFontSize(params.options.length);
  const ordered = orderStepOptions(params.options, params.inverted);
  const min = params.options[0];
  const max = params.options[params.options.length - 1];
  const cells = ordered.map((value, index) => {
    const trackChildren: ReactElement[] = [
      createElement(params.StepMarker, {
        key: 'marker',
        stepMarked: value === params.currentValue,
        currentValue: params.currentValue,
        index,
        min,
        max,
      }),
    ];
    if (params.thumbImage !== undefined && value === params.currentValue) {
      trackChildren.push(
        createElement(
          'symbiote-view',
          {
            key: 'thumb',
            style: THUMB_IMAGE_CONTAINER_STYLE,
            testID: 'sliderTrackMark-thumbImage',
          },
          createElement(Image, { source: params.thumbImage, style: THUMB_IMAGE_STYLE }),
        ),
      );
    }
    const cellChildren: ReactElement[] = [
      createElement(
        'symbiote-view',
        { key: 'track', style: TRACK_MARK_CONTAINER_STYLE },
        ...trackChildren,
      ),
    ];
    if (params.renderStepNumber) {
      cellChildren.push(
        createElement(
          'symbiote-view',
          { key: 'number', style: STEP_NUMBER_CONTAINER_STYLE },
          createElement(
            'symbiote-text',
            { testID: `${index}th-step`, style: { fontSize } },
            String(value),
          ),
        ),
      );
    }
    return createElement(
      'symbiote-view',
      { key: index, style: STEP_INDICATOR_ELEMENT_STYLE },
      ...cellChildren,
    );
  });
  return createElement(
    'symbiote-view',
    {
      pointerEvents: 'none',
      testID: 'StepsIndicator-Container',
      style: resolveStepsContainerStyle(params.width, params.platform),
    },
    ...cells,
  );
}
