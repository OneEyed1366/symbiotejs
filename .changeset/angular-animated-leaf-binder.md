---
"@symbiote-native/angular": patch
---

Extract `AnimatedImage`'s ~100 lines of duplicated leaf-lifecycle orchestration (`reconcile`/`bindNode`/`attachEvents`/`detachEvents`) — copy-pasted from `AnimatedComponentBase` because `AnimatedImage` must extend `ImageBase` instead — into a shared `AnimatedLeafBinder` (composition instead of inheritance). Both classes now hold one as a field and delegate to it; no behavior change.
