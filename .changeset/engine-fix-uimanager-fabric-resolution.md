---
"@symbiote-native/engine": patch
---

Fix `LayoutAnimation`'s `resolveUIManager` carrying a dead fallback native-module name (`'FabricUIManager'`) that can never resolve on a real device: RN never registers a TurboModule under that name. It now mirrors React Native's actual two-mechanism resolution: read `globalThis.nativeFabricUIManager`'s layout-animation capability directly first (Fabric's JSI global slot, not a TurboModule), then fall back to the single correctly-named `getNativeModule('UIManager')`.
