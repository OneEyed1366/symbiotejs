---
"@symbiote-native/navigation": patch
"@symbiote-native/slider": patch
"@symbiote-native/splash-screen": patch
---

Fix `clean` script pointing at `build`, which `prepublish-build`'s `typecheck` step (`tsc --build`)
emits before `ng:build`'s own `clean` step ran — wiping the just-built `build/{core,react,vue}`
output and shipping a tarball with `build-ngc/` but no `build/`, breaking every `.`/`./react`/
`./vue` import for real consumers. `clean` now targets `build-ngc` only, matching its own `ngc`
output directory. See the `symbiote-release-publishing` skill's "Gotcha" section.
