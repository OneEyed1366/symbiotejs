// Side-effect: register RNCSlider's ViewConfig in RN's ReactNativeViewConfigRegistry. Evaluating
// the codegen native-component spec (codegenNativeComponent('RNCSlider', …)) registers the
// ViewConfig getter the engine reads via setNativeViewConfigSource, so the engine can derive
// RNCSlider's events and color/image processors on first commit. We pull the codegen SPEC, never
// the library's default export (Slider.tsx, a React component using hooks) — this module has no
// hooks, so it is framework-agnostic and shared by every adapter entry (vue / react). Each adapter
// barrel imports it; the component modules and their headless tests stay free of the spec.

import '@react-native-community/slider/dist/RNCSliderNativeComponent';
import { processColor, registerComponent, type IColorValue } from '@symbiote-native/engine';
import {
  RNC_SLIDER_VIEW_NAME,
  SLIDER_ON_CHANGE,
  SLIDER_ON_VALUE_CHANGE,
  SLIDER_ON_SLIDING_START,
  SLIDER_ON_SLIDING_COMPLETE,
  SLIDER_ON_ACCESSIBILITY_ACTION,
} from '../core';

function listenerName(prop: string): string {
  return prop.charAt(2).toLowerCase() + prop.slice(3);
}

function processSliderColor(value: unknown): unknown {
  return processColor(value as IColorValue);
}

// Fallback metadata for the native slider. RN's codegen module above normally registers the same
// ViewConfig into ReactNativeViewConfigRegistry, but relying only on that side effect is brittle on
// Metro/RN version boundaries: if the registry lookup misses, the slider still mounts, but tint
// props stay raw and native value events never route back to JS. Keep the explicit fallback here,
// in the wrapper package that owns RNCSlider, so React/Vue/Angular all inherit the same behavior.
registerComponent(RNC_SLIDER_VIEW_NAME, {
  events: [
    { raw: 'topChange', listener: listenerName(SLIDER_ON_CHANGE) },
    { raw: 'topRNCSliderValueChange', listener: listenerName(SLIDER_ON_VALUE_CHANGE) },
    {
      raw: 'topRNCSliderSlidingStart',
      listener: listenerName(SLIDER_ON_SLIDING_START),
      direct: true,
    },
    {
      raw: 'topRNCSliderSlidingComplete',
      listener: listenerName(SLIDER_ON_SLIDING_COMPLETE),
      direct: true,
    },
    {
      raw: 'topRNCSliderAccessibilityAction',
      listener: listenerName(SLIDER_ON_ACCESSIBILITY_ACTION),
      direct: true,
    },
  ],
  processors: {
    minimumTrackTintColor: processSliderColor,
    maximumTrackTintColor: processSliderColor,
    thumbTintColor: processSliderColor,
  },
});
