---
name: angular-adapter-lists
description: "Symbiote Angular adapter — FlatList/SectionList/VirtualizedList/VirtualizedSectionList/ScrollView bugs. Read BEFORE touching adapters/angular/src/components/{flat-list,section-list,virtualized-list,virtualized-section-list,scroll-view}/** or debugging blank list cells, cells outside the ScrollView (horizontal FlatList painting as a full vertical stack), an infinite CD loop/freeze once cells render, an unwanted RefreshControl (SCROLL-MULTI), or 2+ ng-content declarations projecting into only ONE. Covers: (1) bare ng-content passthrough breaking @ContentChild across a second re-projection hop (VListOutletDirective, asItem cast helper); (2) an ngDoCheck rebuilding a child's context unconditionally — a real infinite loop, fixed via a dependency-snapshot guard; (3) (event)=\"x.emit($event)\" forwarding poisoning .observed (refreshRequested fix) — real cause of a freeze first misattributed to bug 2; (4) ng-content duplicated across @if/@else, fixed on iOS (one host tag) and Android (one shared ng-template + outlet)."
---

# Symbiote Angular adapter — list family (FlatList/SectionList/VirtualizedList/VirtualizedSectionList) and ScrollView content-projection bugs

`FlatList`, `SectionList`, `VirtualizedList`, `VirtualizedSectionList`, and `ScrollView`
are the single densest bug-report cluster in the Angular adapter. All of it traces back
to two **different flavors of the same symptom family** — "list cells look empty" or
"list cells land in the wrong place" — with two genuinely distinct root causes, plus one
change-detection bug and one event-forwarding bug that were mistaken for each other on
a real device. Do not assume a blank-cells or misplaced-cells report is "the §12 bug" or
"the §18 bug" without checking which one actually applies:

- **`@ContentChild` across a second `<ng-content>` re-projection hop** (Bug 1 below) —
  a WRAPPER component (`FlatList`, `SectionList`) passes the app's own projected content
  straight through to an INNER component (`VirtualizedList`, `VirtualizedSectionList`)
  via a bare `<ng-content></ng-content>`, and the inner component's `@ContentChild` never
  sees it. Symptom: cells render as **empty wrapper views** — no exception, just blank
  rows.
- **Literal duplicate `<ng-content>` DECLARATIONS inside one component's own template**
  (the ScrollView bug below) — a single component (`ScrollView`) declares `<ng-content>`
  more than once in its own compiled template (once per `@if`/`@else` branch, or once per
  outlet), and Angular only ever projects into the LAST one declared, regardless of which
  branch is structurally active. Symptom: cells render **outside the scroll container
  entirely** — structurally misplaced, not empty.

Both were real on-device symptoms (a screenshot of blank lists, then a full app freeze;
later, a horizontal `FlatList` painting as a full-width vertical stack) that no amount of
`tsc -b` / `ngc` / pre-existing `vitest run` caught, because `FlatList`, `SectionList`,
`VirtualizedList`, and `VirtualizedSectionList` had **zero vitest coverage at all** before
this cluster of investigations — the whole family was verified only by type-checking,
which proves the surface compiles, not that it renders. `flat-list.test.ts` (`mount()` +
`installFabric()`, asserting on `fabric.created` node `testID`s / `RCTRawText` content
after `mount()` + a couple of microtask ticks — exactly like `pressable.test.ts`) is the
reference pattern for testing this family going forward.

## When to use this skill

Read this BEFORE:

- Touching `adapters/angular/src/components/{flat-list,section-list,virtualized-list,
  virtualized-section-list,scroll-view}/**`.
- Debugging a list that renders blank/empty cells with no thrown error.
- Debugging cells that render structurally outside their container (siblings of
  `RCTScrollView` instead of children of `RCTScrollContentView`).
- Debugging an infinite change-detection loop, a list-related app freeze, or RAM growth
  that starts the moment list cells begin rendering.
- Debugging a `RefreshControl` / `PullToRefreshView` that appears on a list with no
  `(refresh)` binding anywhere in the app's own code, or a `SCROLL-MULTI` diagnostic in
  the engine's `commit.ts` log on a `ScrollView` that shouldn't have two children.
- Adding a new component with a similar wrapper-forwards-to-inner-component shape, or a
  template with more than one `<ng-content>` occurrence (conditional or not).

## Bug 1 — bare `<ng-content>` passthrough breaks `@ContentChild` across a second re-projection hop

`FlatList`'s single-column path and `SectionList` (a pure forwarder) both did:

```html
<VirtualizedList ...><ng-content></ng-content></VirtualizedList>
<VirtualizedSectionList ...><ng-content></ng-content></VirtualizedSectionList>
```

banking on the (WRONG) claim that "Angular content queries traverse projected content."
They don't, across a **second** `<ng-content>` re-projection hop: `@ContentChild` on the
INNER component resolves against whatever was projected directly onto ITS OWN tag in the
template that instantiates it — here, that template is the WRAPPER's own (`FlatList`'s /
`SectionList`'s), and `<ng-content>` is only a placeholder there, not real template nodes.
The real app-authored `<ng-template vListItem>` (etc.) lives one level further out and
never resolves.

**Result:** `itemDir`/`headerDir`/etc. stay `undefined` inside `VirtualizedList`/
`VirtualizedSectionList`, `VListOutletDirective` gets an `undefined` `templateRef`, and
every cell renders as an EMPTY wrapper view — no exception, no red banner, just blank rows
against whatever background color the list container has (easy to mistake for "the list is
invisible" rather than "the list is empty").

**Fix:** never `<ng-content>`-passthrough into a component whose OWN `@ContentChild` needs
to see the app's directive. Instead, the WRAPPER captures the app's templates with its OWN
`@ContentChild` (a single, direct hop — this always resolves) and RE-AUTHORS equivalent
`<ng-template>`s on the inner component, each forwarding the captured `templateRef` + a
freshly-built context through `VListOutletDirective` — exactly the pattern
`VirtualizedSectionList` already used correctly for ITS OWN inner `VirtualizedList` (the
multi-column `FlatList` path already did this too; only the single-column `FlatList` path
and all of `SectionList` had the broken passthrough).

When a `[vListOutletContext]` object literal needs a field typed `ItemT` (e.g. a
separator's `leadingItem`/`trailingItem`) but the only available value is a template
`let-` binding (typed `unknown` — Angular cannot preserve a generic structural directive's
type parameter across this kind of reuse), route it through a tiny named
`asItem<ItemT>(value): ItemT | undefined` cast helper (see `flat-list/index.ts` /
`section-list/index.ts`) — the narrowest legitimate `as` boundary, not a general license to
cast.

**Precedent for a future adapter or component:** `VListOutletDirective` — capture with your
own `@ContentChild`, re-author `<ng-template>` on the inner component, forward via a
template-outlet directive — is the same shape `create-tunnel`'s `TunnelOut` uses for
cross-surface content sharing; see the Scope boundary section below.

## Bug 2 — `VirtualizedList.ngDoCheck()` recomputed `windowCells` unconditionally, causing a genuine infinite render loop

`recomputeView()` rebuilds `windowCells` (and each cell's `separators` handle — brand-new
closures every call) from scratch on every single `ngDoCheck`, with no memoization at all,
unlike `VirtualizedSectionList`'s OWN `ngDoCheck` (which already gates on
`sections`/`hasSectionSeparator` unchanged). A fresh context object every tick flows into
`VListOutletDirective`, whose `context` `@Input()` therefore "changes" every tick by
reference — correctly triggering `ngOnChanges` → `viewRef.markForCheck()` → the zoneless
scheduler's `notify()` (`render.ts`'s `SymbioteChangeDetectionScheduler`) → another
`detectChanges()` tick on the NEXT microtask → `ngDoCheck` runs again → rebuilds fresh
again → repeat forever.

This is a genuine infinite render loop, present in `VirtualizedList` since it was written,
but **completely dormant and invisible** until Bug 1 was fixed — with `itemDir` always
undefined, `VListOutletDirective`'s embedded view was never created, so `markForCheck()`
was never called from there, so the loop never started. The moment lists actually render
content (Bug 1 fixed), the app pegs the JS thread in a perpetual re-render churn — on
device this presented as "списки появились, но приложение намертво висит" (lists
appeared, but the app hard-froze) plus broken layout (starved layout/paint while JS never
idles).

**Fix:** `ngDoCheck()` now computes a snapshot of every input `recomputeMetrics`/
`recomputeView` actually depend on (`data`, `extraData`, `getItemLayout`, `keyExtractor`,
`horizontal`, `inverted`, `windowSize`, `initialNumToRender`, `maxToRenderPerBatch`,
`stickyHeaderIndices`, `maintainVisibleContentPosition`, `style`, `contentContainerStyle`,
`scrollOffset`, `viewportLength`, `measureVersion`, and the four header/footer/empty/
separator directive-presence booleans) and skips the recompute entirely when every value
is reference-identical to the previous check — so a CD pass triggered by something else
entirely in the app reuses the same `windowCells` identities, `VListOutletDirective` sees
no real change, and the loop never starts. Explicit state changes (scroll, layout, a cell
measurement, a genuine data swap) still correctly bump one of the tracked values and
trigger a fresh recompute.

**Generalize this:** any future component with a similarly unconditional `ngDoCheck`/
`ngOnChanges` that feeds fresh object identities into a child's `@Input()` should get the
same kind of dependency-snapshot guard — this is not unique to lists, just first
discovered here. See `angular-adapter-change-detection` for the broader CD-mechanics
material this generalizes into (Scope boundary below).

### Gotcha — a JIT-only quirk, not a production bug

A THIRD, separate issue surfaced purely in JIT/vitest and is NOT a production bug:
`VListItemDirective`/`VListHeaderDirective`/etc. (and the `VSection*Directive` family)
originally took their `TemplateRef`/`ViewContainerRef` via constructor-parameter injection
(`constructor(public readonly templateRef: TemplateRef<T>) {}`), which threw `NG0202`
under vitest's JIT compilation (Angular's JIT DI needs `Reflect`-based
`design:paramtypes` metadata that oxc's legacy-decorator lowering doesn't reliably emit
for a generic class) — but compiled to a correct, fully-static
`deps: [{ token: i0.TemplateRef }]` under the REAL `ngc --compilationMode partial` build
(confirmed by inspecting `adapters/angular/build/angular/**/directives.js`), so it was
never actually broken on device.

Converted to `inject()` field style anyway (`readonly templateRef =
inject<TemplateRef<T>>(TemplateRef);`) — matches the rest of the codebase's own DI
convention and, as a side effect, is what made these directives headless-testable at all.

A SEPARATE, still-unresolved JIT-only quirk (`SectionList` wrapping
`VirtualizedSectionList` throws "Can't construct a query for the property ... since the
query selector wasn't defined" under vitest specifically — confirmed absent when mounting
`VirtualizedSectionList` directly, and the real `ngc` build of `SectionList` compiles with
0 errors) means `SectionList` itself still has no passing headless test as of this
session; treat that as a known gap, not evidence the component is broken — verify
`SectionList` changes via a real device/simulator run until this JIT quirk is tracked
down.

## Bug 3 — `(event)="x.emit($event)"` forwarding permanently poisons an inner component's `.observed` gate

Every list wrapper (`FlatList`, `SectionList`, `VirtualizedSectionList`) forwards its
inner `VirtualizedList`'s `refresh` event outward via a template binding:
`(refresh)="refresh.emit()"` (or `resolvedOnRefresh?.()`). **The mere presence of that
binding subscribes to the inner component's `refresh` `@Output()`, unconditionally,
regardless of what the handler expression does** — so `VirtualizedList`'s own
`refresh.observed` getter is permanently `true` the moment it is used INSIDE any wrapper,
even when the app itself never listens to `(refresh)` on the outermost `<FlatList>`/
`<SectionList>`. `VirtualizedList`'s template gated `<RefreshControl>` rendering on
`@if (refresh.observed)`, so this made **every single list in the app render a
`RefreshControl` / `PullToRefreshView`, always** — confirmed on-device via `DEBUG=1` log:
every `RCTScrollView` (all 5 in the app, including ones with no `(refresh)` binding
anywhere in the app's own code) showed `SCROLL-MULTI!!` (`core/engine/src/commit.ts`'s
diagnostic for "a ScrollView has more than one direct child") with an unconditional
`PullToRefreshView` child.

### This is the ACTUAL cause of a device freeze originally misdiagnosed as Bug 2's loop guard being wrong

This is what actually caused the on-device freeze/RAM-growth symptom reported AFTER
Bug 1 and Bug 2 above were fixed — the extra always-present `PullToRefreshView` (+ a
permanently-uncommitted `#anchor#NEW` sibling, never resolving to a stable Fabric tag in
the log) destabilized native scroll/layout enough that `onLayout`/`onScroll` kept firing
with shifting values, which correctly (per Bug 2's now-working memoization) kept
triggering fresh, legitimate recomputes forever — **Bug 2's loop guard was never wrong;
the values it was watching were genuinely never settling, because of this RefreshControl
leak.** Do not re-open or second-guess Bug 2's memoization fix when chasing a similar
symptom — check for an `.observed`-forwarding leak like this one first.

**Fix:** `.observed` cannot be trusted as a "does anyone actually want this" gate on a
component that is ALWAYS wrapped and ALWAYS internally forwarded — the WRAPPING layer's
forwarding subscription poisons it. Added an explicit `@Input() refreshRequested?:
boolean` to `VirtualizedList` (and to `VirtualizedSectionList`, which has the identical
problem one layer up), computed from `shouldRenderRefreshControl = this.refreshRequested
?? this.refresh.observed` (falls back to the component's own `.observed` for direct,
unwrapped usage — unchanged behavior there). Each wrapper now passes
`[refreshRequested]="refresh.observed"` — ITS OWN public output's `.observed`, the one
signal that genuinely still reflects "did the APP subscribe" — down to the next layer in
(`FlatList` → `VirtualizedList`, `SectionList` → `VirtualizedSectionList` →
`VirtualizedList`).

**Generalize this:** any future wrapper that forwards a child component's event via
`(event)="x.emit($event)"` and then reads that SAME child's `.observed` to gate behavior
has this exact bug — the forwarding binding is itself an observer. The fix pattern (an
explicit override input, falling back to local `.observed`) generalizes directly.

## ScrollView — `<ng-content>` duplicated across `@if`/`@else` branches, cells land outside the ScrollView (FIXED 2026-07)

The bug (device-confirmed on iOS, "FlatList · 24 chips, windowed" demo in
`examples/angular/App.ts`): a horizontal `FlatList`'s item cells rendered as a full-width
vertical stack at the app root instead of a small horizontal strip — looked like "styles
not applied", but the styles were correct; the cells were structurally outside the
ScrollView entirely (siblings of `RCTScrollView`, not children of its
`RCTScrollContentView`). Every OTHER list on the same screen (plain `FlatList`,
`SectionList` with sticky headers, MVCP prepend-without-jump) was unaffected.

### Root cause — a documented Angular limitation, not a SymbioteNative-specific bug

`ScrollView`'s iOS template (`scroll-view/index.ios.ts`) used to branch its ENTIRE host
structure on `@if (isHorizontal) { ...horizontal tags + <ng-content>... } @else {
...vertical tags + <ng-content>... }` — declaring `<ng-content>` TWICE, once per branch.
Angular's own content projection has a known limitation with this shape: **content
projected into the FIRST (`@if`) branch of a two-branch conditional never receives
Angular's native "catch-up" placement; only the SECOND (`@else`) branch does.** Confirmed
both by our own headless `DEBUG=1` trace (below) AND by upstream Angular issues describing
the identical symptom:
[angular/angular#53310](https://github.com/angular/angular/issues/53310) ("@if syntax
does not display projected content" — "When the @if condition is true, the projected
content is not displayed... but when the condition is false, the projected content in the
@else block displays correctly"), [#54840](https://github.com/angular/angular/issues/54840)
("Conditionals and content projection" — same interaction with legacy `*ngIf`/`else`, not
new-control-flow-specific). Angular's own official docs state it as a hard rule: **"You
should not conditionally include `<ng-content>` with `@if`, `@for`, or `@switch`"**
(angular.dev/guide/components/content-projection) — the general-purpose recommended
workaround is `<ng-template>` + explicit `ViewContainerRef`/`NgTemplateOutlet` rendering,
for cases that truly need conditional projection.

Since our symptom was axis-specific (horizontal broken, vertical fine) rather than an
obviously-conditional `<ng-content>`, it took a headless `DEBUG=1` trace to see the
mechanism: for the vertical (`@else`, second) branch, Angular's native catch-up
(`applyProjection`) fires immediately after `RCTScrollContentView` is created — real
`appendChild`/`insertBefore` calls land the already-built cell row-wrappers into it BEFORE
`ScrollViewProjectionController.bindContentNode()` even runs (confirmed:
`bindContentNode preExistingChildren=29`). For horizontal (`@if`, first), that same
catch-up never fires — `bindContentNode preExistingChildren=0`, forever, even after a real
`topLayout` event and multiple settle-ticks.

### The iOS fix — collapse to a single unconditional host tag

Unlike Android, iOS has only ONE native intrinsic pair regardless of axis —
`symbiote-scroll-view`/`symbiote-horizontal-scroll-view` (and their `-content`
counterparts) both resolve to the exact same Fabric view (`RCTScrollView`/
`RCTScrollContentView`, confirmed in trace logs). `shared.ts`'s `scrollProps` getter
ALREADY forwards the axis as a plain prop — `if (this.horizontal !== undefined)
bag.horizontal = this.horizontal;` (its own comment: "iOS needs `horizontal` to flip
RCTScrollView's axis; Android's dedicated manager ignores it"). So the `@if`/`@else`-
over-two-tag-pairs shape in `index.ios.ts` was ALWAYS redundant with that existing prop
forwarding — written to mirror Android's genuinely-necessary branching, for authoring
symmetry, not because iOS needed it.

Removed the conditional entirely: `index.ios.ts` now renders ONE
`<symbiote-scroll-view>`/`<symbiote-scroll-content>` structure unconditionally (dropped
the `HorizontalScrollView`/`HorizontalScrollContentView` imports from this file only —
they're still exported from `primitives/index.ts` for `index.android.ts`), with
`<ng-content>` declared exactly once. `hasProjectedRefreshControl`'s own `@if` is
untouched (it doesn't wrap `<ng-content>`, so it was never part of this bug).

**Verified:** rebuilt (`pnpm ng:build` from `adapters/angular`), full `adapters/angular/src`
suite: **57/57 passing, zero regressions** — including the 3
`scroll-view-projection.test.ts` vertical-scenario tests that DID break under the ruled-out
swap below, confirming this fix (unlike the swap) doesn't trade one axis for the other.
`flat-list-scroll-containment.test.ts`'s pinned regression test flipped from `it.fails` to
a plain `it` and passes for real.

### TESTED AND RULED OUT — naive branch-order swap (iOS)

Before finding the real fix, swapped `index.ios.ts` to `@if (!isHorizontal) {
...vertical... } @else { ...horizontal... }` (semantically identical, just reordered which
block is textually first). Result: the horizontal chip test flipped to passing (confirmed
the first-branch/second-branch theory) — but 3 previously-green
`scroll-view-projection.test.ts` tests and `flat-list.test.ts`'s header/footer test
immediately broke (vertical content now empty: `RCTScrollView(RCTScrollContentView)` with
nothing inside). **Proves the bug is purely positional, not about horizontal vs vertical
semantics — reordering only relocates it onto whichever axis ends up first.** Do not retry
a plain reorder as "the fix."

### Android — same class of bug, worse (four call sites), FIXED after two attempts were ruled out

`index.android.ts` had the same class of bug — investigated and FIXED 2026-07, after two
earlier attempts were RULED OUT. Android's template has the SAME `<ng-content>`-per-branch
shape, but WORSE — FOUR call sites (nested `@if (isHorizontal) { @if
(hasProjectedRefreshControl) {...} @else {...} } @else { @if
(hasProjectedRefreshControl) {...} @else {...} }`), one of which additionally used
`<ng-content select="*:not(RefreshControl)">` where the others didn't. That selector was
DEAD WEIGHT, not a real inconsistency to preserve:
`ScrollViewProjectionController.reconcileStickyRecords()` (`projection.ts:315`) already
strips a projected `<RefreshControl>` out of the content records whenever
`excludeRefreshControl` is set, regardless of any `<ng-content select>` — confirmed by
reading the code, not just inference; the fix drops the selector.

Android CANNOT reuse the iOS fix's "collapse to one tag" approach — it genuinely needs a
different Fabric view per axis for BOTH the outer scroll container (`RCTScrollView` is
vertical-only; `AndroidHorizontalScrollView` is a dedicated ViewManager) AND the inner
content view (RN's `*ScrollContentViewNativeComponents.js`: vertical content is a plain
Android `View`; horizontal content is `AndroidHorizontalScrollContentView`, which carries
its own `ShadowNode::layout()` override participating in scroll content-size math — NOT a
cosmetic/optional class, confirmed by reading
`AndroidHorizontalScrollContentViewShadowNode.h` in `.vendors/react-native`, so silently
downgrading horizontal content to a plain `RCTView` is not a safe shortcut).

**Attempt 1 — RULED OUT: `<ng-template>` PER AXIS (two templates), each with its own
`<ng-content>`.** Declared exactly one `<ng-content>` per axis inside its own top-level
`<ng-template>`, outletted into the correct `@if`/`@else` branch via a custom
`[symbioteTemplateOutlet]` directive (`ViewContainerRef.createEmbeddedView`, a local
`@angular/core`-only twin of `@angular/common`'s `NgTemplateOutlet` — the adapter
deliberately has no `@angular/common` dependency, see `package.json`). This is literally
Angular's own documented workaround ("configure that component to accept an
`<ng-template>` element... Angular will not initialize the content... until that element
is explicitly rendered", angular.dev/guide/components/content-projection) — and it still
failed, because it still declared `<ng-content>` TWICE (once per axis template).

Built, rebuilt, tested: BROKE DIFFERENTLY depending on which of the two `<ng-template>`
blocks was declared LAST in template source order — whichever was declared last received
projected content, the other got NOTHING appended at all (not "wrong position", genuinely
zero `appendChild` calls for that content, confirmed via a `DEBUG=1` headless trace:
`bindContentNode preExistingChildren=0`, `reconcile records=0` forever). Swapping branch
ORDER inside `@if`/`@else` did NOT change this — only swapping which `<ng-template>` was
declared last in the template string did.

**This produced the key finding:** the rule is not "first `@if` branch loses catch-up"
(that was iOS's framing, and it's too narrow) — it's "a component with TWO TEXTUALLY
DISTINCT unqualified `<ng-content>` declarations anywhere in its own compiled template
reliably projects into only ONE of them (the one declared last in source), regardless of
whether they're wrapped in `@if`/`@else`, deferred into an `<ng-template>`, or outletted
via `ViewContainerRef.createEmbeddedView`/`NgTemplateOutlet`." Matches the *title* of a
related upstream issue, [angular/angular#22972](https://github.com/angular/angular/issues/22972)
("Strange behaviour with multiple `<ng-content>` and `*ngIf`"). Nesting a second, distinct
COMPONENT with its own single `<ng-content>` doesn't dodge this either — the count that
matters is "how many distinct `<ng-content>` declarations exist in the ONE component whose
caller supplied the content", and delegating the axis choice to a child component just
relocates that same count into the child's own template.

**The fix — Attempt 3 (2026-07): ONE shared `<ng-template>`, referenced by outlet from all
four branches, not one-per-axis.** The insight Attempt 1 missed: the "only last one wins"
rule fires on `<ng-content>` DECLARATION COUNT, not on how many places
reference/instantiate that declaration. So `index.android.ts` now declares a SINGLE
top-level `<ng-template #sharedContent><ng-content></ng-content></ng-template>` — one
`<ng-content>` occurrence, period — and every one of the four structural branches contains
`<ng-container [symbioteTemplateOutlet]="sharedContent"></ng-container>` instead of its own
`<ng-content>`. `SymbioteTemplateOutletDirective` (the same minimal `@angular/common`-free
twin of `NgTemplateOutlet` from Attempt 1, now exported from `index.android.ts` — `ngtsc`'s
partial-mode compiler requires an imported symbol referenced by a component's `imports`
array to be exported from its declaring file, confirmed via a real `NG3004` build error)
instantiates that one `TemplateRef` via `ViewContainerRef.createEmbeddedView` wherever the
active branch places it. Since only one branch is ever live, only one embedded view of
`sharedContent` exists at a time — but the DECLARATION itself, textually, is singular, so
the "last one wins" limitation never triggers in the first place. Angular local template
variables (`#sharedContent`) are hoisted across the whole component template regardless of
DOM position, so declaring it before the `@if` is valid and the four outlet references
below it all resolve correctly.

**Verified:** `pnpm ng:build` (AOT partial→linker) clean, monorepo `tsc --build` clean,
ESLint clean. New permanent regression test
`scroll-view/android-scroll-view-axis-projection.test.ts` covers all four static axis x
refresh-control combinations PLUS a runtime vertical→horizontal axis switch (a
signal-driven `@if` re-evaluation) — all pass. Full `adapters/angular/src` suite: **61/61
passing, zero regressions** (57 pre-existing + 4 new), including
`scroll-view-projection.test.ts`'s Android refresh-control case and
`flat-list-scroll-containment.test.ts`. NOT tested on an Android device/emulator (headless
vitest + AOT build only) — worth a real-device smoke before shipping, but the headless
mechanism match with the now-fixed iOS case (same engine, same commit path) is strong
evidence.

**Attempt 2 (imperative relocation via `ScrollViewProjectionController`) was never
attempted** — Attempt 3 above resolved it declaratively first and is simpler; keep
Attempt 2's approach on file as a fallback ONLY if a future Angular version changes the
outlet-reuse behavior Attempt 3 relies on.

## Verification checklist

Run through this whenever touching the list family or `ScrollView`'s templates:

1. Does any component pass a bare `<ng-content></ng-content>` straight into a child that
   itself declares a `@ContentChild`? If yes, that query will never resolve — capture with
   the wrapper's own `@ContentChild` and re-author `<ng-template>` + a template-outlet
   directive instead (Bug 1).
2. Does any component declare `<ng-content>` more than once in its OWN compiled template
   (across `@if`/`@else` branches, multiple `<ng-template>`s, or otherwise)? Collapse to a
   single unconditional `<ng-content>` if the structural difference can be expressed as a
   prop instead (iOS fix); if genuinely different host tags are required per branch, use
   ONE shared `<ng-template>` + outlet referenced from every branch, never one `<ng-content>`
   per branch (Android fix).
3. Does a `ngDoCheck`/`ngOnChanges` in the touched component rebuild any object/array
   passed to a child `@Input()` unconditionally, every CD pass? If yes, add a
   dependency-snapshot guard (Bug 2's pattern) before it ships.
4. Does any template forward a child component's `@Output()` via `(event)="x.emit($event)"`
   and then read that SAME child's `.observed` getter to gate behavior? If yes, that
   `.observed` is permanently poisoned — add an explicit override `@Input()` instead
   (Bug 3's `refreshRequested` pattern).
5. Run the full `adapters/angular/src` vitest suite; confirm no regression against the
   pinned counts (57/57 after the iOS ScrollView fix, 61/61 after the Android fix).
6. Rebuild via `pnpm ng:build` (AOT partial→linker) — a JIT-only pass (plain `vitest run`)
   is not sufficient proof for anything touching `@ContentChild`/DI/`<ng-content>`; the
   real compiler can behave differently (see the NG0202 gotcha and the NG3004 export-
   visibility gotcha above).
7. For anything Android-specific, budget a real device/emulator smoke — this cluster's
   Android fixes have repeatedly been headless-clean but unverified on a real host.

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Cells render as empty wrapper views, no error | Bare `<ng-content>` passthrough breaks `@ContentChild` on inner component (Bug 1) | Capture with wrapper's own `@ContentChild`, re-author `<ng-template>` + `VListOutletDirective` |
| App hard-freezes / JS thread pegged the moment list cells start rendering | `ngDoCheck` rebuilding fresh object identities every CD pass, feeding a child `@Input()` (Bug 2) | Add a dependency-snapshot memoization guard to `ngDoCheck` |
| `RefreshControl`/`PullToRefreshView` appears on a list with no `(refresh)` binding in app code | `(event)="x.emit($event)"` forwarding makes `.observed` permanently true (Bug 3) | Add an explicit override `@Input()` (e.g. `refreshRequested`), fall back to local `.observed` |
| A device freeze looks like Bug 2's loop guard is wrong again | Actually Bug 3's RefreshControl leak destabilizing scroll/layout, which correctly re-triggers Bug 2's (working) memoized recompute | Check for a `.observed`-forwarding leak before touching Bug 2's guard |
| A horizontal `FlatList`/`ScrollView` paints as a full-width vertical stack; cells are siblings of `RCTScrollView`, not children of `RCTScrollContentView` | Duplicate `<ng-content>` across `@if`/`@else` branches on iOS; first branch never gets Angular's projection catch-up | Collapse to one unconditional host tag with one `<ng-content>` (iOS fix) |
| Same symptom on Android, or content silently disappears from whichever branch was declared earlier in the template | Duplicate `<ng-content>` across FOUR branches on Android; "last declared wins", not "first branch loses" | ONE shared `<ng-template>` + `SymbioteTemplateOutletDirective` referenced by outlet from every branch |
| `NG0202` thrown only under vitest JIT, directive otherwise fine | JIT DI can't resolve constructor-param-injected `TemplateRef`/`ViewContainerRef` on a generic class | Convert to `inject()` field style (also makes the directive headless-testable) |
| `NG3004` build error referencing a template-outlet directive | `ngtsc` partial-mode requires a symbol referenced in a component's `imports` array to be exported from its declaring file | Export the directive from the file that declares the shared `<ng-template>` |
| `SectionList` throws "Can't construct a query for the property..." only under vitest | Known unresolved JIT-only quirk, absent when mounting `VirtualizedSectionList` directly and absent from the real `ngc` build | Not a production bug; verify `SectionList` changes on a real device/simulator until tracked down |

## Scope boundary

This skill owns the **list-family content-projection, infinite-loop, and RefreshControl-
leak bugs** (FlatList/SectionList/VirtualizedList/VirtualizedSectionList/ScrollView) —
nothing else about these components' props, styling, or general architecture.

- **`angular-adapter`** — the main skill — is the parent record: §0 for adapter status,
  §6 for the `DescriptorOutlet`/`descriptorToAngular` component-parity model these list
  components build their views on top of. Read it first for anything outside this
  skill's list-specific bug cluster.
- **`angular-adapter-portal`** — `TunnelOut`'s own template-outlet mechanism for
  cross-surface content sharing is directly modeled on `VListOutletDirective` (Bug 1's
  fix in this skill) — the capture-with-your-own-`@ContentChild`-then-re-author-
  `<ng-template>` pattern is precedent, not a coincidence. Read that skill for anything
  about portals/tunnels; treat `VListOutletDirective` as the reference shape it followed.
- **`angular-adapter-change-detection`** — Bug 2's infinite-loop fix (the dependency-
  snapshot memoization guard on `ngDoCheck`) and that skill's `SignalView`/`markForCheck`
  material are closely related: a list's `ngDoCheck` misbehaving is fundamentally a
  change-detection-mechanics problem wearing a list-specific costume. Read that skill for
  the general CD model this bug is one instance of, or when a similar unconditional-
  recompute pattern shows up outside the list family.

Reach for the right skill by what the work is actually about: LIST CELLS/CONTENT-
PROJECTION/REFRESH-LEAK → this skill, CROSS-SURFACE CONTENT SHARING → `angular-adapter-
portal`, GENERAL CD MECHANICS/SIGNALS → `angular-adapter-change-detection`, ANYTHING ELSE
→ `angular-adapter`.
