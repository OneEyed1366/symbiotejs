---
paths:
  - "core/components/package.json"
  - "adapters/*/package.json"
  - "packages/*/package.json"
---

# `@symbiote-native/engine` MUST be a peerDependency, never a regular dependency

Every adapter (`react`/`vue`/`angular`) and every package that imports engine internals
(`isSymbioteNode`, `dispatchViewCommand`, the commit mirror, …) declares
`"@symbiote-native/engine": ">=0.1.0"` under `peerDependencies` (plus `"workspace:*"` under
`devDependencies` for local pnpm-workspace dev/test) — mirroring the existing `react`/
`react-native` singleton-peer treatment (`<react_native_is_an_explicit_top_level_peer>` in
CLAUDE.md). NEVER move it back to a plain `dependencies` entry.

## Why: engine holds module-scope singleton state

`core/engine/src/node.ts`'s `BRAND` is a `Symbol()` created once per module evaluation.
`createElement` stamps it on every node; `isSymbioteNode` checks `BRAND in value`. Two
separate module instances of `@symbiote-native/engine` — from two packages each declaring it
as a regular `dependencies` entry — produce two DIFFERENT `BRAND` symbols. A node created via
ONE copy's `createElement` fails `isSymbioteNode` when checked via the OTHER copy, even
though the object is structurally identical (same `type`/`component`/`props`/`children` keys,
even the grafted `measure`/`setNativeProps`/`focus` methods) — confirmed by dumping
`Object.getOwnPropertySymbols(node).length` (returned 1: a foreign symbol, not zero).

Inside the pnpm workspace this is invisible — pnpm dedupes `workspace:*` siblings. It only
surfaces in a standalone `npm install` outside the workspace (`examples/*`, per
`symbiote-dev-examples`), where every `@symbiote-native/*` dependency is a `pkg.pr.new`
COMMIT-PINNED URL, not a semver range. Publishing several packages at different points in the
same session (a normal canary workflow) pins each one's own `@symbiote-native/engine`
dependency to whatever canary commit was current AT THAT PUBLISH — three packages published an
hour apart can each pin a DIFFERENT commit URL. npm cannot dedupe distinct URLs no matter how
their internal `"version"` field reads, so multiple engine copies land side by side in
`node_modules` (e.g. `node_modules/@symbiote-native/engine` AND
`node_modules/@symbiote-native/navigation/node_modules/@symbiote-native/engine`).

## The concrete incident (2026-07-15)

Angular's `HeaderOptionsScreen` search-bar buttons (`focus`/`setText`/`clearText`/
`cancelSearch`) silently no-op'd — direct native taps on the search bar worked fine
(`onFocus` fired), but the imperative `SearchBarCommands` ref never attached
(`searchBarRef.current` stayed `null` forever, with zero error/warning). Root cause:
`SearchBarRefDirective` (`packages/navigation/src/angular/search-bar-ref.directive.ts`) reads
the native node via Angular's `ElementRef.nativeElement` — created by
`@symbiote-native/angular`'s OWN copy of `createElement` — then checks it with
`@symbiote-native/navigation`'s OWN copy of `isSymbioteNode`. This is a genuine cross-package
identity check. React's and Vue's equivalent search-bar ref is a callback PROP resolved
inside the SAME `createElement` call, entirely within `@symbiote-native/navigation`'s own
module graph — it never crosses a package boundary, so the same engine-duplication bug never
had a code path to manifest through on those adapters. Any FUTURE cross-package
`isSymbioteNode`/mirror check (not just this one) is equally exposed until engine is a true
singleton.

## Diagnosing this class of bug

1. A ref/imperative-API path silently no-ops with no error, while direct native
   interaction on the same view works fine → suspect a node-identity mismatch, not a missing
   wire-up.
2. Confirm live: dump `Object.getOwnPropertySymbols(node).length` and `node.constructor.name`
   at the failing `isSymbioteNode`/mirror-lookup call site. `constructor.name === 'Object'`
   with `symbols > 0` (not `0`) means a REAL node from a DIFFERENT engine copy, not a fake/
   unbranded object.
3. Check for duplicate `@symbiote-native/engine` installs:
   `find <app>/node_modules -path "*@symbiote-native/engine*package.json"` — more than one hit
   confirms it.
4. Fix: `@symbiote-native/engine` → `peerDependencies` in the offending package (and, since the
   underlying architectural rule is universal, audit every other package too — don't patch just
   the one that happened to surface a symptom).

Full incident writeup, the `mobile-mcp` live-repro method (device tap vs. imperative-ref tap
diverging), and the throwaway `node_modules` diagnostic-patch technique used to confirm it:
`.changeset/engine-peer-dependency-singleton.md`.
