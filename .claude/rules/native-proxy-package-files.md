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
