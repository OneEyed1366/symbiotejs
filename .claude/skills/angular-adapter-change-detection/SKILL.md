---
name: angular-adapter-change-detection
description: "Symbiote Angular adapter change detection — read BEFORE debugging why a component renders but does not REPAINT after a flat-bag onX/responder/PanResponder mutation, before touching SymbioteHostPropsDirective or render.ts's CD wiring, or before assuming ApplicationRef.tick() fixes a whole-tree rebuild on press. Covers: whenCommitted async-commit gotcha (from Vue); SignalView vs CheckAlways (Angular 20 @Component views are SignalView, so a flat-bag onX mutation dirties nothing — fix is markForCheck(), NOT detectChanges()); zoneless scheduling + ApplicationRef.tick() (unreachable pre-fix, missing INJECTOR_SCOPE:'root', Targeted vs Global mode); a hypothesis DISPROVED: Targeted mode does NOT stop a press re-running the root template (markViewDirty walks RefreshView|Dirty to root); protected (@Component) vs not (@if/@for). Trigger: 'renders but doesn't repaint', 'rebuild whole tree on press', markForCheck vs detectChanges, NG0201/ApplicationRef failures, template literals losing referential stability."
---

# Symbiote Angular adapter — change detection mechanics

Three discoveries, made in this order, and each one narrows the picture left by the
last. Read them in order — the narrative is the point, not just the final answer.

1. **§1 below (async-commit timing)** — the basic, Vue-inherited gotcha: Angular's
   change detection is async/batched too, so a native call that needs a committed
   Fabric tag must go through `whenCommitted`, exactly like Vue.
2. **§2 below (SignalView vs CheckAlways)** — a component can render correctly on
   mount and still go permanently dead on every subsequent flat-bag `onX` mutation,
   because Angular 20 plain components are `SignalView`, not `CheckAlways`, and a
   SymbioteNative callback dirties nothing Angular knows about. Fixed with
   `markForCheck()` via a directive.
3. **§3 below (real `ApplicationRef.tick()`)** — investigating "why does any press
   rebuild the whole tree" led to replacing a hand-rolled scheduler with Angular's
   own `ApplicationRef`, AND to a hypothesis ("Targeted mode stops the root
   re-render") that was written up, implemented, and then DISPROVED by a test
   before it shipped. Both the fix and the correction are durable — keep both.

## §1. Async-commit-timing gotcha applies identically (inherited from Vue)

Angular's change detection is async/batched (zoneless schedules CD on a microtask),
just like Vue's commit batching. So the **whenCommitted** gotcha from
`vue-adapter-reactivity` (Gotcha 2) repeats verbatim: any native/imperative call
wired at Angular lifecycle time (e.g. an `afterNextRender` / `effect` that reads a
Fabric tag — native-driver Animated, sticky-attach, TextInput autoFocus) must go
through `whenCommitted(node, action)` (`core/engine/src/post-commit.ts`,
`commit.ts`), not assume the tag exists. This was BUILT during Vue — Angular inherits
it for free. (React doesn't hit it: `react-reconciler` commits synchronously.)

## §2. A flat-bag `onX` callback that mutates plain state must `markForCheck` — Angular 20 components are SignalView, not CheckAlways (2026-07)

The bug (device-confirmed on iOS): the responder/PanResponder demo (`examples/angular/components/
ResponderDemo.ts`) and `ParityDemo` (`onLongPress`/`onPress`) rendered but were dead — "pan does
nothing", the `{{ status }}` text never changed — while the SAME demo repainted fine on React and
Vue. The gesture logic ran (the engine logged `responder granted`, the callback mutated
`this.status`); only the template never repainted (`setValue` for `{{ status }}` never fired,
`commit reconciled changed=false`).

**Root cause — Angular 20 compiles a component as a `SignalView`, NOT `CheckAlways`.**
`getInitialLViewFlagsFromDef` (`.vendors/angular/.../view/construction.ts`): `signals → SignalView;
onPush → Dirty; else → CheckAlways`. In v20 plain `@Component`s carry `def.signals`, so their LView
is `SignalView`. In `detectChangesInView` a view is refreshed only when
`(Global && CheckAlways) || (Global && Dirty) || RefreshView || (its reactive consumer is dirty)`.
A SignalView is none of those on a plain-property mutation, so a root `detectChanges()` **does not
descend into it**. React/Vue never hit this: React's `setState` and Vue's proxy `.value =` are the
notification; a SymbioteNative flat-bag `onX` callback is invoked DIRECTLY by the engine's event dispatch
(`callOwnListener`/`bubble` in `core/engine/src/events/index.ts`), entirely outside Angular, so it
dirties nothing. `(event)="…"` template bindings escape the bug because Angular compiles them through
its own `ɵɵlistener` wrapper which calls `markForCheck`; `[symbioteHostProps]`/flat-bag `onX` props do
not. Only components whose state is mutated via a flat-bag callback are affected — hence responder /
`onLongPress`, not the Buttons' `(press)`.

**The fix — `SymbioteHostPropsDirective` wraps every `onX` function prop to call `this.cdr.markForCheck()`
after the handler runs** (`adapters/angular/src/primitives/shared.ts`). The directive is declared IN its
host component's template, so its injected `ChangeDetectorRef` is that component's view detector.
`markForCheck` → `markViewDirty` which (when NOT already inside a CD pass) sets `RefreshView | Dirty` on
the view **and every ancestor up to the root**, and calls `changeDetectionScheduler.notify()` — our own
scheduler. `RefreshView` is the one flag that survives the Targeted descent a root tick uses for
un-dirtied intermediate views, so the next root `detectChanges()` reaches and repaints the mutated
component. This is the exact Angular twin of what React/Vue get for free.

### Landmines proven the hard way (don't repeat them)

- **`detectChanges()` in the directive does NOT work; `markForCheck()` does.** `createViewRef`
  (`.vendors/angular/.../change_detector_ref.ts`): a component-host tNode → `new ViewRef(componentView,
  componentView)`; a plain ELEMENT tNode (what a directive sits on) → `new ViewRef(hostComponentView,
  lView)`. `ViewRef.detectChanges()` acts on `_lView` (wrong view for the element case), but
  `markForCheck()` acts on `_cdRefInjectingView` (= the host component). So a directive must use
  `markForCheck`, not `detectChanges`.
- **`ApplicationRef.tick()` is unavailable** — `injector.get(ApplicationRef, null)` is `null` in this
  DOM-less `createEnvironmentInjector(null-parent)` bootstrap (§2 of the main `angular-adapter` skill),
  by design. And it would not help: it also refreshes only dirty/CheckAlways views.
- **A root-level `setEventDispatcher(run => { run(); scheduler.notify() })` wrap does NOT fix it** (an
  earlier attempt). It pings the scheduler, but the scheduler's root `detectChanges()` still can't
  descend into a SignalView child — and it fires `detectChanges` on every native event incl. every
  scroll frame (needless churn). Removed. `markForCheck` already notifies the scheduler itself.
- wolf-tui's Angular adapter uses the SAME `componentRef.changeDetectorRef.detectChanges()` scheduler
  and does not hit this only because its reactive state is SIGNAL-driven (setInterval → signal), which
  dirties the SignalView's consumer. Plain-property state is what exposes the gap.

Also in `render.ts`: the root tick resolves each root's OWN-view detector via
`cmpRef.injector.get(ChangeDetectorRef)` (not `ComponentRef.changeDetectorRef`, the host/wrapper view,
which paints once but never re-descends into the component). Regressions:
`adapters/angular/src/__tests__/responder-change-detection.test.ts` (flat root) and
`responder-nested-cd.test.ts` (App→child nesting, the device-faithful shape) — fire real touch
primitives over the fake Fabric slot (`fabric.fireEvent`) and assert `{{ status }}` walks
idle→granted→moving→released in the COMMITTED tree (use `findCommitted`, not `fabric.find`:
clone-on-write puts prop updates only in `committed`, never in `created`). A composed child a test
mounts must register its selector via `registerComposedComponent(selector)` (exported from
`renderer.ts`) or createElement paints RN's "Unimplemented component" fallback.

## §3. Change detection now runs on real `ApplicationRef.tick()`, not a hand-rolled scheduler — but that does NOT stop a press from re-running the root's own template (2026-07)

**Trigger for this investigation**: after fixing 3 Android-only bugs in a row on the same new
demo section (content-wrapping crash → `nestedScrollEnabled` default → unstable
`[animatedProps]` literal causing native-handler churn on EVERY press anywhere), the user asked
"we rebuild the whole tree on any sneeze, that's nonsense — investigate properly." This section
is that investigation's conclusion, including a claim that looked right, got implemented, and
was then DISPROVED by a test before it shipped — keep both the fix and the correction, they are
both durable lessons.

### Root cause, confirmed by reading vendored Angular source, not guessed

`render.ts`'s old `SymbioteChangeDetectionScheduler.notify()` called `rootView.detectChanges();
cmpView.detectChanges();` on EVERY tick, unconditionally, regardless of what triggered it.
`ChangeDetectorRef.detectChanges()` (`view_ref.ts`) calls `detectChangesInternal(lView)` with
**no mode argument**, and `detectChangesInternal`'s default parameter
(`render3/instructions/change_detection.ts`) is `mode = ChangeDetectionMode.Global` — which
refreshes `CheckAlways`-flagged content unconditionally, not just `RefreshView`-flagged content.
By contrast Angular's own `ApplicationRef.tick()` → `synchronize()` → `synchronizeOnce()`
(`application/application_ref.ts`) computes `useGlobalCheck = Boolean(dirtyFlags &
ApplicationRefDirtyFlags.ViewTreeGlobal)` — and for a **zoneless** app, plain `tick()` never sets
that flag (`if (!this.zonelessEnabled) { dirtyFlags |= ViewTreeGlobal }`), so real zoneless
`ApplicationRef.tick()` runs `ChangeDetectionMode.Targeted` — "only refresh views with the
`RefreshView` flag or a dirty signal consumer."

### Why `ApplicationRef` wasn't reachable before, and the actual one-line fix

`render.ts` bootstraps via `createEnvironmentInjector(providers, null)`. Every `createEnvironmentInjector`
call — including the one inside `internalCreateApplication()`/`bootstrapApplication()` itself —
builds an `R3Injector` with `scopes = new Set(['environment'])`
(`render3/ng_module_ref.ts`, `EnvironmentNgModuleRefAdapter`), **never** `'root'`. Angular's DI
only resolves a `providedIn:'root'` token (`ApplicationRef` included) in an injector whose
`this.scopes.has('root')` is true (`r3_injector.ts`, `injectableDefInScope`) — a null parent, a
real `platformCore()`, even a full `StaticInjector`-based platform injector: NONE of these add
`'root'` to OUR injector's own scope set, so `injector.get(ApplicationRef)` threw `NG0201` no
matter what parent was tried (confirmed empirically — `platformCore()` as parent did NOT help).
The actual mechanism, found by reading `platform-browser/src/browser.ts`:
`BROWSER_MODULE_PROVIDERS` includes `{ provide: INJECTOR_SCOPE, useValue: 'root' }` **as one of
its own app-level providers** — `R3Injector`'s constructor reads `INJECTOR_SCOPE` off its own
provider list and self-tags `this.scopes.add('root')`. So the fix is one provider line, no
`PlatformRef` needed, no DOM needed:

```ts
{ provide: ɵINJECTOR_SCOPE as INJECTOR_SCOPE, useValue: 'root' },
...ɵprovideZonelessChangeDetectionInternal(),  // the real ChangeDetectionSchedulerImpl + NoopNgZone + ZONELESS_ENABLED:true
```

then `injector.get(ApplicationRef)`, `appRef.attachView(cmpRef.hostView)` (+`rootRef.hostView`
for the wrapper-component path), and `appRef.tick()` for first paint. This **replaced** the
whole hand-rolled `SymbioteChangeDetectionScheduler` class (queueMicrotask + reentrancy guards)
— Angular's own `ChangeDetectionSchedulerImpl` already does exactly that, self-scheduling off
`ApplicationRef.afterTick`. All 676 tests green, `ngc` AOT build green, no other file needed to
change. `EffectScheduler`'s concrete impl (`ZoneAwareEffectScheduler`) is genuinely NOT exported
anywhere (checked the installed package's public `.d.ts`), so a naive attempt at this fix looks
like it requires forking that ~50-line private class — it does NOT, because
`ɵprovideZonelessChangeDetectionInternal()` only needs `ApplicationRef` itself to be reachable
(via the scope fix above) and provides `NgZone`/`ZONELESS_ENABLED`/the scheduler token itself;
`ApplicationRef`'s OTHER `providedIn:'root'` dependencies (`EffectScheduler`,
`AfterRenderManager`, `PendingTasksInternal`, `INTERNAL_APPLICATION_ERROR_HANDLER`) resolve fine
via their OWN `providedIn:'root'` factories the moment the injector is scope-tagged 'root' too —
no manual wiring needed for any of them.

### The claim that got disproved before shipping — read this before assuming Targeted mode fixes "press re-renders everything"

The first hypothesis was "`ApplicationRef.tick()` in Targeted mode means the root's own template
no longer re-runs on an unrelated press." A regression test was written to prove it (nested child
press → assert the root's own template-level render counter does NOT increment) — it FAILED even
against the new, fixed scheduler. Tracing why (all in `render3/instructions/mark_view_dirty.ts`
and the directive's own already-correct comment in `primitives/shared.ts`): **both** a native
`(event)="handler()"` binding (via `wrapListenerIn_markDirtyAndPreventDefault` → `markViewDirty`)
**and** `ChangeDetectorRef.markForCheck()` (its entire body is `markViewDirty(this._lView,
NotificationSource.MarkForCheck)` — see `view_ref.ts`) walk `LViewFlags.RefreshView | Dirty`
**unconditionally onto every ancestor up to the root**:

```ts
// mark_view_dirty.ts — markViewDirty
while (lView) {
  lView[FLAGS] |= dirtyBitsToUse;   // RefreshView | Dirty, not the weaker HasChildViewsToRefresh
  lView = getLViewParent(lView)!;
  // ... until isRootView(lView) && !parent
}
```

This is universal, unavoidable Angular zoneless behavior — true in every Angular app, signals or
not, `ApplicationRef` or hand-rolled scheduler, and it is exactly why `SymbioteHostPropsDirective`
already has its own correct comment about `markForCheck()` reaching "THIS component's view AND
all its ancestors." **`ApplicationRef.tick()`'s Targeted mode changes NOTHING about this** — it
only changes the OUTER decision of "which top-level *attached* view do we even enter"
(`ApplicationRef._views`, relevant across multiple independently-`attachView()`'d roots) and
whether refreshing a view also force-checks `CheckAlways` content that ISN'T actually dirty.
**Once any view decides to refresh at all, `refreshView()` (`change_detection.ts`) hardcodes
`ChangeDetectionMode.Global` for its OWN embedded views (`@if`/`@for`, always `CheckAlways`,
never independently gated) and child components** — so a press or `markForCheck()` ANYWHERE
always re-runs the ROOT's own template, full stop, regardless of scheduler.

### What genuinely IS protected, with or without this fix

A real `@Component` boundary. A plain (non-`OnPush`) child compiles as `SignalView` in Angular
20+ (not `CheckAlways`), so `detectChangesInView`'s `shouldRefreshView` gate (`flags &
CheckAlways` in Global mode, or `flags & RefreshView`/dirty-consumer regardless of mode)
correctly skips an untouched **sibling child component** even when its parent's template
re-executes around it — proven by `render.test.ts`'s `'does not re-check a sibling child
component...'` test, which passes identically whether the scheduler is the old hand-rolled one
or the new `ApplicationRef`-based one. **An `@if`/`@for` block does NOT get this protection** —
embedded views are always `CheckAlways`, always re-execute when their containing view refreshes,
with no per-view gate at all. So: decomposing a monolithic template's demo/feature sections into
genuine child `@Component`s (matching the existing `AnimatedDemo`/`ResponderDemo` precedent) is
what actually limits blast radius for unrelated presses — `@if`-wrapping content in place does
nothing for this, and neither does replacing the scheduler.

### The concrete, durable takeaway — put together, not sequentially

1. A press anywhere ALWAYS re-runs the pressed component's OWN view and every ancestor's own
   template, all the way to root. This cannot be avoided in Angular's zoneless model; do not
   attempt to "fix" it again.
2. Therefore: an inline object/array/function literal written directly in ANY component's
   template (root or not) is re-evaluated (and gets a fresh reference) on every tick that
   refreshes THAT component — mirror the `AnimatedParityDemo` precedent (`[animatedProps]`
   bound to a stable class-field reference) for every prop that flows through a change-detecting
   equality check, not just Animated ones.
3. A SIBLING `@Component` with no dirty descendant of its own IS properly skipped — this is why
   decomposing a monolithic template into real components (not `@if`/`@for` blocks) is the
   actual lever for keeping an unrelated press cheap, and it already worked before this fix.
4. The `ApplicationRef` swap is still worth keeping — it deletes a hand-rolled CD driver in
   favor of Angular's own (less bespoke code, matches how the whole ecosystem works, and now
   exposes real `ApplicationRef` capabilities — `isStable`/`whenStable()`/`afterTick` — that
   were previously just unavailable). Its concrete benefit is narrower than originally hoped:
   properly-scoped ticking for dirtiness that does NOT originate from a native event listener or
   `markForCheck()` (e.g. multiple independently-`attachView()`'d surfaces not cross-triggering
   each other, or future code that adopts genuine Angular signals). Do not oversell it as "fixes
   the tree rebuild" in any future write-up — verify with a test first, the way this one was
   caught before shipping.

## Scope boundary

This skill owns Angular's **change-detection mechanics** — SignalView vs CheckAlways,
`markForCheck` vs `detectChanges`, zoneless scheduling, `ApplicationRef.tick()`'s Targeted vs
Global mode, and why a flat-bag `onX` prop needs help that a native `(event)=` binding already
gets for free via Angular's own `ɵɵlistener` (that latter point is the boundary with
**`angular-adapter-events`**: an `@Output()`/`(event)=` binding is not this skill's concern
because it already routes through `markViewDirty` on its own — this skill exists for the cases
that DON'T).

For everything else about the Angular adapter — renderer/`Renderer2` seam, DOM-less bootstrap,
version floor, the two-stage AOT pipeline, `descriptorToAngular`/`DescriptorOutlet`, and overall
status — read the main **`angular-adapter`** skill (its §0 covers status/seam/bootstrap; this
skill's §1/§3 material was originally its §5 and §20).

The `whenCommitted` async-commit-timing gotcha (§1 above) originated in Vue and is inherited
here verbatim — see **`vue-adapter-reactivity`** (Gotcha 2, "Vue commits async — the tag may not
exist yet") for the full mechanism, the `whenCommitted(node, action)` primitive, and its Vue-side
regression tests; this skill does not re-derive it, only restates that Angular hits the identical
shape.

Some bugs in **`angular-adapter-lists`** (e.g. an infinite recompute loop in `VirtualizedList`)
are downstream symptoms of these same change-detection mechanics — worth a check against this
skill's §2/§3 before treating them as list-specific.

A native `(event)=` binding already triggers CD correctly via Angular's own `ɵɵlistener` — see
**`angular-adapter-events`** for the event-surface conventions (every component event as
`@Output()`, the scroll-family exception); this skill explains specifically why a flat-bag `onX`
prop does NOT get the same treatment and what closes that gap.
