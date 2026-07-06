---
name: symbiote-rn-import-testability
description: "Symbiote react-native-import testability — read BEFORE writing any NEW file in core/engine, core/components, or an adapter (adapters/react|vue|angular) that imports from 'react-native' directly (processColor, DeviceEventEmitter, Image, AppRegistry, a deep RN internal path, etc.), or before adding a new package.json 'exports' subpath, or when a Vitest run throws 'RolldownError: Parse failure: Flow is not supported' / 'Cannot find package react-native'. Covers: (1) WHY — react-native's own source is Flow syntax; Vitest's Rolldown/Vite transform cannot parse it, so a file that imports 'react-native' must stay OUTSIDE every package's main index.ts barrel and outside anything a test transitively imports. (2) THE PATTERN — export such a file via a separate package.json 'exports' subpath (precedent: './metro-css-parser', './runtime-helpers', './bootstrap') instead of the main barrel; Metro resolves these subpaths fine (unstable_enablePackageExports is on by default in this repo's metro-config). (3) THE TEST RECIPE — vi.mock('react-native', factory) (+ any deep RN subpath actually imported) fully shields a module under test, verified empirically. (4) UNTYPED DEEP RN IMPORTS — use a local `// @ts-expect-error` comment at the import site (existing precedent: adapters/react/src/create-portal.ts, host-config.ts, render.ts), NOT a standalone ambient .d.ts file — an ambient declare-module shim silently fails to be picked up by a DIFFERENT package's separate TypeScript program (e.g. the Angular adapter's own ngc compile), because ambient declarations are only visible within the SAME tsconfig 'include' set, not merely 'reachable via import chain'. (5) a new package may not inherit @types/node (process/console) resolution the way a sibling package does — verify with a real tsc build, add an explicit 'types': ['node'] to that package's tsconfig.json if it doesn't. For the Angular-specific twist on subpath exports (conditional exports shape, ngc/AOT), see angular-adapter-build instead. For workspace: vs catalog: protocol on @symbiote-native/* deps, see symbiote-dependency-catalog."
---

# Symbiote — importing `react-native` from a new file, and keeping it testable

`react-native`'s own package source is written in **Flow**, not plain JS/TS. Vitest's
transform pipeline (Rolldown/Vite) cannot parse Flow — confirmed empirically, this
session: even `core/engine`, which already declares `react-native` as a
`peerDependency`, throws

```
RolldownError: Parse failure: Flow is not supported
  react-native@0.86.0/node_modules/react-native/index.js:1:0
```

the moment a test **transitively** imports `'react-native'`. This is why, before this
session, **no file anywhere in `core/` or `adapters/**` imported `react-native`
directly** — only the untyped, never-unit-tested `examples/*/index.js` entry files did
(Metro bundles those; Metro strips Flow, Vitest never touches them). The moment a new
file needs a real RN binding (`processColor`, `DeviceEventEmitter`, `Image`,
`AppRegistry`, a deep internal path like
`react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry`), this constraint
applies — check this skill first, don't rediscover it by chasing a cryptic Rolldown
parse error.

## The rule

**A new file that imports `'react-native'` directly must be unreachable from every
package's main `index.ts` barrel, and unreachable from anything a Vitest test imports
— directly or transitively.** If `index.ts` (or a test) re-exports/imports it even one
hop away, the whole test file that touches that barrel breaks with the Flow parse
error above, not just the new file's own tests.

The fix is a **separate `package.json` `"exports"` subpath**, never the main barrel.
This repo already had the pattern for other reasons before this was documented —
`adapters/react`'s and `adapters/vue`'s `"./metro-css-parser"`, Vue's
`"./runtime-helpers"` — this skill exists to name the REASON explicitly so the next RN
import doesn't have to rediscover it the hard way:

```jsonc
// core/components/package.json (same shape used by adapters/react|vue's "./bootstrap")
"exports": {
  ".": "./src/index.ts",              // main barrel — Vitest-reachable, MUST stay react-native-free
  "./bootstrap": "./src/bootstrap.ts" // imports react-native directly — kept OUT of "."
}
```

Consumers import the subpath explicitly (`import { bootstrapHost } from
'@symbiote-native/components/bootstrap'`), never the bare package. Metro resolves this
fine: `metro-config@0.84.4` (pulled by `react-native@0.86.0` in this repo) sets
`unstable_enablePackageExports: true` by default — verified by reading
`metro-config/src/defaults/index.js` directly, not assumed — so a real app bundle
picks up the subpath correctly with no extra Metro config.

**Exception — `adapters/angular`.** A plain string subpath is NOT enough there, even
for a decorator-free file, because the package's whole `src/` is one module graph and
ngc's AOT pipeline needs a conditional `exports` shape (`"types"` / `"react-native"` /
`"default"`) pointing Metro at the *compiled* output. See `angular-adapter-build`
§2a for the exact shape and the concrete failure mode
(`SyntaxError ... decorators isn't currently enabled`) if you skip it.

## Testing a file that imports `react-native`

`vi.mock('react-native', factory)` fully shields it — Vitest substitutes the mock
before Rolldown ever attempts to parse the real Flow source. Mock every deep RN
subpath the file actually imports too:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  processColor: vi.fn(),
  DeviceEventEmitter: { addListener: vi.fn() },
  Image: { resolveAssetSource: vi.fn() },
}));
vi.mock('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry', () => ({
  get: vi.fn(),
}));

// Import the module under test AFTER the mocks (dynamic import keeps mock hoisting correct).
const { bootstrapHost } = await import('./bootstrap');
```

Reference: `core/components/src/bootstrap.test.ts`.

## Untyped deep RN internal imports — `@ts-expect-error`, not an ambient `.d.ts`

A deep RN path with no shipped types (e.g.
`react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry` — plain `.js`, no
`.d.ts`) needs *some* type-error suppression. This codebase's established pattern is a
plain comment at the import site:

```ts
// @ts-expect-error react-native ships no types for this internal path (plain .js) — the
// try/catch below is what actually proves the shape, not TS.
import * as ReactNativeViewConfigRegistry from 'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry';
```

(precedent: `adapters/react/src/create-portal.ts`, `host-config.ts`, `render.ts`).

**A standalone ambient `declare module 'x' {}` `.d.ts` file was tried first and
rejected** — it works for the file's own package's `tsc --build` (the `.d.ts` sits in
that package's own `"include"` glob), but silently fails to help a **different**
package's separate TypeScript program that transitively resolves into the same raw
source. Concretely: `core/components/src/react-native-view-config-registry.d.ts`
fixed `pnpm --filter @symbiote-native/components run typecheck`, but
`adapters/angular`'s own `ngc -p tsconfig.angular.json` (a completely separate
compile, `"include": ["src/**/*.ts"]` scoped to `adapters/angular/src` only) still
threw `TS7016: Could not find a declaration file`, because it resolves
`@symbiote-native/components/bootstrap` to raw source and ambient module declarations
are only visible within the SAME TypeScript Program's `include` set — not merely
"reachable via an import chain." `@ts-expect-error` has no such cross-program
visibility problem: it's self-contained at the one call site, so it works identically
regardless of which tsconfig/build tool (`tsc --build`, `ngc`, Vitest's transform) ends
up parsing that line.

## A new package may not inherit `@types/node` (`process`, `console`, …) for free

`core/engine` resolves `process.env`/`console` fine with **no** explicit `@types/node`
devDependency and no `"types"` tsconfig field — apparently via incidental pnpm
hoisting. A brand-new sibling package is not guaranteed the same luck: `core/components`
needed an explicit `"@types/node": "catalog:"` devDependency **and** an explicit
`"types": ["node"]` added to its `tsconfig.json`'s `compilerOptions` before `process`
resolved, even after confirming (`node -e "require.resolve('@types/node/package.json',
{paths:['core/components']})"`) that the package really was symlinked in. The exact
root cause (a pnpm-hoisting / TS composite-project interaction — `core/components` has
a `"references": [{"path": "../engine"}]` entry engine itself lacks) wasn't fully
chased down; the practical rule is: **don't assume a new package inherits ambient
Node-global resolution from a sibling — verify with a real `tsc --build` /
`--noEmit` run, and add `"types": ["node"]` if it doesn't.**

## Related skills

- `angular-adapter-build` — the Angular-specific twist on subpath exports (conditional
  `exports` shape, `ngc`/AOT, why a decorator-free file still needs it).
- `symbiote-dependency-catalog` — `workspace:*` vs `catalog:` for `@symbiote-native/*`
  deps; a package under active local development must use `workspace:*` in
  `examples/*/package.json` or a fresh export/subpath silently 404s against the last
  published npm version instead.
- `symbiote-third-party-native-view` — a related but distinct RN-import concern (the
  library's own React *component*, not a raw RN binding).
