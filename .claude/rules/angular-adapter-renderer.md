---
paths:
  - "adapters/angular/src/**/*.ts"
  - "packages/*/src/angular/**/*.ts"
---

# Angular adapter/renderer source — read `angular-adapter` first

Any composed `@Component` used as a plain `<Tag>` (adapter-authored, app-authored, or
navigation-package-authored) MUST be in `ANCHOR_HOST_COMPONENTS`, or it silently paints
wrong/invisible on a real device — never provable via vitest/tsc/ngc alone. The registry
(`ANCHOR_HOST_COMPONENTS` + `registerComposedComponent` + `isAnchorHostComponent`) lives in the
dependency-free LEAF module `adapters/angular/src/anchor-host-registry.ts` (NOT in the
require-cyclic `renderer/index.ts`); the renderer imports it and the barrel re-exports
`registerComposedComponent` off it, BOTH by relative path (one Metro resolution route → one Set),
and the babel-register-composed plugin injects the barrel import. Do NOT give it a package subpath
injected alongside the relative imports (two routes → two Sets under pnpm symlinks). The bug that
actually surfaced this was STALE ngc BUILD ARTIFACTS: `ngc -p` never deletes orphaned outputs, so a
renamed source (`renderer.ts` → `renderer/index.ts`) leaves `build/angular/renderer.js` behind and a
file shadows a folder in Metro resolution → a stale second registry Set. Every Angular package now
`rm -rf build` before `ngc` (its `clean` script) — do NOT drop that. Device-verified 2026-07-17. See
angular-adapter §11c. The lookup is case-INsensitive (fixed 2026-07-09): a
component mounted via `NgComponentOutlet`/`ViewContainerRef.createComponent` (every screen
`Stack`/`Tab`/`Drawer` mounts) reaches `createElement` with its selector LOWERCASED by
Angular's runtime, unlike a static template tag which keeps its authored case — do not
reintroduce a case-sensitive check. Before editing renderer/component logic here, invoke the
`angular-adapter` skill (§11/§11a) and the `angular-adapter-build` skill.
