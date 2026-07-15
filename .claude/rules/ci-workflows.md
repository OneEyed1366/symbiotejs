---
paths:
  - ".github/workflows/*.yml"
---

# CI pnpm cache — a same-run save race is expected, not broken

`checks.yml`'s `lint`/`typecheck`/`test` jobs run in PARALLEL against the
identical `pnpm-lock.yaml`, so their `cache: pnpm` (via `actions/setup-node`)
keys are identical (OS + manager + lockfile hash, no job name). A first run
on a new lockfile hash legitimately misses (`pnpm cache is not found`) in
every job, then races to save: one job logs `Cache saved with the key: ...`,
the rest log a benign `Failed to save: ... another job may be creating this
cache` (still `success`). Diagnose via real job logs (`gh api
repos/<owner>/<repo>/actions/jobs/<jobId>/logs`), not the Actions UI summary,
before assuming the cache config is broken.

Full mechanism + diagnosis command: `symbiote-release-publishing` skill,
"pnpm store cache" section.
