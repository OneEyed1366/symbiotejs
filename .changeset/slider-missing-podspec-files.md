---
"@symbiote-native/slider": patch
---

Fix the published package missing `react-native.config.cjs` and `symbiote-slider.podspec` (omitted from `files`), which left iOS with no native `RNCSliderComponentView` to autolink and rendered the slider as `Unimplemented component: <RNCSlider>` in any app installing the package from npm.
