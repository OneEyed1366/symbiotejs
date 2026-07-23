---
name: symbiote-dev-examples
description: "Symbiote examples/ vs .examples/ split — read BEFORE wiring up, smoke-testing, or demoing ANY new component/adapter/package/third-party wrapper in an example app, or before editing any example app's package.json dependency versions, metro.config.js, or react-native.config.js. `examples/{react,vue-sfc,vue-tsx,angular}` are PUBLIC canary apps and, since 2026-07-14, are OUTSIDE the pnpm workspace entirely (removed from pnpm-workspace.yaml's `packages:`) — a standalone npm-installable tree with NO `catalog:`/`workspace:*` specifiers (those only resolve inside a pnpm workspace); every dependency is a literal version, and every `@symbiote-native/*` is a pkg.pr.new canary URL until each package has a real npm release. Install with plain `npm install` INSIDE the example directory, never `pnpm install` from repo root; run its scripts with plain `npm run` too. `.examples/{react,vue-sfc,vue-tsx,angular}` (dot-prefixed, gitignored) is UNCHANGED — the ONLY place package/feature/adapter development happens, still inside the pnpm workspace on `workspace:*` for live local-source edits — same split applies to running scripts, not just install: `pnpm --filter <app-name> run <script>`, never bare `npm run`. Covers WHY examples/* left the workspace (pnpm 10.26+'s `blockExoticSubdeps` blocks any transitive URL/git subdependency in a shared pnpm lockfile — a pkg.pr.new preview's own internal @symbiote-native/* cross-deps are URL-based, so a pkg.pr.new dependency anywhere in examples/* poisoned .examples/*'s install too via the single shared lockfile), the metro.config.js/react-native.config.js implications (no more watchFolders/extraNodeModules reaching into monorepo source — @symbiote-native/* resolve from the app's own node_modules like a real consumer; react-native.config.js's manual @symbiote-native/android monorepo-path link is gone now that android is a real npm dep), and the diagnostic for confirming an app's actual dependency source. Trigger on 'add a new example app', 'where do I test/demo this component', 'workspace vs catalog in examples', 'is this app on published or local deps', 'pkg.pr.new canary testing', 'blockExoticSubdeps', or any symbiote-add-component/symbiote-new-adapter/symbiote-third-party-native-view task's verify step."
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
  run scripts with `npm run <script>` (or       run scripts with `pnpm --filter <app-name>
  `npm run ios`/`npm run android`) INSIDE the   run <script>` from repo root, or `cd
  example dir                                   .examples/<app> && pnpm run <script>` — NOT
                                                 `npm run`, even though the script already
                                                 exists and "just runs a shell command":
                                                 npm spawns its OWN module-resolution pass
                                                 over a pnpm-managed node_modules tree of
                                                 symlinks, the same class of confusion the
                                                 whole split exists to avoid
```

Both trees carry the SAME full native scaffolding (`ios/` + `android/` projects) —
`.examples/` is not a stripped-down sandbox, it's a full copy of the public app
wired to local source instead of npm.

**The package-manager split applies to every command, not just install.** `pnpm
--filter <app-name> run <script>` (`<app-name>` is that app's own `package.json`
`"name"` field, e.g. `Canary` for `.examples/react` — NOT the directory name) is the
one to reach for by reflex once you're inside `.examples/*`, exactly the same as
`pnpm install` from repo root — `dev`/`start`/`ios`/`android`/`test` included.

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

## 5b. `.examples/*`'s own `metro.config.js` is a stale copy — read this before flipping any dep to `workspace:*`

All four `.examples/*/metro.config.js` (confirmed for react/vue-sfc/angular; vue-tsx
presumed identical, unverified) are byte-for-byte descendants of the public
`examples/*` template, INCLUDING its comment claiming "examples/\* is a standalone
npm install, decoupled from the monorepo's pnpm workspace" — backwards for `.examples/*`,
which is the opposite (the `workspace:*`-linked harness). None of the four has
`watchFolders`, `resolver.unstable_enableSymlinks`, or `resolver.nodeModulesPaths`.

This stayed invisible because, as of 2026-07-16, all four `.examples/*` apps'
`@symbiote-native/*` deps had drifted to caret ranges (`^0.2.6`) resolving to
PUBLISHED packages in the pnpm store — the §5 readlink check above was failing
("WRONG, published copy") on every one of them, so nobody was actually exercising
live local-source linking through `.examples/*` when this was last touched.

**Symptom, the moment you fix a dep to `workspace:*` and reload:**

```
ERROR  Unable to resolve module @babel/runtime/helpers/interopRequireDefault
from .examples/<app>/index.js: … could not be found within the project or in
these directories: node_modules ../../node_modules …
```

— even though that exact file exists on disk (`.examples/<app>/node_modules/@babel/runtime/…`,
a real pnpm symlink). Two compounding causes:

1. Metro doesn't watch or resolve outside `projectRoot` by default, so once
   `@symbiote-native/react` resolves to real source at `adapters/react` (outside
   `.examples/react`), Metro can't see files under `adapters/react/src/` at all.
2. A PUBLISHED package ships pre-built JS with `@babel/runtime` already a resolved
   sibling dependency inside its OWN `.pnpm` store entry (its package.json declares
   it). Raw workspace SOURCE has no such `node_modules` of its own — a library's
   source never needs its own babel-runtime helper, only whoever transpiles it does
   — and `adapters/react` is not an ancestor directory of `.examples/react`, so
   Metro's ordinary upward `node_modules` climb from the source file's real
   location never reaches `.examples/react/node_modules`.

**Fix** (as of 2026-07-16 applied to ALL FOUR — react/vue-sfc/vue-tsx/angular — each merged into
that app's OWN existing config, preserving its adapter-specific `babelTransformerPath`: react →
`@symbiote-native/react/metro-css-parser`, vue-sfc → `@symbiote-native/vue/metro-vue-transformer`,
vue-tsx → `@symbiote-native/vue/metro-css-parser`, angular → `@symbiote-native/angular/metro-css-parser`
with the new resolver keys placed AFTER the `withSymbioteAngularMetroConfig(...).resolver` spread so
the AOT `resolveRequest` is not clobbered. All four also relinked to `workspace:*` + `pnpm install` →
readlink confirms LOCAL source. Syntax-verified; a full Metro bundle run was NOT yet done, so the
`@babel/runtime` symptom is defended-against by construction but not yet re-proven on device):

```js
const path = require('path');
const repoRoot = path.resolve(projectRoot, '../..');
// merged into the exported config:
watchFolders: [repoRoot],
resolver: {
  unstable_enableSymlinks: true,
  nodeModulesPaths: [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(repoRoot, 'node_modules'),
  ],
  // …existing resolver keys (sourceExts, babelTransformerPath, etc.) stay
},
```

This exact `watchFolders`/`nodeModulesPaths` shape already existed in
`examples/react/metro.config.js` before the 2026-07-14 split (`git show 40f5ded`
shows it removed from the public app) — it just never got carried over into
`.examples/react` when the split happened, since `.examples/*` wasn't actually
being exercised on `workspace:*` at the time. `extraNodeModules` from that old
config is NOT needed here — real workspace symlinks already resolve
`@symbiote-native/*` correctly; only the `@babel/runtime` fallback-root piece is.

## 5c. `.examples/angular`'s adapter dep is inverted (found 2026-07-16)

`.examples/angular/package.json` declares `@symbiote-native/react` (which the app imports ZERO
times — a copy-paste leftover from the react example) but does NOT declare `@symbiote-native/angular`
(which app source imports ~30 times: the bare package plus `/bootstrap`, `/metro-config`,
`/metro-css-parser`, `/typescript-plugin`, `/babel-linker`, `/babel-register-composed`). It resolves
today only via pnpm workspace hoisting from the repo-root `node_modules` (kept alive by the §5b
`nodeModulesPaths: [repoRoot/node_modules]`), so there was no direct `.examples/angular/node_modules/
@symbiote-native/angular` symlink — fragile. FIXED 2026-07-16: swapped them — added
`@symbiote-native/angular: workspace:*`, dropped the unused `@symbiote-native/react`; `pnpm install`
now gives a direct `adapters/angular` symlink. (Recorded so a future session doesn't re-flag it as
still-broken; the deeper lesson is the general one — an `.examples/*` app can import a package it never
declares and limp along on workspace hoisting, invisible until the hoist path changes.)

**The PUBLIC `examples/angular` has the SAME inversion (found 2026-07-16 installing canaries):** its
tracked `package.json` listed `@symbiote-native/react` (unused) and omitted `@symbiote-native/angular`
(imported ~30×). Under npm's flat install it had no workspace hoist to limp on, so it would simply fail to
resolve `@symbiote-native/angular`. Fixed the same way — add `@symbiote-native/angular`, drop the unused
`@symbiote-native/react`. When canary-testing an Angular change, install via pkg.pr.new URLs
(`https://pkg.pr.new/@symbiote-native/<pkg>@<build>`, same build number across all packages) into
`examples/angular` with plain `npm install` inside the dir, and confirm the build carries the change (e.g.
`grep reduceSticky node_modules/@symbiote-native/components/build/index.js`). Canary URLs in
`examples/*/package.json` are TEMPORARY test state — do not commit them; the tracked form is a literal
published version (see `symbiote-release-publishing`).

## 5d. `pod install` "path name contains null byte" — a stale-install artifact, cure with a clean reinstall (found 2026-07-16)

Running `pod install` in `.examples/angular/ios` (or any `.examples/*/ios`) can die with
`ArgumentError - path name contains null byte` deep in CocoaPods
(`file_references_installer.rb` -> `group_for_path_in_group` -> `Pathname#realdirpath`). This is
CocoaPods issue #12866 ("pnpm monorepo … pod install raises pathname contains null byte error
SOMETIMES") — flaky, driven by a corrupt/stale install tree, NOT by the podspecs. The three native
packages' podspecs (`symbiote-navigation`/`-slider`/`-splash-screen`) already vendor their RN source
into a real downward `.rn-screens`/`.rn-slider`/`.rn-bootsplash` copy (`FileUtils.cp_r`), so their own
`source_files` never glob through a symlink — they are NOT the cause.

**Fix (proven 2026-07-16):** delete `node_modules` + the lockfile in the example app and reinstall,
then `pod install` again — the stale state clears and it succeeds. It is a stale-install artifact,
not a `workspace:*` symlink defect: a first, wrong hypothesis was that flipping the native packages
to `workspace:*` (symlinking `packages/*` with their nested pnpm `node_modules` under the pod root)
caused CocoaPods' `Dir.glob(root + '**/*')` to trip on a symlink — reverting the native packages to
published was NOT needed and NOT the fix. Do not chase the podspecs or the dep specifiers; reinstall
first. (Keep the native packages on `workspace:*` per §1/the P0 rule — the clean reinstall keeps that
intact.)

## 5e. `.examples/angular` composed components rendered blank / redboxed — root cause was STALE ngc build artifacts, not workspace symlinks (found 2026-07-16, root-caused + fixed 2026-07-17)

Symptom: on `.examples/angular` (`workspace:*`), an app-authored composed screen (`MenuScreen`, mounted via
`NgComponentOutlet`) did NOT anchor-host — `createElement menuscreen -> menuscreen` (raw native path) instead
of `-> anchor host`, so the screen body was blank white under a working native header on iOS, and a
`Can't find ViewManager 'menuscreen'`/`'Stack'` redbox on Android. ONLY the pnpm `workspace:*` harness; the
public npm-installed `examples/angular` (fresh build) worked. **That very divergence was the clue: canary
builds `build/` from a clean pack, the workspace reuses a LOCAL `build/` that ngc had polluted** — it was never
a symlink-resolution bug at all.

Root cause (proven by `react-native bundle` + grep, NOT theorized): `ngc -p tsconfig.angular.json` never
deletes orphaned outputs. When the adapter renderer moved `src/renderer.ts` → `src/renderer/index.ts`
(folder-as-module), ngc left the orphaned `build/angular/renderer.js` behind, and **a file beats a folder in
Node/Metro resolution**, so the barrel's `export … from './renderer'` loaded the STALE flat `renderer.js` (own
inline `ANCHOR_HOST_COMPONENTS` Set). The bundle then had TWO registry modules — `grep -c 'function
isAnchorHostComponent'` = 1 but `grep -c 'function registerComposedComponent'` = 2, and
`node -e "require.resolve('./build/angular/renderer')"` → `…/renderer.js` not `…/renderer/index.js`.
Registrations wrote one Set, `createElement` read the stale other. After `rm -rf build && ngc` the bundle had
exactly ONE registry.

**The headless-bundle diagnostic (reuse it):** `ngc` the app, `react-native bundle --platform ios --dev true
--reset-cache --bundle-output <tmp>.js`, then grep the output for `function isAnchorHostComponent` (should be
1) vs `function registerComposedComponent` (should be 1) vs `ANCHOR_HOST_COMPONENTS = new Set` (should be 1).
More than one of any = a duplicate/stale registry. This reproduces the split WITHOUT a device.

Fix: every Angular-shipping package (`adapters/angular`, `packages/{slider,navigation,splash-screen}`) now has
`"clean": "rm -rf build"` + `"ng:build": "pnpm run clean && ngc …"`, so a stale output can never shadow again.
(The registry was also moved into a dependency-free leaf `adapters/angular/src/anchor-host-registry.ts` — cheap
cycle-safety hygiene, reached by ONE relative route; the earlier require-cycle theory was never confirmed and
may have been a misdiagnosis of this stale shadow. A subpath-injected variant of the leaf briefly made it WORSE
by splitting the Set two ways under symlinks — see `angular-adapter` §11c. Metro realpath-dedup `resolveRequest`
is a NO-OP, do not re-attempt.)

**Device-verified 2026-07-17** on `.examples/angular` with Metro `--reset-cache` (both the build and the
injected transform changed; a warm Metro serves a stale mix): composed selectors log `createElement <selector>
-> anchor host` and paint on iOS + Android. Full adapter-side record: `angular-adapter` §11c; changeset
`.changeset/angular-anchor-host-leaf-module.md`.

## Reference

- `symbiote-dependency-catalog` — the `catalog:`/`workspace:*` mechanics `.examples/*` still
  relies on, and the `blockExoticSubdeps` gotcha that drove `examples/*` out of the workspace.
- `symbiote-file-layout` §1 — the monorepo map (`.examples/` sits beside `examples/`).
- `symbiote-release-publishing` — bumping `examples/*` to a real npm version after a publish
  (no longer a catalog bump — a direct literal-version edit in `examples/*/package.json`).
- `symbiote-add-component`, `symbiote-new-adapter`, `symbiote-third-party-native-view`,
  `symbiote-parity-check` — each one's "verify/smoke against a running app" step means `.examples/<app>`.
- History: `origin/master` commit `6d9efb9` — the pre-2026-07-14 all-`catalog:` state (see §2).
