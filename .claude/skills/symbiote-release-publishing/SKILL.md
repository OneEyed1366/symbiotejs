---
name: symbiote-release-publishing
description: "Symbiote npm publishing & versioning — read before touching .changeset/**, a publishable package's `publishConfig`/`files`/`exports`, .github/workflows/release.yml, or running `pnpm changeset`/`pnpm run release`. Versioning is Changesets (`pnpm changeset` → PR → 'Version Packages' PR → merge → CI publishes). Core trick: `main`/`exports` keep pointing at `src/index.ts` for in-repo dev (Metro/tsc resolve live TS, unchanged) — `publishConfig` overrides those to `build/` ONLY inside the tarball, never touching local resolution. No new bundler: `tsc --build` already emits `build/`, so `typecheck` IS the build. `@symbiote-native/angular`/`@symbiote-native/slider`'s `./angular` entry predate this, use a DIFFERENT mechanism (conditional `exports`, AOT build) — don't convert or copy that onto plain packages. Covers the mechanism table, the `files`-mandatory gotcha (`.gitignore` excludes `build/`), the `fix-esm-extensions` argument-list gotcha (a package missing from it ships an unimportable `build/` for every real npm consumer, invisible in-repo), changeset ignore list, release scripts, the `checks.yml` reusable-workflow CI gate (`ci.yml` + `release.yml` both call it, sequencing publish after lint/typecheck/test), and the canary release flow — a REAL npm publish under the `canary` dist-tag, auto-triggered on every PR and gated by a GitHub Environment reviewer approval (`select-canary-dirs.mjs` auto-detects changed packages via `git diff`, `trust:publishers` is now mandatory immediately at package-scaffold time, a `cleanup-canary-versions.mjs` retention cron keeps the registry from growing forever) — which REPLACED an earlier pkg.pr.new-based mechanism (manual `workflow_dispatch`, one checkbox per package, never touched the real npm registry, now removed entirely), and why a 'pnpm cache is not found' + 'Failed to save ... another job may be creating this cache' pair across checks.yml's parallel lint/typecheck/test jobs is an expected first-run/same-key race, not a broken cache (diagnose via job logs, not the Actions UI summary). Trigger: 'publish npm', 'release', 'changeset', 'version bump', 'publishConfig', 'canary release', 'CI publish', 'pkg.pr.new', 'canary dist-tag', 'trust:publishers', 'pnpm cache not found', 'actions cache'."
---

# Symbiote npm publishing & versioning

Versioning is [Changesets](https://github.com/changesets/changesets); publishing
ships **compiled JS + `.d.ts`**, never raw `.ts`, without disturbing the
zero-build in-repo dev loop (Metro resolving `src/*.ts` directly today).

> **Why this exists.** The repo is about to publish `@symbiote-native/*` to npm once
> Angular + docs land. Every package currently ships `main`/`exports` pointing
> straight at `src/index.ts` — correct for Metro inside the monorepo, wrong for
> an external consumer whose Metro config doesn't know to transform a
> node_modules TS package. The fix had to add zero risk to the thing that
> already works (in-repo dev), which is why it's a `publishConfig` overlay, not
> a rewrite of `main`/`exports`.

## The mechanism — one sentence

**`main`/`module`/`types`/`exports` stay pointed at `src/index.ts` (unchanged,
still what Metro/tsc resolve in-repo); `publishConfig` repeats those same keys
pointed at `build/`, and pnpm swaps them in ONLY inside the packed tarball** —
local resolution never sees `publishConfig` at all.

```jsonc
// core/engine/package.json — the plain-package pattern (4 of 7 packages)
{
  "main": "src/index.ts",              // ← Metro/tsc resolve this in-repo, unchanged
  "module": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "files": ["build"],                   // ← REQUIRED, see Gotchas
  "publishConfig": {
    "access": "public",
    "main": "./build/index.js",         // ← only these are what `npm install`ers get
    "module": "./build/index.js",
    "types": "./build/index.d.ts",
    "exports": {
      ".": { "types": "./build/index.d.ts", "default": "./build/index.js" }
    }
  }
}
```

Verify the override actually applies by packing for real, not by reading the
source `package.json`:

```bash
cd core/engine && pnpm pack --pack-destination /tmp
tar -xzf /tmp/symbiote-engine-0.0.0.tgz -C /tmp/x && cat /tmp/x/package/package.json
# main/module/types/exports now show build/, publishConfig is gone (already applied)
```

## The non-obvious fact: there is no new build tool

`tsc --build` already emits `build/index.js` + `build/index.d.ts` today,
because every package's `tsconfig.json` extends `tsconfig.base.json`, which
already sets `declaration: true, composite: true, noEmit: false, outDir:
"build"`. The root `"typecheck": "tsc --build"` script was, unnoticed, already
a build script — it just also happened to satisfy the project-references
type-check. **Do not add tsup/unbuild/rollup** for this — it would duplicate
what `tsc --build` gives for free and the paths in `publishConfig` are chosen
to match its actual output 1:1 (verified by running it, not assumed).

## Which package uses which mechanism

| Package | Mechanism | Why |
|---|---|---|
| `@symbiote-native/engine` | `publishConfig` override (above) | plain TS, no AOT need |
| `@symbiote-native/components` | same | plain TS |
| `@symbiote-native/react` | same | plain TS |
| `@symbiote-native/vue` | same, **multi-entry** (`.` + `./runtime-helpers`, mirrored 1:1 in `publishConfig.exports`) | plain TS, two entry points |
| `@symbiote-native/angular` | **pre-existing conditional `exports`** (`types`/`react-native`/`default`), built by `"prepare": "pnpm run ng:build"` (`ngc -p tsconfig.angular.json` → `build/angular/`) | needs real Angular AOT compilation, which `tsc --build` cannot do — only `publishConfig.access` was added, the exports block is untouched |
| `@symbiote-native/slider` | its `./angular` sub-export uses the same conditional pattern as above (`build-ngc/angular/`); `.`/`./vue`/`./react` use the plain `publishConfig` override pointed at `build/{core,vue,react}/index.js` | mixed: one AOT entry + three plain entries in one package |
| `@symbiote-native/android` | no build at all — ships tracked native `android/` source as-is | pure native module, no JS/TS to compile |

**Do not cross the two mechanisms.** Conditional `exports` on a plain package
would make Metro resolve `build/` even in-repo (conditions are evaluated
identically locally and externally) and silently break the zero-build dev
loop the other 4+3 packages rely on. `publishConfig` is inert until
`pnpm pack`/`pnpm publish`, which is exactly why it's the right tool for
everything that doesn't need AOT.

## Gotcha: `.gitignore` will silently eat your dist unless `files` says otherwise

`build/`, `build-ngc/`, and `dist/` are all gitignored (`.gitignore`). `npm`/
`pnpm pack` falls back to `.gitignore` for what to exclude from a tarball when
no `files` field is present — meaning without an explicit `"files"` array,
the just-built `build/` output would be **silently stripped from the
package you publish**, shipping an empty/broken tarball. Every publishable
package.json in this repo has an explicit `"files"` array for this reason:
`["build"]` for the plain packages, `["src", "build"]` / `["src", "build",
"build-ngc"]` for the Angular-conditional ones (their `default` export
condition still points at `src/*.ts`, so `src/` must ship too), `["android"]`
for the native-only package.

## Gotcha (fixed 2026-07): the hidden-folder `.gitignore` rule ate `.github/` itself

`.gitignore` had `.*/` to keep local-only dotfolders (`.claude`, `.docs`,
`.notes`, `.vendors`, …) out of git. That pattern also matches `.github/` —
so `.github/workflows/release.yml` existed on disk, was described by this very
skill, and `git status`/`git add -A` never showed it as untracked (blanket
dir-ignore, not a per-file miss) — it was **never committed, never pushed,
never run**, for as long as that rule existed. `git check-ignore -v <path>`
is what surfaces this; plain `git status` looks clean because an ignored
directory just doesn't appear at all, ignored or not-yet-tracked look
identical from a glance. Fixed with an explicit re-include after the blanket
rule:
```
.*/
!.github/
```
**Lesson for any FUTURE blanket-ignore rule in this repo**: verify with
`git check-ignore -v <path>` (or `git status --porcelain -- <dir>` showing
`??`) that it isn't also swallowing something that must ship — a directory
pattern that "obviously" only means local scratch dirs can silently net a
real one too.

## Gotcha (found 2026-07 via the canary-release CI work): `fix-esm-extensions` must list EVERY publishable package's `build/`

`fix-esm-extensions` (see `scripts/fix-esm-extensions.mjs`'s own header
comment for why it exists at all — `tsc --build` emits relative imports with
no extension, which Node's own ESM loader rejects outside a bundler) only
rewrites the `build/` directories passed to it as CLI args in the root
`fix-esm-extensions` script. `core/test-utils/build` was missing from that
argument list since the package was first published — every published
version (0.1.1 through 0.1.3) shipped a `build/index.js` doing
`export * from './fake-fabric'` (no `.js`), which fails at import time for
any REAL npm consumer (`Cannot find module '.../build/fake-fabric'`) while
looking completely fine in-repo, because Metro/Vitest resolve `src/*.ts`
directly and never touch `build/` at all. Caught only because adding a
`test` job to CI (running `pnpm run test` against `examples/*`'s real
`catalog:`-installed `@symbiote-native/test-utils`) turned it from
"invisible" to "one failing suite, 833/834 passing." **When adding a new
publishable package with its own `build/` output, add it to the
`fix-esm-extensions` script's argument list in the SAME change** — it is not
inferred from `files`/`publishConfig`, it's a flat, easy-to-forget list.
Fixed by adding `core/test-utils/build` to the list; see the
`test-utils-esm-extension` changeset for the republish.

## Gotcha (found 2026-07-23 via a `sensors` canary that shipped with no `build/` at all): a mixed-mechanism package's `clean` script must target `build-ngc`, never `build`

Any package with the **mixed mechanism** (a plain `publishConfig` override for
`.`/`./react`/`./vue` pointed at `build/{core,react,vue}/...`, PLUS a
conditional `./angular` export pointed at a *separate* `build-ngc/angular/...`
— `slider`, `navigation`, `splash-screen`, `sensors`) runs `prepublish-build`
as `typecheck && fix-esm-extensions && ng:build`, in that order. `typecheck`
(`tsc --build`) emits the plain `build/` tree first; `ng:build` runs after it
as `pnpm run clean && ngc -p tsconfig.angular.json`. If that package's own
`clean` script reads `"rm -rf build"` (copy-pasted from `@symbiote-native/
angular`, where it's CORRECT — see below), it deletes the `build/` tree
`typecheck` just produced, `ngc` only ever repopulates `build-ngc/`, and
nothing regenerates `build/` afterward. The packed tarball ships `build-ngc/`
but no `build/`, while `exports["."]`/`exports["./react"]`/`exports["./vue"]`
still point at `./build/...` — every consumer's `Cannot find module
'@symbiote-native/<pkg>/react'` (Metro AND `tsc`/`vue-tsc` alike; confirmed via
a real Metro bundle attempt, not just a type-checker false positive). Silent
in-repo: `workspace:*` resolution never touches a package's own `build/` at
all, so this is invisible until a real packed install (canary or npm).

**`@symbiote-native/angular` itself is NOT affected and must NOT get this
fix** — its own `ngc` outDir is `build/angular` (a SUBFOLDER of `build`, not a
sibling `build-ngc`), and its `exports` never reference plain `build/*.js`
directly, only `build/angular/*` — so `clean: "rm -rf build"` there correctly
wipes the whole tree before `ngc` regenerates just the `angular/` subfolder.
Check each package's own `tsconfig.angular.json` `outDir` before assuming
which fix applies — `build-ngc` (sibling, needs this fix) vs `build/angular`
(subfolder, already correct).

Fixed 2026-07-23 in `packages/{sensors,navigation,slider,splash-screen}/
package.json`: `"clean": "rm -rf build-ngc"`. Verified by deleting both dirs,
running `npx tsc --build packages/sensors` (repopulates `build/{core,react,
vue,angular}`), then `pnpm run ng:build` inside the package (confirms `build/`
still has all 4 subfolders afterward, `build-ngc/` also regenerates). Any
FUTURE mixed-mechanism package must get `clean` pointed at `build-ngc`, not
`build`, from the start — check this the moment a new package.json copies the
`ng:build`/`clean` pair from an existing one.

## Changesets config (`.changeset/config.json`)

```jsonc
{
  "access": "public",
  "baseBranch": "master",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@symbiote-native/docs-site",    // apps/*, private
    "Canary", "vue-sfc-canary", "vue-tsx-canary", "angular-canary"  // examples/*
  ]
}
```

`@symbiote-native/test-utils` used to be in this `ignore` list (it started as
an internal-only test double) but was published for real in a later session —
it is now a normal publishable package like the other 7 and must NOT be
re-added to `ignore`.

`@changesets/cli` itself is catalogued (`pnpm-workspace.yaml` → `catalog:`
under "workspace tooling"), like every other dev tool in this repo — see
`symbiote-dependency-catalog`.

## Root scripts

```jsonc
"typecheck": "tsc --build",
"prepublish-build": "pnpm run typecheck && pnpm run fix-esm-extensions && pnpm --filter @symbiote-native/angular --filter @symbiote-native/slider run ng:build",
"build": "pnpm run prepublish-build && pnpm run docs:build",
"changeset": "changeset",                 // pnpm changeset — author a changeset for a PR
"version-packages": "changeset version",  // bump versions + changelogs from pending changesets
"release": "pnpm run build && changeset publish",
"trust:publishers": "node scripts/trust-publishers.mjs"
```

`release` explicitly re-runs the full build (typecheck → ESM-extension fix →
Angular/slider AOT → docs) before publishing rather than trusting `prepare`
ran recently — publishing must be idempotent from a cold checkout.
`prepublish-build` is split out from `build` specifically so the canary flow
below can reuse the package-relevant steps without also building the
unrelated docs site.

`pnpm run trust:publishers` (`scripts/trust-publishers.mjs`) configures npm's
GitHub-OIDC trusted publishing for every publishable package in one loop —
run once per package after its first manual authenticated publish, needs an
interactive OTP/browser confirm so it can't run from CI. It hardcodes
`--file .github/workflows/release.yml`: npm's OIDC trust is scoped to that
exact workflow FILE (not job), so both the `release` job and the
`publish-canary` job below can publish under it — a NEW workflow file would
need its own `trust:publishers`-style re-registration first, or every publish
from it 404s (npm returns 404, not 403, for an identity with no trust config).

## CI (`.github/workflows/release.yml` + `checks.yml`)

`checks.yml` is a `workflow_call`-only reusable workflow holding the three
gate jobs (`lint`, `typecheck`, `test`). Both `ci.yml` (fast PR feedback on
every `pull_request`/`push`) and `release.yml` (the hard gate before
publishing) call it via `uses: ./.github/workflows/checks.yml` — GitHub
Actions has no cross-workflow `needs:`, so the only way to make one
workflow's publish job wait on another workflow's checks is to re-run the
same job definitions inside the publishing workflow itself; the reusable
workflow keeps them defined once instead of duplicated.

`release.yml` has two `needs: checks` jobs gated by `if:`, mutually exclusive
by trigger:
- **`release`** (`if: github.event_name == 'push'`) — push to `master` →
  `changesets/action@v1` either opens/updates a `chore: version packages` PR
  (when unreleased changesets exist) or, once that PR is merged, runs
  `pnpm run release` and publishes. Needs a repo secret `NPM_TOKEN` (mapped to
  `NODE_AUTH_TOKEN`, which `actions/setup-node`'s `registry-url` reads) OR the
  OIDC trusted-publisher config above; without either the version-PR step
  still works, only the actual `npm publish` call fails.
- **`publish-canary`** (`if: github.event_name == 'pull_request'`, further
  gated by `environment: canary-publish`) — see "Canary releases" below.

### pnpm store cache — a same-run save race is expected, not broken

`checks.yml`'s `lint`/`typecheck`/`test` jobs (plus `release.yml`'s own
`release`/`cut-release`/`publish-canary` jobs) each run `pnpm/action-setup` +
`actions/setup-node@v4` with `cache: pnpm`. That cache key is built from
**OS + package manager + `hash(pnpm-lock.yaml)` only** — it does NOT include
the job name. Since `checks.yml`'s three jobs run in PARALLEL against the
identical lockfile, they always compute the identical cache key.

Two log lines are BOTH benign, not evidence of a broken cache:
- `pnpm cache is not found` on a job's restore step — expected the very
  first time a given lockfile hash runs after enabling/changing caching;
  nothing has been saved under that key yet.
- `Failed to save: Unable to reserve cache with key ..., another job may be
  creating this cache` on a job's save step — expected whenever 2+ parallel
  jobs share one key: only one wins the race and actually saves (its log
  shows `Cache saved with the key: ...`), the rest lose harmlessly and still
  report job `success`.

Diagnosis method (don't guess from the Actions UI summary — read the actual
job logs): `gh run view <runId> --json jobs -q '.jobs[].databaseId'` per job,
then `gh api repos/<owner>/<repo>/actions/jobs/<jobId>/logs | grep -i "cache
is not found\|Cache saved\|Failed to save"`. Confirm at least ONE parallel
job shows `Cache saved with the key: ...` at the end — if so, caching is
working and the NEXT run with an unchanged lockfile should show `Cache
restored from key: ...` in all jobs instead of `not found`. Only worth
digging further if the SAME lockfile hash still misses on a *second* run.

## Canary releases (automatic per-PR, real npm publish under the `canary` dist-tag)

**Now a real npm publish — a reversal of an earlier rejection.** The
mechanism documented here until 2026-07 went through
[pkg.pr.new](https://github.com/stackblitz-labs/pkg.pr.new): a manual
`workflow_dispatch` with one checkbox per package, publishing a real packed
tarball to pkg.pr.new's own npm-compatible URLs — never touching npmjs.com,
no dist-tag, nothing to clean up. That mechanism is **removed entirely**.

Before pkg.pr.new, an even earlier version of the CURRENT idea was tried and
explicitly rejected: `changeset version --snapshot` + `npm publish --tag`,
straight against the real registry — rejected at the time because every
snapshot version, however obscure the tag, stays forever visible on the real
npmjs.com registry (immutable, un-deletable). The team is now consciously
reversing that rejection and going back to a real publish, because
`examples/*/package.json` needs to commit `"@symbiote-native/<pkg>": "canary"`
as a literal, git-tracked npm dependency value — npm/pnpm support a dist-tag
string as a dependency specifier
([npm docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)),
and unlike pkg.pr.new's ephemeral per-commit URLs or the untracked
`.examples/*` dev harness, it always resolves live and survives branch
switches. A real publish also makes pkg.pr.new's packed-tarball testing
redundant — it exercises the real `publishConfig` override for free. The
immutable-forever-visible tradeoff from the original rejection is real and
still applies; this time it's mitigated with a retention cron (below) instead
of avoided.

### Mechanism

1. **Versioning — Changesets snapshot mode.** Root script:
   ```jsonc
   "release:canary": "changeset version --snapshot canary && changeset publish --tag canary"
   ```
   Produces versions shaped like `0.0.0-canary-<timestamp>...`, published
   under npm dist-tag `canary`, never touching the `latest` tag.

2. **Trigger — every PR, gated by a required-reviewer approval.**
   `release.yml`'s `publish-canary` job now triggers on
   `pull_request: types: [opened, synchronize, reopened]` instead of a manual
   `workflow_dispatch` checkbox list. It's gated by `needs: checks`
   (lint/typecheck/test must pass first) AND `environment: canary-publish` —
   a GitHub Environment with required reviewers, which surfaces a native
   "Review deployments" approval button directly in the PR's Checks tab
   ([GitHub docs](https://docs.github.com/actions/managing-workflow-runs/reviewing-deployments)) —
   the GitHub-native equivalent of the old manual "Play" button, no custom
   comment-parsing or permission-checking code needed. Required reviewers on
   the Free/Pro/Team plan tier only work for PUBLIC repos; `OneEyed1366/
   symbiote-native` is public, so this applies as-is. Self-review is NOT
   prevented (the "prevent self-reviews" environment setting stays off) —
   this is currently a solo-maintained project, so the same person who
   opens/pushes the PR also approves their own canary-publish deployment.

3. **Package selection — auto-detected from the PR diff, not checkboxes.**
   `scripts/select-canary-dirs.mjs` was rewritten from checkbox-reading to
   auto-detecting which publishable packages changed in the PR, via `git
   diff` against the PR base, resolved through the existing
   `publishablePackageEntries()` helper (`scripts/lib/publishable-
   packages.mjs`) — the same package-discovery loop `trust-publishers.mjs`
   uses. The old per-package `workflow_dispatch` boolean inputs are gone.

4. **Trust-bootstrap moves to package creation, not first release.** Because
   canary publishing now also hits the real npm registry, a package's OIDC
   trust registration (`pnpm run trust:publishers <pkg>`) can no longer wait
   until its first REAL release — it must happen before its first CANARY
   publish too, i.e. effectively immediately at package creation (see the
   `symbiote-add-component` skill's new-package steps). CI enforces this: the
   canary-selection step runs `npm view <pkg> version` for every package
   about to be canary-published and fails fast with an actionable message
   ("run `pnpm run trust:publishers <pkg>` locally first") instead of a
   confusing 404 if the package was never published.

5. **`trust-publishers.mjs` hardened with an auth preflight.** It now runs
   `npm whoami` before its publish/trust loop and auto-runs `npm login`
   (interactive) if there's no active session, instead of failing on a raw
   npm auth error — npm login sessions for this user expire fairly quickly,
   and this was a recurring source of friction.

6. **Retention — a cron cleans up what a per-PR publish accumulates.** New
   `.github/workflows/canary-cleanup.yml`, `schedule:` every 2 days, runs new
   `scripts/cleanup-canary-versions.mjs`. For every publishable package,
   every version matching the `-canary` snapshot pattern (never a real
   release version), excluding whatever version the `canary` dist-tag
   currently points at: real `npm unpublish` if younger than 72 hours (npm's
   hard unpublish window —
   [npm policy](https://docs.npmjs.com/policies/unpublish/)), `npm deprecate`
   (soft, permanent, can't be undone, but doesn't break installs) as the
   fallback for anything older that slipped past the window.

### Consuming a canary in `examples/*`

`examples/*/package.json` MAY commit a literal dist-tag dependency —
`"@symbiote-native/<pkg>": "canary"`, not a semver range — for a feature
branch that wants to dogfood in-progress unreleased changes: git-tracked,
survives branch switches, always resolves to whatever the `canary` tag
currently points at. This is a capability now available, not a blanket
rewrite of every example app's dependencies — `examples/*` continues to
default to real published semver ranges except when a specific branch
deliberately opts in. `.examples/*` (the private untracked dev harness, still
`workspace:*`) is unchanged and out of scope for this decision entirely — see
`symbiote-dev-examples`.

### Removed

`pkg-pr-new` is gone entirely — no longer a devDependency, no longer in the
pnpm catalog. The old repo-qualified `pkg.pr.new/OneEyed1366/symbiote-native/…`
install URL no longer works for anything published after this change; use
the `canary` dist-tag instead. The pkg.pr.new GitHub App on this repo is no
longer needed by the release pipeline.

## The actual release workflow (day to day)

1. On a feature branch: `pnpm changeset` — pick affected package(s), bump
   type (patch/minor/major), write a summary. Commit the generated
   `.changeset/*.md` with the PR.
2. Merge to `master`. CI opens/updates "Version Packages" PR (bumps versions +
   CHANGELOGs, including dependents via `updateInternalDependencies: patch`).
3. Merge THAT PR. CI now runs `pnpm run release` and publishes every bumped
   package to npm.

First-ever publish of a new scoped package needs `access: public` — already
set both in `.changeset/config.json` and per-package `publishConfig.access`,
so no `--access` flag juggling is needed by hand.

## Known pre-existing blocker (not caused by this setup)

`pnpm run <any script>` triggers pnpm's dependency-status check, which can
re-run every workspace package's `prepare` hook — including
`@symbiote-native/angular`'s `ng:build`. While the Angular adapter has outstanding
type errors (WIP, see `angular-adapter` skill), this makes `pnpm run release`
fail in CI. That's the correct, intended gate — Angular is one of the 7
published packages, so the pipeline should refuse to release while it doesn't
compile. Don't route around it; fix the Angular errors instead. For
verifying non-Angular changes without tripping this, use `npx tsc --build`
directly (bypasses the `pnpm run` wrapper's install-check).

## Verify

```bash
npx tsc --build                       # confirms build/ output for every plain + slider entry
./node_modules/.bin/syncpack lint      # catalog discipline still holds after touching package.json
cd core/engine && pnpm pack --pack-destination /tmp && tar -tzf /tmp/symbiote-engine-*.tgz
# → only build/** + package.json + LICENSE, no src/ leakage
```
