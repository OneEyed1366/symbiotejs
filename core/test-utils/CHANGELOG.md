# @symbiote-native/test-utils

## 0.1.2

### Patch Changes

- ec8036e: Republish with the `build/` directory actually included — the currently published `0.1.1` tarball is missing it entirely (only `package.json`/`README.md`/`LICENSE` shipped), breaking module resolution for every consumer. `pnpm pack` against the current source confirms `build/` is produced correctly; this was a one-off publish gap, not a config bug.

## 0.1.1

### Patch Changes

- e2ba63c: Publish the shared fake-Fabric test harness to npm so examples can depend on it directly instead of a workspace link.
