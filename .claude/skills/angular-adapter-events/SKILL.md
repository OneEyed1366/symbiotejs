---
name: angular-adapter-events
description: "Symbiote Angular adapter event conversion — read BEFORE converting a callback @Input() (onPress, onValueChange, onFocus…) to a real @Output() EventEmitter in adapters/angular/**, or debugging: a handler firing TWICE per interaction, an NG2007 AOT-only 'not decorated' error from ngc (not plain tsc), an NG8002 'binding to event property disallowed' error after converting an INNER wrapped component's prop, an @Output() name colliding with an existing method (focus/blur), or whether onScroll-family props should ever become @Output() (never — Animated.event() markers can't bind to a listener). Covers listen()'s anchor-transparency double-fire cause, @Directive()-required-on-abstract-base (SwitchBase), wrapped-component forwarding breakage (FlatList→VirtualizedList→ScrollView/RefreshControl, ImageBackground→Image), the @Output('focus') alias trick, and the Button/IButtonProps fork mirroring Vue. Angular twin of vue-adapter-events — read that instead for Vue's emits/attrs conversion."
---

# Symbiote Angular adapter — callback-Input to @Output()/EventEmitter conversion

React-style component props pass callbacks as plain values: `onPress={handler}`,
`onValueChange={handler}`. Angular's own idiom is a listener BINDING against a real
`@Output()` `EventEmitter`: `(press)="handler($event)"`, never `[onPress]="handler"`.
Symbiote's shared component logic (`@symbiote-native/components`) defines each handler type
once as a plain callback (`IPressHandler`, `(value: boolean) => void`, …), callable
verbatim from React or Vue — but Angular's `@Output()` mechanism requires the
component to construct an `EventEmitter` field and call `.emit()` internally instead
of invoking the prop directly. Every event conversion pays that cost, once per event,
per component.

As of 2026-07 this conversion is **FIXED for (almost) every component** — the work is
done, not planned. This skill exists because six distinct, hard-won gotchas were
discovered doing it, and each is a landmine for anyone converting a NEW component's
events or touching an already-converted one.

## When to use this skill

Use before converting any Angular adapter component's callback-Input to `@Output()`,
and especially when you hit one of these symptoms:

- A press/tap/change handler fires **twice** for one user interaction.
- `ngc`'s AOT build fails with `NG2007: Class is using Angular features but is not
  decorated`, while plain `tsc --build` is green.
- `ngc`'s AOT build fails with `NG8002: Binding to event property 'foo' is disallowed
  for security reasons`, on a component that WRAPS another component in its own
  template.
- You're about to add `onFocus`/`onBlur` (or any output name that already exists as a
  class method) and TypeScript complains a property and a method can't share a name.
- You're deciding whether `onScroll` or one of its four siblings should become an
  `@Output()` — it should not, ever.
- You're touching `adapters/angular/**` component files or `SymbioteRenderer.listen()`
  in `adapters/angular/src/renderer.ts`.

## Rule 1 — every event is a real @Output() now

Every event on every Angular component is a real `@Output()` `EventEmitter`, bound as
`(press)="handler($event)"`, never `[onPress]="handler"`. Converted (non-exhaustive):
`Pressable`, `Button`, `TouchableOpacity`/`TouchableHighlight`/
`TouchableWithoutFeedback`, `TouchableNativeFeedback`, `Switch` (`valueChange`,
`change`), `TextInput` (13 events, including the `focus`/`blur` alias split — Rule 6),
`Modal`, `RefreshControl`, `ImageBackground`, `KeyboardAvoidingView`, `SafeAreaView`,
`InputAccessoryView`, `ActivityIndicator`, the list family (`VirtualizedList`/
`FlatList`/`VirtualizedSectionList`/`SectionList`), and `ScrollView` — including every
accessibility callback (`onAccessibilityAction`→`accessibilityAction`,
`onAccessibilityTap`, `onMagicTap`, `onAccessibilityEscape`) on all of the above.

Verified via `tsc --build`, the full vitest suite (622 tests), AND both real `ngc` AOT
builds (`@symbiote-native/angular`'s `ng:build` and `examples/angular`'s — which also
transitively builds `@symbiote-native/slider`'s Angular entry), which type-check every
template binding against real `@Output()` metadata, not just `tsc`.

Do not read a plain callback anywhere else in the adapter as "not converted yet" —
everything besides Rule 2's permanent exception genuinely is finished.

## Rule 2 — the permanent exception: the scroll-callback family

`onScroll`, `onScrollBeginDrag`, `onScrollEndDrag`, `onMomentumScrollBegin`,
`onMomentumScrollEnd` stay `@Input()` callbacks **forever**, on `ScrollView`,
`VirtualizedList`, `FlatList`, `VirtualizedSectionList`, and `SectionList`.

**Why**: React Native's scroll callbacks can receive either a plain JS function OR the
return value of `Animated.event(...)` (a native-driver marker object) — this is how
native-driven scroll-linked animations work
(`onScroll={Animated.event([...], {useNativeDriver: true})}`). Angular's `@Output()`
mechanism only accepts template LISTENER expressions in bindings
(`(scroll)="handler($event)"`) — there is no Angular syntax to bind an arbitrary VALUE
(like an `Animated.event(...)` result) to an output name. So these five props are not
an unfinished migration step; they are the permanent, correct shape, matching what any
future component with the same Animated-value use case should also do.

## Rule 3 — the Button fork is not a new precedent, it mirrors Vue's

`IButtonProps` (title, color, disabled, touchSoundDisabled, testID, TV-focus,
accessibility) is the one prop type genuinely shared verbatim cross-adapter
(`<prop_types_split_agnostic_vs_per_adapter>` in the project's `CLAUDE.md`), UNLIKE
Pressable/Touchable's prop types (already "still per-adapter" there). Converting
`onPress` to `@Output()` forks Angular's type off the shared one — but
`adapters/vue/src/components/button.ts` already does exactly this:
`export type IButtonProps = Omit<ICoreButtonProps, 'onPress'>` + a Vue `press` emit.
Angular's `button.ts` mirrors it verbatim:

```ts
export type IButtonProps = Omit<ICoreButtonProps, 'onPress'>;
```

plus `@Output() press`. Every other `IButtonProps` field stays shared and untouched.
If a future component's event needs the same fork, check Vue's adapter for the same
field first — don't treat it as a fresh architectural call each time.

## Rule 4 — why the migration is costly (still true for anything left unconverted)

The shared handler type (`IPressHandler`, `(value: boolean) => void`, …) is defined
once in `@symbiote-native/components` and must be the literal same function callable from
React, Vue, or Angular code with zero adapter-side wrapping. `@Input()` forwards it for
free; an `@Output()` requires the component to construct an `EventEmitter` field and
call `.emit()` internally instead of calling the prop directly — for every event, on
every component.

This is the same recurring pattern as Vue's `v-model`/`v-show` gaps: trading a
framework's own idiom for cross-adapter code reuse. The press family proved the fix
was worth it and cheap; treat every other component's conversion as a project-wide,
recognized backlog item, not something to silently carry forward unexamined.

## Landmine 1 — the anchor double-fire bug (SymbioteRenderer.listen())

**Symptom**: naming an `@Output()` the SAME as a native event fired by a node INSIDE
that same component's own template double-fires the handler.

**Root cause**: Angular's component-output binding subscribes to the `EventEmitter`
directly (correct), but the adapter's own `SymbioteRenderer.listen()`
(`adapters/angular/src/renderer.ts`) ALSO gets called by Angular for that same
binding and registers a REDUNDANT native listener on the component's own host
element — which, for components in `ANCHOR_HOST_COMPONENTS` (Pressable, Button, every
Touchable included), is a real `#anchor` node sitting as the PARENT of the component's
own template content in the retained tree. When the inner template's native event
(e.g. Pressable's own `<symbiote-view (pressIn)="handlePressIn($event)">`) fires and
bubbles up past that anchor, it hits the redundant phantom listener and refires the
same callback a second time.

**Fix**: fixed generically, once, in the engine — not per component.
`core/engine/src/events/index.ts`'s `bubble()` now treats anchor nodes as transparent
to listener lookup (`isAnchor(node) ? undefined : node.listeners?.get(...)`) in both
the capture and bubble phases, since an anchor "never paints, has no native view"
already by definition (`core/engine/src/node.ts`) and Angular's real Output delivery
never depended on that phantom registration anyway.

**Any future `@Output()` conversion is safe** — this was a one-time engine fix, proven
across 6 components, not something each new component needs to work around. Do NOT
"fix" a double-fire by trying to force `provideZonelessChangeDetection()` into the
bootstrap — that is a different, resolved, non-issue (see `angular-adapter-change-
detection`); this landmine is only about the public component event shape.

## Landmine 2 — @Directive() required the moment an abstract base gains a decorated member

**Symptom**: `ngc`'s AOT build (NOT plain `tsc --build`) fails with `NG2007: Class is
using Angular features but is not decorated`.

**Root cause**: a `@Directive()` decorator becomes REQUIRED on an abstract base class
the moment it gains a decorated member. `SwitchBase` originally held plain,
undecorated fields (its concrete `@Component` referenced the field names via an
`inputs: [...]` metadata array instead). Converting a field to
`@Output() readonly x = new EventEmitter()` puts a real decorator on the abstract
class itself, and `ngc` then rejects it unless the base class also gets a bare
`@Directive()`. `ScrollViewBase` already had this right (it predates this pass).

**General rule**: any abstract base class that is composed into a `@Component` via
inheritance — not just via an `inputs`/`outputs` metadata array pointing at plain
fields — needs `@Directive()` the instant ANY of its own members carry an Angular
decorator (`@Input()`, `@Output()`, `@ViewChild`, ...). `tsc --build` will not catch
this; only `ngc` (or the app's real AOT build) does — another instance of the AOT-only
`strictTemplates` gap documented in the main `angular-adapter` skill's §4.

## Landmine 3 — wrapped-component forwarding breakage (NG8002)

**Symptom**: `ngc` AOT build fails with `NG8002: Binding to event property 'foo' is
disallowed for security reasons` — a real AOT-only compile error, not a runtime
symptom.

**Root cause**: several components in this adapter build another component into their
own template and forward props straight through it: `FlatList`/`SectionList`/
`VirtualizedSectionList` each render an inner `VirtualizedList`; `VirtualizedList`
itself renders an inner `ScrollView` and conditionally a `RefreshControl`;
`ImageBackground` renders an inner `Image`. Converting the INNER component's prop from
`@Input()` to `@Output()` silently breaks the OUTER component's forwarding binding,
because Angular's template compiler treats `[foo]="bar"` (now targeting an
`@Output()`) as `NG8002`. Concretely hit during this pass: `VirtualizedList` forwards
`onLayout`/`onAccessibilityAction`/etc. into its inner `<ScrollView>` and `onRefresh`
into its inner `<RefreshControl>` via `[prop]="tickField"` bindings — none of this is
visible by reading the `ScrollView` or `RefreshControl` files alone, only by reading
what wraps them.

**Fix**: mechanical but must be done explicitly, per wrapper — change the forwarding
from a value binding to a listener that re-emits: `[foo]="bar"` →
`(foo)="bar($event)"` (or `(foo)="bar?.($event)"` where the forwarded value is an
`.observed`-gated getter, as `VirtualizedSectionList`'s `resolvedOnRefresh`-style
fields already were).

**Practical checklist before converting any component's `@Input()` to `@Output()`**:

1. Grep the WHOLE adapter (not just the component's own directory) for the prop name
   being converted, in BOTH directions:
   - as a consumer (`<TheComponent onFoo="...">` / `[onFoo]=`) in another component's
     template, AND
   - as a value read directly off a `@ContentChild`/`@ViewChild` instance — e.g.
     `scroll-view/shared.ts` read `refresh.onAccessibilityAction` directly off a
     projected `RefreshControl` instance, not through a template binding at all; that
     needed the SAME emitter-to-callback adapter pattern, just via a getter/helper
     call instead of a template rewrite.
2. Run a real `ngc` AOT build (see the main `angular-adapter` skill's §4) across BOTH
   `adapters/angular` and every consuming `examples/*`/`packages/*` Angular build —
   this catches the template-binding half of this landmine.
3. Run `tsc --build` too — it does NOT catch the template-binding half, but it DOES
   catch the direct-property-read half, which surfaces only as a
   `Property 'onX' does not exist` error. Run BOTH checks; neither alone is sufficient.

## Landmine 4 — output name collides with an existing class method (focus/blur)

**Symptom**: a natural output name (`focus`, `blur`) collides with an existing
imperative method of the same name; a class can't have a property and a method share
a name.

**Root cause**: `TextInput` already had `focus(): void` / `blur(): void` methods (the
RN ref API, called via `@ViewChild(TextInput)`) before `onFocus`/`onBlur` were
converted.

**Fix**: alias the `@Output()` to a differently-named internal field:

```ts
@Output('focus') readonly focusEvent = new EventEmitter<...>();
@Output('blur') readonly blurEvent = new EventEmitter<...>();
```

The public template binding stays `(focus)="…"` / `(blur)="…"` (Angular's output
ALIAS, the first argument to `@Output()`, not the class member name) — only the
internal field name differs. This is the same aliasing trick already used for
`@Input('aria-label') ariaLabel` elsewhere in this adapter — reach for it any time a
natural output name collides with an existing class member, rather than renaming
either one.

## Current coverage

| Component | Converted @Output()s | Notes |
|---|---|---|
| `Pressable` | `press`, `pressIn`, `pressOut`, `pressMove`, `longPress`, `hoverIn`, `hoverOut` | anchor-transparency fix applies (Landmine 1) |
| `Button` | `press` | forked type — Rule 3 |
| `TouchableOpacity`/`TouchableHighlight`/`TouchableWithoutFeedback`/`TouchableNativeFeedback` | same press surface as `Pressable` | anchor-transparency fix applies |
| `Switch` | `valueChange`, `change` | |
| `TextInput` | 13 events including `focus`/`blur` | alias split — Landmine 4 |
| `Modal` | full event surface | |
| `RefreshControl` | `refresh` (and related) | forwarded into by `VirtualizedList` — Landmine 3 |
| `ImageBackground` | forwards into inner `Image` | Landmine 3 applies |
| `KeyboardAvoidingView`, `SafeAreaView`, `InputAccessoryView`, `ActivityIndicator` | converted | |
| `VirtualizedList`/`FlatList`/`VirtualizedSectionList`/`SectionList` | converted, EXCEPT the scroll family | forwards into inner `ScrollView`/`RefreshControl` — Landmine 3 |
| `ScrollView` | all events EXCEPT the scroll family | scroll family stays `@Input()` — Rule 2 |
| all of the above | every accessibility callback (`accessibilityAction`, `onAccessibilityTap`, `onMagicTap`, `onAccessibilityEscape`) | |

Permanently NOT converted: `onScroll`, `onScrollBeginDrag`, `onScrollEndDrag`,
`onMomentumScrollBegin`, `onMomentumScrollEnd` on `ScrollView`, `VirtualizedList`,
`FlatList`, `VirtualizedSectionList`, `SectionList` (Rule 2).

## Verification checklist

After converting any component's callback `@Input()` to `@Output()`:

1. Confirm the public template binding form changed from `[onFoo]="handler"` to
   `(foo)="handler($event)"` everywhere the component is consumed.
2. Grep the whole adapter for the OLD prop name, in both directions (Landmine 3's
   checklist) — as a consumer template binding AND as a direct
   `@ContentChild`/`@ViewChild` property read.
3. If the component (or its base class) newly carries a decorated member for the
   first time, confirm the class (or its abstract base) has `@Component`/
   `@Directive()` as appropriate (Landmine 2).
4. If the new output name could collide with an existing class member (a ref-API
   method like `focus`/`blur`), use the `@Output('alias') readonly xEvent = ...`
   pattern (Landmine 4) instead of renaming the method.
5. If the component is in `ANCHOR_HOST_COMPONENTS`, confirm no output name matches a
   native event name fired by that component's OWN inner template — or rely on the
   engine's anchor-transparency fix (Landmine 1) and confirm the handler fires
   exactly once, not twice, in a real smoke.
6. Run `tsc --build` on the touched packages.
7. Run a real `ngc` AOT build for `@symbiote-native/angular` (`ng:build`) AND every
   consuming `examples/*`/`packages/*` Angular build — plain `tsc` does not catch
   NG2007/NG8002.
8. Run the full vitest suite.

## Common failure modes

| Failure | Cause | Fix |
|---|---|---|
| Handler fires twice for one interaction | Output name collides with a native event fired inside the component's own template, on an `ANCHOR_HOST_COMPONENTS` member | Confirmed fixed generically by the engine's anchor-transparency `bubble()` change (Landmine 1) — if it still double-fires, the engine fix regressed |
| `NG2007: Class is using Angular features but is not decorated` (ngc only) | Abstract base class gained a decorated member (`@Output()`) without `@Directive()` | Add `@Directive()` to the abstract base (Landmine 2) |
| `NG8002: Binding to event property 'foo' is disallowed for security reasons` (ngc only) | An outer wrapper still forwards the converted prop as `[foo]="bar"` | Change to `(foo)="bar($event)"` in every wrapper (Landmine 3) |
| `tsc`-level `Property 'onX' does not exist` | A `@ContentChild`/`@ViewChild` consumer read the old callback property directly, not through a template binding | Same emitter-to-callback adapter pattern via a getter/helper (Landmine 3) |
| Class member name collision (property vs method) | New `@Output()` name matches an existing imperative method (`focus`, `blur`) | Alias with `@Output('focus') readonly focusEvent = ...` (Landmine 4) |
| Native-driven scroll animation stops working after "finishing" event conversion | `onScroll`-family prop was converted to `@Output()` | Revert — this family is permanently `@Input()` (Rule 2), never convert it |
| Fork of a shared prop type looks unprecedented / feels risky | Not checking Vue's adapter first | Check `adapters/vue/src/components/<name>.ts` — Angular usually mirrors an existing Vue fork (Rule 3) |

## Scope boundary

This skill owns the **callback-Input → @Output()/EventEmitter conversion** — every
gotcha in landing `(event)="handler($event)"` bindings correctly, including the
permanent scroll-callback exception. It does NOT own:

- **The renderer seam itself** — `SymbioteRenderer.listen()`'s general shape, how
  `Renderer2`/`RendererFactory2` map onto the engine mutation API, or the adapter's
  overall implementation status. Read the main `angular-adapter` skill's §0 (status)
  and §1 (seam mapping) for that; this skill only interacts with `listen()` at the
  point where the anchor double-fire landmine lives.
- **Change detection mechanics** — a converted `(event)="..."` binding gets CD for
  free via Angular's own listener wrapper (the zoneless scheduler notices the
  `EventEmitter` fire and schedules a check), but the mechanism that makes that work
  lives in `angular-adapter-change-detection`, not here. This skill assumes CD fires
  correctly once the binding is correct; if a converted event's UI doesn't update
  despite firing, that's a CD-skill problem, not an events problem.
- **The equivalent conversion in Vue.** Vue faces the same underlying tension (React-
  style `onX` callback props vs. the framework's native event idiom) but solves it
  with `emits`/`$attrs` routing instead of `@Output()`/decorators, and has its own
  distinct landmines (Volar payload inference, `v-model` read-every-site gotcha). If
  you're doing the equivalent conversion in Vue, read `vue-adapter-events` instead —
  don't assume Angular's landmines (anchor double-fire, NG2007, NG8002) transfer, and
  don't assume Vue's landmines transfer here.
