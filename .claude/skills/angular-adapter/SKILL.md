---
name: angular-adapter
description: "Symbiote Angular adapter — entry point, read BEFORE planning or writing Angular adapter code (adapters/angular/**, examples/angular/**). Status (2026-07): IMPLEMENTED, 21+ components at parity, renderer seam/bootstrap/AOT all real (§0). Holds CORE architecture only — split 2026-07: AOT build/prepare-script/dev-watch → angular-adapter-build; change detection/SignalView/markForCheck/ApplicationRef.tick() → angular-adapter-change-detection; @Input to @Output conversion → angular-adapter-events; createPortal/createTunnel/AppRegistry → angular-adapter-portal; FlatList/SectionList/ScrollView bugs → angular-adapter-lists. Stays HERE: Renderer2/RendererFactory2 seam; DOM-less bootstrap; version floor angular/core 20+; component parity (DescriptorOutlet, mixed adoption); symbioteHostProps escape hatch incl. dynamic testID; ANCHOR_HOST_COMPONENTS (unlisted composed component paints Unimplemented-component fallback on device; §21: listed-but-not-merging-anchorHostStyle silently drops class="..." — device-confirmed on Animated*/Button/ScrollViewStickyHeader, checklist + anchorStyleProp<T> helper); style-array-crashes-styleMap gotcha; DrawerLayoutAndroid removal note."
---

# Symbiote Angular adapter — core architecture

## This skill was split (2026-07)

The Angular adapter's knowledge outgrew one file. This skill keeps the core
architecture — status, seam, bootstrap, version floor, the component-parity
model, and general cross-cutting gotchas that don't belong to one narrower
topic. Everything else moved into a focused sibling skill:

| Topic | Skill |
|---|---|
| AOT build pipeline (two-stage ngc→linker), package self-build via `prepare`+conditional `exports`, `dev`/`start` + `ngc --watch` | `angular-adapter-build` |
| Change detection — `whenCommitted`, SignalView vs CheckAlways, `markForCheck`, real `ApplicationRef.tick()` | `angular-adapter-change-detection` |
| `@Input()` callback → `@Output()` EventEmitter conversion, the anchor double-fire bug, NG2007/NG8002 | `angular-adapter-events` |
| `createPortal`/`createTunnel`, `AppRegistry` + dynamic component composition | `angular-adapter-portal` |
| FlatList/SectionList/VirtualizedList/VirtualizedSectionList/ScrollView bugs | `angular-adapter-lists` |

Read this skill first for the architecture; jump to the matching topic skill
for implementation-level gotchas. Section numbers below (§0, §1, …) are
preserved from before the split — some numbers (§4, §5, §7–§9, §12–§15,
§17–§18, §20) now live only in the topic skills above, not here.

## §0. Status: IMPLEMENTED (verified 2026-07), not planning

`adapters/angular/src/` and `examples/angular/` are real and working — this
supersedes the "planning / pre-spike" framing the rest of this document was
originally written under. Sections below are corrected in place where reality
diverged from the plan; read §0 first, then treat the rest as the (now mostly
accurate) design record — §7's (`angular-adapter-events`) `@Output()` rollout
is DONE (2026-07), not an open question, except the permanent onScroll-family
exception it documents.

- **Components**: 21+ at full cross-adapter parity — `components/` has
  activity-indicator, button, drawer-layout-android, flat-list, image,
  image-background, input-accessory-view, keyboard-avoiding-view, modal,
  pressable, refresh-control, safe-area-view, scroll-view, section-list,
  switch, text-input, touchable, touchable-native-feedback,
  virtualized-list, virtualized-section-list. `primitives/` holds the
  `symbiote-*` host components (`ViewHost`, `TextHost`, `ImageHost`,
  `ScrollViewHost`, …). `modules/` has `animated`, `status-bar`. `services/`
  (`ColorSchemeService`, `WindowDimensionsService`) is the Angular-idiomatic
  DI-injectable lifecycle bucket — the framework-idiom equivalent of React
  hooks / Vue composables (`<adapter_src_follows_framework_idioms>`).
- **Bootstrap** (`adapters/angular/src/render.ts`) is real — see §2 for the
  corrected mechanism (it differs from the original plan below).
- **Renderer seam** (`adapters/angular/src/renderer.ts`,
  `SymbioteRendererFactory`/`Renderer2`) is fully wired to the engine mutation
  API with microtask-coalesced `requestCommit()`, confirming §1 below.
- **AOT pipeline**: `ng:build: ngc -p tsconfig.angular.json` produces real
  compiled output in `adapters/angular/build/angular/`, feeding the
  Metro/compiler-cli linker — not just a bench-spike, the real build. Full
  detail: `angular-adapter-build`.
- **Example app**: `examples/angular/App.ts` is a working demo using 20+
  components (Pressable, FlatList, Modal, KeyboardAvoidingView, …), with
  `ios`/`android`/`dev` pnpm scripts mirroring `examples/react` and
  `examples/vue-sfc`, plus Detox e2e config. Aligned 2026-07 to full section
  parity with the React/Vue canaries: the press-retention demo
  (`pressRetentionOffset`/`hitSlop`/`(pressMove)`), the native-driver
  `AnimatedScrollView` scroll-header demo, the boxShadow/filter/
  transformOrigin style-prop A/B demos, the `Image` web-alias demo, and a
  LOCAL KeyboardAvoidingView toggle demo (switch + nested KAV + email
  `TextInput`) were all missing and have been added. The root no longer wraps
  the whole screen in `KeyboardAvoidingView` (`SafeAreaView` → `ScrollView`
  directly, matching React/Vue) — that wrapping was itself a parity bug: it
  shifted the ENTIRE app on keyboard-open instead of one isolated demo panel,
  and `kavEnabled` had no switch to toggle it. The new `AnimatedScrollView`
  demo surfaced two real, Android-only, device-only bugs in
  `AnimatedScrollView` itself (a content-wrapping crash — "ScrollView can
  host only one direct child" — and a missing `nestedScrollEnabled` default),
  both fixed in `adapters/angular/src/modules/animated/
  create-animated-component.ts`; both are the same root pattern —
  `AnimatedScrollView` is a from-scratch reimplementation talking directly to
  `symbiote-scroll-view`, so it silently misses ANY defaulting/behavior that
  lives in the real `ScrollView` component's prop-bag assembly
  (`scroll-view/shared.ts`). Before trusting `AnimatedScrollView` for a new
  use case, diff its prop bag against `scroll-view/shared.ts` for anything
  else silently dropped (sticky headers, snap-to, `scrollEventThrottle`
  defaults, keyboard-dismiss handling, …) rather than assuming parity. Note
  testID naming across the three canaries was NEVER a strict cross-adapter
  invariant — don't chase full testID-string parity, only content/behavior
  parity.
- **Both closed (2026-07)**: `packages/slider/src/angular/` ships a real Angular
  build (`@symbiote-native/slider/angular`, same `createNode`-by-ViewConfig wrapper
  React/Vue use); the docs site's live framework switcher
  (`apps/docs-site/src/pages/index.astro`) lists Angular as `live: true`
  alongside React/Vue (`LIVE_SYMBIOTES = ['react', 'vue', 'angular']`). The
  ONLY remaining Angular-specific gap is third-party **React component**
  packages (`@react-native-community/slider` itself) — React-dispatcher-only
  per `<third_party_rn_packages_are_react_only>`, not fixable by a wrapper.

Angular was the 4th adapter (after React, Vue) and isolated the same R4 risk
Vue did — a second non-React, mutation-oriented framework on the validated
engine — plus one genuinely new risk: **AOT template compilation under
Metro**, which `angular-adapter-build` covers in full.

## 1. The renderer seam — Angular is already built for us

An Angular component **never touches the DOM directly**. Every paint goes through
`Renderer2` (created per-component by `RendererFactory2`). The default factory
returns a DOM renderer; Angular lets you provide your OWN factory. That is the exact
framework-agnostic seam, the twin of:

- Vue — `createRenderer(RendererOptions)` (`adapters/vue/src/renderer.ts`)
- React — the `react-reconciler` host config

So the adapter is a `SymbioteRenderer implements Renderer2` whose every method maps
onto the engine's tiny mutation API — the engine owns all Fabric clone-on-write,
shared with every other adapter (`<clone_on_write_lives_in_engine>`). Mapping
(mirror of the Vue `RendererOptions` map):

```
Angular Renderer2             →  @symbiote-native/engine
──────────────────────────────────────────────────────────────────
createElement(name)           →  createElement(descriptorFor(name)) + toPublicInstance
createText(value)             →  createRawText(value)
createComment(value)          →  createAnchor()            // twin of Vue createComment
appendChild(p, c)             →  appendChild(p, c)         + surface.requestCommit()
insertBefore(p, c, ref)       →  insertBefore / appendChild + requestCommit()
removeChild(p, c)             →  removeChild(p, c)         + requestCommit()
parentNode(n) / nextSibling   →  n.parent ?? surface / sibling lookup in children
setProperty(el, name, val)    →  routeProp(el, name, val)  + requestCommit()   // [prop]="x"
setAttribute(el, name, val)   →  routeProp(...)            + requestCommit()    // name="x"
setValue(textNode, val)       →  setText(textNode, val)    + requestCommit()
listen(node, event, cb)       →  setEventListener(node, event, cb)              // (press)="x"
setStyle / [style]="…"        →  routeProp(el,'style',…)   // per-key; merges via engine's getExplicitStyle
addClass/removeClass          →  per-node token Set, rejoined + routeProp(el,'class',joined)  // class="x" / [ngClass]
```

**Corrected 2026-07** (was previously documented as a no-op — see the
`symbiote-sfc-style-compiler` skill for the full cross-adapter design): Ivy
compiles every `class=`/`[class.foo]`/`[ngClass]` form down to per-token
`addClass`/`removeClass` calls, never a single string. `SymbioteRenderer`
accumulates a per-node `Set<string>` of tokens (`adapters/angular/src/
renderer.ts`) and re-joins it on every change, then routes through
`routeProp(el, 'class', joined)` — the SAME centralized class+style merge
React's `className` and Vue's `class` use (`core/engine/src/node.ts`), so a
class registered via the SFC/CSS-Modules style compiler resolves identically
regardless of adapter. `setStyle`/`removeStyle` were also fixed at the same
time: they now read/write via the engine's exported `getExplicitStyle(node)`
instead of `el.props.style` directly, since that may now hold the
`[classStyle, explicitStyle]` array the centralized merge writes.

Two facts that make this cheap:

- **Events come pre-named.** Angular compiles `(press)="…"` into a
  `listen(node, 'press', cb)` call — the event name is **explicit**, no `onX→x`
  inference. The engine already anticipates this: `setEventListener`'s comment in
  `core/engine/src/node.ts` literally names "Angular Renderer2.listen" as a planned
  direct caller. `[prop]="…"` bindings arrive via `setProperty` → `routeProp`
  (flat-bag path, shared with React/Vue). So Angular is mixed: events structural,
  props flat-bag — both already supported.
- **One renderer per surface.** `SymbioteRendererFactory.createRenderer` returns one
  `SymbioteRenderer(surface)` for all components (wolf-tui reuses a single instance
  the same way). The factory's `begin()/end()` hooks could coalesce a commit per CD
  cycle, but per-mutation `surface.requestCommit()` already microtask-coalesces, so
  the Vue path transfers verbatim.

The seam itself is ~150 lines, low risk. Reference shape:
`wolf-tui/packages/angular/src/renderer/{wolfie-renderer,wolfie-renderer-factory}.ts`
(same architecture, ANSI target — the framework seam transfers, the host-call
targets differ).

## 2. DOM-less bootstrap — AS BUILT (corrected from the original plan)

`mount(rootTag, RootComponent)` in `adapters/angular/src/render.ts` — the Angular
twin of `adapters/vue/src/render.ts`. The real implementation does NOT use
`createApplication` + `provideZonelessChangeDetection()` as originally planned
below — `createEnvironmentInjector` with a **null parent** does not install
Angular's application-level CD scheduler providers, so `provideZonelessChangeDetection()`
has nothing to attach to in this bootstrap shape. The actual mechanism:

```
mount(rootTag, RootComponent):
  surface   = createSurface(rootTag)                       // same engine container as Vue
  scheduler = new SymbioteChangeDetectionScheduler()        // hand-rolled: queueMicrotask + reentrancy guard
  injector  = createEnvironmentInjector([
                { provide: RendererFactory2, useValue: new SymbioteRendererFactory(surface) },
                { provide: DOCUMENT, useValue: { head: surface, body: surface } },
                { provide: NgZone, useClass: NoopNgZone },          // ɵNoopNgZone — zoneless, no public helper
                { provide: ChangeDetectionScheduler, useValue: scheduler }, // ɵChangeDetectionScheduler token
                ColorSchemeService, WindowDimensionsService,
              ], null as unknown as EnvironmentInjector)    // sanctioned FFI-edge cast: rootInjectorParent()
  cmpRef    = createComponent(RootComponent, { environmentInjector: injector,
                                               hostElement: surface as unknown as Element }) // asAngularHost()
  scheduler.setDetectChanges(() => cmpRef.changeDetectorRef.detectChanges())
  cmpRef.changeDetectorRef.detectChanges()                  // first paint
  surface.requestCommit()
```

**Update — `angular-adapter-change-detection` §3 supersedes the hand-rolled
`SymbioteChangeDetectionScheduler` above** with a real `ApplicationRef.tick()`
wired via a one-line `INJECTOR_SCOPE:'root'` provider fix; read that skill for
the current CD driver. The bootstrap shape (createEnvironmentInjector with a
null parent, no platform-browser) itself is unchanged.

Two sanctioned FFI-edge `as` casts are confined to this file
(`rootInjectorParent()`, `asAngularHost()`) — Angular's core types model a
browser (non-null injector parent, DOM `Element` host); our root has neither
shape, and these are the two places that boundary is crossed. Nothing else in
the adapter casts. `asAngularHost` also defines a `tagName` property on the
surface because Angular's `locateHostElement` reads it even when a concrete
host is supplied.

One Angular app per surface (`apps: Map<IRootTag, IMountedApp>`) so Fast
Refresh / focus-lifecycle re-mounts tear down and rebuild cleanly. Also
installs `globalThis.RN$stopSurface` exactly like `adapters/vue/src/render.ts`
(the bridgeless stop-surface contract). wolf-tui proves the no-DOM bootstrap
works (`wolf-tui/packages/angular/src/bootstrap.ts`) — it predates stable
zoneless and hacks the same **private** `ɵChangeDetectionScheduler` token our
real bootstrap now uses deliberately (not as a hack — it's the only way to
supply a CD scheduler when there's no `platform-browser` to install one via
the public API).

## 3. Version floor — @angular/core >=20 (locked, confirmed in `package.json`)

`adapters/angular/package.json` pins `@angular/core: ">=20"` as a peerDependency,
matching this section. **Correction vs the original plan**: the floor is NOT
because we call `provideZonelessChangeDetection()` — we don't (see §2, §0). The
real bootstrap supplies `NoopNgZone` + a hand-rolled scheduler directly via
`createEnvironmentInjector`, which has worked since `>=20`'s stable
`createEnvironmentInjector`/`createComponent` API surface regardless of the
zoneless helper. The floor still holds because **that's the version where
zoneless-without-zone.js is a first-class, non-experimental Angular concept**
(the ecosystem, tooling, and Angular's own internal APIs like
`ɵChangeDetectionScheduler` stabilized around it) — not because of the public
helper function itself. If a future refactor DOES switch to calling
`provideZonelessChangeDetection()` (e.g. if bootstrap moves to a shape that
supports it), the floor reasoning changes to the original one below; today it
doesn't apply literally.

The floor is set by **change detection without zone.js**, which is effectively a
requirement, not a nicety: zone.js monkey-patches global async primitives and under
Hermes that is a known headache. Zoneless availability by version:

```
v17 (wolf-tui)  no public zoneless → private ɵChangeDetectionScheduler hack   AVOID
v18–19          provideExperimentalZonelessChangeDetection()  (public, experimental)
v20             provideZonelessChangeDetection()  (stable)                    ← FLOOR
v21+            zoneless by default, nothing to call
```

Angular's support window is 18 months / EOL every ~6 months. As of 2026-06 only
**v20, v21, v22** are supported; **v17/18/19 are all EOL** (v17 — wolf-tui's version —
dead since 2025-05). So floor=20 = "any still-supported Angular", and excludes only
EOL versions. Everything else we need (Renderer2, standalone, createComponent /
createApplication / createEnvironmentInjector, signals) exists since ≤17, so zoneless
is the only thing that moves the floor.

- `adapters/angular` peerDependency: `@angular/core` `>=20`.
- `examples/angular`: pin a recent stable (21.x).
- Lowering the floor later is a one-line range change; raising it is breaking — so
  start high.

## 6. Component parity (L4) — a generic `descriptorToAngular` NOW EXISTS (mixed adoption)

Full parity is structural (`<adapters_reach_full_feature_parity>`): the shared
*logic* (state machines — e.g. `createPressHandlers`/`createPressRuntime` for
Pressable) lives in `@symbiote-native/components` and every Angular component imports
it verbatim, same as React/Vue.

**Corrected 2026-07**: an earlier version of this section said no generic
walker existed and never would without a large redesign. That is now wrong —
`DescriptorOutlet` (`adapters/angular/src/descriptor-to-angular/index.ts`,
selector `symbiote-descriptor-outlet`) IS the `descriptorToAngular` bridge,
the twin of `descriptorToReact`/`descriptorToVue`. Since Angular has no
`h()`-style hyperscript, it can't return a tree value the way React/Vue's
bridges do — instead it is a standalone `@Component` with `@Input({required:
true}) node!: IDescriptor` that walks the `Descriptor` tree and drives
`Renderer2` **imperatively**: `createElement`/`createText`/`setProperty`/
`appendChild` on first render, then a `patchElement`/`patchChildren` diff on
every subsequent `ngOnChanges` that PATCHES same-`(type, key)` nodes in place
(`sameElement`) rather than clearing and recreating the subtree — mirrors
wolf-tui's `WNodeOutlet` but preserves retained-node identity, matching
Fabric's clone-on-write model. Usage: `<symbiote-descriptor-outlet
[node]="someDescriptor" />` inside any component's template. Covered by
`descriptor-outlet.test.ts` (mount → patch → unmount, node-identity
preserved across patches).

**Adoption is IN PROGRESS, not universal** — check before assuming either
pattern for a given component:
- **`ActivityIndicator`** (`components/activity-indicator/index.{ios,android}.ts`)
  is migrated: its template renders a `<symbiote-descriptor-outlet>` bound to
  the shared `renderActivityIndicator(...)` Descriptor, exactly like React/Vue
  call `descriptorToReact`/`descriptorToVue` on the same shared render fn.
- **Every other component** (`Pressable`, `Switch`, and ~15 more) still uses
  the ORIGINAL pattern this section used to document exclusively: each
  component hand-writes its own Angular `@Component` template that mirrors
  what the shared render function would produce, binding directly onto the
  `primitives/` host components (`symbiote-view`, `symbiote-text`, …) via
  `[prop]="…"` / `(event)="…"` bindings, with no `Descriptor` walk at all.

Practical effect: don't assume a component's shape from this section alone —
`grep -l DescriptorOutlet adapters/angular/src/components/*/index*.ts` tells
you which pattern a given component actually uses today. When adding a NEW
component that has a shared `@symbiote-native/components` render function, prefer
`DescriptorOutlet` (it's the generic, already-proven path — see
`ActivityIndicator`) over hand-writing a new template; only fall back to a
hand-written template if the component's real event/imperative-ref needs
don't fit cleanly through a plain `Descriptor` prop bag (this hasn't been hit
in practice yet, so treat it as a hypothesis, not settled guidance). Migrating
the remaining ~15 hand-written components to `DescriptorOutlet` is a real,
uncompleted backlog item — do not treat it as done just because the bridge
exists.

## Layered milestones (mirror the Vue plan) — ALL SHIPPED (see §0)

```
L1  Static paint     View/Text/Image, no reactivity → prove createComponent +
                     RendererFactory2 → surface paints on iOS  (gated by the AOT pipeline — see angular-adapter-build) DONE
L2  Reactive         signals/CD → requestCommit; a counter increments                 DONE
L3  Events           (press) → setEventListener; Pressable                            DONE
L4  Parity (P0)      @symbiote-native/components state machines + descriptorToAngular      DONE for L1-L3 surface (see §6 — DescriptorOutlet
                     (DescriptorOutlet) for new components, hand-written templates    exists + proven on ActivityIndicator; most
                     for the ~15 not yet migrated                                    components still hand-written, migration ongoing)
Build                Variant 1 (ngc + Metro/linker) + examples/angular               DONE
```

## §10. `symbioteHostProps` is the general escape hatch for ANY non-`@Input()` prop on a bare primitive — including `testID`

`View`/`Text` (`adapters/angular/src/primitives/shared.ts`'s `SymbiotePrimitiveHost`)
declare ONLY `style` as a real `@Input()`. Everything else — `testID`, accessibility props
(`accessible`, `accessibilityRole`, `accessibilityState`, `role`, `aria-label`, ...),
Responder negotiation callbacks (`onStartShouldSetResponder`, `onResponderGrant`, ...),
`Text`'s `onLongPress`/`onPress` — is NOT a declared Input. A STATIC string-literal attribute
with no brackets (`testID="ref-box"`) works fine even though it's undeclared (Angular treats
an unbound literal attribute differently from a bound property). But the MOMENT the value
needs to be a bound expression — `[testID]="dynamicExpr"` inside a `@for` loop, `[onLongPress]
="handler"`, `[accessibilityState]="someObject"` — it fails Angular's real `strictTemplates`
build with `NG8002: Can't bind to 'X' since it isn't a known property of 'View'`, even though
it works fine at RUNTIME (Angular still routes it through `Renderer2.setProperty` when no
schema/Input matches — the failure is a STATIC template-check-time rejection, not a runtime
one, so plain `vitest`/headless tests never catch it; only a real `ngc --strictTemplates`
compile does — see `angular-adapter-build`).

**The fix, already proven in `Pressable`'s own template** (`adapters/angular/src/components/
pressable/index.ts`): bundle every such prop into ONE plain object and bind it through
`[symbioteHostProps]`, a REAL declared `@Input()` on `SymbioteHostPropsDirective`
(`adapters/angular/src/primitives/shared.ts`, `exportAs: 'symbioteHost'`) — now also exported
from the public barrel (`adapters/angular/src/index.ts`) so app/example code can use it
directly, not just internal composed components:
```html
<View [symbioteHostProps]="chip.hostProps" [style]="styles.chip">
```
```ts
readonly hostProps = { testID: `resp-chip-${index}`, onResponderGrant, onResponderMove, ... };
```
This was needed (and fixed) in `examples/angular/components/{ResponderDemo,ParityDemo,
AccessibilityDemo}.ts` — every one of them binds a MIX of testID + responder/a11y/press
callbacks onto a bare `View`/`Text`, all through one `hostProps` bag per element, never a
separate `[testID]=`/`[onFoo]=` binding. **Rule of thumb**: if a prop you want to bind onto
`View`/`Text` isn't `style`, and the value isn't a static string literal, it goes in a
`symbioteHostProps` bag — don't add a new `@Input()` to the primitive host classes just to
make one more binding legal (that would defeat the point of them staying thin), and don't
assume a static-literal exception applies once the value becomes an expression.

Note: `SymbioteHostPropsDirective` ALSO wraps every `onX` function prop to call
`markForCheck()` after the handler runs, which is what makes a flat-bag callback
(e.g. a responder gesture) actually repaint the component — see
`angular-adapter-change-detection` for why that's necessary at all.

## §11. Every composed `@Component` used as a plain `<Tag>` must be listed in `ANCHOR_HOST_COMPONENTS` — a real, device-visible failure mode, not silent

`SymbioteRenderer.createElement(name)` (`adapters/angular/src/renderer.ts`) is called for
EVERY element Angular's template compiler emits, including the host element it auto-creates
for a NESTED component tag (`<Slider>`, `<Pressable>`, `<AnimatedDemo>` — any custom
`@Component` used as a child inside another component's template gets its OWN host element
created via this exact call, using its selector as `name`, same as a plain `<View>`/`<Text>`
would). `createElement` checks `name` against the `ANCHOR_HOST_COMPONENTS` set FIRST — a
listed name gets a harmless anchor host (invisible, no native view, exactly right for a
composed component whose OWN template does the real painting). An UNLISTED name falls
through to `descriptorFor(engineName)` — which, per its own doc comment, treats any name
that isn't a recognized `symbiote-*` primitive as "a raw Fabric view name" and hands it
straight to a real `createNode` call. Since `'Slider'`/`'AnimatedDemo'`/etc. are NOT real
native view names, this doesn't throw or no-op — **React Native's own Fabric fallback
silently paints a real, visible "Unimplemented component: `<Name>`" placeholder view** in
its place. This is NOT a headless-testable bug: vitest/tsc/ngc all stay green (the mock
Fabric in tests doesn't reproduce RN's real "unknown view name" fallback rendering), so it
was only caught on a real device/simulator run.

**Discovered 2026-07** porting Slider + 8 new demo components into `examples/angular`: every
one of them (adapter-authored OR app-authored, the mechanism doesn't distinguish) needed its
selector added to `ANCHOR_HOST_COMPONENTS` before it painted correctly instead of showing the
red "Unimplemented component" banner (with, confusingly, the REAL content sometimes still
partially visible/functional underneath or beside it, since the anchor issue is about the
OUTER host, not the component's own inner-template rendering — "looks broken but the widget
still works" is exactly this bug, not a coincidence).

**This is a known scaling gap, not a one-time fix**: the set is a manually-maintained
allowlist with no general/automatic rule for "is this selector a composed component or a raw
Fabric view name" — Angular's `Renderer2` contract gives `createElement` no such signal.
Every NEW composed `@Component` ANYONE writes and uses as a plain tag — in the adapter, in
an example app, in a future consumer's own app code — needs a one-line addition here or it
silently (from the type-checker's perspective) paints wrong on a real device. When adding a
new composed component, add its selector to this set as a matter of course; when debugging
"my component partially renders but shows a red overlay on device," check this list FIRST
before suspecting the component's own logic.

Being correctly listed here is necessary but NOT sufficient — the anchor host it gets still
needs its class-derived style merged back into the real inner primitive, or `class="..."` on
it silently does nothing (a DIFFERENT, second-order failure of the exact same anchor
mechanism). See §21.

## §16. `[style]="[a, b]"` (RN's array-composition idiom) crashes Angular's built-in `ɵɵstyleMap` — always flatten first (2026-07)

Angular's template compiler special-cases the literal binding name `style` (and `class`,
`style.x`, `class.x`) at PARSE TIME, regardless of the target element — a template attribute
written `[style]="expr"` ALWAYS lowers to the built-in `ɵɵstyleMap(expr)` instruction, never a
regular `ɵɵproperty('style', expr)` call, even when the target is one of OUR components with a
plain `@Input() style`. §1's mapping table already documents the intended, working half of this
(`setStyle / [style]="…" → routeProp(el,'style',…)`, via `Renderer2.setStyle`'s per-key merge in
`renderer.ts`) — that path handles a FLAT style object fine. What it does not handle, because
`ɵɵstyleMap` itself cannot: **RN's own `style={[base, override]}` array-composition idiom.** Binding
an array directly to `[style]=` throws deep inside Angular's own styling engine
(`prop.indexOf is not a function` in `applyStyling`) — before `Renderer2.setStyle` is ever called, so
nothing in our adapter can intercept or paper over it.

Confirmed as the root cause of a real, reported device bug: `examples/angular/App.ts`'s "FlatList ·
24 chips" demo bound `[style]="[styles.chipCard, { backgroundColor: chipColor(item) }]"` on each
cell. The crash landed inside a change-detection microtask tick (`adapters/angular/src/render.ts`)
whose `try { detectChanges() } finally { … }` has no `catch` — the exception propagated out of the
microtask uncaught, but the reentrancy guard still reset in the `finally`, so the NEXT notify (from a
batch-fill timer, a measure callback, anything) re-ran `detectChanges()` and hit the identical crash
again, forever: the item's style never successfully committed ("styles don't apply") AND change
detection free-ran retrying the same throw every tick (constant re-render log spam, climbing RAM) —
two symptoms, one cause. Proven and fixed via a headless test:
`adapters/angular/src/components/flat-list/flat-list-array-style.test.ts` reproduces the crash with a
raw array binding, then shows both symptoms gone once the array is flattened first.

**Fix — flatten before ANY array-typed value reaches a literal `[style]=` binding, always, both
ends:**
- **App authors**: never write `[style]="[a, b]"`. Call the engine's `flattenStyle` (re-exported
  from `@symbiote-native/angular`, alongside `StyleSheet`) inline: `[style]="flattenStyle([a, b])"` — expose
  it on the component as `readonly flattenStyle = flattenStyle;` since Angular templates can only call
  instance members, never a bare module-level import.
- **Adapter components**: any field/getter that a template binds via `[style]="…"` and that *can* hold
  an array must flatten at the point of assignment, not leave it as `IStyleProp<T>` (which allows
  arrays) all the way to the binding. Two real, previously-broken sites fixed this way:
  `flat-list/index.ts`'s `rowStyle` (ALWAYS an array — `[{flexDirection:'row'}, columnWrapperStyle]`,
  crashed on every multi-column `FlatList`, immediately) and
  `virtualized-list/index.ts`'s `resolvedStyle` (an array only when `inverted` — dormant until the
  first inverted-list demo). Both now assign `flattenStyle(...)` instead of a raw array/tuple.
- **Component-to-component forwarding is JUST AS EXPOSED as a leaf app usage.** A wrapper's own
  template line `<Inner [style]="style">` (forwarding ITS OWN `@Input() style` onward) is STILL a
  literal `[style]=` binding — if the APP passes an array to the WRAPPER's top-level `style` input
  (e.g. `<FlatList [style]="[a,b]">`), it crashes at the wrapper's own template, before the inner
  component's logic runs at all. Fixed at every such forwarding site in the list family:
  `FlatList`/`SectionList`/`VirtualizedSectionList` each now expose a `resolvedStyle` (field+
  `ngOnChanges`, or a getter — either is fine, `flattenStyle` is cheap and idempotent) that flattens
  `this.style` before the `[style]="resolvedStyle"` forwarding. Full detail on the list family's own
  bugs: `angular-adapter-lists`.

**Renaming the binding away from `style` was considered and rejected**: Angular's `[style]=`
interception is by literal template syntax, not by the target's `@Input()` alias — so a differently-
named public API (e.g. `[styleProp]=`) WOULD dodge the crash and route through the normal, already-
correct `setProperty`→`routeProp` path (which the engine's own `flattenStyle` already handles at
commit time, making the whole `setStyle`/`removeStyle` Renderer2 workaround redundant) — but it would
break the RN-idiom-matching `style` name every other adapter and the whole existing demo app already
use, for every single component, a much larger and riskier rename than the accepted fix. Not revisited
unless a future case makes the flatten-at-every-site discipline genuinely unmanageable.

**Not yet swept**: several other `[style]="style"`-forwarding sites exist outside the list family
(`touchable.ts`, `image-background.ts`, `drawer-layout-android/index.ts`) — same latent risk if an app
ever passes an array to THEIR top-level `style` input directly; not fixed here since no reported bug
traced there yet. Apply the identical `resolvedStyle` pattern if one surfaces.

**Related, separate fix in the same pass**: `examples/angular/tsconfig.json` (the editor-facing base
config) lacked `"lib": ["DOM"]` that `tsconfig.angular.json` (the real ngc build config) already had —
`@angular/core`'s own `.d.ts` surface references DOM lib ambient types even though this adapter never
touches a real DOM (DOM-less bootstrap, §2), so any file importing it spammed TS2584 ("Cannot find
name 'document'") in editor diagnostics only, never in the real build. Mirrored the same `lib` array
into the base config so editor diagnostics match reality for the whole example, not just `App.ts`.

## Prior art

- **NativeScript-Angular** — nearest relative (Angular on native iOS/Android via a
  custom renderer) but compiles via `@ngtools/webpack` + webpack; transfer the idea,
  not the code (Metro ≠ webpack).
- **`angular/react-native-renderer`** — Google's own abandoned ~2016 "Angular → React
  Native" experiment. Conceptual twin, but its compilation approach is pre-Ivy and
  dead; renderer shape only, not worth vendoring.

## §19. DrawerLayoutAndroid — REMOVED entirely (2026-07), do not re-add casually

`DrawerLayoutAndroid` existed across all three adapters purely for parity coverage (proving the
adapter seam can drive an arbitrary third-party native `ViewManager`, not just SymbioteNative's own
primitives) and was demoed ONLY in `examples/angular/App.ts` — never in React/Vue's example
apps. It hit two real-device Android RedBox crashes in the same session: `ColorValue: the value
must be a number or Object` (a genuinely fixable `COLOR_PROPS` gap, since reverted along with
everything else) and `The Drawer cannot have more than two children`
(`ReactDrawerLayoutManager.kt` — RN's OWN native Fabric mounting layer, not our JS engine;
`SurfaceMountingManager.kt` admits "we don't know /why/ this happens yet" about the underlying
re-add pattern). A memoization mitigation was tried for the second crash but headless testing
could not confirm or deny it actually fixed anything, since the JS-side shadow tree was already
provably correct — the bug lived entirely in native code this project doesn't control.

Given `DrawerLayoutAndroid` is **deprecated in React Native core itself** (the ecosystem moved to
`@react-navigation/drawer`), Android-only, undemonstrated outside the Angular example, and the
one thing blocking real-device Android testing — the decision was to drop it entirely rather than
keep chasing an unfixable native bug: removed from `adapters/{react,vue,angular}/src/components/`,
`core/components/src/{state,view}/`, the `examples/angular/App.ts` demo (imports, template,
handlers, `@ViewChild`, styles), `examples/angular/e2e/probe.test.ts`, and the `COLOR_PROPS`
entries it needed in `core/engine/src/commit.ts`. See the root `CLAUDE.md` for the durable
one-line rationale. If a FUTURE need for a native Android drawer arises, prefer wrapping
`@react-navigation/drawer` (or a maintained equivalent) through the
`<third_party_rn_packages_are_react_only>` seam rather than reviving this deprecated RN
component.

## §21. `ANCHOR_HOST_COMPONENTS` §11's sequel: being listed doesn't forward `class` — every composed component must ALSO merge `anchorHostStyle` back in, or it silently stays unstyled/unsized (device-confirmed 2026-07)

§11 covers listing a selector so it gets a harmless anchor instead of a visible "Unimplemented
component" fallback. That anchor host still needs a second, separate step: Angular gives no
`@Input()` interception hook for `class="..."`/`[class.x]`/`[ngClass]` the way it does for
`[style]`, so a `class="..."` at a composed component's OWN use site ALWAYS resolves onto its
anchor (`routeProp`'s `commitClassStyle` writes the resolved style straight onto
`anchor.props.style`) and NEVER reaches the real inner `symbiote-*` primitive the component's
own template creates one level down — UNLESS the component explicitly reads it back off its own
anchor and merges it into what it hands the inner primitive. `anchorHostStyle(elementRef)` /
`anchorStyleProp<T>(elementRef)` (`adapters/angular/src/primitives/shared.ts`) exist for exactly
this; the doc comment on `anchorHostStyle` has carried the mechanism and the correct call
pattern since it was first written for `ScrollView`/`Image`/`Switch`/`TextInput`/the Touchable
family — but nothing enforces every NEW or ported composed component actually calls it, and
skipping it produces no compiler signal at all: `tsc --build` stays green, and even a real `ngc`
AOT `strictTemplates` build stays green, because the merge is a plain runtime data-flow gap, not
a template binding error.

**Device-confirmed real bug (2026-07)**: `AnimatedView`/`AnimatedText`/`AnimatedImage`/
`AnimatedScrollView` (`adapters/angular/src/modules/animated/create-animated-component.ts`),
`Button` (`adapters/angular/src/components/button.ts`), and `ScrollViewStickyHeader`
(`adapters/angular/src/components/scroll-view/sticky-header.ts`) were all correctly listed in
`ANCHOR_HOST_COMPONENTS` but never merged `anchorHostStyle` back in. Symptom: a scroll-linked
"header fades as you scroll" demo (`examples/angular/App.ts`) — `class="box-list160"` on an
`<AnimatedScrollView>` (meant to give the box a fixed height + overflow clipping) never reached
the real scroll view, so the box had NO height/overflow constraint at all: every row rendered
fully stacked with zero clipping and zero actual scrolling — not a cosmetic glitch, the
component was functionally non-scrollable. Every OTHER `ANCHOR_HOST_COMPONENTS` entry was
audited (4 parallel agents, full sweep: `ActivityIndicator`, the whole Pressable/Touchable
family, the whole list family `FlatList`/`SectionList`/`VirtualizedList`/
`VirtualizedSectionList`, `Switch`, `TextInput`, `ScrollView`, `Image`, `ImageBackground`,
`InputAccessoryView`, `KeyboardAvoidingView`, `Modal`, `RefreshControl`, `SafeAreaView`) and
found already correctly wired — only these 3 spots (all newer/less-trodden components) had the
gap. `StatusBar` is N/A (`template: ''`, purely imperative, no visual host).

**Fix pattern** — inject the component's OWN `ElementRef` (`private readonly elementRef =
inject(ElementRef);`, its own anchor host, NOT a `@ViewChild` into its inner primitive) and
merge `anchorHostStyle(this.elementRef)` into the style handed to the real inner primitive,
anchor-style FIRST so an explicit `[style]` input still wins (`flattenStyle`'s later-wins array
collapse — the same class-loses-to-explicit-style cascade `commitClassStyle` enforces for a
direct primitive):
- Loosely-typed target (a `Record<string, unknown>` hostProps bag, or `AnimatedComponentBase`'s
  untyped `style: unknown` field) → `anchorHostStyle` directly: `reduced['style'] =
  [anchorHostStyle(this.elementRef), reduced['style']];`.
- `AnimatedImage`'s `animatedImageProps` getter is the one exception needing care: it calls
  `resolveImageProps(reduced)`, which builds its OWN internal `[dimensionStyle, style]` array
  from `width`/`height` — merging the anchor style into the INPUT before that call produces a
  wrongly double-nested array. Merge into the OUTPUT instead: `const resolved =
  resolveImageProps(reduced); resolved['style'] = [anchorHostStyle(this.elementRef),
  resolved['style']]; return resolved;`.
- A strictly-typed target (an inner primitive's own real `@Input() style: IStyleProp<Some-
  ConcreteStyle>`, e.g. binding straight onto `TouchableOpacity`'s or `Pressable`'s typed style
  input, as `Button` and `touchable.ts`'s `TouchableHighlight`/`TouchableWithoutFeedback` do)
  needs the narrowed helper instead: `anchorStyleProp<T>(elementRef): IStyleProp<T> | undefined`
  (same file) — narrows `unknown` to `IStyleProp<T>` via a generic runtime type-guard, no `as`
  cast. Its generic argument does NOT infer automatically from an array-literal call site —
  always pass it explicitly (`anchorStyleProp<IViewStyle>(this.elementRef)`), or the result
  types as `unknown` and a downstream `IStyleProp<...>` assignment only fails under a REAL `ngc`
  AOT build (`strictTemplates`), never under plain `tsc --build` — another instance of the
  AOT-only gap §4 (now in `angular-adapter-build`) documents for a different symptom.
  `anchorStyleProp`/its `isStyleValue<T>` guard used to be duplicated locally, un-exported,
  inside `touchable.ts`; moved to `primitives/shared.ts` as the one shared definition when this
  bug surfaced a second consumer (`Button`) — reuse it, don't re-duplicate it a third time.
- Button itself has no `style` prop in RN's real API surface (RN's stock `Button` doesn't accept
  one) — but this project's own convention explicitly supports styling `Button` via
  `className`/`class` regardless (confirmed via `adapters/react/src/components/button.ts`,
  which declares its own `className?: string` field specifically for this and forwards it onto
  `TouchableOpacity`), so merging `anchorHostStyle` into Angular's `Button` is correct parity
  with React/Vue, not scope creep.

**Cross-adapter scope** (2 more parallel agents, full sweep): this bug class is Angular-
specific, caused by Angular's anchor-host indirection — React (`className` prop, falls into a
plain `...rest` spread) and Vue (`class`/`:class`, either auto-fallthrough or a manual
`attrs.class`/`normalizeVueAttrs` forward when `inheritAttrs:false`) render a composed
component's tree directly with no anchor node, so both were audited fully clean across every
composed component in both adapters. Do not port this checklist to React/Vue — it does not
apply there.

**Verification for any future fix in this area**: `tsc --build adapters/angular` AND a real
`ngc -p tsconfig.angular.json` AOT build (both `adapters/angular` and the consuming
`examples/*`) stay green with OR without the bug — neither catches it. The only way to confirm
is a real device/simulator render of a `class="..."`-styled instance of the component (or a
headless test asserting the COMMITTED node's resolved `style` prop actually contains the
class-derived value, mirroring `scroll-view-class-style.test.ts`'s pattern).

## Reference

- Vendored Angular source: `.vendors/angular` (= `~/projects/vendors/angular`, git
  submodule, shallow `main` @ v22-next — for reading the mechanism; version-stable
  for ngtsc/linker). Key files:
  - Stage B linker Babel plugin: `packages/compiler-cli/linker/babel/src/{babel_plugin,es2015_linker_plugin}.ts`
  - Stage A ngtsc: `packages/compiler-cli/src/ngtsc`, `packages/compiler`
- Renderer seam reference: `wolf-tui/packages/angular/src/renderer/*` and
  `src/bootstrap.ts` (no-DOM bootstrap; note its private-CD hack is obsolete for us).
- Engine mutation API the seam targets: `core/engine/src/node.ts`
  (`createElement`/`createRawText`/`createAnchor`/`appendChild`/`insertBefore`/
  `removeChild`/`routeProp`/`setEventListener`/`setText`), surface
  `requestCommit` in `core/engine/src/surface.ts`.
- Vue twin to mirror: `adapters/vue/src/{renderer,render,index}.ts`.
- Commit-timing: the `vue-adapter-reactivity` skill (Gotcha 2 / `whenCommitted`),
  or `angular-adapter-change-detection` for the Angular-specific follow-on.
- Build pipeline: `angular-adapter-build`. Change detection: `angular-adapter-change-detection`.
  Events: `angular-adapter-events`. Portal/tunnel/AppRegistry: `angular-adapter-portal`.
  Lists/ScrollView: `angular-adapter-lists`.
