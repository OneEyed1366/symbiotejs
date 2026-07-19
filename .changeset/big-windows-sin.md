---
---

Release-pipeline fix only, no package release needed: guard `@symbiote-native/angular`'s
`prepare` so it doesn't `rm -rf build` and race consumer packages' concurrent `ngc` during
`changeset publish` (the `TS500 … file.referencedFiles[index]` crash). The adapter's published
runtime is unchanged and its `prepare` never runs for registry consumers; the release CI runs
the fixed `prepare` from source, so no version bump is required. See the `angular-adapter-build`
skill §2b.
