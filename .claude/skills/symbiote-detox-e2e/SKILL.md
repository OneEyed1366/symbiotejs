---
name: symbiote-detox-e2e
description: "Detox e2e test suites for the four canary example apps (examples/{react,vue-sfc,vue-tsx,angular}/e2e, and their .examples/ dev-harness twins). Read before touching examples/*/e2e/canary-journeys.test.ts, examples/*/e2e/probe.test.ts, or any examples/*/detox.config.js, and before running `npx detox test` / `pnpm exec detox test` to debug a failure. canary-journeys.test.ts is BYTE-IDENTICAL across react/vue-sfc/vue-tsx (the file's own header explains why: Detox attaches below the renderer, so the same journeys prove any adapter) — a fix in one MUST be copied to the other two, never patched in just one. Documents real, fixed flakiness bugs (scroll-momentum drift after bringIntoView, a bare expect racing the JS->recommit round-trip under detoxEnableSynchronization:0, a stale Podfile.lock silently blocking a screen's new native dependency so EVERY test fails identically with no crash log, a probe test gone stale after the app root grew a navigator so every asserted testID vanished at once, Angular's multi-line `{{ }}` interpolation preserving whitespace and breaking exact by.text() matches) and an OPEN, unresolved investigation (Detox's own hittability pre-check reporting `not hittable` for elements that are visually on-screen and tappable via mobile-mcp raw coordinates — confirmed against upstream wix/Detox#3130/#4747/#2229, aggravated by nested FlatLists inside a ScrollView) — read the open-investigation section before re-diagnosing this from scratch. A real, actionable workaround now exists: `device.tap(point)` (screen-absolute, no hittability pre-check) computed from `getAttributes().frame`, plus polling that same `frame` instead of `toBeVisible()` for transform-positioned or ActionButton-composed targets — see "Fix (2026-07): a real, actionable workaround" and the leading hypothesis correlating the bug with Angular's composed-component anchor-host nodes (`ActionButton`/`Pressable` double-wrapping) before writing a new hittability workaround from scratch. Also covers general workflow gotchas: leftover Metro on port 8081 blocking `detox test`, simulator state, and how to manually drive the already-built app outside Detox via mobile-mcp for diagnosis."
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

## Fixed (2026-07): stale Podfile.lock silently breaks EVERY test when a screen gains a new native dependency

If `probe.test.ts`/`canary-journeys.test.ts` fail on the VERY FIRST assertion
(e.g. `angular-root`/`resp-chip-0` never appears) with no crash, no red box,
and nothing useful in `xcrun simctl spawn <udid> log show --predicate
'process == "Canary"'`, check whether a screen's template started rendering a
component backed by a NEW native dependency (e.g. `App.ts` wrapping the whole
app in `@symbiote-native/navigation`'s `<Stack>`, which mounts
`react-native-screens`' native `RNSScreen`/`RNSScreenStack`) without a
matching `pod install`. Symptom chain: `ios/Podfile.lock` predates the
dependency (check its mtime / `grep RNScreens ios/Podfile.lock`), the built
`.app` binary has no matching native symbols (`strings
<binary> | grep -c RNSScreen` → `0`), so the new native view fails to
construct and the ENTIRE tree under it never mounts — every single test in
the file times out identically, because Detox itself is working fine, the
app just never rendered anything. Fix: `cd ios && pod install`, then a real
rebuild (`pnpm run e2e:build:ios`, not just `pnpm ng:build`) — this is a
genuine native change, no shortcut around the rebuild.

## Fixed (2026-07): probe.test.ts went stale after App.ts became Menu-first

When `App.ts` was restructured to wrap the whole demo surface in
`@symbiote-native/navigation`'s `<Stack>` with `Menu` as `initialRouteName`
(Canary itself demoted to a pushed screen, reachable via a
`menu-row-Canary` `testID`), `probe.test.ts` was never updated: it still
asserted `angular-root` on launch — a testID that no longer exists anywhere
in the app — and several other testIDs it referenced had also been renamed
during a later CanaryScreen rework (`angular-counter` →
`angular-counter-card`/`angular-counter-value`, `angular-switch` →
`angular-spinner-switch`, `angular-spinner` → `angular-spinner-indicator`,
`angular-input` → `angular-greeting-input`). **Lesson: a probe/smoke test
that asserts a testID directly on launch is a hard dependency on the app's
ROOT component staying the same shape — the moment a navigator gets inserted
above it, EVERY assertion times out identically, `Failed to find`-style
errors are absent, and it looks exactly like an infra breakage (wrong
binary, stale build) rather than a stale test.** Always check whether the
tested testIDs still exist in the current source
(`grep -rn testID screens/CanaryScreen.ts`) before assuming the harness is
broken. Fixed by adding a `beforeAll`-independent first test that navigates
`menu-row-Canary` → `angular-safe-area`, and updating every renamed
testID.

### Angular multi-line `{{ }}` interpolation keeps its surrounding whitespace

`<Text>a text\n  {{ expr }}\n</Text>` (multi-line, indented) renders with the
literal leading/trailing whitespace/newlines intact — Angular's default
`preserveWhitespaces: false` does NOT collapse this the way JSX auto-trims
text children. Confirmed via `mobile-mcp`'s `mobile_list_elements_on_screen`,
which showed `angular-image-bg-label`'s accessibility label as `" Angular
children paint on top of the image "` (leading + trailing space) for a
template written across three lines. Any Detox `by.text('exact string')`
assertion against such a node fails a deterministic, silent timeout — no
error explains *why* the string doesn't match. Two fixes, pick per case:
assert via the node's own `testID` instead of `by.text` (robust either way),
or — the cleaner fix when the copy is short — write the interpolation
inline on one line (`<Text testID="x">tapped {{ count }}×</Text>`) so there
is no incidental whitespace to begin with.

## OPEN INVESTIGATION UPDATE (2026-07): confirmed upstream — wix/Detox #3130, #4747, #2229

The counter-card "not hittable" bug above is not isolated. A second,
independent case surfaced on Angular's `probe.test.ts`: `angular-open-modal`
— reachable and tappable via raw `mobile-mcp` coordinate taps, confirmed
visually on-screen — deterministically fails Detox's own `.tap()` with the
identical `View does not pass visibility percent threshold (100)` error
every run, unaffected by settle delays, keyboard-dismiss taps, or scroll
strategy (`whileElement().scroll()`, manual step-scroll loop, or
`scrollTo('bottom')` all reproduce it once the target is reached). Its
`getAttributes()` dump makes the coordinate-space bug concrete — MUCH larger
than the counter-card's 62pt gap:

```
"elementFrame": { "y": 5862.6665, "x": 24, "width": 354, "height": 45 }  // position inside the scroll CONTENT
"frame":        { "y": 587.9998,  "x": 24, "width": 354, "height": 45 }  // real ON-SCREEN position — well inside the 874pt viewport
"hittable": false, "visible": true
```

Web research (2026-07) confirms this is a known, still-open Detox issue
class, not project-specific: **wix/Detox#3130** ("Detox 19.3.0 causes 'View
is not hittable at its visible point' failures" — a maintainer confirms a
*deliberately* stricter hittability assertion landed in 19.3.0, breaking
previously-stable tests by design), **wix/Detox#4747** (same error; that
specific case resolved when a full-screen transparent overlay turned out to
intercept the hit-test ahead of the real target — CanaryScreen has an
analogous `angular-overlay-host` portal-target sibling of the ScrollView,
though it doesn't fully explain THIS failure since sibling taps on the same
screen succeed), and **wix/Detox#2229**. Search results also flag that
Detox "may match the wrong ScrollView in the hierarchy" when ScrollViews
nest — CanaryScreen nests TWO `FlatList`s directly inside its outer
`ScrollView` (`angular-chips-list`, `angular-mvcp-list`), the exact
anti-pattern React Native itself warns against ("VirtualizedLists should
never be nested inside plain ScrollViews"), and a plausible aggravating
factor for why elements deep in this particular scroll tree hit the bug
while shallower ones (`angular-counter-card`, switches, text inputs) don't.

**Resolution taken**: `it.skip('opens and closes an Angular Modal through
Fabric', …)` in `probe.test.ts`, with a comment citing this section — not a
fix, a documented, upstream-confirmed limitation. Re-enable if: wix/Detox
ships a fix for #3130/#4747/#2229, OR CanaryScreen's two FlatLists are ever
pulled out of the outer ScrollView (would also be worth retesting the
counter-card bug at that point — same theory could explain both).

## Fix (2026-07): a real, actionable workaround for the hittability bug — `device.tap(point)`

Detox exposes `device.tap(point)` / `device.longPress(point)` (screen-absolute
coordinates, confirmed present in the installed `detox@20.51.4` types) — a
**raw simulator-level tap with NO element-matcher hittability pre-check**,
unlike `element(...).tap()` which always runs
`dtx_assertHittableAtPoint`/the visibility-percent check first. Combined with
`getAttributes().frame` (documented "in screen coordinate space," confirmed
accurate even for the buggy elements below), this sidesteps the whole
hittability-bug class instead of chasing settle delays that can't fix a
geometry pre-check that structurally never passes:

```ts
async function deviceTap(id: string): Promise<void> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) throw new Error(`${id}: getAttributes() returned no frame`);
  const { x, y, width, height } = attrs.frame;
  await device.tap({ x: x + width / 2, y: y + height / 2 });
}
```

Caveat: a single frame read right after a scroll can be stale (the scroll
gesture's own momentum keeps drifting for a beat after it resolves — the same
reason `bringIntoView` already sleeps 300ms). Harden by re-reading the frame
until two consecutive reads agree before tapping (see
`canary-native-modules.test.ts`'s `deviceTap`), rather than a single blind
read. A tap computed from a stale/mid-drift frame doesn't just miss — it can
land on a NEIGHBORING control and trigger the wrong app-wide state change
(observed once: a drifted tap intended for `angular-status-bar-style-btn`
plausibly landed on the adjacent `angular-status-bar-hidden-btn` instead,
toggling the status bar's hidden state and shifting the whole screen's
safe-area layout, which then cascaded into several unrelated tests failing to
find `angular-canary-scroll` at all).

The same `toBeVisible()` geometry check that breaks `.tap()`'s hittability
also breaks plain `waitFor(...).toBeVisible()` waits on the same class of
element, timing out at whatever duration you give it (tested up to 20s)
regardless of how long the wait is — proof it's the check failing, not a slow
transition. Replace those with polling the raw `frame` instead of trusting
the boolean:

```ts
async function waitForFrameSettle(id: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: { x: number; y: number } | undefined;
  let stableReads = 0;
  while (Date.now() < deadline) {
    const attrs = await element(by.id(id)).getAttributes();
    if ('frame' in attrs) {
      const { x, y } = attrs.frame;
      if (last && Math.abs(x - last.x) < 1 && Math.abs(y - last.y) < 1) {
        stableReads += 1;
        if (stableReads >= 2) return;
      } else {
        stableReads = 0;
      }
      last = { x, y };
    }
    await sleep(150);
  }
  throw new Error(`${id}'s frame never settled within ${timeoutMs}ms`);
}
```

For a view positioned via an animated `transform` (e.g.
`packages/navigation/src/angular/drawer/index.ts`'s `panelStyle`/
`contentStyle`, driven by `Animated.timing` with `useNativeDriver:false`),
there's an additional, well-documented reason `toBeVisible()` can never
succeed: iOS specifies `UIView.frame` as **undefined** once that view's own
`transform` isn't the identity transform. `getAttributes().frame` still
reports real, usable numbers in practice (Detox computes it via proper
screen-coordinate conversion, not the raw `.frame` getter), so
`waitForFrameSettle`/`deviceTap` work fine here too — just don't reach for
`toBeVisible()`/`.tap()` on a transform-positioned view at all, direction
doesn't matter (the same settle-poll covers both opening and closing).

### A concrete, previously-undocumented correlation: which testIDs hit this bug

Every element that reliably triggers Detox's hittability/visibility-percent
misfire in this suite is reached through an `ActionButton` (which wraps
`<Pressable>`) — `deep-link-resolve`, `persist-serialize`, `persist-restore`,
`drawer-close-from-settings`, `sheet-dismiss`, and CanaryScreen's
`angular-alert-btn`/`angular-action-sheet-btn`/`angular-vibrate-btn`/
`angular-status-bar-style-btn`. Elements that never hit it: `menu-row-*` (a
bare `<Pressable>` used directly in `MenuScreen.ts`), `TabsDemo`'s tab bar
items (`packages/navigation/src/core/render-tabs.ts`'s `renderTabBar` —
framework-agnostic, painted as a plain `symbiote-view` with a passthrough
`onPress`, no Angular component wrapper at all), and non-Pressable primitives
(`Switch`, `TextInput`, `ScrollView`).

The likely mechanism (traced, not yet proven on-device): a composed Angular
component (`Pressable`, and anything wrapping it) is rendered as a
**non-painting anchor host node** in ADDITION to its real content node
(`adapters/angular/src/primitives/shared.ts`'s `anchorHostStyle` — see also
the `angular-adapter-renderer.md` rule on `ANCHOR_HOST_COMPONENTS`).
`ActionButton` is itself a composed component wrapping `<Pressable>` (also
composed), so a testID reached through `ActionButton` sits behind **two**
stacked anchor nodes in the native hierarchy, vs. one for a bare `<Pressable>`
and zero for a plain `symbiote-view`. This lines up exactly with which
testIDs fail and which don't. Official Detox docs independently describe this
exact failure shape: *"if an element with `pointerEvents="none"` is
obscuring your target element... consider restructuring your component
hierarchy... making the obscuring element a descendant of the target element"*
— an anchor node sitting above the real content at the same screen position
is a strong match. **Not yet confirmed** via Xcode view-hierarchy debugging
(`wix.github.io/Detox/docs/guide/debugging-in-xcode`) or a real-device repro
with the anchor node isolated — treat as the leading hypothesis, not a closed
investigation. If a future session confirms it, the real fix is likely in the
anchor-host mechanism itself (e.g. giving the anchor `pointerEvents="none"`
explicitly, or excluding it from Detox's accessibility tree), which would
obsolete the `deviceTap`/`waitForFrameSettle` workarounds above for EVERY
composed-component testID project-wide, not just this suite.

## Simulator used this session

iPhone 17, UDID `F1A51728-ED67-4995-B703-590EB3D597A3`, iOS 26.5, screen
402×874pt / 1206×2622px @3x. Angular canary tests used a second simulator,
`iPhone 17-Detox`, UDID `88104F11-E404-4528-940C-903A4EA5F9B3`.
