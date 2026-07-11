---
"@symbiote-native/angular": minor
---

Add `@symbiote-native/angular/babel-register-composed`, a Babel plugin (composes into Metro's `babel.config.js`, ahead of `babel-linker`) that reads `selector` off every compiled `ɵɵngDeclareComponent(...)` and auto-calls `registerComposedComponent` for every composed component in the bundle, skipping the closed set of real Fabric intrinsics. Makes manual `registerComposedComponent(...)` calls at each composed component's own definition unnecessary going forward — `ANCHOR_HOST_COMPONENTS` no longer needs a hand-maintained entry for every new composed component, adapter-owned, third-party, or app-authored.
