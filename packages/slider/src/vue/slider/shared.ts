// Slider, the Vue lifecycle half. The logic (value/limit/disabled folds, the step-option layout)
// and the native render live in @symbiote/slider core, shared verbatim with the future Angular
// adapter; here Vue supplies the reactivity — a ref tracks the value native last reported (to mark
// the active step) and a ref the measured width (for the step indicator) — plus the descriptor
// bridge. The native RNCSlider view carries no symbiote metadata: the engine derives its events
// and color processors from the library's ViewConfig at runtime. That ViewConfig is registered by
// the side-effect import in ../register (pulled in by the package barrel, NOT here, so this module
// and its tests stay free of the third-party spec). See CLAUDE.md
// <third_party_rn_packages_are_react_only> and ADR 0027.

import { defineComponent, h, ref, type SetupContext, type VNode } from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs, Image } from '@symbiote/vue';
import { dlog, type ISymbioteEvent } from '@symbiote/engine';
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
  type ISliderViewProps,
  type ISliderAccessibilityState,
} from '../../core';

type IUnknownHandler = (...args: readonly unknown[]) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

// accessibilityState arrives untyped; narrow its disabled flag for the fold while preserving the
// other entries at runtime (the resolve spread carries them onto the native node).
function asAccessibilityState(value: unknown): ISliderAccessibilityState | undefined {
  if (!isRecord(value)) return undefined;
  return { ...value, disabled: typeof value.disabled === 'boolean' ? value.disabled : undefined };
}

// The props/handlers the lifecycle consumes itself; everything else (the track tints + images,
// thumbSize, tapToSeek, vertical, accessibility*/testID/aria-*) forwards onto the native node.
// The four callbacks are JS-only and must NEVER reach Fabric, so they are stripped here and
// re-supplied as the native event handlers in `passthrough`.
const HANDLED_ATTRS = [
  'value',
  'minimumValue',
  'maximumValue',
  'step',
  'lowerLimit',
  'upperLimit',
  'disabled',
  'inverted',
  'thumbTintColor',
  'thumbImage',
  'accessibilityState',
  'renderStepNumber',
  'style',
  'onValueChange',
  'onSlidingStart',
  'onSlidingComplete',
  'onAccessibilityAction',
];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export function createSlider(platform: ISliderPlatform) {
  return defineComponent({
    name: 'Slider',
    inheritAttrs: false,
    setup(_props, { attrs: rawAttrs, slots }: SetupContext) {
      // The value native last reported, kept only to mark the active step in the indicator. Not
      // the controlled value — the slider is uncontrolled during a drag (no snap-back).
      const reportedValue = ref<number | undefined>(undefined);
      // The measured wrapper width the step indicator lays out against; 0 until the first layout.
      const width = ref(0);

      const callback = (key: string): IUnknownHandler | undefined => {
        const handler = rawAttrs[key];
        return isHandler(handler) ? handler : undefined;
      };

      const handleValueChange = (event: ISymbioteEvent): void => {
        const value = valueFromSliderEvent(event);
        if (value === undefined) return;
        reportedValue.value = value;
        callback('onValueChange')?.(value);
      };
      const handleSlidingStart = (event: ISymbioteEvent): void => {
        const value = valueFromSliderEvent(event);
        if (value !== undefined) callback('onSlidingStart')?.(value);
      };
      const handleSlidingComplete = (event: ISymbioteEvent): void => {
        const value = valueFromSliderEvent(event);
        if (value !== undefined) callback('onSlidingComplete')?.(value);
      };
      const handleAccessibilityAction = (event: ISymbioteEvent): void => {
        callback('onAccessibilityAction')?.(event);
      };
      const handleLayout = (event: ISymbioteEvent): void => {
        const layout = event.nativeEvent.layout;
        if (isRecord(layout) && typeof layout.width === 'number') width.value = layout.width;
      };

      return () => {
        const attrs = normalizeVueAttrs(rawAttrs);

        const minimumValue = asNumber(attrs.minimumValue) ?? SLIDER_DEFAULT_MINIMUM_VALUE;
        const maximumValue = asNumber(attrs.maximumValue) ?? SLIDER_DEFAULT_MAXIMUM_VALUE;
        const step = asNumber(attrs.step) ?? SLIDER_DEFAULT_STEP;
        const lowerLimit = resolveSliderLowerLimit(asNumber(attrs.lowerLimit));
        const upperLimit = resolveSliderUpperLimit(asNumber(attrs.upperLimit));
        if (isInvalidLimitConfig(lowerLimit, upperLimit)) {
          dlog('Slider: lowerLimit must be smaller than upperLimit');
        }
        const disabledAttr = asBoolean(attrs.disabled);
        const accessibilityState = asAccessibilityState(attrs.accessibilityState);
        const inverted = asBoolean(attrs.inverted) ?? false;

        const hasStepMarker = slots.stepMarker !== undefined;
        const renderStepNumber = asBoolean(attrs.renderStepNumber);
        const hasThumbImage = attrs.thumbImage !== undefined;
        const showSteps = shouldRenderStepsIndicator(hasStepMarker, renderStepNumber);

        // The native view gets a thumbImage only when there is one AND no custom marker (which
        // draws its own thumb), matching the library. We pass the source raw — the engine runs the
        // image processor derived from RNCSlider's ViewConfig (same path as the color tints), so
        // unlike the plain-RN library wrapper we do NOT pre-call Image.resolveAssetSource here.
        const nativeThumbImage = shouldPassNativeThumbImage(hasStepMarker, hasThumbImage)
          ? attrs.thumbImage
          : undefined;

        const view: ISliderViewProps = {
          value: sanitizeSliderValue(asNumber(attrs.value)),
          minimumValue,
          maximumValue,
          step,
          lowerLimit,
          upperLimit,
          disabled: resolveSliderDisabled(disabledAttr, accessibilityState),
          inverted,
          thumbTintColor: resolveThumbTintColor(attrs.thumbTintColor, hasStepMarker, hasThumbImage),
          thumbImage: nativeThumbImage,
          accessibilityState: resolveSliderAccessibilityState(disabledAttr, accessibilityState),
          width: showSteps ? width.value : undefined,
          style: attrs.style,
          passthrough: {
            ...forwardAttrs(attrs),
            [SLIDER_ON_CHANGE]: handleValueChange,
            [SLIDER_ON_VALUE_CHANGE]: handleValueChange,
            [SLIDER_ON_SLIDING_START]: handleSlidingStart,
            [SLIDER_ON_SLIDING_COMPLETE]: handleSlidingComplete,
            [SLIDER_ON_ACCESSIBILITY_ACTION]: handleAccessibilityAction,
          },
        };

        // Common case: no step overlay. The full slider (wrapper + native leaf) renders agnostic.
        if (!showSteps) {
          return descriptorToVue(renderSlider(view, platform));
        }

        const options = computeStepOptions(
          minimumValue,
          maximumValue,
          step,
          platform.stepResolution,
        );
        const currentValue = reportedValue.value ?? view.value ?? minimumValue;

        // A custom StepMarker is a per-adapter element (a Vue slot), so its overlay is assembled
        // here at the VNode level; the default overlay (numbers / thumbImage only) is the shared
        // agnostic render. Either way the wrapper measures width via onLayout.
        if (hasStepMarker) {
          const overlay = renderCustomStepsOverlay({
            options,
            currentValue,
            minimumValue,
            maximumValue,
            inverted,
            renderStepNumber: renderStepNumber === true,
            thumbImage: attrs.thumbImage,
            width: width.value,
            platform,
            stepMarker: slots.stepMarker,
          });
          return h(
            'symbiote-view',
            { style: resolveStepsWrapperStyle(view.style, platform), onLayout: handleLayout },
            [overlay, descriptorToVue(renderSliderNative(view, platform))],
          );
        }

        const steps = renderStepsIndicator({
          options,
          currentValue,
          width: width.value,
          renderStepNumber: renderStepNumber === true,
          thumbImage: attrs.thumbImage,
          inverted,
          platform,
        });
        return descriptorToVue(renderSlider(view, platform, { steps, onLayout: handleLayout }));
      };
    },
  });
}

// The wrapper style for the steps path mirrors renderSlider's wrapper (kept here because the
// custom-marker path builds the wrapper itself rather than going through renderSlider).
function resolveStepsWrapperStyle(style: unknown, platform: ISliderPlatform): unknown {
  return [platform.defaultStyle, style, { justifyContent: 'center' }];
}

type ICustomStepsParams = {
  options: readonly number[];
  currentValue: number;
  minimumValue: number;
  maximumValue: number;
  inverted: boolean;
  renderStepNumber: boolean;
  thumbImage: unknown;
  width: number;
  platform: ISliderPlatform;
  stepMarker: SetupContext['slots'][string];
};

// The custom-marker overlay: the same flex row as the agnostic default, but each mark hosts the
// user's `#stepMarker` scoped slot (plus the thumbImage on the current step and the optional step
// number), exactly as the library's SliderTrackMark composes a StepMarker + Image.
function renderCustomStepsOverlay(params: ICustomStepsParams): VNode {
  const fontSize = stepNumberFontSize(params.options.length);
  const ordered = orderStepOptions(params.options, params.inverted);
  const min = params.options[0];
  const max = params.options[params.options.length - 1];
  const cells = ordered.map((value, index) => {
    const trackChildren: VNode[] = [];
    const marker = params.stepMarker?.({
      stepMarked: value === params.currentValue,
      currentValue: params.currentValue,
      index,
      min,
      max,
    });
    if (marker !== undefined) trackChildren.push(h('symbiote-view', {}, marker));
    if (params.thumbImage !== undefined && value === params.currentValue) {
      trackChildren.push(
        h(
          'symbiote-view',
          { style: THUMB_IMAGE_CONTAINER_STYLE, testID: 'sliderTrackMark-thumbImage' },
          [h(Image, { source: params.thumbImage, style: THUMB_IMAGE_STYLE })],
        ),
      );
    }
    const cellChildren: VNode[] = [
      h('symbiote-view', { style: TRACK_MARK_CONTAINER_STYLE }, trackChildren),
    ];
    if (params.renderStepNumber) {
      cellChildren.push(
        h('symbiote-view', { style: STEP_NUMBER_CONTAINER_STYLE }, [
          h('symbiote-text', { testID: `${index}th-step`, style: { fontSize } }, String(value)),
        ]),
      );
    }
    return h('symbiote-view', { style: STEP_INDICATOR_ELEMENT_STYLE }, cellChildren);
  });
  return h(
    'symbiote-view',
    {
      pointerEvents: 'none',
      testID: 'StepsIndicator-Container',
      style: resolveStepsContainerStyle(params.width, params.platform),
    },
    cells,
  );
}
