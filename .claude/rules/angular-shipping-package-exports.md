---
paths:
  - "packages/*/package.json"
  - "adapters/angular/package.json"
  - "**/tsconfig.angular.json"
---

# Angular-shipping package: `exports` must be conditional, never a bare string

If this package has (or gains) an Angular entry point (`@Component`/`@Directive`/anything
importable into an Angular component's `imports:` array), its `exports` subpath for that
entry must be a **conditional** object (`types`/`react-native`/`default` → prebuilt
`.d.ts`/`.js` vs raw `src`), built by the package's own `prepare` + `ng:build` scripts —
never a bare string pointing at raw source. A bare string crashes any consumer's `ngc` with
`TS500: Cannot destructure property 'pos' of 'file.referencedFiles[index]'`. Do NOT fix this
by widening the *consumer's* `tsconfig.angular.json` `rootDir` — that's a trap, not a fix.
Before touching either file, invoke the `angular-adapter-build` skill (§2).
