---
"@symbiote-native/angular": patch
"@symbiote-native/slider": patch
"@symbiote-native/navigation": patch
"@symbiote-native/splash-screen": patch
---

Clean the ngc output dir before every Angular build, and move the anchor-host registry into a leaf module.

Composed Angular components (app screens mounted via `NgComponentOutlet`, and statically-tagged
navigation components like `Stack`) rendered blank on iOS / redboxed on Android
(`Can't find ViewManager '<selector>'`) under the `.examples/angular` workspace harness, while the
freshly-built npm/canary `examples/angular` worked. Root cause: `ngc -p` never deletes orphaned outputs,
so after the renderer moved `src/renderer.ts` → `src/renderer/index.ts` the stale `build/angular/renderer.js`
lingered and — because a file shadows a folder in Node/Metro resolution — was loaded instead of
`build/angular/renderer/index.js`. It carried its own inline `ANCHOR_HOST_COMPONENTS` Set, so the bundle had
two registry modules: `registerComposedComponent` wrote one, `createElement` read the stale other, and every
composed selector fell through to a raw native view name.

Every Angular-shipping package (`@symbiote-native/angular`, `@symbiote-native/slider`,
`@symbiote-native/navigation`, `@symbiote-native/splash-screen`) now runs `rm -rf build` before `ngc`, so a
stale output can never shadow the current one again. The anchor-host registry
(`ANCHOR_HOST_COMPONENTS` + `registerComposedComponent` + `isAnchorHostComponent`) also moved out of
`renderer/index.ts` into a dependency-free leaf module `anchor-host-registry.ts`, reached by a single relative
import route, as cheap cycle-safety hygiene. Public API unchanged.
