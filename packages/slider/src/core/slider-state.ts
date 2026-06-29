// Slider: the logic half (framework-agnostic, zero render). Unlike Switch, the slider is NOT
// controlled during a drag — the native view owns the thumb position and reports values up, so
// there is no snap-back reducer. The shared logic is the pure prop folding the library's React
// wrapper does before handing props to the native view: value sanitation, disabled/accessibility
// resolution, limit defaulting, and the step-indicator option layout. Every adapter reuses these.

import type { ISymbioteEvent } from '@symbiote/engine';
import { SLIDER_LIMIT_MAX_VALUE, SLIDER_LIMIT_MIN_VALUE } from './constants';

// The accessibilityState slice the disabled fold reads/writes. Only `disabled` is typed (the only
// field the fold inspects) and NO index signature — so RN's IAccessibilityStateValue (which has no
// index signature) assigns cleanly. Other state fields (selected/checked/…) are preserved at
// RUNTIME by the resolve spread; the static type just doesn't track them.
export type ISliderAccessibilityState = {
  disabled?: boolean;
};

// Mirror the library's `passedValue`: NaN or a falsy value (incl. 0) becomes undefined, so the
// native view falls back to its own default initial value rather than receiving NaN/0 as a
// write. Entered once it still acts as the initial value (the slider is uncontrolled after).
export function sanitizeSliderValue(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.isNaN(value) || !value ? undefined : value;
}

// Resolve the effective disabled flag exactly as the wrapper does: an explicit boolean wins,
// else it falls back to accessibilityState.disabled.
export function resolveSliderDisabled(
  disabled: boolean | undefined,
  accessibilityState: ISliderAccessibilityState | undefined,
): boolean {
  if (typeof disabled === 'boolean') return disabled;
  return accessibilityState?.disabled === true;
}

// When `disabled` is given explicitly, fold it into accessibilityState so the native view and
// the a11y tree agree; otherwise pass the caller's accessibilityState through untouched.
export function resolveSliderAccessibilityState(
  disabled: boolean | undefined,
  accessibilityState: ISliderAccessibilityState | undefined,
): ISliderAccessibilityState | undefined {
  if (typeof disabled === 'boolean') return { ...accessibilityState, disabled };
  return accessibilityState;
}

// Default the slide limits to the unbounded sentinels when unset (the native, non-web case).
export function resolveSliderLowerLimit(lowerLimit: number | undefined): number {
  return lowerLimit ?? SLIDER_LIMIT_MIN_VALUE;
}

export function resolveSliderUpperLimit(upperLimit: number | undefined): number {
  return upperLimit ?? SLIDER_LIMIT_MAX_VALUE;
}

// The value the native value/sliding events carry as nativeEvent.value. nativeEvent is an
// untyped Record, so narrow; a non-number payload yields undefined (no callback fired upstream).
export function valueFromSliderEvent(event: ISymbioteEvent): number | undefined {
  const value = event.nativeEvent.value;
  return typeof value === 'number' ? value : undefined;
}

// A step overlay is rendered when the caller supplies a custom StepMarker OR opts into step
// numbers, mirroring `props.StepMarker || !!props.renderStepNumber`.
export function shouldRenderStepsIndicator(
  hasStepMarker: boolean,
  renderStepNumber: boolean | undefined,
): boolean {
  return hasStepMarker || renderStepNumber === true;
}

// With a thumbImage AND a custom StepMarker, the native thumb tint goes transparent so the
// custom mark shows through; otherwise the caller's thumbTintColor stands. Kept `unknown` (not
// IColorValue) since a color is an opaque value the engine's derived processor handles — the
// fold only chooses between the input and the 'transparent' sentinel, never inspects the color.
export function resolveThumbTintColor(
  thumbTintColor: unknown,
  hasStepMarker: boolean,
  hasThumbImage: boolean,
): unknown {
  return hasThumbImage && hasStepMarker ? 'transparent' : thumbTintColor;
}

// The native view gets a thumbImage only when there is one AND no custom StepMarker (the marker
// draws its own thumb); matches `props.StepMarker || !props.thumbImage ? undefined : <image>`.
// The adapter still resolves the asset source (RN's Image.resolveAssetSource) when this is true.
export function shouldPassNativeThumbImage(
  hasStepMarker: boolean,
  hasThumbImage: boolean,
): boolean {
  return hasThumbImage && !hasStepMarker;
}

// The library warns when the limits cross; surfaced as a pure predicate so the adapter logs it.
export function isInvalidLimitConfig(lowerLimit: number, upperLimit: number): boolean {
  return lowerLimit >= upperLimit;
}

// Lay out the step-indicator option values, mirroring the library's options array. With an
// explicit step the points run min→max by step; with step 0 they spread `resolution`+1 points
// evenly across the range. `resolution` is the platform-resolved fallback the adapter supplies
// (ios 1000 / android 128), keeping this fn platform-invariant. Array.from floors a fractional
// length, matching the library.
export function computeStepOptions(
  min: number,
  max: number,
  step: number,
  resolution: number,
): number[] {
  const stepLength = step !== 0 ? step : (max - min) / resolution;
  const count = (step !== 0 ? (max - min) / step : resolution) + 1;
  return Array.from({ length: count }, (_, index) => min + index * stepLength);
}
