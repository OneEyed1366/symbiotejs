---
name: symbiote-dev-examples
description: "Symbiote examples/ vs .examples/ split — read BEFORE wiring up, smoke-testing, or demoing ANY new component/adapter/package/third-party wrapper in an example app, or before editing any example app's package.json dependency versions, metro.config.js, or react-native.config.js. `examples/{react,vue-sfc,vue-tsx,angular}` are PUBLIC canary apps and, since 2026-07-14, are OUTSIDE the pnpm workspace entirely (removed from pnpm-workspace.yaml's `packages:`) — a standalone npm-installable tree with NO `catalog:`/`workspace:*` specifiers (those only resolve inside a pnpm workspace); every dependency is a literal version, and every `@symbiote-native/*` is a pkg.pr.new canary URL until each package has a real npm release. Install with plain `npm install` INSIDE the example directory, never `pnpm install` from repo root. `.examples/{react,vue-sfc,vue-tsx,angular}` (dot-prefixed, gitignored) is UNCHANGED — the ONLY place package/feature/adapter development happens, still inside the pnpm workspace on `workspace:*` for live local-source edits. Covers WHY examples/* left the workspace (pnpm 10.26+'s `blockExoticSubdeps` blocks any transitive URL/git subdependency in a shared pnpm lockfile — a pkg.pr.new preview's own internal @symbiote-native/* cross-deps are URL-based, so a pkg.pr.new dependency anywhere in examples/* poisoned .examples/*'s install too via the single shared lockfile), the metro.config.js/react-native.config.js implications (no more watchFolders/extraNodeModules reaching into monorepo source — @symbiote-native/* resolve from the app's own node_modules like a real consumer; react-native.config.js's manual @symbiote-native/android monorepo-path link is gone now that android is a real npm dep), and the diagnostic for confirming an app's actual dependency source. Trigger on 'add a new example app', 'where do I test/demo this component', 'workspace vs catalog in examples', 'is this app on published or local deps', 'pkg.pr.new canary testing', 'blockExoticSubdeps', or any symbiote-add-component/symbiote-new-adapter/symbiote-third-party-native-view task's verify step."
---

# Symbiote examples/ vs .examples/ — public canary vs dev harness

One question decides which directory a task touches: **are you demonstrating the
published package, or developing against local source?**

## 1. The split (as of 2026-07-14)

```
examples/{react,vue-sfc,vue-tsx,angular}      .examples/{react,vue-sfc,vue-tsx,angular}
  PUBLIC canary apps                            PRIVATE dev harness (gitignored)
  OUTSIDE the pnpm workspace entirely           still INSIDE the pnpm workspace
  (removed from pnpm-workspace.yaml packages:)  every @symbiote-native/* dep = workspace:*
  every dep is a LITERAL version — no           (live link to core/*, adapters/*, packages/*)
  catalog:/workspace:* (neither resolves        where package/component/adapter work happens
  outside a pnpm workspace); @symbiote-native/*
  point at pkg.pr.new canary URLs pending a
  real npm release
  install with plain `npm install` INSIDE       install with `pnpm install` from repo root
  the example dir, never `pnpm install` at root (part of the shared workspace lockfile)
  demonstrates the real npm install experience  tracked in git? NO — never committed
  tracked in git, ships in the repo
```

Both trees carry the SAME full native scaffolding (`ios/` + `android/` projects) —
`.examples/` is not a stripped-down sandbox, it's a full copy of the public app
wired to local source instead of npm.

## 1b. Why examples/* left the pnpm workspace (2026-07-14)

Both trees used to share ONE pnpm workspace and ONE lockfile (`examples/*` on
`catalog:`, `.examples/*` on `workspace:*` — see history in §2 below). That broke
the moment `examples/*` needed a pkg.pr.new canary URL for real-simulator testing:

pnpm 10.26+'s **`blockExoticSubdeps`** setting (`.npmrc` key `block-exotic-subdeps`,
default `true`, boolean-only — no per-package allowlist) blocks any **transitive**
exotic-protocol (URL/git) dependency anywhere in a single shared pnpm-workspace
resolution; only **direct** dependencies may use exotic sources. A pkg.pr.new
preview tarball's own internal `@symbiote-native/*` cross-deps get rewritten to
sibling pkg.pr.new URLs by the `pkg-pr-new` publish tool (it can't emit
`workspace:*` into a published artifact), making them transitive exotic deps from
pnpm's point of view. So a pkg.pr.new URL in `examples/angular/package.json` alone
was enough to break `.examples/angular`'s `pnpm install` too — same shared
lockfile, one poisoned resolution pass — even though `.examples/*` itself never
touched a URL dependency:

```
[ERR_PNPM_EXOTIC_SUBDEP] Exotic dependency "@symbiote-native/components"
(resolved via url) is not allowed in subdependencies when blockExoticSubdeps is enabled
This error happened while installing the dependencies of @symbiote-native/angular@0.4.0
```

The fix: remove `examples/*` from `pnpm-workspace.yaml`'s `packages:` list
entirely. Plain `npm install` (no such supply-chain guard) installs each example
standalone, so a pkg.pr.new URL there can never again reach `.examples/*`'s
resolution. This is a **permanent** architectural split, not a workaround —
`examples/*` was always meant to demonstrate the real external install
experience, and a genuine external consumer was never inside this monorepo's pnpm
workspace either.

**Mechanical fallout, already applied** — read before touching any of these:
- `examples/*/metro.config.js`: no more `watchFolders: [repoRoot]` /
  `extraNodeModules` pointing at `core/`/`adapters/` SOURCE / a `repoRoot` entry in
  `nodeModulesPaths`. `@symbiote-native/*` resolve from the app's own
  `node_modules` like any real npm consumer now.
- `examples/*/react-native.config.js` — DELETED. It existed only to manually link
  `@symbiote-native/android` from `../../packages/android` because android was
  source-only; now it's a real npm dependency (pkg.pr.new URL today, a real
  registry version later), so ordinary RN autolinking discovers it in
  `node_modules` with no config needed.
- Root `vitest.config.ts`'s `test.include` no longer globs
  `examples/*/**/*.test.{ts,tsx}` — examples/* doesn't share the root
  install/lockfile anymore, so its tests (if any) run from inside the example app,
  not the root `vitest run`.
- `pnpm-workspace.yaml`'s `catalog:` entries for `@symbiote-native/*` and the RN
  app toolchain are now mostly dead weight (nothing in the remaining workspace
  references most of them — `.examples/angular`'s own `css-parser` dep is the one
  live exception) — left in place rather than pruned, flagged for a future
  cleanup pass.

## 2. History — why two trees, not one with a flag (pre-2026-07-14 background)

A single `examples/react` cannot serve both jobs at once: the moment in-progress
feature work (new screens, a package under construction) lands in it, it stops
being a trustworthy demo of "what an external user gets by running `npm install
@symbiote-native/react`". This happened for real on 2026-07-04 —
`examples/react/App.tsx` had been gutted into `components/`+`screens/` while
building `packages/navigation`, and all four examples' `package.json` had been
switched to `workspace:*`, none of it committed. The fix at the time: move that
in-progress state into `.examples/react`, and re-derive clean `examples/*` from
`origin/master` (verified — commit `6d9efb9`, every `@symbiote-native/*` dep was
`catalog:` in all four apps). That `catalog:`-based state itself later gave way to
the fully-standalone-npm split above once pkg.pr.new canary testing needed it.

## 3. The P0 rule

**Any task that adds, ports, or wires up a component / adapter / third-party
wrapper / package integrates it ONLY into the matching `.examples/<app>` — never
into `examples/<app>`.** `examples/<app>` is updated later, deliberately, as its
own step: bump the literal version (or swap a pkg.pr.new URL for the real
published version) directly in `examples/*/package.json` — there is no catalog to
bump anymore, since `examples/*` isn't in the pnpm workspace (the precedent, from
back when this WAS a catalog bump: `@symbiote-native/test-utils` was updated in
`examples/*` only after publishing `0.1.1` — see `symbiote-release-publishing`).

This applies to every package-development skill's "verify against a running app"
step: `symbiote-add-component` (parity smoke), `symbiote-new-adapter`
(mount/unmount smoke), `symbiote-third-party-native-view` (native ViewConfig
registration), `symbiote-parity-check` (detox). All of them mean
`.examples/<app>`.

## 4. Gitignore mechanics — no explicit entry needed

`.examples/` is already covered by the existing blanket hidden-folder rule in
`.gitignore`:

```
.*/          ← matches any dotdir at any depth; only .github/, .changeset/, .husky/ are carved back in
```

Confirmed with `git check-ignore -v .examples/react/package.json` → matches
`.gitignore:32:.*/`. Do NOT add a redundant explicit `.examples` line — it's
already silently ignored.

## 5. Diagnostic — which one is this app actually on?

`.examples/<app>` is still inside the pnpm workspace, so its `readlink` check is
unchanged:

```bash
readlink .examples/<app>/node_modules/@symbiote-native/<pkg>
# → ../../../adapters/<pkg> or ../../../core/<pkg>   (real workspace link — correct)
# → node_modules/.pnpm/@symbiote-native+<pkg>@…/…    (published copy — WRONG, means it
#                                                       stopped picking up local edits)
```

`examples/<app>` is a standalone npm install now — there's no workspace symlink to
compare against. Confirm its dependency SOURCE instead by reading the specifier
directly in `examples/<app>/package.json`: a `https://pkg.pr.new/...` URL means
it's on an in-flight canary; a bare semver range means a real npm release.

Run the `.examples/*` readlink check FIRST whenever that app doesn't pick up a
fresh local change.

## Reference

- `symbiote-dependency-catalog` — the `catalog:`/`workspace:*` mechanics `.examples/*` still
  relies on, and the `blockExoticSubdeps` gotcha that drove `examples/*` out of the workspace.
- `symbiote-file-layout` §1 — the monorepo map (`.examples/` sits beside `examples/`).
- `symbiote-release-publishing` — bumping `examples/*` to a real npm version after a publish
  (no longer a catalog bump — a direct literal-version edit in `examples/*/package.json`).
- `symbiote-add-component`, `symbiote-new-adapter`, `symbiote-third-party-native-view`,
  `symbiote-parity-check` — each one's "verify/smoke against a running app" step means `.examples/<app>`.
- History: `origin/master` commit `6d9efb9` — the pre-2026-07-14 all-`catalog:` state (see §2).
