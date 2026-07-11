---
"@symbiote-native/angular": patch
---

Fix Angular's `AnimatedScrollView` never applying `ScrollView`'s base style (`overflow: 'scroll'` + per-axis `flexDirection`) — its bespoke template built props by hand instead of going through `selectScrollIntrinsics`, so on iOS Fabric never clipped the scroll view's content to its own frame (Android was unaffected since its native `ViewGroup` clips regardless of the style prop). The inner content view now also gets `contentStyle` from the same intrinsics selection, mirroring the real `ScrollView`'s `contentProps` getter.
