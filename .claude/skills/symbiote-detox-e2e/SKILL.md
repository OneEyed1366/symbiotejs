---
name: symbiote-detox-e2e
description: "Detox e2e test suites for the four canary example apps (examples/{react,vue-sfc,vue-tsx,angular}/e2e). Read before touching examples/*/e2e/canary-journeys.test.ts, examples/*/e2e/probe.test.ts, or any examples/*/detox.config.js, and before running `npx detox test` to debug a failure. canary-journeys.test.ts is BYTE-IDENTICAL across react/vue-sfc/vue-tsx (the file's own header explains why: Detox attaches below the renderer, so the same journeys prove any adapter) — a fix in one MUST be copied to the other two, never patched in just one. Documents two real, fixed flakiness bugs (scroll-momentum drift after bringIntoView, a bare expect racing the JS->recommit round-trip under detoxEnableSynchronization:0) and one OPEN, unresolved investigation (the counter-card second-tap 'not hittable' failure, proven to be a Detox-side false negative, not an app bug, via manual mobile-mcp taps) — read the open-investigation section before re-diagnosing this from scratch. Also covers general workflow gotchas: leftover Metro on port 8081 blocking `detox test`, simulator state, and how to manually drive the already-built app outside Detox via mobile-mcp for diagnosis."
---

# Symbiote Detox e2e suites

## Layout

Each example app (`examples/react`, `examples/vue-sfc`, `examples/vue-tsx`,
`examples/angular`) has its own `e2e/` directory: `canary-journeys.test.ts`
(react/vue-sfc/vue-tsx only — **byte-identical across all three**, see below),
`probe.test.ts` (all four — a minimal attach/recommit smoke test), `setup.ts`,
`jest.config.js`, `tsconfig.json`. Detox config lives at
`examples/*/detox.config.js` (iOS sim + Android emu configurations, each
building via `xcodebuild`/`gradlew` or reusing an existing build).

`canary-journeys.test.ts`'s own header comment explains why it's identical
across react/vue-sfc/vue-tsx: **Detox attaches at the stock RN host, BELOW the
renderer SymbioteNative replaces** — so the exact same journey script, with the
exact same `testID`s (contract: `.docs/e2e-cases/feature-vue.e2e-cases.md`),
proves any adapter drives the native surface correctly. **A fix to one copy
must be copied to the other two verbatim** — never patch just one, `diff` all
three after any edit to confirm they still match.

Sync is OFF for the whole file
(`launchArgs: { detoxEnableSynchronization: 0 }`) because the canary runs a
perpetual native `Animated.loop` heartbeat (ADR 0017 offload proof) — with
sync on, `launchApp` would hang forever waiting for the app to go idle, which
it never does. This is the root cause of both fixed bugs below: with sync
off, NOTHING auto-waits for anything, so every interaction that depends on an
async round-trip must poll or settle explicitly instead of relying on Detox's
usual implicit synchronization.

## Running

```bash
cd examples/react   # or vue-sfc / vue-tsx / angular
npx detox test --configuration ios.sim.debug                          # full suite
npx detox test --configuration ios.sim.debug -t "<title substring>"   # filter by test name
npx detox test --configuration ios.sim.debug --loglevel trace          # full ws protocol log (getAttributes/tap raw responses)
```

- Reuses the existing build at
  `ios/build/Build/Products/Debug-iphonesimulator/Canary.app` if present — no
  rebuild needed for a quick iteration loop. Use `npm run e2e:build:ios` only
  after native/config changes.
- `-t` filters by test TITLE, but still loads/schedules every `e2e/*.test.ts`
  file — non-matching `it()` blocks are shown as `[SKIPPED]`, and a file's
  `beforeAll` only runs if at least one of ITS OWN tests matches the filter.
- Detox auto-passes `-detoxDisableHierarchyDump YES` as a launch arg whenever
  `detoxEnableSynchronization: 0` is set — the usual "view hierarchy dump on
  failure" (mentioned in Detox's own error HINT text) is **not available** in
  this project's canary tests. Use the `mobile-mcp` workaround below instead.

### Gotcha: leftover Metro on port 8081

Every example's Metro dev server binds `:8081`. A leftover `react-native
start` process from an earlier manual/visual-verification session (e.g. via
the `run` skill to eyeball something on a simulator) makes `detox test` fail
immediately with `EADDRINUSE` — the whole run exits before jest even starts,
with no test output at all. Always check first:

```bash
lsof -nP -iTCP:8081 -sTCP:LISTEN
kill <pid>   # if a stale process owns it
```

### Manually driving the built app outside Detox (for diagnosis)

When Detox's own error is ambiguous or you suspect Detox itself (not the
app) is wrong, drive the already-built app directly via `mobile-mcp`,
bypassing Detox's synchronization/hittability layer entirely:

```bash
cd examples/react && npx react-native start   # Metro must be running; port 8081 must be free first
```
Then: `mobile-mcp`'s `mobile_launch_app` (packageName
`org.reactjs.native.example.Canary`, device UDID is whatever
`mobile_list_available_devices` reports — this session used iPhone 17,
`F1A51728-ED67-4995-B703-590EB3D597A3`) + `mobile_take_screenshot` /
`mobile_click_on_screen_at_coordinates` / `mobile_list_elements_on_screen`.
**Kill the manual Metro before letting `detox test` run again** (port
conflict, same as above). Note `mobile_list_elements_on_screen` is
accessibility-tree based and will NOT show a plain `View` with no
accessibility traits — it only surfaced the child `Text`, not the parent
`View`, for the counter-card investigation below; it's useful for reading
on-screen text/labels, not for a full raw-UIKit-view dump.

## Fixed: two real flakiness bugs (2026-07)

Both live in `bringIntoView`/the counter-card test, patched identically in
`examples/{react,vue-sfc,vue-tsx}/e2e/canary-journeys.test.ts`.

### 1. Scroll momentum drift after `bringIntoView`

`bringIntoView`'s `.scroll(300, 'down', NaN, 0.8)` is a real swipe **gesture**,
not a discrete `scrollTo` — the ScrollView's own momentum/deceleration keeps
drifting for a beat after the gesture call resolves. A tap immediately after
can land on a spot the target view has already scrolled away from (Detox
reports `View is not hittable` / `not visible` with the view's frame
partially clipped by the scroll container). Fixed by making the helper
`async` and awaiting a short settle delay after the scroll:

```ts
async function bringIntoView(id: string): Promise<void> {
  await waitFor(element(by.id(id)))
    .toBeVisible()
    .whileElement(by.id('canary-scroll'))
    .scroll(300, 'down', NaN, 0.8)
  await sleep(300)
}
```

### 2. Bare `expect` racing the JS event → recommit round-trip

With sync off, nothing auto-waits for an async effect. The counter-card test
originally did `await element(...).tap(); await expect(...).toHaveText(...)`
immediately — this races React's `onPress` → `setState` → Fabric recommit,
and fails intermittently depending on how fast that round-trip lands. Fixed
by using the file's own pre-existing `waitForText(id, matches, timeoutMs)`
helper (already used elsewhere for `Image.getSize`/`measure()` readouts, just
not for this test) instead of a bare synchronous `expect`:

```ts
await element(by.id('counter-card')).tap()
await waitForText('counter-value', text => text === 'tapped 1×', 3_000)
```

## OPEN INVESTIGATION: counter-card second-tap "not hittable" (unresolved)

**Status as of 2026-07: NOT fixed. Read this before re-diagnosing from
scratch — a lot of ground was already covered and ruled out.**

After both fixes above, the "counter card increments on each tap" test still
**deterministically** fails on the SECOND tap (0×→1× always succeeds; 1×→2×
always fails), with the identical error every single run regardless of how
long you wait first (300ms, 3s, 20s, and 30s pauses were all tested — same
failure every time, proving this is NOT a transient timing race):

```
Test Failed: View is not hittable at its visible point. Error: View is not visible around point.
- view point: {177, 32.333343505859375}
- visible bounds: {{0, 0}, {354, 64.66668701171875}}
- view bounds: {{24, 557}, {354, 64.66668701171875}}
---
Error: ... "View does not pass visibility percent threshold (100)" ...
```

(native side: `dtx_assertHittableAtPoint`, `UIView+DetoxUtils.m:579`, per the
error's `DetoxFailureInformation`.)

### Proof this is a Detox bug, not an app bug

Using `mobile-mcp`'s `mobile_click_on_screen_at_coordinates` to tap the
counter-card's real screen center (201, 651 on the iPhone 17 sim, 402×874pt)
**twice in a row with no delay, entirely bypassing Detox's tap()/hittability
assertion** — both taps worked instantly and correctly: 0×→1×→2×,
screenshotted and confirmed after each tap. **The SymbioteNative app / React
onPress / Fabric recommit pipeline has no bug here.** The failure is 100%
inside Detox's own native pre-check.

### Diagnostic evidence gathered

- A `device.takeScreenshot()` taken at the exact moment right before the
  failing second tap shows the card fully visible, correctly reading
  "tapped 1×", centered normally — nothing visually wrong.
- `element(by.id('counter-card')).getAttributes()` right before the failing
  tap returns `visible: true` but `hittable: false`, AND reports **two
  different y-offsets for the same element in the same response**:
  `elementFrame.y = 557` vs `frame.y = 619` (a ~62pt gap, roughly a
  status-bar/safe-area-sized offset). This mismatch between two coordinate
  spaces for one native view in one attributes call is unexplained.
- The child `Text` (`counter-value`), queried independently around the same
  moment, reports `hittable: true` normally — only the PARENT `View`
  (`counter-card`) reports `hittable: false`.
- `tapWithRetry(id, attempts)` (a retry-with-300ms-backoff wrapper around
  `.tap()`) does **not** help — confirms the failure is persistent/
  deterministic for this interaction, not a transient race worth retrying.

### Leading hypothesis (UNPROVEN — verify before trusting)

Two candidate explanations, neither confirmed:

1. Detox's hittability check computes/uses the wrong coordinate space (the
   `elementFrame` vs `frame` ~62pt mismatch above) for this specific
   `RCTViewComponentView` after a recommit.
2. Detox's accessibility-identifier element cache resolves to a stale/
   differently-attached native view left over from Fabric's clone-on-write
   mounting (the engine clones nodes rather than mutating in place per
   `<clone_on_write_lives_in_engine>` in the root `CLAUDE.md`) — worth
   checking whether `RCTViewComponentView` instances are reused vs recreated
   across a props-only recommit of a sibling/child.

### Next steps to try

1. Check whether Detox exposes any tap variant that skips its own
   hittability assertion — a coordinate-based/device-level tap rather than
   an element-matcher tap (was mid-checking
   `detox/index.d.ts`/`detox/detox.d.ts` in `node_modules/.pnpm/detox@*` for
   this when the investigation paused).
2. If no such API exists, consider: a `mobile-mcp`-style raw coordinate tap
   as a documented escape hatch inside the test itself, waiting for an
   upstream Detox fix, or restructuring the test to avoid tapping the SAME
   element twice in immediate succession (verify multi-tap behavior a
   different way, e.g. tap once, assert, `bringIntoView` again, tap again).
3. Re-run the OTHER tests that failed in the ORIGINAL full-suite run (modal,
   responder chip, switch, animations, persist, image getSize, measure,
   chips FlatList, sticky SectionList) once this root issue has a fix or
   workaround — most of those failures were likely just cascading
   scroll-drift/state-carryover from test 1 never completing, not
   independent bugs.

## Simulator used this session

iPhone 17, UDID `F1A51728-ED67-4995-B703-590EB3D597A3`, iOS 26.5, screen
402×874pt / 1206×2622px @3x.
