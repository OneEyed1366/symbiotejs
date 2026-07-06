---
name: symbiote-dev-examples
description: "Symbiote examples/ vs .examples/ split — read BEFORE wiring up, smoke-testing, or demoing ANY new component/adapter/package/third-party wrapper in an example app, or before editing any example app's package.json dependency versions. `examples/{react,vue-sfc,vue-tsx,angular}` are PUBLIC canary apps — every `@symbiote-native/*` dependency is ALWAYS `catalog:` (the real published npm version), demonstrating the actual install experience for external users and docs; NEVER add in-progress dev/demo code there. `.examples/{react,vue-sfc,vue-tsx,angular}` (dot-prefixed, gitignored by the existing blanket `.*/ ` rule in `.gitignore` — no explicit entry needed) is the ONLY place package/feature/adapter development and integration happens: same full native (ios/android) scaffolding, but every `@symbiote-native/*` dependency is `workspace:*` so local source edits in `core/*`/`adapters/*`/`packages/*` are picked up live. Covers the origin/master verification (`6d9efb9`, all four examples on `catalog:`), the 2026-07-04 split (moved in-progress `packages/navigation` dev work out of `examples/react` into `.examples/react`), the diagnostic (`readlink <app>/node_modules/@symbiote-native/<pkg>` — a `.pnpm/@symbiote-native+<pkg>@…` target means published/catalog, `../../../adapters/<pkg>` or `../../../core/<pkg>` means real workspace link), and the rule that `examples/*` only updates later, deliberately, to bump a catalog version after a real npm release. Trigger on 'add a new example app', 'where do I test/demo this component', 'workspace vs catalog in examples', 'is this app on published or local deps', or any symbiote-add-component/symbiote-new-adapter/symbiote-third-party-native-view task's verify step."
---

# Symbiote examples/ vs .examples/ — public canary vs dev harness

One question decides which directory a task touches: **are you demonstrating the
published package, or developing against local source?**

## 1. The split

```
examples/{react,vue-sfc,vue-tsx,angular}      .examples/{react,vue-sfc,vue-tsx,angular}
  PUBLIC canary apps                            PRIVATE dev harness (gitignored)
  every @symbiote-native/* dep = catalog:       every @symbiote-native/* dep = workspace:*
  (real published npm version)                  (live link to core/*, adapters/*, packages/*)
  demonstrates the real install experience      where package/component/adapter work happens
  tracked in git, ships in the repo             never committed — local-only working copies
```

Both trees carry the SAME full native scaffolding (`ios/` + `android/` projects) —
`.examples/` is not a stripped-down sandbox, it's a full copy of the public app
wired to local source instead of npm.

## 2. Why two trees, not one with a flag

A single `examples/react` cannot serve both jobs at once: the moment in-progress
feature work (new screens, a package under construction) lands in it, it stops
being a trustworthy demo of "what an external user gets by running `npm install
@symbiote-native/react`". This happened for real on 2026-07-04 —
`examples/react/App.tsx` had been gutted into `components/`+`screens/` while
building `packages/navigation`, and all four examples' `package.json` had been
switched to `workspace:*`, none of it committed. The fix: move that in-progress
state into `.examples/react`, and re-derive clean `examples/*` from
`origin/master` (verified — commit `6d9efb9`, every `@symbiote-native/*` dep is
`catalog:` in all four apps).

## 3. The P0 rule

**Any task that adds, ports, or wires up a component / adapter / third-party
wrapper / package integrates it ONLY into the matching `.examples/<app>` — never
into `examples/<app>`.** `examples/<app>` is updated later, deliberately, as its
own step: bump the `catalog:` version in `pnpm-workspace.yaml` after a real npm
publish (the precedent: `@symbiote-native/test-utils` was bumped in `examples/*`
only after publishing `0.1.1` — see `symbiote-release-publishing`).

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

```bash
readlink examples/<app>/node_modules/@symbiote-native/<pkg>
readlink .examples/<app>/node_modules/@symbiote-native/<pkg>
```

```
target under node_modules/.pnpm/@symbiote-native+<pkg>@<version>_.../   → published catalog:
  correct for examples/*  |  WRONG for .examples/* (means it's not picking up local edits)

target like ../../../adapters/<pkg> or ../../../core/<pkg>              → real workspace link
  correct for .examples/*  |  WRONG for examples/* (means a public demo is drifting off catalog:)
```

Run this FIRST whenever an example app doesn't pick up a fresh local change, or
whenever `examples/*` looks like it's tracking local source it shouldn't.

## Reference

- `symbiote-dependency-catalog` — the `catalog:`/`workspace:*` mechanics this split relies on.
- `symbiote-file-layout` §1 — the monorepo map (`.examples/` sits beside `examples/`).
- `symbiote-release-publishing` — the deliberate step that bumps `examples/*` to a new catalog version.
- `symbiote-add-component`, `symbiote-new-adapter`, `symbiote-third-party-native-view`,
  `symbiote-parity-check` — each one's "verify/smoke against a running app" step means `.examples/<app>`.
- Verified state: `origin/master` commit `6d9efb9` — all four `examples/*/package.json` on `catalog:`.
