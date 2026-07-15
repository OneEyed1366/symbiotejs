---
paths:
  - "packages/*/package.json"
---

# native-proxy package `"files"` allowlist

A `packages/<lib>` one-dependency native-proxy package's `"files"` array MUST
explicitly list `react-native.config.cjs` and its `*.podspec` filename, not
just `src`/`build`/`build-ngc`. Neither is in npm's default-included set —
omitting them ships a tarball with no proxy for CocoaPods/Gradle to autolink,
which only surfaces as a runtime `Unimplemented component` crash, never a
build error. Full incident + verification steps: the
`symbiote-third-party-native-view` skill (checklist step 1 + 11, and the
"files allowlist" gotcha).

## `codegenConfig.jsSrcsDir` must be a package-local vendored dir, never `node_modules/<dep>/…`

RN codegen resolves `codegenConfig.jsSrcsDir` as a LITERAL path relative to the
package's own root (a plain `lstat`, not Node's `require.resolve` walk). A
native-proxy package must NOT point it at `node_modules/@x/native-lib/src` — pnpm's
isolated store never nests the wrapped dep inside the wrapper's own `node_modules`
(it sits as a symlinked SIBLING in the `.pnpm` store dir), so that path doesn't
exist → `pod install` dies with `ENOENT … /src` in the codegen step and an
`Invalid Podfile file` error. Fix: `prepare` calls the SHARED
`scripts/vendor-codegen-specs.cjs <native-package-name> <specs-subdir>` (one script,
not a per-package copy — the vendoring logic is identical everywhere, only those two
args differ), which `require.resolve`s the native lib from the CALLING package's own
cwd and copies its specs subdir into a package-local, gitignored `codegen-specs/`;
set `jsSrcsDir: "codegen-specs"` and add `"codegen-specs"` to `files`. Precedent:
`packages/splash-screen`, `packages/slider`, and `packages/navigation` all call it
(twin of the podspec's `.rn-slider`/`.rn-screens` vendoring — same pnpm-symlink root
cause, different consumer). Full detail: the `symbiote-third-party-native-view`
skill.

The vendored `codegen-specs/**` is third-party source copied verbatim — it does NOT
follow our lint rules (it carries `@ts-ignore`, `require()`, `.web.tsx`, etc.), so it
MUST be in eslint's `ignores` (`eslint.config.js`), same as `build/`. typecheck/test/
build are already safe because they scope to `src` and the vendored dir lives outside
it — only eslint's wider glob (`{core,adapters,packages}/**/*.{ts,tsx}`) sweeps it in.

## The wrapped native dep's catalog entry MUST be an exact version, never a caret range

`codegen-specs/` is a FROZEN SNAPSHOT baked once, at this workspace's own `prepare` time,
from whatever version the workspace's own `pnpm-workspace.yaml` catalog resolves — it never
re-syncs itself. If that catalog entry is a caret range (`^4.25.2`), a standalone consumer
outside the pnpm workspace (`examples/*`, its own `npm install`, its own lockfile) can
legitimately resolve a NEWER patch/minor of the same wrapped library for its *native* side
(CocoaPods vendors that consumer's own `node_modules/<lib>` fresh on every `pod install`,
independent of anything baked into our published tarball). The two silently drift: our
vendored JS specs are missing a prop the consumer's native `.mm` unconditionally references,
producing `error: no type named 'RNS...' in namespace 'facebook::react'` at `pod install`/
`xcodebuild` time — with ZERO warning at either version's own install, since neither side's
tooling has any way to know about the other. Root-caused for `react-native-screens`
(`^4.25.2` in this workspace vs. `4.26.0` in `examples/vue-tsx`, missing `RNSSplitHostColorScheme`
— a prop added between those two versions) — 2026-07-15, `.changeset/navigation-ship-native-proxy-files.md`.
Fix: pin the wrapped library's catalog entry to an EXACT version (no `^`/`~`) — `pnpm publish`
bakes that exact version into the published `dependencies` field too (`catalog:` is rewritten
to a concrete version string at pack/publish time), so every consumer, no matter when they
install, resolves the SAME version our vendored `codegen-specs/` was baked from. Bumping the
wrapped library therefore means: bump the catalog pin, re-run `prepare` to re-vendor, and
republish the native-proxy package — never just bump the catalog and assume old vendored specs
still match.
