---
name: angular-adapter-portal
description: "Symbiote Angular adapter — createPortal + createTunnel (create-portal.ts, create-tunnel.ts) AND AppRegistry + dynamic component composition (modules/app-registry/index.ts). Read BEFORE touching either file, adding a structural directive relocating content, wiring projectableNodes/createComponent, or extending AppRegistry's wrapperComponentProvider. Angular twin of react-adapter-portal, analog of vue-adapter-directives' portal half — read those two FIRST for the cross-surface-out-of-scope rationale. Covers why Angular can't be a per-call factory (no runtime JIT); PortalOutletDirective/PortalDirective (structural directive into the destination's ViewContainerRef, not a Renderer2 move; strictTemplates replaces isSymbioteNode); createTunnel's signal store + TunnelInDirective/TunnelOut (a rendering slot); the redesign from components to structural directives; AND AppRegistry's createDetachedViewHost + projectableNodes recipe for composing dynamic components without JIT, plus the selectRootElement bug surfaced."
---

# Symbiote Angular adapter — `createPortal` + `createTunnel`, and AppRegistry's composition recipe

Angular hit the SAME underlying constraint twice, independently: **there is no
runtime component synthesis under this stack** — no JIT compiler ships to
Hermes under Metro/AOT (the same constraint `create-animated-component.ts`'s
header documents for `createAnimatedComponent`). React's and Vue's
`createTunnel()` can be a factory that builds a fresh closure-scoped
`In`/`Out` pair (a function pair for React, a `defineComponent` pair for
Vue) on every call. Angular cannot — so both times the Angular adapter had to
solve "compose or relocate pre-authored component content without JIT" a
different way: a **static, pre-authored, AOT-compiled pair parameterized by
an input**, not a fresh factory output.

This skill covers both solutions. The larger, primary one is
**`createPortal`/`createTunnel`** (§15 below, the Angular twins of React's
and Vue's portal primitives — read `react-adapter-portal` and
`vue-adapter-directives` first for the shared cross-surface rationale). The
smaller, secondary one is **AppRegistry's dynamic component composition**
(§8 below), which needed to compose two dynamically-created components (a
host app + a host-supplied wrapper) without JIT — its `createDetachedViewHost`
+ `projectableNodes` recipe is exactly the kind of technique worth reaching
for if `createPortal`/`createTunnel` are ever extended further (an outlet, a
third-party wrapper, anything that needs to compose pre-authored component
classes at runtime without synthesizing a new one).

## `createPortal` + `createTunnel` — the Angular twins of React's/Vue's portal primitives (2026-07)

Both now exist (`adapters/angular/src/create-portal.ts`, `create-tunnel.ts`), matching the
React (`react-adapter-portal` skill) / Vue (`vue-adapter-directives` skill) feature exactly:
`createPortal`/`Teleport` for a same-surface target, `createTunnel` for cross-surface delivery
via a shared store. Read those two skills first for the full "why cross-surface is permanently
out of scope for the portal, and why createTunnel exists as a separate primitive" rationale —
it applies verbatim here, only the Angular MECHANISM differs.

**The one thing that does NOT transfer from React/Vue: neither can be a factory that returns
fresh per-call components.** React's `createTunnel()` builds a closure-scoped `In`/`Out`
function pair; Vue's builds a closure-scoped `defineComponent` pair. Angular has no runtime
component synthesis — no JIT compiler ships to Hermes under Metro (see
`modules/animated/create-animated-component.ts`'s header for the same constraint, hit first).
So both Angular primitives split differently:

- **`PortalDirective`** (`create-portal.ts`) — `PortalOutletDirective` (`[portalOutlet]`, marks
  the destination, exposes its `ViewContainerRef` via `exportAs`) + `PortalDirective`
  (`[portal]`), a STRUCTURAL directive (`*portal="overlayHost"`, the `*ngIf`/`*ngTemplateOutlet`
  idiom) that creates the embedded view straight INTO the destination's `ViewContainerRef`.
  **Deliberately does NOT move an already-created view's nodes with `Renderer2`** — Angular's
  own view-destroy path removes a view's nodes from wherever ITS OWN bookkeeping thinks they
  live (the container's original insertion point), not wherever a node was manually relocated to
  afterwards, so a raw post-creation move would desync Angular's internals from the retained
  tree. Creating the view directly in the destination's container sidesteps this — nothing is
  ever moved, so nothing can desync. This also replaces React's/Vue's `isSymbioteNode` runtime
  guard: `portal` is typed as `PortalOutletDirective`, and the only way to produce one is
  Angular's template compiler resolving a template reference variable, so `strictTemplates`
  rejects anything else at compile time — there is no runtime value left to validate.
- **`createTunnel()`** (`create-tunnel.ts`) returns a plain reactive STORE (an Angular
  `signal<ReadonlyMap<number, TemplateRef<unknown>>>`, wrapped as `ITunnelStore`);
  `TunnelInDirective` (`[tunnelIn]`, also structural — same reason as `PortalDirective`) and
  `TunnelOut` (`tunnel-out`, a plain component — a rendering SLOT, the same shape as Angular's
  own `<router-outlet>`, not content that needs a structural directive) are ONE static,
  pre-authored, AOT-compilable pair, parameterized by that store through an input — the same
  relationship `VListOutletDirective` (`components/virtualized-list/directives.ts`, imported
  directly rather than duplicated — see its header) has to the one template it stamps,
  generalized to an open-ended, changing SET of templates instead of one. `TunnelOut` diffs its
  own `Map<id, EmbeddedViewRef>` against the store's current entries inside an `effect()`
  (constructor-captured `Injector`, subscribed in `ngOnInit`) — add/remove views on structural
  change; Angular's own top-level `detectChanges()` walk (via the app's `ɵChangeDetectionScheduler`,
  §2) keeps each view's CONTENT current for free, since embedded views created anywhere via a
  `ViewContainerRef` are still children of that same LView tree.
- **Both are STRUCTURAL directives, not components taking a `<ng-template>` + `[content]`
  input.** The first working version used the latter shape — it worked, but read as foreign to
  anyone used to `*ngIf`/`*ngFor`/`*ngTemplateOutlet`, where the directive sits DIRECTLY on the
  content and its `TemplateRef` comes from injection, never a passed-in reference (user
  feedback: "выглядит будто из другого мира"). `*portal="expr"` desugars exactly the way
  `*ngIf` does — Angular wraps the host element in a generated `<ng-template>` and injects
  THAT template's own `TemplateRef` into the directive automatically — so the two-step
  indirection disappears with zero behavior change, only a shape change.
- **No "symbiote" prefix on these selectors, by explicit request** — `portalOutlet`, `portal`,
  `tunnelIn`, `tunnel-out`, unlike every OTHER selector in this adapter (`symbiote-view`,
  `symbiote-descriptor-outlet`, `symbioteHostProps`, …). This is a deliberate one-off exception
  for this primitive pair, not a new project-wide convention — don't drop the prefix elsewhere
  without the same explicit ask.
- **No `context` param on either.** Unlike a `*ngFor`/`vListItem` cell template, portaled/
  tunneled content needs no per-registration data passed in — it already closes over whatever
  signals/fields its OWN declaring component exposes, and Angular's change detection keeps that
  live once the embedded view exists, same as any other template. Dropping it kept both
  primitives smaller than the list-outlet precedent they're built on.
- **App code stays fully declarative** — no `ViewContainerRef`/imperative rendering, and no
  named `<ng-template>` to wire up separately — the structural directive sits directly on the
  content, exactly like `*ngIf`:
  ```html
  <View portalOutlet #overlayHost="portalOutlet"></View>
  @if (toastVisible) {
    <View *portal="overlayHost"><Text>…</Text></View>
  }
  ```
  and for the cross-surface case, register from anywhere and paint via the store:
  ```html
  @if (toastVisible) {
    <View *tunnelIn="overlayTunnel"><Text>…</Text></View>
  }
  …
  <tunnel-out [tunnel]="overlayTunnel" />
  ```
  `overlayTunnel = createTunnel()` is a MODULE-level singleton (not a component field
  initializer), same reason React's/Vue's example apps declare their tunnel at module scope —
  the whole point is that `TunnelInDirective`/`TunnelOut` don't need to share a component
  instance.
- **§11 applies to `tunnel-out` only.** `PortalDirective`/`TunnelInDirective` are ATTRIBUTE
  (structural) directives — they never call `createElement` with their OWN selector as `name`,
  they attach to whatever host the directive's generated `<ng-template>` embeds, so they need NO
  `ANCHOR_HOST_COMPONENTS` entry at all (see the main `angular-adapter` skill's §11 for what that
  set is and why it exists — not fully re-explained here). `tunnel-out` is still a real component
  with its own host tag, so it stays in the set — omitting it reproduces the exact `Unknown
  symbiote component type` failure §11 describes (thrown by the fake test double; a real device
  would have painted RN's "Unimplemented component" fallback instead). `PortalOutletDirective` is
  ALSO attribute-only, same reasoning, no entry.
- Live demo: `examples/angular/App.ts` — "Show toast (createPortal)" / "Show toast
  (createTunnel)" buttons, a shared `overlayHost`/`overlayTunnel` pair, mirroring
  `examples/react/App.tsx` and `examples/vue-sfc/App.vue`'s equivalent demos exactly.
  Covered by `create-portal.test.ts` (same-surface paint/unpaint) and `create-tunnel.test.ts`
  (two independent `mount()` calls on different rootTags — genuine cross-surface proof, mirroring
  the React/Vue tunnel tests).

## AppRegistry + dynamic component composition (2026-07)

`AppRegistry` (RN's `registerComponent(appKey, () => App)` entry point) is now ported to
Angular (and Vue), closing what was previously the one confirmed real runtime-module gap
vs React. All three adapters share ONE registry core — `createAppRegistry` in
`core/engine/src/app-registry/` (bookkeeping: sections, host-registrar bridge, headless
tasks) — and supply only their own `runnableFor`, the sole framework-specific seam. Angular's
lives in `adapters/angular/src/modules/app-registry/index.ts`, built on two additions to
`render.ts`'s `mount()`: an `IMountOptions` with `initialProps` (applied via
`cmpRef.setInput`) and `wrapperComponent` (RN's `setWrapperComponentProvider`).

**A latent bug this surfaced and fixed**: `SymbioteRenderer.selectRootElement()`
(`renderer.ts`) was hardcoded to `return this.surface`, silently ignoring its
`selectorOrNode` argument. It only "worked" because the sole prior caller (`mount()`)
always passed `surface` itself as `hostElement`, so the ignored return value coincidentally
matched. It broke the moment a second, distinct host node was introduced. Angular's
`locateHostElement` ALWAYS routes `createComponent()`'s `hostElement` through
`renderer.selectRootElement(hostElement, preserveContent)` — never bypassed just because a
real object (not a selector string) was passed. Fixed: `return typeof selectorOrNode ===
'string' ? this.surface : selectorOrNode`. General lesson: any Angular renderer method that
looks unconditionally hardcoded, ignoring its own parameter, is suspect for the same
reason — it may only work by coincidence of the single current caller.

**Composing two dynamically-created components without JIT** (needed for
`wrapperComponentProvider`, which wraps the root app in a host-supplied context provider):
create the root with an explicit synthetic host node — `createDetachedViewHost()` in
`render.ts`, a bare `symbiote-view` built directly via `@symbiote-native/engine`'s
`createElement`/`toPublicInstance` + `descriptorFor('View')` from `@symbiote-native/components`,
**not** through Angular's own `Renderer2.createElement`, which only resolves known symbiote
primitives and throws on an arbitrary component's own selector (`Unknown symbiote component
type: <selector>`). Then create the wrapper via `createComponent(wrapperType, { hostElement:
surface, projectableNodes: [[rootHostNode]] })`; the wrapper's own template must contain
`<ng-content>` — Angular's native content-projection idiom, the equivalent of React's
`{children}`. This is NOT JIT synthesis — no new template/class compiles at runtime; it
composes two pre-authored, already-AOT-compiled component classes via the documented
`createComponent(type, { projectableNodes })` API, so it doesn't violate the no-JIT-under-AOT
constraint documented for `createAnimatedComponent` (§ modules/animated). Reusable for any
future Angular composition need (an outlet/portal, a third-party wrapper) — same recipe.

Verified via co-located tests: `adapters/angular/src/modules/app-registry/app-registry.test.ts`
(registration/host-bridge/runApplication + a wrapper-projection smoke), mirrored in React's and
Vue's own `app-registry.test.ts(x)`.

## Scope boundary

- **`react-adapter-portal`** and **`vue-adapter-directives`** — read those FIRST for the full
  why-cross-surface-is-out-of-scope argument (same-surface-only as a permanent design decision,
  not a v1 stopgap; the researched prior art — `facebook/react#17147`, `pmndrs/tunnel-rat` — and
  the real infinite-render-loop bug that shaped React's/Vue's `In`/`Out` into separate
  components). It is not repeated here — this skill covers only what differs in the Angular
  MECHANISM (structural directives instead of a per-call factory, `strictTemplates` instead of
  `isSymbioteNode`).
- **`angular-adapter`** (the main skill) — go there for §0's overall implementation status, and
  for §11's full `ANCHOR_HOST_COMPONENTS` explanation (referenced above for `tunnel-out` but not
  fully explained in this file).
- **`angular-adapter-lists`** — go there for `VListOutletDirective`
  (`components/virtualized-list/directives.ts`), the template-outlet precedent `TunnelOut`
  borrows its "one static component stamping a changing set of templates" shape from.
