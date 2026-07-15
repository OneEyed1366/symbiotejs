---
paths:
  - "adapters/angular/src/**/*.ts"
  - "packages/*/src/angular/**/*.ts"
---

# Angular adapter/renderer source — read `angular-adapter` first

Any composed `@Component` used as a plain `<Tag>` (adapter-authored, app-authored, or
navigation-package-authored) MUST be listed in `adapters/angular/src/renderer.ts`'s
`ANCHOR_HOST_COMPONENTS`, or it silently paints wrong/invisible on a real device — never
provable via vitest/tsc/ngc alone. The lookup is case-INsensitive (fixed 2026-07-09): a
component mounted via `NgComponentOutlet`/`ViewContainerRef.createComponent` (every screen
`Stack`/`Tab`/`Drawer` mounts) reaches `createElement` with its selector LOWERCASED by
Angular's runtime, unlike a static template tag which keeps its authored case — do not
reintroduce a case-sensitive check. Before editing renderer/component logic here, invoke the
`angular-adapter` skill (§11/§11a) and the `angular-adapter-build` skill.
