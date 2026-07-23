---
paths:
  - "packages/*/package.json"
  - "adapters/*/package.json"
---

# Mixed-mechanism package: `clean` must target `build-ngc`, never `build`

A package with BOTH a plain `publishConfig` build (`.`/`./react`/`./vue` →
`build/{core,react,vue}/...`) AND a conditional `./angular` export pointed at
a SEPARATE `build-ngc/angular/...` (`slider`, `navigation`, `splash-screen`,
`sensors`) must have `"clean": "rm -rf build-ngc"` — never `"rm -rf build"`.
`prepublish-build` runs `typecheck` (emits `build/`) BEFORE `ng:build` (runs
`clean` then `ngc`); a `clean` that deletes `build` wipes what `typecheck`
just produced, and nothing regenerates it — the canary/npm tarball ships
`build-ngc/` but no `build/`, breaking every `.`/`./react`/`./vue` import for
every real consumer while looking fine in-repo (`workspace:*` never touches a
package's own `build/`).

**`@symbiote-native/angular` is the ONE exception — do not apply this to it.**
Its own `ngc` outDir is `build/angular` (a subfolder of `build`, not a
sibling `build-ngc`), so `clean: "rm -rf build"` there is correct. Check the
package's own `tsconfig.angular.json` `outDir` before deciding.

Full incident, verification steps, and the mechanism table: `symbiote-release-publishing` skill.
