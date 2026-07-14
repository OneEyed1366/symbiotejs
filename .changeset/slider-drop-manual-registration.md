---
"@symbiote-native/slider": patch
---

Angular's `Slider` no longer self-registers as an anchor host at module load — `@symbiote-native/angular/babel-register-composed` now covers it automatically, the same as every other composed Angular component. A consuming app must wire that Babel plugin into its `babel.config.js` (see the `angular-adapter-build` skill) for `Slider` to render correctly under Angular.
