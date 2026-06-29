// Side-effect: register RNCSlider's ViewConfig in RN's ReactNativeViewConfigRegistry. Evaluating
// the codegen native-component spec (codegenNativeComponent('RNCSlider', …)) registers the
// ViewConfig getter the engine reads via setNativeViewConfigSource, so the engine can derive
// RNCSlider's events and color/image processors on first commit. We pull the codegen SPEC, never
// the library's default export (Slider.tsx, a React component using hooks) — this module has no
// hooks, so it is framework-agnostic and shared by every adapter entry (vue / react). Each adapter
// barrel imports it; the component modules and their headless tests stay free of the spec. See
// CLAUDE.md <third_party_rn_packages_are_react_only> and ADR 0027.

import '@react-native-community/slider/dist/RNCSliderNativeComponent';
