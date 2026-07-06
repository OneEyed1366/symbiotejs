---
name: symbiote-dependency-catalog
description: "Symbiote dependency-version management — read BEFORE adding a dependency, bumping a version, scaffolding a new package, or touching ANY package.json / pnpm-workspace.yaml. The monorepo has ONE source of truth for versions: pnpm CATALOGS in pnpm-workspace.yaml. A package NEVER writes a literal version for an external dep — it references `catalog:` (default) or `catalog:NAME`. Covers: (1) the CATALOG LAYOUT — default `catalog:` holds every single-versioned dep (react, react-native 0.86 toolchain, vue, babel, jest, detox, typescript, vitest, prettier, eslint10 + root tooling); the named `catalogs.rn-app` holds ONLY the deps that legitimately cannot share the workspace version. (2) the RULES — prod+dev deps MUST be `catalog:`; peerDependencies are NEVER catalogued (they are compatibility RANGES like `0.86+`, not pins); `@symbiote-native/*` stay `workspace:*`; the `react` override is `'catalog:'` (quoted!). (3) the GUARD — syncpack `policy: catalog` in .syncpackrc.json, run via `pnpm deps:check` / auto-fixed via `pnpm deps:fix`, wired into lint-staged on any package.json / pnpm-workspace.yaml change. (4) the eslint CONSTRAINT — eslint canNOT be unified to the workspace's v10 because @react-native/eslint-config@0.86 peers `^8 || ^9` and examples lint via legacy .eslintrc.js (eslint 10 is flat-config only); this is upstream-forced, hence the rn-app split. (5) WORKFLOWS — add a dep, bump a version, add a package. (6) GOTCHAS — YAML requires quoting `'catalog:'`. Trigger on any add-dependency / bump-version / version-drift / new-package / 'why two eslints' / package.json edit decision."
---

# Symbiote dependency-version management

Versions are centralized, not per-package. One file — `pnpm-workspace.yaml` —
declares every external dependency's version once (pnpm **catalogs**); each
`package.json` references it with `catalog:` instead of a literal. A bump happens
in ONE place; drift between packages is structurally impossible. A guard
(syncpack) fails the commit if anyone writes a literal version past the catalog.

> **Why this exists.** The repo grew to 11+ packages. The same version (`@vue/runtime-core`,
> the RN 0.86 toolchain, `react`) was hand-copied into 4–6 manifests, and some had
> already silently diverged (prettier 2 vs 3, eslint 8 vs 10, typescript 5.7 vs 5.8).
> Catalogs make one declaration the truth; syncpack makes divergence a hard error.

## The one rule

**An external dependency in `dependencies` or `devDependencies` is NEVER a literal
version. It is `catalog:` (default catalog) or `catalog:<name>` (a named catalog).**

```jsonc
// ✅ correct
"dependencies": { "@vue/runtime-core": "catalog:" },
"devDependencies": { "eslint": "catalog:rn-app" }

// ❌ wrong — syncpack (pnpm deps:check) will fail this
"dependencies": { "@vue/runtime-core": "^3.5.13" }
```

Three things are deliberately exempt (do NOT catalogue them):

| Exempt | Form | Why |
|---|---|---|
| Local packages | `"@symbiote-native/x": "workspace:*"` | resolved by the workspace protocol, not a registry version |
| **peerDependencies** | `"react-native": ">=0.86"` | a peer is a compatibility **range** a consumer satisfies, not a pinned version — cataloguing it would narrow the published surface |
| `overrides.react` | `react: 'catalog:'` | a transitive-singleton guard (see below), not a package dep |

## The catalog layout (`pnpm-workspace.yaml`)

```yaml
catalog:                 # DEFAULT — everything single-versioned across the repo
  react: 19.2.3
  react-native: 0.86.0
  '@vue/runtime-core': ^3.5.13
  typescript: ^5.8.3
  prettier: ^3.9.1       # unified — RN's eslint-config peers `prettier >=2`, so v3 is fine
  eslint: ^10.6.0        # workspace (library) lint — flat config
  # …react-reconciler, @types/*, @angular/core, the whole RN 0.86 app toolchain,
  #  babel, jest, detox, vitest, and the root eslint/husky/lint-staged tooling…

catalogs:
  rn-app:                # the ONLY deps that cannot share the workspace version
    eslint: ^8.19.0      # see "the eslint constraint" below

overrides:
  react: 'catalog:'      # transitive singleton — keeps nested react at catalog.react too
```

**Default vs named.** Put a dep in the **default** catalog when one version serves
the whole repo. Create/extend a **named** catalog ONLY when two consumers genuinely
need different majors of the same dep AND that split is forced (not preference).
Today `rn-app` exists for exactly one such dep — `eslint`.

## The eslint constraint (why there are two eslints)

This is a learned, load-bearing decision — do not "tidy" it away:

```
@react-native/eslint-config@0.86  peers  eslint "^8.0.0 || ^9.0.0"   ← never 10
examples/* lint through legacy .eslintrc.js                          ← eslint 10 removed
                                                                        legacy config (flat-only)
workspace (core/adapters/packages)  uses  eslint 10 + eslint.config.js (flat)
```

So examples are pinned to `catalog:rn-app` (eslint 8); the library packages use
`catalog:` (eslint 10). Unifying to 10 would require BOTH a flat-config rewrite of
every example AND an eslint-10-capable `@react-native/eslint-config` upstream —
neither exists. `prettier` and `typescript`, by contrast, ARE unified (prettier 3
is allowed by RN's config; typescript has no such floor).

## The guard — syncpack

`.syncpackrc.json` enforces the one rule with `policy: "catalog"`:

```jsonc
{
  "versionGroups": [
    { "dependencies": ["@symbiote-native/**"], "isIgnored": true },        // workspace protocol
    { "dependencyTypes": ["peer"], "isIgnored": true },             // peers are ranges
    { "dependencyTypes": ["prod", "dev"], "policy": "catalog" }     // everything else: catalog
  ]
}
```

| Command | Does |
|---|---|
| `pnpm deps:check` | `syncpack lint` — fails if any prod/dev dep skips the catalog |
| `pnpm deps:fix` | `syncpack fix` — auto-converts literals to `catalog:` and adds missing catalog entries |

It also runs in **lint-staged** (`lint-staged.config.js`) on any
`**/package.json` or `pnpm-workspace.yaml` change, so a literal can't reach a commit.

## Workflows

**Add a dependency to a package**
1. Add the version to the right catalog in `pnpm-workspace.yaml` (default unless it
   genuinely needs a named catalog).
2. In the package, declare it as `"dep": "catalog:"` (or `catalog:<name>`).
3. `pnpm install` → `pnpm deps:check`. (Or skip step 2's manual edit and run
   `pnpm deps:fix` to convert.)

**Bump a version**
1. Edit the single line in `pnpm-workspace.yaml`. Done — every consumer follows.
2. `pnpm install && pnpm deps:check && pnpm typecheck && pnpm test`.

**Add a new package**
- Reference shared deps with `catalog:` from the start. Peers stay as ranges
  (`>=…`). Local deps stay `workspace:*`. Never paste a literal version.

## Gotchas

- **YAML quoting.** `react: catalog:` is invalid YAML — a trailing `:` reads as a
  nested key. Quote it: `react: 'catalog:'`. (Object-keyed `"dep": "catalog:"` in
  JSON package.json is fine unquoted-value-wise; this only bites in the YAML.)
- **`overrides.react` is separate from the catalog.** The catalog standardizes
  *direct* declarations; the `overrides` entry forces *transitive* react (pulled by
  any nested dep) to the same version — both are needed to keep one react instance
  (else Vitest hits "Invalid hook call"). `overrides.react: 'catalog:'` keeps them
  locked together.
- **Orphan store copies are not drift.** `pnpm why <dep>` showing one version in the
  graph is the truth; a stray `node_modules/.pnpm/<dep>@<old>` is a peer-resolution
  variant, not a declared dependency.
- **`examples/*` is SUPPOSED to be on `"@symbiote-native/*": "catalog:"` (the real PUBLISHED npm
  package), always — never `workspace:*`.** This repo's pnpm does NOT auto-link a plain version
  range to the local workspace package (`linkWorkspacePackages` is effectively off here), so
  `catalog:` genuinely installs from the npm registry; local source edits in `adapters/*`/
  `core/*` are invisible to `examples/*`, and that is BY DESIGN — those apps are the public canary,
  demonstrating the real install experience (see `symbiote-dev-examples`). Switching them to
  `workspace:*` for active development was tried for real and reverted (2026-07-04): it left the
  public demo mid-migration and uncommittable. **Active development against local source happens
  in `.examples/*` instead** (a separate, gitignored tree with the same apps wired to
  `workspace:*`) — never by flipping `examples/*` to `workspace:*`. `.syncpackrc.json`'s
  `isIgnored: true` on `@symbiote-native/**` only means syncpack doesn't enforce catalog vs
  workspace either way; the enforced norm is `symbiote-dev-examples`'s split. Diagnostic:
  `readlink examples/<app>/node_modules/@symbiote-native/<pkg>` vs
  `readlink .examples/<app>/node_modules/@symbiote-native/<pkg>` — a target under
  `node_modules/.pnpm/@symbiote-native+<pkg>@<version>_.../` means the published copy (correct for
  `examples/*`, wrong for `.examples/*`); a target like `../../../adapters/<pkg>` or
  `../../../core/<pkg>` means real workspace linking (correct for `.examples/*`, wrong for
  `examples/*`). Check this FIRST, before suspecting a Metro config or `exports`-map bug, whenever
  an app doesn't pick up a fresh local change — or whenever a public example looks like it's
  tracking local source it shouldn't.

## Verify

Any dependency change is DONE only when all four are green:

```bash
pnpm install        # catalogs resolve
pnpm deps:check     # syncpack: "No issues found"
pnpm typecheck      # tsc --build
pnpm test           # vitest run
```
