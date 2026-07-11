---
"@symbiote-native/engine": patch
"@symbiote-native/components": patch
"@symbiote-native/angular": patch
---

Consolidate several independently-duplicated pieces of logic found during an architecture review, with no behavior change intended:

- `isSymbioteEvent` now lives once in the engine (`node.ts`) and is shared by `core/components` and eight Angular components that each had their own copy (the shared guard narrows `nativeEvent` to a non-null object, slightly stricter than a couple of the old presence-only checks).
- `core/components/src/state/scroll-routing-handle.ts` gives `VirtualizedList`/`SectionList` a shared `IScrollRoutingHandle` base; `layout-event.ts` centralizes reading a numeric field out of `nativeEvent.layout`, replacing three separate reimplementations in `ScrollView`/`VirtualizedList`.
- A new `createDeviceEventModule` factory in the engine's `native-modules.ts` backs `AccessibilityInfo`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, and `Keyboard`, each keeping its own degrade policy.
- `touch-history.ts` and the image pipeline (`image-loader.ts` statics, `image-source-resolver.ts`) are extracted out of `events/index.ts` and the `Image` view layer respectively, so the view stays render-only.
- `render-pressable.ts` exports `shouldSuppressPress`/`shouldClaimResponder`/`isTerminationAllowed`, now shared by the Angular Pressable adapter — this resolves one real divergence, aligning Angular's `cancelable === undefined` handling with the other adapters' native-default behavior instead of its old hardcoded `cancelable !== false`.
